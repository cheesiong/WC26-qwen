The WC2026 Qwen Prediction Platform employs a **console-based logging strategy** without a dedicated logging framework (e.g., Winston, Pino, or Bunyan). Logging is implemented using native Node.js `console` methods (`console.log`, `console.error`, `console.warn`) across the backend and frontend.

### 1. System Approach
- **Native Console Methods**: The application relies entirely on `console.log` for informational output, `console.error` for exceptions and critical failures, and `console.warn` for non-fatal issues or fallbacks.
- **No Structured Logging**: Logs are primarily human-readable strings. There is no consistent JSON structured logging format for machine parsing in production sinks.
- **Emoji Prefixes**: Backend logs frequently use emoji prefixes (e.g., `⚽`, `📊`, `🌱`, `✅`, `⏭️`) to visually categorize log output in terminal environments.
- **Contextual Tagging**: Critical background jobs (cron tasks) and agent sessions use bracketed tags (e.g., `[cron]`, `[AgentSession]`, `[generateInsight]`) to identify the source of the log entry.

### 2. Key Files and Packages
- **`backend/server.js`**: The main entry point uses `console.log` for startup messages and cron job status updates. It uses `console.error` for unhandled cron failures.
- **`backend/services/agentFramework.js`**: Extensively uses `console.log` for multi-agent session lifecycle events (dispatch, conflict detection, resolution) and `console.warn`/`console.error` for LLM parsing failures or API errors.
- **`backend/services/predictionEngine.js`**: Uses `console.warn` when fallback mechanisms are triggered (e.g., Qwen insight generation failure, form fetch failure).
- **`backend/services/dataService.js`**: Uses `console.warn` for API fallbacks (e.g., when football-data.org fails and scraping is attempted) and `console.error` for sync failures.
- **`frontend/src/pages/*.jsx`**: Frontend components use `console.error` sparingly for caught promise rejections during data fetching.

### 3. Architecture and Conventions
- **Error Handling**: Most asynchronous operations are wrapped in `try/catch` blocks. Errors are logged to `console.error` with a descriptive message and the error object (`e.message`).
- **Fallback Transparency**: When external services (APIs, LLMs) fail, the system logs a warning and proceeds with a fallback (e.g., synthetic data, default probabilities), ensuring availability over strict accuracy.
- **Cron Job Visibility**: Scheduled tasks (prediction generation, lineup fetching, live result syncing) log their start, progress, and completion status to `console.log` to allow operators to monitor background health via stdout.
- **Agent Session Auditing**: The multi-agent framework logs high-level negotiation steps (conflicts detected, resolutions applied) to `console.log`, providing a traceable audit trail in the server logs.

### 4. Rules for Developers
- **Use `console.error` for Exceptions**: Always use `console.error` when catching an exception that disrupts normal flow or requires attention.
- **Use `console.warn` for Fallbacks**: Use `console.warn` when a non-critical service fails but a fallback is available (e.g., API timeout, LLM parse error).
- **Use `console.log` for Lifecycle Events**: Use `console.log` for significant state changes, startup events, and cron job completions.
- **Include Context**: When logging errors, include a descriptive prefix (e.g., `[cron]`, `[AgentSession]`) to easily filter logs in production monitoring.
- **Avoid Sensitive Data**: Do not log raw API keys, user PII, or full internal objects unless necessary for debugging. Stick to `e.message` or summarized state.