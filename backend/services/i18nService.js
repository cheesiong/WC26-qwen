/**
 * i18n Translation Service
 * Translates prediction insights and factor descriptions to Chinese on-demand.
 * Uses Qwen Turbo for fast, context-aware translation with in-memory caching.
 */

const { chatComplete, QWEN_MODELS } = require('./qwenClient');

// In-memory cache: matchId → { insight_zh, factors_zh, methodology_zh }
const zhCache = new Map();

/**
 * Translate insight, factor descriptions, and methodology to Chinese.
 * Returns a shallow copy of the prediction with translated strings.
 * Cached per matchId to avoid repeated LLM calls.
 */
async function translatePredictionToZh(prediction, matchId) {
  if (!prediction) return prediction;

  // Check cache
  const cached = zhCache.get(matchId);
  if (cached && cached._ts === prediction.generated_at) {
    return {
      ...prediction,
      insight: cached.insight_zh || prediction.insight,
      methodology: cached.methodology_zh || prediction.methodology,
      factors: prediction.factors?.map((f, i) => ({
        ...f,
        description: cached.factors_zh?.[i] || f.description,
      })),
    };
  }

  try {
    const [insight_zh, methodology_zh, factors_zh] = await Promise.all([
      prediction.insight ? translateText(prediction.insight) : null,
      prediction.methodology ? translateText(prediction.methodology) : null,
      prediction.factors?.length
        ? translateBatch(prediction.factors.map(f => f.description))
        : null,
    ]);

    zhCache.set(matchId, {
      _ts: prediction.generated_at,
      insight_zh,
      methodology_zh,
      factors_zh,
    });

    return {
      ...prediction,
      insight: insight_zh || prediction.insight,
      methodology: methodology_zh || prediction.methodology,
      factors: prediction.factors?.map((f, i) => ({
        ...f,
        description: factors_zh?.[i] || f.description,
      })),
    };
  } catch (e) {
    console.warn('[i18n] Translation failed for match', matchId, ':', e.message);
    return prediction; // Fall back to English
  }
}

/** Translate a single text string to Chinese using Qwen Turbo. */
async function translateText(text) {
  if (!text || text.length < 5) return text;

  const result = await chatComplete({
    model: QWEN_MODELS.TURBO,
    messages: [{
      role: 'user',
      content: `Translate the following football/sports prediction text to Simplified Chinese. Keep numbers, percentages, team names in their original form where natural. Do not add explanations.\n\nText: ${text}`,
    }],
    temperature: 0.3,
    maxTokens: 256,
  });

  return result.text?.trim() || text;
}

/** Translate an array of texts to Chinese in one batch call. */
async function translateBatch(texts) {
  if (!texts?.length) return texts;

  const numbered = texts.map((t, i) => `[${i + 1}] ${t}`).join('\n');

  const result = await chatComplete({
    model: QWEN_MODELS.TURBO,
    messages: [{
      role: 'user',
      content: `Translate the following numbered football/sports prediction texts to Simplified Chinese. Keep numbers and percentages as-is. Return each translation on its own line, prefixed with its number like [1], [2], etc. Do not add explanations.\n\n${numbered}`,
    }],
    temperature: 0.3,
    maxTokens: 512,
  });

  if (!result.text) return texts;

  // Parse numbered responses
  const translated = [...texts];
  const lines = result.text.split('\n').filter(l => l.trim());
  for (const line of lines) {
    const match = line.match(/^\[(\d+)\]\s*(.+)$/);
    if (match) {
      const idx = parseInt(match[1]) - 1;
      if (idx >= 0 && idx < translated.length) {
        translated[idx] = match[2].trim();
      }
    }
  }
  return translated;
}

module.exports = { translatePredictionToZh };
