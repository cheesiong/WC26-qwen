# ⚽ WC2026 Predictor — Setup Guide

## Quick Start (Local)

```bash
# From the wc26-qwen/ folder:
bash start.sh
```

The script will:
1. Install all dependencies (first run only)
2. Seed the database with all 48 teams and 72 group stage fixtures
3. Start the backend API on http://localhost:6173
4. Start the frontend on http://localhost:6001

Open http://localhost:6001 in your browser.

---

## Manual Setup

### Backend

```bash
cd backend

# Install dependencies
npm install

# Create your .env file
cp .env.example .env
# Edit .env and add your DASHSCOPE_API_KEY and FOOTBALL_DATA_API_KEY

# Seed the database (run once)
node database/seed.js

# Start the API server
npm start         # production
npm run dev       # development (auto-restart on file changes)
```

### Frontend

```bash
cd frontend

npm install
npm run dev       # opens on http://localhost:6001
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DASHSCOPE_API_KEY` | For AI features | Alibaba Cloud DashScope key for Qwen model calls. Get one at [dashscope.aliyuncs.com](https://dashscope.aliyuncs.com). |
| `FOOTBALL_DATA_API_KEY` | Optional | Enables live scores and form data. Free tier: 10 req/min. Get one at [football-data.org](https://www.football-data.org/). |
| `USE_MULTI_AGENT` | Optional | Set `true` to activate the 5-agent Qwen prediction system. Default: `false`. |
| `FRONTEND_URL` | Dev | CORS origin. Default: `http://localhost:6001`. |
| `PORT` | Optional | Backend port. Default: `6173`. |

Without `DASHSCOPE_API_KEY` the app still works — insights fall back to template text and intel parsing uses regex fallback. Without `FOOTBALL_DATA_API_KEY` the app uses FIFA ratings and ELO-based synthetic form data.

---

## How to Use the App

### Dashboard
- Shows which tournament phase is active (Group Stage, Round of 32, etc.)
- Highlights the teams most likely to win, with probability
- Surfaces upcoming matches for the next few days with prediction summaries
- Shows overall prediction accuracy as a trust signal

### Schedule
- Full chronological list of all 104 matches
- Filterable by stage

### Matches → [Match] → Prediction
- Click any match for the full prediction breakdown
- Shows win/draw/loss probabilities, expected score, most likely scoreline
- Lists key factors: ELO, form, H2H, injuries, WC experience
- If multi-agent is enabled, shows the Agent Analysis panel with individual agent outputs, detected conflicts, and negotiation rounds

### Groups
- Live standings with points, GD, goals
- Green border = qualified position (top 2 per group)
- What-if calculator shows qualification scenarios for remaining matches

### Tournament → Bracket
- Visual knockout tree — actual results for completed rounds, predicted for future
- Tournament winner probabilities (50,000-simulation Monte Carlo)
- Road to Final — snapshots of how the bracket evolved

### Predictions
- Every model forecast vs actual result in one place
- Filterable by status (upcoming / completed) and group

---

## Prediction Engine

### Multi-Agent System (when `USE_MULTI_AGENT=true`)

5 specialist agents run in parallel on Qwen models, then an Orchestrator synthesises their outputs:

| Agent | Model | Domain |
|---|---|---|
| StatisticalAgent | qwen-plus | Dixon-Coles λ values, ELO ratings, home advantage |
| H2HAgent | qwen-turbo | Head-to-head history (47k+ matches since 1872) |
| FormAgent | qwen-turbo | Recent form — last 10 matches, competition-weighted |
| IntelAgent | qwen-plus | Pre-match intelligence: injuries, rotation, motivation |
| LineupAgent | qwen-plus | Confirmed starting XI (active ~60 min before kickoff) |
| OrchestratorAgent | qwen-max | Dispatches agents, detects conflicts, runs negotiation, synthesises |

Conflicts between agents (probability gap > 20%) trigger a Round 2 negotiation where both sides challenge each other's evidence. The agent that concedes more has its weight reduced; the one that holds its position gets a boost.

### Legacy Path (when `USE_MULTI_AGENT=false`)

Dixon-Coles bivariate Poisson backbone blended with H2H, form, intel, lineup, and rest-days signals via log-pool. Each completed match refits the temperature calibration and DC ρ parameters.

---

## Deploy to Alibaba Cloud ECS

```bash
# On ECS instance — SSH in and run:
git clone <your-repo>
cd wc26-qwen
cp backend/.env.example backend/.env
# Edit backend/.env with your keys
docker compose up -d
```

**Required ECS setup:**
- Install Docker + Docker Compose
- Open Security Group ports: 80 (HTTP), 443 (HTTPS), 22 (SSH)
- Mount an ESSD cloud disk at `/data` for SQLite persistence
- Point `DB_PATH` in `.env` to `/data/worldcup2026.db`
- Get a DashScope API key from the Alibaba Cloud console

The `docker-compose.yml` builds both the Node.js backend and the nginx frontend container and wires them together automatically.

---

## File Structure

```
wc26-qwen/
├── start.sh                        ← Run this to start everything locally
├── docker-compose.yml              ← Docker deployment (Alibaba Cloud ECS)
│
├── backend/
│   ├── server.js                   ← Express API (all routes)
│   ├── .env.example                ← Copy to .env and add keys
│   ├── data/
│   │   └── teams.js                ← All 48 teams, groups, stats
│   ├── database/
│   │   ├── db.js                   ← SQLite schema + connection
│   │   └── seed.js                 ← Seeds teams + group fixtures
│   └── services/
│       ├── predictionEngine.js     ← DC backbone + log-pool blending
│       ├── qwenClient.js           ← DashScope API wrapper
│       ├── agents/
│       │   ├── agentFramework.js   ← Agent, AgentSession, conflict detection
│       │   ├── orchestratorAgent.js ← Multi-agent orchestration entry point
│       │   ├── statisticalAgent.js
│       │   ├── h2hAgent.js
│       │   ├── formAgent.js
│       │   ├── intelAgent.js
│       │   └── lineupAgent.js
│       ├── bracketService.js       ← Knockout simulation
│       ├── dataService.js          ← Live scores + web scraping
│       ├── analysisService.js      ← Post-match grading + standings
│       ├── calibrationService.js   ← Temperature + DC ρ refit
│       ├── h2hService.js           ← 47k match H2H dataset
│       ├── lineupService.js        ← Lineup fetching
│       ├── scenarioService.js      ← Group qualification scenarios
│       └── suspensionService.js    ← Suspension tracker
│
└── frontend/
    └── src/
        ├── App.jsx                 ← Router + nav
        ├── api/client.js           ← All API calls
        ├── contexts/
        │   ├── ThemeContext.jsx    ← Dark/light theme
        │   └── LanguageContext.jsx ← EN/中文 language toggle
        ├── pages/
        │   ├── Dashboard.jsx
        │   ├── Matches.jsx
        │   ├── MatchDetail.jsx
        │   ├── Schedule.jsx
        │   ├── Groups.jsx
        │   ├── Tournament.jsx
        │   ├── Predictions.jsx
        │   ├── TeamDetail.jsx
        │   └── About.jsx
        └── components/
            ├── MatchCard.jsx
            ├── PredictionBar.jsx
            ├── GroupTable.jsx
            └── FlagImage.jsx
```
