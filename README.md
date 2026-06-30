# WC2026 by Qwen

A World Cup 2026 prediction app powered by Alibaba Cloud's Qwen multi-agent AI system. Covers all 48 teams, 72 group stage fixtures, and the knockout bracket through to the final.

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

## Multi-Agent Prediction System

The prediction engine is a **5-agent AI system** that runs on Alibaba Cloud's Qwen models. When `USE_MULTI_AGENT=true`, each match prediction dispatches 5 specialist LLM agents in parallel, coordinated by an Orchestrator that handles conflict detection and negotiation.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      ORCHESTRATOR AGENT                          │
│  1. Build match context from precomputed backbone               │
│  2. Pre-fetch domain data (H2H, form, intel, lineup)            │
│  3. Dispatch agents in parallel (Round 1)                       │
│  4. Detect conflicts (Δ ≥ 20% triggers negotiation)             │
│  5. Run rebuttal round where agents disagree (Round 2)          │
│  6. Blend probabilities via log-pool + temperature scaling      │
│  7. Generate final insight (qwen-plus)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ Statistical   │   │    Form       │   │    Intel      │
│    Agent      │   │    Agent      │   │    Agent      │
│  (qwen-plus)  │   │  (qwen-turbo) │   │  (qwen-plus)  │
│               │   │               │   │               │
│ Dixon-Coles   │   │ Last 10 match │   │ Injuries,     │
│ backbone:     │   │ results with  │   │ motivation,   │
│ λ values,     │   │ competition   │   │ rotation      │
│ ELO ratings,  │   │ weighting     │   │ (web scraping)│
│ α/β params    │   │               │   │               │
└───────────────┘   └───────────────┘   └───────────────┘

        ┌─────────────────────┐   ┌─────────────────────┐
        │      H2H Agent      │   │    Lineup Agent     │
        │    (qwen-turbo)     │   │    (qwen-plus)      │
        │                     │   │                     │
        │ Head-to-head record │   │ Confirmed starting  │
        │ (47k match dataset) │   │ XI (~60min before   │
        │ Skips if <2 meets   │   │ kickoff)            │
        │                     │   │ Skips if no data    │
        └─────────────────────┘   └─────────────────────┘
```

### Specialist Agents

| Agent | Model | Data Source | Role |
|-------|-------|-------------|------|
| **Statistical** | `qwen-plus` | Dixon-Coles backbone output | Interprets λ values, ELO gaps, α/β attack/defence ratings. Does NOT rerun Poisson math — translates precomputed numbers into natural language with statistical reasoning. |
| **Form** | `qwen-turbo` | football-data.org API | Evaluates last 10 matches per team with competition weighting (WC finals > qualifiers > Nations League > friendlies). |
| **H2H** | `qwen-turbo` | 47k international match dataset | Interprets competition-weighted head-to-head history. Auto-skips when fewer than 2 meetings exist. |
| **Intel** | `qwen-plus` | Google News RSS + Qwen extraction | Interprets injuries, suspensions, squad rotation, motivation. Calibrated: 1 key injury = ~3-5% shift, 2+ = ~8-12%. |
| **Lineup** | `qwen-plus` | Lineup service | Analyzes confirmed starting XI strength scores and formation matchups. Activates ~60-75 min before kickoff; skips otherwise. |

### Negotiation Protocol

When agents disagree (probability delta ≥ 20%), a two-round negotiation occurs:

1. **Round 1** — All agents run simultaneously, producing structured JSON: `{probability, confidence, evidence, weightRecommendation, flags}`

2. **Conflict Detection** — Pairwise probability deltas checked. If any outcome differs by ≥ 20%, that pair enters negotiation.

3. **Round 2 (Rebuttal)** — Conflicting agents receive each other's arguments and produce a rebuttal. The agent that moves less "wins."

4. **Weight Adjustment**:
   - Winner: 1.3× weight boost
   - Loser: weight cut to 0.6×
   - This penalizes overconfident agents who can't defend their position

5. **Final Blend** — Log-pool (geometric mean) of all agent probabilities, weighted by adjusted weights + confidence scores.

### Output

Each prediction stores:
- **`agent_session_id`** — UUID tracking the full negotiation session
- **`methodology`** — Agent weights used (e.g., `StatisticalAgent(37%) + FormAgent(30%) + IntelAgent(34%)`)
- **`insight`** — Rich LLM-generated analyst commentary referencing specific data points

Example insight:
> "Colombia's 43% win probability isn't just noise — it reflects their sharper attack (α=1.806 vs Portugal's 1.698), recent 3-1 win over Uzbekistan, and the statistical model's scepticism about Portugal's ELO advantage translating to open-play dominance."

### Single-Model Fallback

When `USE_MULTI_AGENT=false`, the engine uses:
- Pure Dixon-Coles Poisson model with ELO ratings
- Form/intel signals computed in code (no LLM calls)
- Faster (~1-2s per match) but less nuanced insights

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

## Automated Tasks (Cron Jobs)

The backend runs several scheduled tasks (all times in SGT / Asia/Singapore):

| Job | Schedule | Description |
|-----|----------|-------------|
| **Live results sync** | Every 5 minutes | Fetches live scores from football-data.org, updates match statuses (LIVE/COMPLETED) |
| **Prediction regeneration** | Hourly, midnight–noon | Re-runs predictions for upcoming matches with latest data |
| **Prediction regeneration** | 8:30pm, 9:30pm | Evening prediction update for primetime matches |
| **Lineup fetch** | Every 15 minutes | Checks for confirmed lineups within 2 hours of kickoff; triggers re-prediction when found |
| **Bracket update** | Hourly, midnight–noon | Advances winners to next round, re-predicts upcoming knockout matches |
| **SSL certificate renewal** | Daily, 3:00am | Certbot auto-renewal (container-level cron, only if `DOMAIN` is set) |

### Prediction Accuracy Tracking

The bracket view displays prediction accuracy indicators for completed matches:
- **✓ Green tick** — team was correctly predicted to advance
- **✗ Red cross** — team was wrongly predicted (or lost when predicted to win)

Predictions are based on 90-minute FT results. Extra time and penalties are stored separately and only used to determine knockout round winners.
