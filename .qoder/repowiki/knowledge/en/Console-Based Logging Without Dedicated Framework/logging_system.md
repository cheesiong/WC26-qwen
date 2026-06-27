## Overview

The WC2026 AI Prediction Platform does **not** use a dedicated logging framework (e.g., Winston, Pino, Bunyan, or debug). All logging is performed via Node.js built-in `console` methods (`console.log`, `console.error`, `console.warn`). There is no structured logging, no log-level configuration, no log rotation, and no centralized logger initialization.

## What System Is Used

- **Logging mechanism**: Raw `console.log()`, `console.error()`, `console.warn()` calls scattered throughout the codebase.
- **No logging library**: Neither `backend/package.json` nor `frontend/package.json` lists any logging dependency.
- **No log files**: No `log/` directory, no file-based sinks, no log aggregation.
- **No structured format**: Log messages are free-form strings with emoji prefixes for visual categorization (e.g., `⚽`, `🏆`, `✅`, `⚠️`, `📐`).

## Key Files Where Logging Occurs

### Backend (`backend/`)

| File | Usage Pattern |
|------|---------------|
| `server.js` | Cron job status (`[cron] prediction run: ...`), startup messages, error catches in async handlers |
| `services/bracketService.js` | Tournament simulation progress (`🏆 Knockout match stubs ensured`, `🏟️ Simulating R32…`) |
| `services/calibrationService.js` | Calibration refit results (`📐 Calibration refit: T=...`) |
| `services/dataService.js` | API/scrape failure warnings (`API form fetch failed for ${teamId}`) |
| `services/analysisService.js` | Bracket advancement errors (`bracketService error: ...`) |
| `database/seed.js` | Seeding progress (`🌱 Seeding teams...`, `✅ Seed complete!`) |
| `scripts/*.js` | Backtest output, comparison tables, tuning results |

### Frontend (`frontend/`)

| File | Usage Pattern |
|------|---------------|
| `src/pages/Dashboard.jsx` | Error catch blocks (`console.error(e)`) |
| `src/pages/MatchDetail.jsx` | Error catch blocks (`console.error(e)`) |
| Other page components | `.catch(console.error)` chains on API calls |

## Architecture and Conventions

### Emoji-Prefixed Visual Categorization

Log messages use emoji prefixes as an informal severity/category signal:

- `✅` — Success/completion
- `⚠️` / `⚠` — Warnings, non-critical issues
- `🏆` — Tournament/bracket operations
- `📐` — Calibration/statistical operations
- `🌱` — Database seeding
- `[cron]` — Scheduled job output (plain-text prefix)

### Error Handling Pattern

Errors are caught and logged with `console.error()` but rarely re-thrown or escalated:

```javascript
try {
  await predict(m.id, true);
} catch (e) {
  console.error(`[cron] predict ${m.id} failed:`, e.message);
}
```

In several places, errors are silently swallowed:

```javascript
try { await predict(m.id, false); } catch { /* silent — non-critical */ }
```

### No Log-Level Strategy

There is no distinction between `INFO`, `DEBUG`, `WARN`, or `ERROR` at the framework level. The choice of `console.log` vs `console.warn` vs `console.error` is ad-hoc and inconsistent:

- `console.log` is used for both informational progress and operational output.
- `console.warn` appears in data-service fallback paths (API failures).
- `console.error` is used in catch blocks and cron failures.

### No Structured Fields

Log entries are unstructured strings. There are no JSON-formatted logs, no correlation IDs, no request tracing, and no timestamp injection (relying on the runtime's default console timestamp behavior).

## Rules Developers Should Follow

1. **Continue using `console` methods** — Do not introduce a logging framework unless there is a clear operational need (e.g., production log aggregation).
2. **Use emoji prefixes consistently** — When adding new log statements, follow the existing emoji convention for visual scanning:
   - `✅` for success
   - `⚠️` for warnings
   - `❌` or no emoji for errors (let `console.error` handle severity)
   - Domain-specific emojis (e.g., `🏆` for bracket, `📐` for calibration)
3. **Prefer `console.error` in catch blocks** — Always include the error message: `console.error('context:', e.message)`.
4. **Avoid silent catches** — If an error is truly non-critical, add a comment explaining why (`/* silent — non-critical */`).
5. **Do not log sensitive data** — No API keys, tokens, or PII should appear in console output.
6. **Frontend: keep console usage minimal** — Frontend logging is limited to error catches. Avoid `console.log` in UI rendering paths.
7. **Scripts: verbose output is acceptable** — One-off scripts (`scripts/*.js`) may produce detailed terminal output for debugging and validation purposes.

## Confidence

This assessment is based on:
- Complete scan of `package.json` dependencies (no logging libraries present).
- Grep searches across all `.js` and `.jsx` files confirming exclusive use of `console.*`.
- Review of key entry points (`server.js`, `predictionEngine.js`, `dataService.js`, `bracketService.js`) showing consistent patterns.
- No `log/`, `logging/`, or logger-initialization files found anywhere in the repository.