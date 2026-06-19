# World Cup 2026 Prediction App — Product Spec

## Purpose

A web app for fans to follow FIFA World Cup 2026 — tracking live results, group standings, and the knockout bracket — with an AI-powered prediction engine that forecasts match outcomes before each game. The app should feel like a personal analyst: surfacing the most interesting upcoming matches, explaining why one team is favoured, and tracking how well those predictions hold up over time.

The tournament runs **11 Jun – 19 Jul 2026** across the United States, Canada, and Mexico.

---

## Tournament Format

These are the rules of WC 2026 — not a design decision, they are fixed facts the app must reflect correctly.

- **48 teams**, split into **12 groups (A–L)** of 4 teams each
- **Group stage:** Every team plays the other 3 in their group once (6 matches per group, 72 total)
- **Qualification:** Top 2 teams from each group advance (24 teams), plus the best 8 third-place teams across all groups (8 teams) = **32 teams** enter the knockout rounds
- **Third-place ranking:** Among all 12 third-placed teams, the best 8 qualify — ranked by points, then goal difference, then goals scored, then FIFA rank
- **Knockout bracket:** Round of 32 → Round of 16 → Quarter-finals → Semi-finals → Third-Place Play-off → Final
- **Bracket seeding:** Group winners face runners-up from adjacent groups per the official FIFA draw. Third-place teams are assigned to specific bracket slots based on which groups they came from (FIFA published rules)
- **Drawn knockout matches** go to extra time, then a penalty shootout if still level. The team that scores more penalties advances

---

## Users

All visitors access the app without signing in and can read everything — predictions, standings, bracket, match details, team profiles. There are no write operations available from the UI; data is updated via automated cron jobs (live score sync every 5 minutes, prediction regeneration on a schedule).

---

## Features

### Home / Dashboard

The first thing a fan sees when they open the app. It should answer: *"What's happening in this tournament right now, and who's going to win it?"*

- Shows which phase of the tournament is currently active (Group Stage, Round of 32, etc.) based on today's date
- Highlights the teams most likely to win the whole tournament, with their probability
- Surfaces upcoming matches for roughly the next few days, grouped by date, each with a quick prediction summary
- Shows overall prediction accuracy as a trust signal

---

### Full Schedule

A complete chronological view of all 104 matches across the tournament.

- All matches listed, grouped by date
- Filterable by tournament stage
- Each match shows teams, kickoff time, venue, and a compact prediction (probabilities for each outcome)

---

### Match Browser

A browsable list of matches with flexible filtering.

- Filter by match status (upcoming / completed) and by stage and by group
- Completed matches show the final score

---

### Match Detail

The deepest view — everything the app knows about a single match.

- Match header: both teams (with flags), kickoff time in **Singapore Time**, venue, stage
- Full prediction: win/draw/loss probabilities, most likely scoreline, a confidence indicator, and a plain-English explanation of the key reasons one team is favoured
- Which prediction signals drove the result and in which direction (factor names, descriptions, and weight percentages visible to all)
- **Multi-agent dialogue panel** — when the multi-agent system was used, shows each specialist agent's Round 1 probability output and evidence, any detected conflicts (highlighted), Round 2 rebuttals, and the resolution outcome
- History of how the prediction has shifted across multiple snapshots
- Historical head-to-head record between the two teams
- Confirmed starting lineups, once available (typically ~1 hour before kickoff)
- Suspensions — players who cannot play due to card accumulation or red cards

---

### Group Standings

- All 12 groups, each showing a standard football standings table: position, team, played, won, drawn, lost, goals for, goals against, goal difference, points
- Visual indicator of which positions qualify (top 2 guaranteed), which are in third-place contention, and which are eliminated
- All 6 matches within each group, with predictions for unplayed ones and results for completed ones
- **What-if calculator:** Given the remaining matches in a group, enumerate the possible result combinations and show what each scenario means for each team's qualification

---

### Knockout Bracket

- Visual bracket from Round of 32 through to the Final
- Completed rounds show actual results; future rounds show the model's predicted winner
- Makes clear which rounds are fact and which are prediction
- Tournament winner probabilities — a ranked view of all remaining teams and their chances of lifting the trophy

---

### Team Profile

- Team identity: name, flag, FIFA ranking, ELO rating, which group they're in
- Their group standings context (how are their group rivals doing)
- All their matches — past results and upcoming predictions
- ELO rating trajectory across the tournament

---

### Predictions

A consolidated view of every prediction made for every match.

