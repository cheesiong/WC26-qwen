# Getting Started

<cite>
**Referenced Files in This Document**
- [README.md](file://README.md)
- [SETUP.md](file://SETUP.md)
- [start.sh](file://start.sh)
- [backend/package.json](file://backend/package.json)
- [frontend/package.json](file://frontend/package.json)
- [backend/.env.example](file://backend/.env.example)
- [backend/database/seed.js](file://backend/database/seed.js)
- [backend/server.js](file://backend/server.js)
- [frontend/vite.config.js](file://frontend/vite.config.js)
- [docker-compose.yml](file://docker-compose.yml)
- [deploy.sh](file://deploy.sh)
- [setup-ecs.sh](file://setup-ecs.sh)
- [frontend/entrypoint.sh](file://frontend/entrypoint.sh)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Manual Setup](#manual-setup)
5. [Environment Variables](#environment-variables)
6. [Database Seeding](#database-seeding)
7. [Local Development](#local-development)
8. [Production Deployment](#production-deployment)
9. [Verification](#verification)
10. [Troubleshooting](#troubleshooting)
11. [Conclusion](#conclusion)

## Introduction
This guide helps you install and run the World Cup 2026 Prediction App locally and in production. The app consists of:
- A Node.js backend API with Express serving predictions, schedules, and tournament data
- A React frontend using Vite for development and Nginx for production
- SQLite for persistence and optional live data via football-data.org
- Alibaba Cloud DashScope Qwen models for AI-powered insights and multi-agent predictions

## Prerequisites
- Node.js LTS recommended for local development
- Docker and Docker Compose for containerized deployment
- An Alibaba Cloud account to obtain a DashScope API key
- Optional: football-data.org API key for live scores and form data

**Section sources**
- [README.md:106-113](file://README.md#L106-L113)
- [SETUP.md:124-151](file://SETUP.md#L124-L151)

## Quick Start
Use the convenience script to install dependencies, seed the database, and start both servers in one command. It also waits for both services to be ready before opening the frontend.

```bash
bash start.sh
```

What the script does:
- Installs backend and frontend dependencies if missing
- Copies the backend environment example to `.env` if it doesn't exist
- Seeds the database with teams and fixtures if the database file is missing
- Starts the backend API and frontend in parallel
- Waits for both services to respond and prints the frontend URL

Ports:
- Backend API: http://localhost:6173
- Frontend: http://localhost:6001

**Section sources**
- [SETUP.md:3-17](file://SETUP.md#L3-L17)
- [README.md:114-138](file://README.md#L114-L138)
- [start.sh:1-74](file://start.sh#L1-L74)

## Manual Setup
### Backend
- Navigate to the backend directory and install dependencies
- Create and edit the environment file with your API keys
- Seed the database once
- Start the backend in development or production mode

```bash
cd backend
npm install
cp .env.example .env
# Edit .env and add your keys
node database/seed.js
npm run dev  # development with auto-restart
npm start    # production
```

Ports:
- Backend API port is configurable via environment variable; default is 6173

**Section sources**
- [SETUP.md:20-41](file://SETUP.md#L20-L41)
- [backend/package.json:6-12](file://backend/package.json#L6-L12)
- [backend/server.js:19](file://backend/server.js#L19)

### Frontend
- Navigate to the frontend directory and install dependencies
- Start the development server; it proxies API requests to the backend

```bash
cd frontend
npm install
npm run dev  # opens on http://localhost:6001
```

Proxy configuration ensures API calls go to the backend running on port 6173.

**Section sources**
- [SETUP.md:42-49](file://SETUP.md#L42-L49)
- [frontend/package.json:6-14](file://frontend/package.json#L6-L14)
- [frontend/vite.config.js:11-19](file://frontend/vite.config.js#L11-L19)

## Environment Variables
Configure the backend via `backend/.env`. The environment file includes placeholders for required and optional keys.

Required:
- DASHSCOPE_API_KEY: Alibaba Cloud DashScope key for Qwen model calls

Optional:
- FOOTBALL_DATA_API_KEY: Enables live scores and form data (free tier rate-limited)
- USE_MULTI_AGENT: Set to true to activate the 5-agent Qwen prediction system
- FRONTEND_URL: CORS origin for the API (default localhost:6001)
- PORT: Backend port (default 6173)

Without a DashScope key, the app still works but uses template-generated insights. Without a football-data.org key, the app uses FIFA ratings and ELO-based synthetic form data.

**Section sources**
- [backend/.env.example:1-17](file://backend/.env.example#L1-L17)
- [README.md:139-151](file://README.md#L139-L151)

## Database Seeding
The seed script inserts all 48 teams and 72 group stage fixtures into SQLite. It checks for existing data and skips insertion if the teams table is not empty.

```bash
cd backend
node database/seed.js
```

You can also trigger seeding via the backend start script or npm script.

**Section sources**
- [backend/database/seed.js:1-69](file://backend/database/seed.js#L1-L69)
- [backend/package.json:9](file://backend/package.json#L9)
- [start.sh:33-37](file://start.sh#L33-L37)

## Local Development
There are two primary ways to run the app locally:

Option A: One-command startup
- Run the convenience script to install dependencies, seed the database, and start both servers

Option B: Manual startup
- Terminal 1: Start the backend
- Terminal 2: Start the frontend

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

The frontend proxy forwards API calls to the backend on port 6173.

**Section sources**
- [README.md:124-138](file://README.md#L124-L138)
- [frontend/vite.config.js:11-19](file://frontend/vite.config.js#L11-L19)
- [start.sh:42-47](file://start.sh#L42-L47)

## Production Deployment
### Containerized Deployment with Docker Compose
The repository includes a Docker Compose setup that builds both the backend and frontend, exposes ports 80/443, and manages HTTPS via Certbot and Nginx.

Key points:
- Backend service mounts a volume for the SQLite database
- Frontend service serves static assets via Nginx and obtains HTTPS certificates
- Environment variables are passed via the compose file and `.env`

```bash
docker compose up -d
```

Ports:
- HTTP: 80
- HTTPS: 443

Volumes:
- Database volume persists SQLite data
- Certificates volume stores Let's Encrypt certs

**Section sources**
- [docker-compose.yml:1-34](file://docker-compose.yml#L1-L34)

### Automated ECS Provisioning and Deployment
You can automate the entire process on Alibaba Cloud ECS:
- Provision an ECS instance, install Docker, upload configuration, and deploy the app
- Optionally enable HTTPS with a domain and certificate email

```bash
# First-time provisioning and deployment
aliyun configure  # set up AccessKey ID + Secret
bash setup-ecs.sh

# Subsequent deploys
ECS_IP=<your-ip> ECS_KEY=~/.ssh/aliyun-ecs.pem bash deploy.sh
```

HTTPS:
- The deployment script enables HTTPS by default and supports custom domains and certificate emails

**Section sources**
- [README.md:231-263](file://README.md#L231-L263)
- [setup-ecs.sh:1-443](file://setup-ecs.sh#L1-L443)
- [deploy.sh:1-110](file://deploy.sh#L1-L110)

## Verification
After starting the app, verify the installation by checking:
- Backend health: http://localhost:6173/api/teams
- Frontend availability: http://localhost:6001
- Database seeded: teams and group stage fixtures present

First-time usage examples:
- Open the frontend in your browser and browse the dashboard, schedule, groups, and tournament views
- View match predictions and insights
- Toggle dark/light theme and language

**Section sources**
- [README.md:114-138](file://README.md#L114-L138)
- [start.sh:53-63](file://start.sh#L53-L63)

## Troubleshooting
Common issues and resolutions:

- API key configuration
  - Ensure `DASHSCOPE_API_KEY` is set in `backend/.env`
  - If omitted, the app still runs but uses template insights and synthetic data
  - For live data, set `FOOTBALL_DATA_API_KEY` and note the free tier rate limits

- Port conflicts
  - Backend default port is 6173; change via `PORT` if needed
  - Frontend default is 6001; adjust in the frontend configuration if necessary
  - Docker Compose exposes 80/443; ensure no other service is bound to these ports

- Dependency problems
  - Reinstall dependencies in both backend and frontend directories
  - Clear node_modules and reinstall if stale or corrupted

- Database issues
  - If the database appears inconsistent, re-seed using the seed script
  - Confirm the database file exists and is writable by the backend process

- HTTPS and domain setup
  - When deploying to ECS, ensure the domain resolves and Certbot can obtain a certificate
  - Check logs for certificate renewal and Nginx configuration

**Section sources**
- [backend/.env.example:1-17](file://backend/.env.example#L1-L17)
- [backend/server.js:19](file://backend/server.js#L19)
- [frontend/vite.config.js:11-19](file://frontend/vite.config.js#L11-L19)
- [docker-compose.yml:17-28](file://docker-compose.yml#L17-L28)
- [deploy.sh:81-96](file://deploy.sh#L81-L96)

## Conclusion
You now have the essential steps to install, configure, and run the World Cup 2026 Prediction App locally and in production. Use the quick start script for a fast local setup, configure environment variables for AI and live data features, and leverage Docker Compose or Alibaba Cloud ECS for production. If you encounter issues, refer to the troubleshooting section and verify your installation using the provided endpoints and first-time usage examples.