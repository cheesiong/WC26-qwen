# Predictions Page — What & Why

**Route:** `/predictions`  
**File:** `frontend/src/pages/Predictions.jsx`

---

## Purpose

A single place where anyone can see every model forecast alongside what actually happened. The page serves two audiences simultaneously: fans checking what the model thinks about upcoming matches, and sceptics who want to judge whether the model is actually any good.

---

## Elements

### Hero

```
World Cup 2026
Predictions
Model forecast for every match — locked in before kickoff
```

**Why:** The subtitle carries a trust signal: "locked in before kickoff" emphasises that predictions are pre-committed, not reverse-engineered after the fact. This matters because it establishes the page as an honest accountability record rather than a post-hoc rationalisation.

---

### Summary Stats (3 tiles)

| Tile | Shows |
|---|---|
| Predictions made | Count of matches that have a probability value (prob_home != null) |
| Correct | `N/total_completed` — how many completed matches the model called right |
| Accuracy | `N%` — colour-coded green ≥60%, orange ≥40%, red <40%, dash before any match is completed |

**Why:** Fans should know how much to trust the predictions before they start reading them. An explicit accuracy score sitting above the list provides that calibration at a glance. The colour coding turns the number into an instant verdict without requiring mental arithmetic.

**Why the dash before any completions:** Showing "0%" before a single match is played would make the model look bad for no reason. A dash conveys "not yet measured" honestly.

---

### Filters

**Status filter (pill row):** All · Upcoming · Completed

**Why:** With 104 matches, most users only care about one slice. Fans planning what to watch want upcoming only; fans reviewing results want completed only. "All" is the default so a fresh visitor sees the full record.

**Group filter (scrollable pill row):** All Groups · A · B · C … L

**Why:** Most fans follow one or two national teams. Group filtering lets them zero in on their teams' matches without scrolling through 104 rows. The filter scrolls horizontally on mobile to avoid wrapping 12 buttons across multiple lines.

---

### Match List — Two Layouts

The list renders differently depending on screen width.

#### Mobile: Date-grouped cards (`< md`)

Matches are grouped by SGT date. Each group has a date header with a match count. Within each group, matches are stacked in a single card with dividers.

Each match card shows:
- **Group/stage label** (top-left in small caps) — e.g. "Group A", "Quarter-final"
- **Live badge** (red, animated) — only when `status === 'LIVE'`
- **Teams row** — flag + name left, "vs" centre, name + flag right
- **Predict chip** — tinted background matching the predicted winner (blue=home, orange=away, grey=draw); shows predicted outcome label and most likely scoreline; dash if no prediction exists yet
- **Actual chip** — same tinting logic using the actual result; shows outcome label and final score; shows ✓ or ✗ correctness indicator; dash if the match has not been played

Tapping a match navigates to the full match detail page.

**Why two chips side by side:** The visual comparison of Predict vs Actual is the core information on this page. Two equal-width chips let the eye move horizontally to compare forecast against reality without scanning up and down a table.

**Why date grouping on mobile:** Mobile users scroll vertically. Grouping by date matches the mental model fans already have — they remember a game by which day it was played, not by row number.

#### Desktop: 4-column table (`≥ md`)

A single card with a fixed-grid table layout: `110px | 1fr | 1fr | 1fr`.

Columns:

| Column | Content |
|---|---|
| Date | Day and month on separate lines; group/stage label below; live badge if applicable |
| Match | Home team (flag + name) / "vs" / Away team (flag + name) |
| Predict | Predicted outcome label (colour-coded) + most likely scoreline |
| Actual | Actual outcome label (colour-coded) + final score + ✓ or ✗; dash if not completed |

**Why a table on desktop:** Wide screens can show all four columns comfortably. A flat table is faster to scan than cards because the eye can skip directly to the column it cares about (e.g. only the Predict column, or only the Actual column).

---

### Outcome Colouring

| Outcome | Colour |
|---|---|
| Home win | Apple blue (`#0071E3`) |
| Away win | Apple orange (`#FF9500`) |
| Draw | Apple secondary (`#515154`) |

Background tint: a 7% opacity fill of the outcome colour with a matching 15% opacity border. Used on both Predict and Actual chips so the two columns mirror each other visually.

**Why colour-code outcomes:** The dominant result at a glance. A fan scanning down the predictions page can immediately spot patterns ("the model loves home teams") without reading every label.

---

### Correctness Indicators (completed matches only)

- ✓ in `apple-green` — predicted outcome matched actual outcome
- ✗ in `red-400` — predicted outcome did not match

**Why on the Actual chip, not the Predict chip:** The correctness is a property of the result, not the forecast. Placing the indicator on Actual keeps its meaning clear: "the actual result was [correct / incorrect] relative to what was predicted."

**How correctness is determined:** The predicted outcome is derived from `most_likely_score` (e.g. "2-1" → home win), not from the highest of `prob_home / prob_draw / prob_away`. The scoreline is the committed forecast, not the raw probabilities.

---

### Click-through to Match Detail

Every match row/card is a link to `/matches/:id`.

**Why:** The Predictions page shows only the surface — outcome and score. The full story (probability breakdown, contributing factors, insight text, head-to-head) lives on the match detail page. The list is a summary; the detail page is the full analysis.

---

### Empty State

When filters produce no matches: a centred card with "No predictions found for the selected filter."

---

## Data Sources

| Data | Endpoint |
|---|---|
| All matches (with latest prediction joined) | `GET /api/matches` |
| Model accuracy stats | `GET /api/analytics/accuracy` — returns `{ stats: { correct, accuracy_pct } }` |

Both are fetched in parallel on mount. Matches without a prediction (`prob_home == null`) are hidden from the list unless the match is already `COMPLETED` — a completed match without a prediction means the model was never run for it, which is an edge case worth surfacing.

---

## What Is Not on This Page

- **Probability bars** — the `PredictionBar` component (segmented home/draw/away bar) is not used here. This page trades depth for breadth; the outcome label and scoreline convey the key forecast without crowding the row. The probability bar is on the match detail page.
- **Insight text** — the LLM-generated paragraph is match-detail only.
- **Admin controls** — no result entry, no prediction regeneration. This is a read-only view for everyone.
