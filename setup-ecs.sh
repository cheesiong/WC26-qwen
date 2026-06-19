#!/bin/bash
# ──────────────────────────────────────────────────────────────────
#  WC2026 — Full auto-deploy: provision ECS + install Docker + deploy app
#  Usage:
#    bash setup-ecs.sh                        # interactive prompts
#    ECS_IP=1.2.3.4 bash setup-ecs.sh         # skip provisioning, deploy only
#
#  Prerequisites:
#    1. Install aliyun CLI:  brew install aliyun-cli  (or https://help.aliyun.com/document_detail/139508.html)
#    2. Configure:           aliyun configure
#    3. Set your DASHSCOPE_API_KEY in backend/.env
#
#  What it does:
#    - Creates a security group (ports 22, 80, 443)
#    - Creates an ECS instance (2 vCPU, 2 GB, Ubuntu 22.04, 40 GB SSD)
#    - Waits for the instance to be ready
#    - Installs Docker + Docker Compose
#    - Uploads backend/.env
#    - Deploys the app via deploy.sh
# ──────────────────────────────────────────────────────────────────

set -e

# ── Defaults ──────────────────────────────────────────────────────
REGION="${REGION:-ap-southeast-1}"          # Singapore
INSTANCE_TYPE="${INSTANCE_TYPE:-ecs.t6-c1m2.large}"  # 2 vCPU, 4 GB (burstable, ~$10-15/mo)
DISK_SIZE="${DISK_SIZE:-40}"                # GB
REMOTE_DIR="/opt/wc2026"
KEY_NAME="wc2026-deploy-key"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }

echo ""
echo "⚽  WC2026 — Auto Deploy to Alibaba Cloud"
echo "════════════════════════════════════════"

# ── Check prerequisites ──────────────────────────────────────────
command -v aliyun >/dev/null 2>&1 || error "aliyun CLI not found. Install: brew install aliyun-cli"

# ── If ECS_IP is already set, skip to deployment ─────────────────
if [ -n "$ECS_IP" ]; then
  info "Using existing ECS at $ECS_IP — skipping provisioning"
  KEY_PATH="$HOME/.ssh/aliyun-ecs.pem"
  [ -f "$KEY_PATH" ] || error "SSH key not found at $KEY_PATH"
  echo ""
fi