- One row per match, grouped by date
- Filterable by match status (all / upcoming / completed) and by group
- Each row shows: date, home vs away teams (with flags), predicted outcome and most likely scoreline, actual outcome and final score, correct/incorrect indicator
- Summary statistics at the top: total predictions made, correct count, accuracy percentage

---

### About

- What the app is and who it is for
- Disclosure that predictions are AI-generated and for informational purposes only
- No-gambling notice
- Author information

---

## Prediction System

### What the model produces

For every upcoming match on the next match day, the system generates:
- **Win/draw/loss probabilities** for both teams (three numbers that sum to 100%)
- **Top 3 most likely scorelines** with probabilities, curated to maximise expected points under the scoring rule
- **Confidence level** — Low / Medium / High / Very High
- **Human-readable insight** — a short paragraph generated by Qwen explaining the key reasons for the prediction
- **Contributing signals** — which factors pushed the prediction in each direction, and by how much

### What the model considers

- Team strength (Dixon-Coles α/β attack/defence ratings), updated dynamically after each result
- Each team's recent results and form
- Historical head-to-head record (47,000+ international matches since 1872)
- Pre-match intelligence — injuries, squad availability, rotation expectations, and match motivation
- World Cup experience — how often a team has appeared and how far they have gone
- Confirmed starting lineups, when available before kickoff
- Venue conditions — altitude and heat affect goal expectation
- Rest days between matches
- Home nation advantage — USA, Canada, and Mexico benefit from home support

### Multi-agent prediction (when enabled)

When `USE_MULTI_AGENT=true`, five Qwen specialist agents run in parallel on the match data, each producing an independent probability assessment with evidence:

1. **StatisticalAgent** (qwen-plus) — interprets the Dixon-Coles backbone output
2. **H2HAgent** (qwen-turbo) — analyses head-to-head history
3. **FormAgent** (qwen-turbo) — evaluates recent match form
4. **IntelAgent** (qwen-plus) — interprets injury, rotation, and motivation signals
5. **LineupAgent** (qwen-plus) — assesses confirmed lineup strength (active ~60 min before KO)

An **OrchestratorAgent** (qwen-max) detects conflicts between agents (probability gap > 20%) and runs a Round 2 negotiation where both sides challenge each other's evidence. The final output is a log-pool blend of all agent outputs, weighted by confidence and adjusted based on who held their position in negotiation.

### Model evaluation

After each match result is entered, the system grades the locked pre-match prediction:
- **Outcome correctness is always based on the 90-minute full-time result** (home win / draw / away win). Extra time and penalty shootout results are ignored for grading purposes
- Brier score measures probability calibration quality

After every 10 new results (once ≥ 20 exist), the system automatically refits:
- **Temperature scaling** — calibrates output probabilities via grid-search NLL minimisation
- **Dixon-Coles ρ** — refits the low-score correction on observed scorelines

### Prediction freshness and locking

- Predictions are generated for all scheduled matches in the **active tournament stage** only
- Predictions are automatically refreshed each night via cron (midnight–noon SGT, plus 20:30 and 21:30 SGT)
- While a match is **scheduled**, predictions refresh as new information arrives
- Once a match goes **live** (kickoff), the prediction is locked
- Prediction history is retained — all snapshots, not just the latest

---

## Data & Integrations

### Live score sync

An optional integration with football-data.org automatically pulls live and recent match scores every 5 minutes. When the integration is active, recording a result triggers standings updates, bracket progression, ELO and α/β rating updates, and prediction grading.

### Head-to-head dataset

A comprehensive dataset of international football results (47,000+ matches since 1872) powers the historical head-to-head feature. Competition weighting: World Cup finals (×4), qualifiers (×2.5), continental championships (×2), friendlies (×0.5).

### Lineup fetching

Confirmed starting lineups become available roughly 1 hour before kickoff. The system attempts to fetch them automatically from football-data.org; the lineup agent activates only when data is available.

### Pre-match intelligence

The system gathers pre-match news for each team from Google News RSS. Qwen (qwen-plus via DashScope) parses raw news text into structured signals: injury lists, form rating, motivation level, rotation flag, and a key summary. Degrades gracefully when the API is unavailable — falls back to regex extraction and neutral defaults.

---

## UX Requirements

- **Match times in Singapore Time** — all kickoff times display in SGT (UTC+8) regardless of the visitor's local timezone
- **Mobile-first** — mobile layout is the primary concern
- **Dark and light mode** — the user's theme preference persists between sessions via `localStorage`
