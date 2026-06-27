## Overview

The WC2026 AI Prediction Platform uses a **conventional try/catch pattern** for error handling across both backend (Node.js/Express) and frontend (React). There is no dedicated error-handling framework, custom error types, or centralized error middleware. Errors are handled inline at call sites using `try/catch` blocks, with errors propagated via HTTP status codes (backend) or silently swallowed with `console.error` logging (frontend).

---

## Backend Error Handling

### Express Route-Level Error Handling

All async route handlers in `backend/server.js` wrap their logic in `try/catch` blocks:

```javascript
app.post('/api/matches/:id/result', async (req, res) => {
  try {
    const { homeScore, awayScore } = req.body;
    if (typeof homeScore !== 'number' || typeof awayScore !== 'number') {
      return res.status(400).json({ error: 'homeScore and awayScore must be numbers' });
    }
    const result = await recordMatchResult(req.params.id, homeScore, awayScore);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

**Pattern:** Every async endpoint follows this structure:
- Input validation returns `res.status(400)` with descriptive error messages
- Service-layer exceptions are caught and returned as `res.status(500).json({ error: e.message })`
- No error logging occurs in most route handlers (errors are silently converted to JSON responses)
- A few routes log errors explicitly: `console.error('road-to-final error:', e)`

### Service-Layer Error Propagation

Services throw standard JavaScript `Error` objects:

```javascript
// predictionEngine.js
if (!match) throw new Error(`Match ${matchId} not found`);
if (!homeTeam || !awayTeam) throw new Error('Teams not found for match');

// analysisService.js
if (!match) throw new Error(`Match ${matchId} not found`);
```

**No custom error classes exist.** All errors are plain `Error` instances with string messages.

### External API Error Handling

The `qwenClient.js` implements **retry logic with exponential backoff** for LLM API calls:

```javascript
for (let attempt = 0; attempt <= retries; attempt++) {
  try {
    const resp = await getClient().post('/chat/completions', {...});
    return { text, model, latencyMs, usage };
  } catch (e) {
    lastError = e;
    const status = e.response?.status ?? 0;
    const retryable = e.code === 'ECONNABORTED' || status >= 500;
    if (attempt < retries && retryable) {
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    break;
  }
}
throw lastError;
```

This is the **only place in the codebase with structured retry logic**. Other external calls (football-data.org API, web scraping) use simple try/catch with fallback behavior:

```javascript
// dataService.js
try {
  const resp = await apiClient.get(`/teams/${apiTeamId}/matches?...`);
  // process response
} catch (e) {
  console.warn(`API form fetch failed for ${teamId}:`, e.message);
}
// Falls through to scrapeTeamForm() or generateDefaultForm()
```

### Cron Job Error Handling

Scheduled tasks suppress errors to prevent crashes:

```javascript
cron.schedule('*/5 * * * *', async () => {
  try {
    await syncLiveResults();
  } catch (e) {
    console.error('Cron sync failed:', e.message);
  }
});
```

### Database Migration Error Suppression

Schema migrations use empty catch blocks to handle idempotent ALTER TABLE statements:

```javascript
try { db.exec('ALTER TABLE matches ADD COLUMN scheduled_time TEXT'); } catch {}
try { db.exec('ALTER TABLE predictions ADD COLUMN top_scores TEXT'); } catch {}
```

---

## Frontend Error Handling

### API Client

The Axios client (`frontend/src/api/client.js`) has **no interceptors, no global error handling, and no retry logic**. It sets a 15-second timeout (600s for long-running predictions):

```javascript
const api = axios.create({ baseURL: BASE_URL, timeout: 15000 });
```

### Component-Level Error Suppression

React components wrap data fetching in try/catch and **silently swallow errors**:

```javascript
// Dashboard.jsx
async function load() {
  try {
    const [upcoming, probs] = await Promise.all([getUpcomingMatches(), getWinnerProbabilities()]);
    setUpcomingDays(upcoming.dates || []);
    setWinnerProbs((probs.probabilities || probs).slice(0, 8));
    getAccuracy().then(setAccuracy).catch(() => {});  // Silent catch
  } catch (e) { console.error(e); }
  finally { setLoading(false); }
}
```

```javascript
// MatchDetail.jsx
getLineup(id).then(setLineup).catch(() => {});        // Silent
getH2H(m.home_team, m.away_team).then(setH2H).catch(() => {});  // Silent
getPredictionHistory(id).then(setHistory).catch(() => {});      // Silent
```

**Pattern:** Non-critical data (lineups, H2H history, suspensions) uses `.catch(() => {})` to silently ignore failures. Critical data (match details, predictions) logs to `console.error` but does not display user-facing error messages.

### No Error Boundaries

The React app has **no Error Boundary components**. If a component throws during render, the entire app will crash with no recovery mechanism.

### Graceful Degradation

Some components handle missing data gracefully:

```javascript
// FlagImage.jsx
onError={e => { e.currentTarget.style.display = 'none'; }}
```

---

## Key Conventions

1. **No custom error types** — all errors are plain `Error` objects
2. **No error codes** — errors identified by string messages only
3. **HTTP status codes**: 400 for validation, 404 for not-found, 500 for server errors
4. **Silent failure is common** — especially in frontend `.catch(() => {})` patterns
5. **Console logging** — `console.warn` for recoverable issues, `console.error` for failures
6. **Retry logic exists only for LLM calls** — no retry for database, REST API, or scraping
7. **No centralized error middleware** — each route handles its own errors
8. **No error aggregation or monitoring** — no Sentry, no structured error tracking

---

## Developer Guidelines

- When adding new endpoints, wrap async logic in `try/catch` and return `res.status(500).json({ error: e.message })`
- Validate inputs early and return `res.status(400)` with descriptive messages
- For external API calls, provide fallback behavior (default values, cached data, synthetic generation)
- Use `console.warn` for non-critical failures that have fallbacks
- Use `console.error` for unexpected failures that should be investigated
- Never leave empty catch blocks unless intentionally suppressing migration errors
- Frontend: prefer `.catch(console.error)` over `.catch(() => {})` for debugging
- Consider adding Error Boundaries for critical UI sections