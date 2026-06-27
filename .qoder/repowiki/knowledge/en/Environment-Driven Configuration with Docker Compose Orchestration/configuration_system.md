## Configuration System Overview

The WC2026 AI Prediction Platform uses a **conventional environment-variable-based configuration** approach, layered across three deployment contexts: local development, Docker Compose production, and cloud (Alibaba Cloud ECS) deployment. There is no dedicated configuration framework (e.g., `config/` directory, YAML/TOML files, or a config-loading library beyond `dotenv`).

---

## Key Files

| File | Purpose |
|------|---------|
| `backend/.env.example` | Template for backend secrets and runtime flags |
| `frontend/.env.example` | Template for frontend build-time variables |
| `docker-compose.yml` | Production container orchestration; injects env vars into containers |
| `deploy.sh` | Deployment script that validates `.env` presence on remote ECS |
| `backend/server.js` | Entry point; loads `.env` via `dotenv` at line 1 |
| `frontend/vite.config.js` | Dev server proxy config (hardcoded `localhost:6173`) |
| `frontend/entrypoint.sh` | Runtime nginx config generation using `envsubst` |
| `frontend/nginx.conf.template` | Nginx reverse-proxy template with `${BACKEND_URL}` placeholder |

---

## Architecture and Conventions

### Backend Configuration (`backend/`)

- **Loading mechanism**: `require('dotenv').config({ path: ... })` in `server.js` (line 1) loads `backend/.env` before any other module executes.
- **Access pattern**: All services read configuration directly from `process.env.*` — there is no centralized config object or validation layer.
- **Key environment variables**:
  - `FOOTBALL_DATA_API_KEY` — external API key for match data and lineups
  - `DASHSCOPE_API_KEY` — Alibaba Cloud LLM API key for multi-agent predictions
  - `USE_MULTI_AGENT` — feature flag (`true`/`false`) controlling whether the orchestrator agent system is active
  - `FRONTEND_URL` — CORS origin whitelist
  - `PORT` — server listen port (default `6173`)
  - `INDEXNOW_KEY` — optional SEO ping key
  - `ODDS_API_KEY` — optional odds data source

- **Feature flag precedence** (`predictionEngine.js`, lines 56–61): The `USE_MULTI_AGENT` flag follows a three-tier resolution order:
  1. Environment variable (`process.env.USE_MULTI_AGENT`) takes highest priority
  2. Falls back to database `model_config` table (`use_multi_agent` key)
  3. Defaults to disabled (`0`)

### Frontend Configuration (`frontend/`)

- **Build-time variables**: Uses Vite's `import.meta.env.VITE_*` convention. Variables must be prefixed with `VITE_` to be exposed to client-side code.
- **Key environment variables**:
  - `VITE_API_URL` — backend API base URL (empty in dev; Vite proxy handles `/api` → `localhost:6173`)
  - `VITE_SITE_URL` — production domain for Open Graph tags
  - `VITE_GSC_VERIFICATION` — Google Search Console verification token
  - `VITE_ADMIN_KEY` — stored in `.env.local` (gitignored); used for admin operations

- **Runtime configuration**: The frontend has **no runtime config file**. The only dynamic behavior is the nginx reverse proxy, which substitutes `${BACKEND_URL}` at container startup via `envsubst` in `entrypoint.sh`.

### Docker Compose Layering

The `docker-compose.yml` defines two services with distinct configuration injection strategies:

- **Backend service**:
  - Uses `env_file: ./backend/.env` to load the full `.env` file into the container
  - Sets `NODE_ENV=production` and `DB_PATH=/data/worldcup2026.db` as explicit environment overrides
  - Database persists via named volume `db_data`

- **Frontend service**:
  - Receives `BACKEND_URL=http://backend:6173` (internal Docker network address)
  - Accepts `DOMAIN` and `CERT_EMAIL` from shell environment (passed via `deploy.sh`)
  - SSL certificate management is handled at runtime by `entrypoint.sh` using Certbot

### Deployment Script (`deploy.sh`)

- Validates that `backend/.env` exists on the remote ECS instance before proceeding (lines 56–65)
- Passes `DOMAIN` and `CERT_EMAIL` as environment variables to `docker compose up`
- Excludes `.env` from rsync (line 50), enforcing that secrets are managed separately on the target host

---

## Rules Developers Should Follow

1. **Never commit `.env` files**: Both `backend/.env` and `frontend/.env.local` are gitignored. Use `.env.example` as the template for new developers.

2. **Backend secrets go in `backend/.env`**: API keys (`FOOTBALL_DATA_API_KEY`, `DASHSCOPE_API_KEY`) and feature flags (`USE_MULTI_AGENT`) belong here. On production ECS, this file must be manually copied via `scp` before the first deploy.

3. **Frontend public config goes in `.env.local` or CI variables**: Variables prefixed with `VITE_` are baked into the build at compile time. For production, set these via Render's dashboard or Docker Compose environment section — do not rely on `.env.local` in containers.

4. **Feature flags support dual sources**: For `USE_MULTI_AGENT`, the environment variable overrides the database. Use the DB `model_config` table for runtime toggling without restarts, but set the env var for permanent control.

5. **Do not add a `config/` directory or YAML files**: The project deliberately avoids configuration frameworks. New settings should follow the existing `process.env.*` pattern with defaults defined inline at the point of use.

6. **Nginx backend URL is injected at runtime**: If you need to change the backend URL in production, set the `BACKEND_URL` environment variable in `docker-compose.yml` or pass it via `deploy.sh`. Do not hardcode URLs in `nginx.conf.template`.

7. **CORS origin must match `FRONTEND_URL`**: The backend's CORS middleware (line 21 of `server.js`) reads `process.env.FRONTEND_URL`. Ensure this matches your actual frontend domain to avoid cross-origin errors.
