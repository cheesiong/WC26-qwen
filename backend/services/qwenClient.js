/**
 * Qwen / DashScope API client
 *
 * DashScope exposes an OpenAI-compatible endpoint, so we use plain axios
 * with a Bearer token — no extra SDK needed.
 *
 * Models used across the multi-agent system:
 *   qwen-max   — Orchestrator (complex reasoning, full context)
 *   qwen-plus  — Statistical, Intel, Lineup agents (balanced)
 *   qwen-turbo — Form, H2H agents (fast, high-throughput)
 */

const axios = require('axios');

const DASHSCOPE_BASE_URL = process.env.DASHSCOPE_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

const QWEN_MODELS = {
  MAX:   'qwen-max',
  PLUS:  'qwen-plus',
  TURBO: 'qwen-turbo',
};

// Lazy-initialised so importing this module never throws even if the API key
// isn't configured yet (e.g. running legacy single-agent path or unit tests).
let _client = null;

function getClient() {
  if (!_client) {
    _client = axios.create({
      baseURL: DASHSCOPE_BASE_URL,
      headers: {
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }
  return _client;
}

/**
 * Call a Qwen chat completion.
 *
 * @param {object} opts
 * @param {string}   opts.model          - QWEN_MODELS.MAX | PLUS | TURBO
 * @param {object[]} opts.messages        - OpenAI-format message array
 * @param {number}  [opts.temperature=0.2]
 * @param {number}  [opts.maxTokens=600]
 * @param {number}  [opts.retries=2]     - Extra attempts on 5xx / timeout
 *
 * @returns {{ text: string, model: string, latencyMs: number, usage: object|null }}
 */
async function chatComplete({
  model = QWEN_MODELS.PLUS,
  messages,
  temperature = 0.2,
  maxTokens = 600,
  retries = 2,
}) {
  if (!process.env.DASHSCOPE_API_KEY) {
    throw new Error('DASHSCOPE_API_KEY is not set — cannot call Qwen API');
  }

  const start = Date.now();
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await getClient().post('/chat/completions', {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      });

      const text = resp.data.choices?.[0]?.message?.content?.trim() ?? '';
      return {
        text,
        model,
        latencyMs: Date.now() - start,
        usage: resp.data.usage ?? null,
      };
    } catch (e) {
      lastError = e;

      const status   = e.response?.status ?? 0;
      const timedOut = e.code === 'ECONNABORTED';
      const retryable = timedOut || status >= 500;

      if (attempt < retries && retryable) {
        const backoffMs = 1000 * (attempt + 1);
        console.warn(`[qwenClient] ${model} attempt ${attempt + 1} failed (${e.message}), retrying in ${backoffMs}ms…`);
        await new Promise(r => setTimeout(r, backoffMs));
        continue;
      }
      break;
    }
  }

  throw lastError;
}

/**
 * Quick connectivity check — call qwen-turbo with a single token response.
 * Returns { ok: boolean, latencyMs: number, error?: string }
 */
async function ping() {
  const start = Date.now();
  try {
    await chatComplete({
      model: QWEN_MODELS.TURBO,
      messages: [{ role: 'user', content: 'Reply with the single word: pong' }],
      maxTokens: 5,
      retries: 0,
    });
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: e.message };
  }
}

module.exports = { chatComplete, ping, QWEN_MODELS };
