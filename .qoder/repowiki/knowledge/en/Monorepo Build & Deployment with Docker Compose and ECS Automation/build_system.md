The WC2026 Qwen Prediction Platform employs a monorepo structure containing a Node.js backend and a React frontend, managed through a combination of local development scripts and automated cloud deployment pipelines.

### Build System & Tools
- **Local Development**: The project uses `npm` for dependency management in both `backend/` and `frontend/` directories. A root-level `start.sh` script orchestrates the local environment by installing dependencies, seeding the SQLite database if missing, and launching both the Express server (port 6173) and Vite dev server (port 6001) in parallel.
- **Containerization**: Docker is used for production builds. 
  - The **Backend** (`backend/Dockerfile`) uses a `node:20-alpine` image, installing production dependencies via `npm ci` and running the server.
  - The **Frontend** (`frontend/Dockerfile`) employs a multi-stage build: it first compiles the React application using `node:20-alpine` and Vite, then serves the static assets using `nginx:alpine`. The Nginx container includes `certbot` for automated SSL certificate management.
- **Orchestration**: `docker-compose.yml` defines two services (`backend` and `frontend`). It manages persistent volumes for the SQLite database (`db_data`) and Let's Encrypt certificates (`certbot_etc`, `certbot_var`). The frontend service exposes ports 80 and 443, while the backend remains internal to the Docker network.

### Deployment Pipeline
- **ECS Provisioning**: `setup-ecs.sh` automates the creation of Alibaba Cloud ECS instances. It uses the `aliyun` CLI to configure VPCs, security groups (opening ports 22, 80, 443), SSH key pairs, and Ubuntu 22.04 instances. It also installs Docker on the remote host.
- **Continuous Deployment**: `deploy.sh` handles application updates. It uses `rsync` to synchronize source code to the remote ECS instance (excluding `node_modules`, `.git`, and local database files). It then triggers a remote `docker compose up -d --build` to rebuild and restart containers. The script includes health checks to verify backend API responsiveness and HTTPS availability.
- **SSL Management**: The frontend's `entrypoint.sh` script dynamically configures Nginx. If a `DOMAIN` environment variable is set, it attempts to obtain or renew SSL certificates via Certbot using webroot validation, switching Nginx to an SSL-enabled configuration template.

### Key Conventions
- **Environment Configuration**: Secrets and configuration are managed via `.env` files, which are explicitly excluded from version control and rsync deployments. Developers must manually provision `.env` on production servers.
- **Database Persistence**: The SQLite database is stored in a Docker volume (`/data`) to survive container rebuilds. Backup and corruption handling scripts exist in `backend/scripts/` but are not part of the automated build pipeline.
- **Testing**: Both modules include `vitest` (frontend) and Node.js native test runners (backend) configured in their respective `package.json` files, though testing is not currently integrated into the CI/CD deployment scripts.