# WC2026 Predictor

A World Cup 2026 prediction app powered by Alibaba Cloud's Qwen models. Covers all 48 teams, 72 group stage fixtures, and the knockout bracket through to the final.

## Features

- **Dashboard** — today's matches with win/draw/loss probabilities and a tournament winner leaderboard
- **Schedule** — full chronological list of all 104 matches, filterable by stage, group, status, or team
- **Match detail** — expected score, top 3 most likely scorelines, key prediction factors, pre-match intelligence (injuries, form, motivation), multi-agent dialogue viewer, and an LLM-generated analyst insight
- **Group standings** — live points table with qualification indicators and what-if scenario calculator
- **Bracket** — visual knockout tree that fills in as teams advance, with winner probabilities and Road to Final view
- **Predictions** — consolidated table of every prediction vs actual result with running accuracy stats
- **Team profiles** — per-team page with group context, full match history, ELO rating trajectory
- **About** — site purpose, AI-generated content disclaimer, no-gambling notice, and author profile
- **Dark/light theme** — persistent theme toggle stored in `localStorage`
- **i18n** — English/中文 language toggle

## Prediction Engine

A multi-agent system running on Alibaba Cloud's Qwen models. Each prediction dispatches 5 specialist agents in parallel — Statistical (Dixon-Coles backbone), H2H, Form, Intelligence, and Lineup — and an Orchestrator that detects conflicts between agents, runs a negotiation round when they disagree, and synthesises the final probability via log-pool blending.

## Tech Stack

- **Backend** — Node.js, Express, SQLite (WAL mode), CommonJS
- **Frontend** — React 18, Vite, Tailwind CSS, ES modules
- **AI** — Alibaba Cloud DashScope (Qwen models: `qwen-max`, `qwen-plus`, `qwen-turbo`)
- **Data** — [football-data.org](https://www.football-data.org/) API (optional, free tier)
- **Deployment** — Alibaba Cloud ECS

## Quick Start

```bash
bash start.sh
```

Installs dependencies, seeds the database, and starts both servers:
- Backend API: http://localhost:6173
- Frontend: http://localhost:6001

### Manual startup

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

Re-seed the database at any time:
```bash
cd backend && npm run seed
```

## Environment Variables

Copy `backend/.env.example` to `backend/.env`:

| Variable | Default | Description |
|---|---|---|
| `FOOTBALL_DATA_API_KEY` | — | Optional. Enables live scores and form data. Free tier: 10 req/min. |
| `DASHSCOPE_API_KEY` | — | Required for Qwen LLM calls (insights, intel parsing, multi-agent). Get one at dashscope.aliyuncs.com. |
| `USE_MULTI_AGENT` | `false` | Set `true` to activate the 5-agent Qwen prediction system. |
| `FRONTEND_URL` | `http://localhost:6001` | CORS origin for the API. |
| `PORT` | `6173` | Backend port. |

Without a DashScope key the prediction engine falls back to template-generated insights. Without a football-data.org key the app uses FIFA ratings and ELO-based synthetic form data.

## Project Structure

```
wc26-qwen/
├── start.sh                        # One-command dev startup
├── deploy.sh                       # Rsync + Docker rebuild to ECS
├── setup-ecs.sh                    # Automated ECS provisioning (VPC, SG, instance)
├── docker-compose.yml              # Docker setup for containerised deployment
├── backend/
│   ├── server.js                   # Express API (all routes + cron jobs)
│   ├── data/teams.js               # 48 teams, groups, fixtures, stats
│   ├── database/
│   │   ├── db.js                   # SQLite schema + connection (WAL mode)
│   │   └── seed.js                 # Seeds teams and group fixtures
│   └── services/
│       ├── predictionEngine.js     # Dixon-Coles backbone + log-pool blending
│       ├── agents/
│       │   ├── agentFramework.js   # Agent class, AgentSession, conflict detection
│       │   ├── orchestratorAgent.js # Orchestrates all agents, runs negotiation
│       │   ├── statisticalAgent.js  # DC backbone interpreter (qwen-plus)
│       │   ├── h2hAgent.js          # H2H history analyst (qwen-turbo)
│       │   ├── formAgent.js         # Recent form analyst (qwen-turbo)
│       │   ├── intelAgent.js        # Injury/news interpreter (qwen-plus)
│       │   └── lineupAgent.js       # Confirmed lineup analyst (qwen-plus)
│       ├── bracketService.js       # Knockout bracket simulation + Monte Carlo
│       ├── dataService.js          # API + web scraping for live data
│       ├── analysisService.js      # Post-match grading + standings
│       ├── calibrationService.js   # Temperature scaling + DC ρ refit
│       ├── h2hService.js           # Real head-to-head history (47k matches)
│       ├── lineupService.js        # Lineup and squad data
│       ├── qwenClient.js           # DashScope axios wrapper
│       ├── scenarioService.js      # Group qualification scenarios
│       └── suspensionService.js    # Yellow/red card suspension tracker
└── frontend/
    └── src/
        ├── App.jsx                 # Router + nav + bottom tab bar
        ├── api/client.js           # All API calls
        ├── contexts/
        │   ├── ThemeContext.jsx    # Dark/light theme
        │   └── LanguageContext.jsx # EN/中文 language toggle
        ├── i18n/translations.js    # Translation strings
        ├── pages/
        │   ├── Dashboard.jsx       # Home — hero + today's matches + top teams
        │   ├── Schedule.jsx        # Fixtures — all 104 matches, date/stage filters
        │   ├── MatchDetail.jsx     # Full prediction breakdown per match
        │   ├── Groups.jsx          # Group standings + what-if calculator
        │   ├── Tournament.jsx      # Knockout bracket + Monte Carlo winner
        │   ├── Predictions.jsx     # All predictions vs actuals + accuracy stats
        │   └── TeamDetail.jsx      # Per-team profile + ELO trajectory
        └── components/
            ├── MatchCard.jsx       # Match summary card
            ├── PredictionBar.jsx   # Win/draw/loss probability bar
            ├── GroupTable.jsx      # Group standings table
            ├── FlagImage.jsx       # Team flag SVG loader
            ├── SEO.jsx             # Per-page meta tags
            └── TangOrnaments.jsx   # Chinese decorative watermarks (dragon, phoenix, etc.)
```

## Testing

```bash
# Frontend (Vitest + Testing Library)
cd frontend && npm run test:run   # single run
cd frontend && npm test           # watch mode

# Backend (Node.js built-in test runner)
cd backend && npm test
```

## Linting & Formatting

ESLint + Prettier in both packages.

```bash
npm run lint      # check
npm run format    # auto-fix
```

## Deployment

Target: **Alibaba Cloud ECS** with Docker Compose.

### Automated (recommended)

```bash
# First-time: provision ECS instance + install Docker + deploy app
aliyun configure   # set up AccessKey ID + Secret
bash setup-ecs.sh  # creates VPC, security group, instance, deploys app

# Subsequent deploys: sync code + rebuild containers
ECS_IP=<your-ip> ECS_KEY=~/.ssh/aliyun-ecs.pem bash deploy.sh
```

### With HTTPS (Let's Encrypt)

```bash
ECS_IP=<your-ip> ECS_KEY=~/.ssh/aliyun-ecs.pem DOMAIN=yourdomain.com CERT_EMAIL=you@example.com bash deploy.sh
```

### Manual (on ECS instance)

```bash
git clone <your-repo>
cd wc26-qwen
cp backend/.env.example backend/.env
# Edit backend/.env with your keys
docker compose up -d
```

Set environment variables via `backend/.env`. See `docker-compose.yml` for service definitions.