# ── Helper: look up default VPC + VSwitch (used by multiple steps) ──
lookup_vpc() {
  VPC_ID=$(aliyun vpc DescribeVpcs \
    --RegionId "$REGION" \
    --IsDefault true \
    2>/dev/null \
    | python3 -c "import sys,json; vpcs=json.load(sys.stdin).get('Vpcs',{}).get('Vpc',[]); print(vpcs[0]['VpcId'] if vpcs else '')" 2>/dev/null || true)

  if [ -z "$VPC_ID" ]; then
    # Fallback: pick any Available VPC
    VPC_ID=$(aliyun vpc DescribeVpcs \
      --RegionId "$REGION" \
      --VpcStatus Available \
      2>/dev/null \
      | python3 -c "import sys,json; vpcs=json.load(sys.stdin).get('Vpcs',{}).get('Vpc',[]); print(vpcs[0]['VpcId'] if vpcs else '')" 2>/dev/null || true)
  fi

  [ -z "$VPC_ID" ] && error "No VPC found in $REGION. Create a default VPC in the Alibaba Cloud console first."

  # Find zones that support the desired instance type
  COMPATIBLE_ZONES=$(aliyun ecs DescribeAvailableResource \
    --RegionId "$REGION" \
    --InstanceType "$INSTANCE_TYPE" \
    --DestinationResource InstanceType \
    --InstanceChargeType PostPaid \
    2>/dev/null \
    | python3 -c "
import sys, json
data = json.load(sys.stdin)
zones = data.get('AvailableZones',{}).get('AvailableZone',[])
available = []
for z in zones:
    status = z.get('StatusCategory','')
    if status == 'WithStock' or status == 'SoldOut' is False:
        available.append(z['ZoneId'])
# Fallback: just list all zone IDs if filtering didn't work
if not available:
    available = [z['ZoneId'] for z in zones]
print(','.join(available))
" 2>/dev/null || true)

  info "Compatible zones for $INSTANCE_TYPE: ${COMPATIBLE_ZONES:-none found}"

  # Try to find an existing VSwitch in a compatible zone (status must be Available)
  VSWITCH_ID=""
  if [ -n "$COMPATIBLE_ZONES" ]; then
    VSWITCH_ID=$(aliyun vpc DescribeVSwitches \
      --RegionId "$REGION" \
      --VpcId "$VPC_ID" \
      --VSwitchName "wc2026-vsw" \
      2>/dev/null \
      | python3 -c "
import sys, json
vs = json.load(sys.stdin).get('VSwitches',{}).get('VSwitch',[])
compatible = '${COMPATIBLE_ZONES}'.split(',')
match = [v for v in vs if v['ZoneId'] in compatible and v.get('Status','') == 'Available']
print(match[0]['VSwitchId'] if match else '')
" 2>/dev/null || true)
  fi

  # If no matching VSwitch, create one in a compatible zone
  if [ -z "$VSWITCH_ID" ]; then
    ZONE_ID=$(echo "$COMPATIBLE_ZONES" | cut -d',' -f1)
    if [ -z "$ZONE_ID" ]; then
      # Fallback: use first zone from DescribeZones
      ZONE_ID=$(aliyun ecs DescribeZones \
        --RegionId "$REGION" \
        2>/dev/null \
        | python3 -c "import sys,json; zones=json.load(sys.stdin).get('Zones',{}).get('Zone',[]); print(zones[0]['ZoneId'] if zones else '')" 2>/dev/null || true)
    fi
    [ -z "$ZONE_ID" ] && error "No availability zone found in $REGION."

    # Use different CIDR blocks to avoid conflicts with existing VSwitches
    EXISTING_COUNT=$(aliyun vpc DescribeVSwitches \
      --RegionId "$REGION" \
      --VpcId "$VPC_ID" \
      2>/dev/null \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('TotalCount',0))" 2>/dev/null || echo 0)
    THIRD_OCTET=$((EXISTING_COUNT + 1))

    VSWITCH_ID=$(aliyun vpc CreateVSwitch \
      --RegionId "$REGION" \
      --VpcId "$VPC_ID" \
      --ZoneId "$ZONE_ID" \
      --CidrBlock "172.16.${THIRD_OCTET}.0/24" \
      --VSwitchName "wc2026-vsw" \
      2>/dev/null \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('VSwitchId',''))" 2>/dev/null || true)
    [ -z "$VSWITCH_ID" ] && error "Failed to create VSwitch in VPC $VPC_ID (zone: $ZONE_ID)."
    info "Created VSwitch: $VSWITCH_ID (zone: $ZONE_ID)"

    # Wait for VSwitch to become Available
    for i in $(seq 1 12); do
      VS_STATUS=$(aliyun vpc DescribeVSwitches \
        --RegionId "$REGION" \
        --VSwitchId "$VSWITCH_ID" \
        2>/dev/null \
        | python3 -c "import sys,json; vs=json.load(sys.stdin).get('VSwitches',{}).get('VSwitch',[]); print(vs[0].get('Status','') if vs else '')" 2>/dev/null || true)
      if [ "$VS_STATUS" = "Available" ]; then
        info "VSwitch is ready"
        break
      fi
      sleep 3
    done
  fi

  info "Using VPC: $VPC_ID, VSwitch: $VSWITCH_ID"
}

# ── Step 1: Create security group ────────────────────────────────
if [ -z "$ECS_IP" ]; then
  echo ""
  echo "── Step 1: VPC & Security Group ──"

  lookup_vpc

  SG_ID=$(aliyun ecs DescribeSecurityGroups \
    --RegionId "$REGION" \
    --SecurityGroupName "wc2026-sg" \
    --VpcId "$VPC_ID" \
    2>/dev/null | python3 -c "import sys,json; sgs=json.load(sys.stdin).get('SecurityGroups',{}).get('SecurityGroup',[]); print(sgs[0]['SecurityGroupId'] if sgs else '')" 2>/dev/null || true)

  if [ -z "$SG_ID" ]; then
    SG_ID=$(aliyun ecs CreateSecurityGroup \
      --RegionId "$REGION" \
      --VpcId "$VPC_ID" \
      --SecurityGroupName "wc2026-sg" \
      --Description "WC2026 Predictor" \
      | python3 -c "import sys,json; print(json.load(sys.stdin)['SecurityGroupId'])")
    info "Created security group: $SG_ID"

    # Add rules: SSH, HTTP, HTTPS
    for PORT in 22 80 443; do
      aliyun ecs AuthorizeSecurityGroup \
        --RegionId "$REGION" \
        --SecurityGroupId "$SG_ID" \
        --IpProtocol tcp \
        --PortRange "$PORT/$PORT" \
        --SourceCidrIp "0.0.0.0/0" \
        --Policy accept \
        > /dev/null 2>&1
    done
    info "Opened ports 22, 80, 443"
  else
    info "Security group exists: $SG_ID"
  fi
fi

# ── Step 2: Create SSH key pair ──────────────────────────────────
if [ -z "$ECS_IP" ]; then
  echo ""
  echo "── Step 2: SSH Key Pair ──"

  KEY_PATH="$HOME/.ssh/aliyun-ecs.pem"

  KEY_EXISTS=$(aliyun ecs DescribeKeyPairs \
    --RegionId "$REGION" \
    --KeyPairName "$KEY_NAME" \
    | python3 -c "import sys,json; kps=json.load(sys.stdin).get('KeyPairs',{}).get('KeyPair',[]); print('yes' if kps else 'no')" 2>/dev/null)

  if [ "$KEY_EXISTS" = "no" ] && [ ! -f "$KEY_PATH" ]; then
    aliyun ecs CreateKeyPair \
      --RegionId "$REGION" \
      --KeyPairName "$KEY_NAME" \
      | python3 -c "
import sys, json
d = json.load(sys.stdin)
with open('$KEY_PATH', 'w') as f:
    f.write(d['PrivateKeyBody'])
" 2>/dev/null
    chmod 600 "$KEY_PATH"
    info "Created key pair: $KEY_NAME → $KEY_PATH"
  else
    if [ ! -f "$KEY_PATH" ]; then
      warn "Key pair '$KEY_NAME' exists in Alibaba Cloud but local key not found at $KEY_PATH"
      error "Please provide your SSH key at $KEY_PATH or delete the key pair in Alibaba Cloud console"
    fi
    info "Using existing key: $KEY_PATH"
  fi
fi

# ── Step 3: Create ECS instance ──────────────────────────────────
if [ -z "$ECS_IP" ]; then
  echo ""
  echo "── Step 3: ECS Instance ──"

  # Check if instance already exists
  INSTANCE_ID=$(aliyun ecs DescribeInstances \
    --RegionId "$REGION" \
    --InstanceName "wc2026-server" \
    | python3 -c "import sys,json; insts=json.load(sys.stdin).get('Instances',{}).get('Instance',[]); print(insts[0]['InstanceId'] if insts else '')" 2>/dev/null || true)

  if [ -z "$INSTANCE_ID" ]; then
    # Reuse VPC_ID/VSWITCH_ID from Step 1 (lookup_vpc)

    # Look up latest Ubuntu 22.04 base image in this region (exclude GPU/CUDA/special images)
    IMAGE_ID=$(aliyun ecs DescribeImages \
      --RegionId "$REGION" \
      --OSType linux \
      --ImageOwnerAlias system \
      --Architecture x86_64 \
      --ImageName "ubuntu_22_04*" \
      --PageSize 50 \
      2>/dev/null \
      | python3 -c "
import sys, json
imgs = json.load(sys.stdin).get('Images',{}).get('Image',[])
# Filter out GPU, CUDA, and special images; prefer small base images
base = [i for i in imgs if 'gpu' not in i['ImageId'].lower() and 'cuda' not in i['ImageId'].lower() and 'with' not in i['ImageId'].lower()]
if not base:
    base = imgs
base.sort(key=lambda x: x.get('CreationTime',''), reverse=True)
img = base[0] if base else None
if img:
    print(f\"{img['ImageId']}|{img.get('Size',40)}\")
else:
    print('')
" 2>/dev/null || true)

    # Fallback: broader search
    if [ -z "$IMAGE_ID" ]; then
      IMAGE_ID=$(aliyun ecs DescribeImages \
        --RegionId "$REGION" \
        --OSType linux \
        --ImageOwnerAlias system \
        --Architecture x86_64 \
        --PageSize 50 \
        2>/dev/null \
        | python3 -c "
import sys, json
imgs = json.load(sys.stdin).get('Images',{}).get('Image',[])
ubuntu = [i for i in imgs if 'ubuntu' in i.get('OSNameEn','').lower() and '22.04' in i.get('OSNameEn','') and 'gpu' not in i['ImageId'].lower()]
ubuntu.sort(key=lambda x: x.get('CreationTime',''), reverse=True)
img = ubuntu[0] if ubuntu else None
if img:
    print(f\"{img['ImageId']}|{img.get('Size',40)}\")
else:
    print('')
" 2>/dev/null || true)
    fi

    [ -z "$IMAGE_ID" ] && error "No Ubuntu 22.04 image found in $REGION. Set IMAGE_ID manually."

    IMG_ID=$(echo "$IMAGE_ID" | cut -d'|' -f1)
    IMG_MIN_DISK=$(echo "$IMAGE_ID" | cut -d'|' -f2)
    # Ensure disk is at least as large as image requires
    if [ "$IMG_MIN_DISK" -gt "$DISK_SIZE" ] 2>/dev/null; then
      warn "Image requires ${IMG_MIN_DISK}GB disk, adjusting from ${DISK_SIZE}GB"
      DISK_SIZE="$IMG_MIN_DISK"
    fi
    info "Using image: $IMG_ID (disk: ${DISK_SIZE}GB)"

    INSTANCE_ID=$(aliyun ecs CreateInstance \
      --RegionId "$REGION" \
      --InstanceName "wc2026-server" \
      --HostName "wc2026" \
      --InstanceType "$INSTANCE_TYPE" \
      --ImageId "$IMG_ID" \
      --SecurityGroupId "$SG_ID" \
      --VSwitchId "$VSWITCH_ID" \
      --InternetMaxBandwidthOut 5 \
      --InternetChargeType "PayByTraffic" \
      --SystemDisk.Category cloud_essd \
      --SystemDisk.Size "$DISK_SIZE" \
      --InstanceChargeType PostPaid \
      --KeyPairName "$KEY_NAME" \
      | python3 -c "import sys,json; print(json.load(sys.stdin)['InstanceId'])")
    info "Created instance: $INSTANCE_ID"
  else
    info "Instance exists: $INSTANCE_ID"
  fi

  # Allocate public IP if not already assigned
  ECS_IP=$(aliyun ecs DescribeInstances \
    --RegionId "$REGION" \
    --InstanceIds "[\"$INSTANCE_ID\"]" \
    | python3 -c "
import sys, json
inst = json.load(sys.stdin)['Instances']['Instance'][0]
ips = inst.get('PublicIpAddress',{}).get('IpAddress',[])
if not ips:
    ips = [e['IpAddress'] for e in inst.get('EipAddress',{}).get('AllEipAddresses',{}).get('EipAddress',[])]
print(ips[0] if ips else '')
" 2>/dev/null || true)

  if [ -z "$ECS_IP" ]; then
    aliyun ecs AllocatePublicIpAddress --InstanceId "$INSTANCE_ID" > /dev/null 2>&1
    sleep 3
    ECS_IP=$(aliyun ecs DescribeInstances \
      --RegionId "$REGION" \
      --InstanceIds "[\"$INSTANCE_ID\"]" \
      | python3 -c "import sys,json; print(json.load(sys.stdin)['Instances']['Instance'][0]['PublicIpAddress']['IpAddress'][0])")
    info "Allocated public IP: $ECS_IP"
  else
    info "Public IP: $ECS_IP"
  fi

  # Start instance if not running
  STATUS=$(aliyun ecs DescribeInstances \
    --RegionId "$REGION" \
    --InstanceIds "[\"$INSTANCE_ID\"]" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['Instances']['Instance'][0]['Status'])")

  if [ "$STATUS" != "Running" ]; then
    aliyun ecs StartInstance --InstanceId "$INSTANCE_ID" > /dev/null 2>&1
    info "Starting instance..."
    for i in $(seq 1 30); do
      sleep 5
      STATUS=$(aliyun ecs DescribeInstances \
        --RegionId "$REGION" \
        --InstanceIds "[\"$INSTANCE_ID\"]" \
        | python3 -c "import sys,json; print(json.load(sys.stdin)['Instances']['Instance'][0]['Status'])")
      if [ "$STATUS" = "Running" ]; then
        info "Instance is running"
        break
      fi
      printf "."
    done
    echo ""
  else
    info "Instance already running"
  fi
fi

# ── Step 4: Wait for SSH ─────────────────────────────────────────
echo ""
echo "── Step 4: SSH Access ──"
SSH="ssh -i $KEY_PATH -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@$ECS_IP"

info "Waiting for SSH..."
for i in $(seq 1 20); do
  if $SSH "echo ready" >/dev/null 2>&1; then
    info "SSH connected"
    break
  fi
  if [ "$i" = "20" ]; then
    error "SSH timeout. Check security group allows port 22."
  fi
  sleep 5
  printf "."
done
echo ""

# ── Step 5: Install Docker ───────────────────────────────────────
echo ""
echo "── Step 5: Install Docker ──"

DOCKER_INSTALLED=$($SSH "docker --version 2>/dev/null && echo yes || echo no")
if [ "$DOCKER_INSTALLED" = "no" ]; then
  info "Installing Docker..."
  $SSH bash <<'REMOTE'
    # Remove any conflicting packages first
    apt-get remove -y docker.io docker-compose docker-compose-plugin > /dev/null 2>&1 || true
    # Install via Docker's official script
    curl -fsSL https://get.docker.com | sh -s -- --quiet > /dev/null 2>&1
    systemctl enable --now docker
    # Verify
    docker --version || exit 1
REMOTE
  info "Docker installed"
else
  info "Docker already installed"
fi

# ── Step 6: Upload .env ──────────────────────────────────────────
echo ""
echo "── Step 6: Upload Configuration ──"

ENV_FILE="$(dirname "$0")/backend/.env"
[ -f "$ENV_FILE" ] || error "backend/.env not found. Create it with your API keys."

$SSH "mkdir -p $REMOTE_DIR/backend"
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no "$ENV_FILE" "root@$ECS_IP:$REMOTE_DIR/backend/.env" > /dev/null 2>&1
info "Uploaded backend/.env"

# ── Step 7: Deploy ───────────────────────────────────────────────
echo ""
echo "── Step 7: Deploy Application ──"

export ECS_IP ECS_KEY="$KEY_PATH"
bash "$(dirname "$0")/deploy.sh"

echo ""
echo "════════════════════════════════════════"
info "Your app is live at: http://$ECS_IP"
echo ""
echo "  SSH access:  ssh -i $KEY_PATH root@$ECS_IP"
echo "  Logs:        ssh -i $KEY_PATH root@$ECS_IP 'cd $REMOTE_DIR && docker compose logs -f'"
echo ""
echo "  To enable HTTPS later:"
echo "    DOMAIN=yourdomain.com ECS_IP=$ECS_IP bash deploy.sh"
echo "════════════════════════════════════════"
