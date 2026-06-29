# Configuration System

The WC2026 Qwen Prediction Platform uses an **environment-variable-driven configuration** approach, orchestrated through **Docker Compose** for production and shell scripts for local development. There is no dedicated configuration framework (e.g., `config/` directory, YAML/TOML config files, or a centralized config loader). All runtime settings flow through `.env` files and environment variables.

## What System/Approach Is Used

### Core Pattern: Environment Variables + `.env` Files

Configuration is managed entirely through environment variables loaded from `.env` files using the [`dotenv`](https://www.npmjs.com/package/dotenv) package in the backend and Vite's built-in `import.meta.env` handling in the frontend.

- **Backend**: Uses `require('dotenv').config({ path: ... })` at the top of `server.js` to load `backend/.env` into `process.env`.
- **Frontend**: Relies on Vite's native support for `VITE_*` prefixed variables via `import.meta.env.VITE_*`.

### No Centralized Config Module

There is no `config/` directory, no configuration schema validation, and no hierarchical config merging. Each service reads `process.env.*` directly where needed.

## Key Files and Packages

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Production orchestration; injects env vars and mounts `.env` file into the backend container |
| `backend/.env.example` | Template documenting all required backend environment variables |
| `backend/.env` | Actual backend secrets (gitignored); loaded by `dotenv` at startup |
| `frontend/.env.example` | Template documenting all required frontend build-time variables |
| `frontend/.env.local` | Local overrides (gitignored); used during development |
| `backend/server.js` | Entry point; loads `.env` via `dotenv`, reads `PORT`, `FRONTEND_URL` |
| `backend/database/db.js` | Reads `DB_PATH` from env, defaults to `data/worldcup2026.db` |
| `frontend/vite.config.js` | Dev server proxy config (`/api` → `http://localhost:6173`) |
| `frontend/entrypoint.sh` | Runtime nginx config generation via `envsubst` for `BACKEND_URL`, `DOMAIN`, `CERT_EMAIL` |
| `deploy.sh` | Deployment script that passes `DOMAIN` and `CERT_EMAIL` as env vars to Docker Compose |
| `start.sh` | Local dev launcher; auto-creates `backend/.env` from `.env.example` if missing |

## Architecture and Conventions

### Backend Configuration

The backend reads environment variables directly at point-of-use across multiple modules:

```javascript
// server.js — line 1, 19, 21
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const PORT = process.env.PORT || 6173;
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:6001' }));

// database/db.js — line 5
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/worldcup2026.db');

// services/dataService.js — line 19
const API_KEY = process.env.FOOTBALL_DATA_API_KEY || '';

// services/qwenClient.js — lines 15, 32, 60
const DASHSCOPE_BASE_URL = process.env.DASHSCOPE_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`
if (!process.env.DASHSCOPE_API_KEY) { /* error */ }

// services/predictionEngine.js — lines 57-58
if (process.env.USE_MULTI_AGENT === 'true') return true;
if (process.env.USE_MULTI_AGENT === 'false') return false;
```

**Key backend env vars** (from `.env.example`):
- `FOOTBALL_DATA_API_KEY` — External API key for football-data.org
- `DASHSCOPE_API_KEY` — Alibaba Cloud DashScope API key for Qwen LLM calls
- `FRONTEND_URL` — CORS origin URL
- `PORT` — Server port (default 6173)
- `USE_MULTI_AGENT` — Feature flag (`true`/`false`) to enable multi-agent prediction system
- `INDEXNOW_KEY` — Optional SEO indexing key
- `ODDS_API_KEY` — Optional odds data API key

### Frontend Configuration

The frontend uses Vite's `import.meta.env` for build-time variable injection:

```javascript
// frontend/src/api/client.js — lines 3-5
const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';
```

**Key frontend env vars** (from `.env.example`):
- `VITE_API_URL` — Backend API base URL (blank for local dev; Vite proxy handles it)
- `VITE_SITE_URL` — Production domain for Open Graph tags and sitemap generation
- `VITE_GSC_VERIFICATION` — Google Search Console verification token
- `VITE_ADMIN_KEY` — Admin authentication key (stored in `.env.local`, gitignored)

### Docker Compose Layering

Production configuration is layered through `docker-compose.yml`:

```yaml
services:
  backend:
    environment:
      NODE_ENV: production
      DB_PATH: /data/worldcup2026.db
    env_file:
      - ./backend/.env          # Secrets mounted from host
    volumes:
      - db_data:/data           # Persistent DB volume

  frontend:
    environment:
      BACKEND_URL: http://backend:6173   # Internal Docker network URL
      DOMAIN: "${DOMAIN:-}"              # Passed from deploy.sh
      CERT_EMAIL: "${CERT_EMAIL:-}"      # Passed from deploy.sh
    volumes:
      - certbot_etc:/etc/letsencrypt     # SSL certs persisted
```

The `DOMAIN` and `CERT_EMAIL` variables are passed from `deploy.sh` into Docker Compose via shell export, then consumed by `frontend/entrypoint.sh` to dynamically generate nginx configuration.

### Nginx Runtime Configuration via `envsubst`

The frontend container uses template-based nginx configuration:

1. `nginx.conf.template` — HTTP-only config with `${BACKEND_URL}` placeholder
2. `nginx-ssl.conf.template` — HTTPS config with `DOMAIN_PLACEHOLDER` and `${BACKEND_URL}`
3. `entrypoint.sh` — At container startup:
   - Runs `envsubst` to replace `${BACKEND_URL}` in templates
   - If `DOMAIN` is set and SSL cert exists, switches to HTTPS config
   - If `DOMAIN` is set but no cert, runs `certbot` to obtain one
   - Sets up cron for automatic cert renewal

### Deployment Script Configuration

`deploy.sh` controls production deployment with these configurable variables:

```bash
ECS_IP="${ECS_IP:-43.98.192.47}"       # ECS public IP
ECS_USER="${ECS_USER:-root}"            # SSH user
ECS_KEY="${ECS_KEY:-$HOME/.ssh/aliyun-ecs.pem}"  # SSH key path
DOMAIN="${DOMAIN:-qwen.wc2026ai.com}"   # Production domain
CERT_EMAIL="${CERT_EMAIL:-cheesiong@gmail.com}"  # Let's Encrypt email
```

The script validates that `backend/.env` exists on the remote ECS instance before deploying, preventing misconfigured deployments.

### Local Development Configuration

`start.sh` provides a zero-config local setup:

1. Auto-installs dependencies if `node_modules/` is missing
2. Copies `backend/.env.example` to `backend/.env` if `.env` doesn't exist
3. Seeds the SQLite database on first run
4. Starts both backend (`npm start`) and frontend (`npm run dev`) in parallel
5. Waits for health checks before printing the ready URL

## Rules Developers Should Follow

### 1. Never Commit `.env` Files

Both `backend/.env` and `frontend/.env.local` are gitignored. Always use `.env.example` as the template for new environment variables.

### 2. Backend Env Var Naming Convention

Use `UPPER_SNAKE_CASE` for all backend environment variables. Prefix external API keys with their service name (e.g., `FOOTBALL_DATA_API_KEY`, `DASHSCOPE_API_KEY`).

### 3. Frontend Env Var Prefix Requirement

All frontend environment variables **must** be prefixed with `VITE_` to be exposed to client-side code via `import.meta.env`. Variables without this prefix are only available in Node.js contexts (e.g., build scripts).

### 4. Provide Sensible Defaults

Every `process.env.*` access should include a fallback default:

```javascript
const PORT = process.env.PORT || 6173;
const API_KEY = process.env.FOOTBALL_DATA_API_KEY || '';
```

This ensures the application can start even if an optional env var is missing.

### 5. Feature Flags Use String Comparison

Boolean feature flags like `USE_MULTI_AGENT` are compared as strings (`'true'`/`'false'`), not parsed as booleans. This avoids issues with dotenv's string-only behavior.

### 6. Secrets Are Container-Mounted, Not Baked In

In production, `backend/.env` is mounted as an `env_file` in Docker Compose rather than being `COPY`ed into the image. This keeps secrets out of the container image layers.

### 7. Database Path Is Configurable

The SQLite database path is controlled by `DB_PATH`. In Docker, it points to `/data/worldcup2026.db` (a named volume). Locally, it defaults to `backend/data/worldcup2026.db`.

### 8. CORS Origin Must Match Frontend URL

The `FRONTEND_URL` env var controls the CORS origin. In production, this must match the actual deployed frontend domain to avoid cross-origin errors.

### 9. Add New Env Vars to `.env.example`

When introducing a new environment variable, always document it in the corresponding `.env.example` file with a comment explaining its purpose and where to obtain the value.

### 10. Nginx Config Uses `envsubst` Placeholders

Any new nginx configuration that needs runtime values must use `${VAR_NAME}` syntax compatible with `envsubst`, and the variable must be exported in the Docker Compose `environment` section.
