## Overview

The WC2026 AI Prediction Platform uses a **monorepo structure** with two independently built services (backend Node.js API, frontend React SPA) orchestrated through **Docker Compose** for production deployment. Development relies on npm scripts and shell-based orchestration; CI/CD is implemented via custom bash automation targeting Alibaba Cloud ECS.

---

## Build System Architecture

### Dual-Service Monorepo

The repository contains two self-contained workspaces:

| Service | Runtime | Build Tool | Output |
|---------|---------|------------|--------|
| `backend/` | Node.js 20 (Express) | npm + nodemon (dev) | In-place server execution |
| `frontend/` | Node.js 20 (React 18 + Vite) | Vite + react-snap | Static assets in `dist/` |

There is **no root-level build orchestrator** (no Makefile, no lerna/nx/turborepo). Each workspace manages its own dependencies via separate `package.json` and `package-lock.json` files.

### Backend Build Flow

- **Dependencies**: Installed via `npm ci --omit=dev` in Docker; `npm install` in development.
- **Entry point**: `server.js`, preceded by database seeding (`node database/seed.js`).
- **Development**: `npm run dev` uses `nodemon` for hot-reload.
- **Testing**: Native Node.js test runner (`node --test services/*.test.js`).
- **Linting/Formatting**: ESLint 9 (flat config) + Prettier.

### Frontend Build Flow

- **Build tool**: Vite 5 with `@vitejs/plugin-react`.
- **Target**: `chrome79/es2019` — deliberately lowered to support `react-snap`'s bundled Chromium 71 for static pre-rendering.
- **Post-build step**: `react-snap` generates static HTML snapshots for SEO-critical routes (`/`, `/predictions`, `/schedule`, `/groups`, `/tournament`, etc.).
- **Testing**: Vitest with jsdom environment.
- **Dev server**: Runs on port 6001 with proxy to backend at `localhost:6173`.

---

## Containerization Strategy

### Multi-stage Docker Builds

**Backend (`backend/Dockerfile`)** — Single-stage, minimal:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 5173
CMD ["npm", "start"]
```
Note: The `EXPOSE 5173` directive appears inconsistent with the actual backend port (6173 per `vite.config.js` proxy target and deploy health checks).

**Frontend (`frontend/Dockerfile`)** — Two-stage build:
1. **Build stage** (`node:20-alpine`): Installs all deps (including dev), runs `npm run build` then `react-snap` post-build.
2. **Runtime stage** (`nginx:alpine`): Serves static files from `dist/`, includes `certbot` and `bash` for runtime SSL certificate management.

The frontend container uses a custom `entrypoint.sh` that:
- Generates nginx config from templates via `envsubst`.
- Optionally obtains/renews Let's Encrypt certificates via certbot webroot challenge.
- Sets up daily cron-based cert renewal.
- Falls back to HTTP-only if no `DOMAIN` env var is set.

### Docker Compose Orchestration

`docker-compose.yml` defines two services:
- **backend**: Internal-only (not exposed to host), mounts persistent `db_data` volume for SQLite.
- **frontend**: Exposes ports 80/443, depends on backend, mounts certbot volumes for SSL persistence.
- Communication: Frontend proxies API requests to `http://backend:6173` (Docker internal network).

---

## Deployment Pipeline

### Production: Alibaba Cloud ECS

Deployment is fully automated via two bash scripts:

**`setup-ecs.sh`** — One-time infrastructure provisioning:
1. Creates VPC, VSwitch, and security group (ports 22, 80, 443 open).
2. Generates SSH key pair (`~/.ssh/aliyun-ecs.pem`).
3. Provisions ECS instance (2 vCPU, 4 GB RAM, Ubuntu 22.04, 40 GB ESSD).
4. Allocates public IP, waits for SSH availability.
5. Installs Docker via official script.
6. Uploads `backend/.env`.
7. Invokes `deploy.sh`.

**`deploy.sh`** — Incremental application deployment:
1. `rsync` source files to ECS (excludes `node_modules/`, `dist/`, `.db` files, `.env`).
2. Validates `backend/.env` exists on remote.
3. Runs `docker compose up -d --build` remotely.
4. Prunes dangling images.
5. Performs health checks against backend API and HTTPS endpoint.

Environment variables control behavior:
- `ECS_IP`: Target server address.
- `DOMAIN`: Enables HTTPS via Let's Encrypt (default: `qwen.wc2026ai.com`).
- `CERT_EMAIL`: Contact email for certificate registration.

### Development: Local Startup

**`start.sh`** — Single-command local development:
1. Installs dependencies for both workspaces if `node_modules/` missing.
2. Copies `.env.example` to `.env` if absent.
3. Seeds SQLite database on first run.
4. Launches backend (`npm start`) and frontend (`npm run dev`) in parallel.
5. Polls both servers until responsive, then prints access URL (`http://localhost:6001`).
6. Traps `SIGINT`/`SIGTERM` to cleanly shut down both processes.

### Alternative Frontend Hosting

`frontend/vercel.json` provides SPA routing rewrites for Vercel deployment, though the primary production path is ECS + Docker Compose.

---

## Code Quality Tooling

Both workspaces share identical lint/format tooling:
- **ESLint 9** with flat config (`eslint.config.mjs`).
- **Prettier** for formatting.
- Backend config: Node.js globals, CommonJS source type.
- Frontend config: React plugins (`eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`), browser + Jest globals for tests.

Scripts available in both `package.json` files:
- `npm run lint` — ESLint check.
- `npm run format` — Prettier auto-fix.

---

## Developer Conventions & Rules

1. **Never commit sensitive files**: `.env`, `*.db`, `node_modules/`, `dist/` are excluded via `.gitignore` and rsync filters.
2. **Database state is ephemeral in builds**: SQLite databases are excluded from sync; they persist only via Docker volumes or local `data/` directory.
3. **Environment configuration**: Copy `.env.example` to `.env` and populate API keys before first run. The deploy script aborts if `.env` is missing on the target server.
4. **Port conventions**: Backend listens on 6173; frontend dev server on 6001. Docker EXPOSE in backend Dockerfile (5173) is stale and should be corrected.
5. **HTTPS is opt-in via domain**: Set `DOMAIN` env var to enable automatic Let's Encrypt provisioning. Without it, the app serves over HTTP only.
6. **No CI/CD platform integration**: There are no GitHub Actions, GitLab CI, or similar pipeline configs. Deployment is entirely script-driven via SSH + rsync.
7. **Version pinning**: Both workspaces use `package-lock.json` for deterministic installs. Docker builds use `npm ci` (not `npm install`) for reproducibility.
8. **Pre-rendering for SEO**: The frontend build includes `react-snap` to generate static HTML for key routes, improving initial load and search engine indexing.