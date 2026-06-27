/**
 * Intel Agent — pre-match intelligence interpreter
 *
 * Calls fetchWebIntel() which scrapes Google News RSS for both teams
 * and extracts structured intelligence (injuries, motivation, rotation).
 * The Qwen model then interprets what those signals mean for match outcome.
 *
 * Note: fetchWebIntel() scrapes Google News RSS and uses Qwen (qwen-plus)
 * to extract structured intelligence (injuries, motivation, rotation).
 * The IntelAgent's role is the probability INTERPRETATION layer —
 * "given these injury/motivation facts, how does it shift the odds?"
 *
 * Model: qwen-plus  (requires qualitative judgment over structured facts)
 */

const { Agent, AGENT_OUTPUT_SCHEMA } = require('./agentFramework');
const { QWEN_MODELS }   = require('../qwenClient');
const { fetchWebIntel } = require('../dataService');

// ── System prompt ─────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a football intelligence analyst specialising in pre-match factors: injuries, suspensions, squad rotation, and team motivation. You receive structured pre-match intelligence for a World Cup 2026 match and assess how these off-pitch factors shift the win/draw/loss probabilities from what pure statistics would suggest.

Your analysis should consider:
- Key injury absences — a missing striker or first-choice goalkeeper matters far more than a bench player
- Confirmed squad rotation — teams resting starters ahead of a must-win next match play worse
- Motivation differential — a team needing a win to advance plays with higher intensity
- Compounding effects — multiple absences or low motivation + rotation = significant handicap

CRITICAL RULE: Only reference player absences that appear in the "INJURIES / UNAVAILABILITIES" section above. If a player is NOT listed there, they are available and playing. Do NOT claim any player is injured, suspended, or absent based on your own knowledge — rely ONLY on the provided intel.

Calibration guide:
- 1 key player injured: shift favoured team down ~3-5%
- 2+ key players injured: shift down ~8-12%
- Confirmed rotation: shift down ~6-10%
- High motivation vs normal: shift up ~3-5%
- No significant intel: probability distribution should stay near the neutral prior (0.38/0.28/0.34 or similar)

If the intel data is sparse or unreliable, reduce your confidence score and weightRecommendation.

${AGENT_OUTPUT_SCHEMA}`;

// ── Domain data fetcher ───────────────────────────────────────────
/**
 * @param {string} homeId
 * @param {string} awayId
 * @param {string} matchDate    — 'YYYY-MM-DD'
 * @param {string} stage        — e.g. 'GROUP', 'R16', 'QF'
 * @returns {object|null}       — webIntel struct from dataService
 */
async function fetchDomainData(homeId, awayId, matchDate, stage) {
  try {
    return await fetchWebIntel(homeId, awayId, matchDate, stage);
  } catch (e) {
    console.warn(`[IntelAgent] fetchDomainData failed: ${e.message}`);
    return null;
  }
}

// ── Prompt builder ────────────────────────────────────────────────
/**
 * @param {MatchContext} matchContext
 * @param {object|null}  domainData — webIntel struct
 */
function buildPrompt(matchContext, domainData) {
  const { home, away, stage, scheduledDate } = matchContext;

  if (!domainData) {
    return `MATCH: ${home.name} vs ${away.name} | ${stage} | ${scheduledDate}

PRE-MATCH INTEL: No intelligence data available (scrape failed or no news found).

With no pre-match intelligence, return a near-neutral probability distribution with very low confidence and a low weightRecommendation of 0.05 or less.`;
  }

  const listOrNone = (arr) =>
    Array.isArray(arr) && arr.length > 0 ? arr.join(', ') : 'None confirmed';

  const motivFmt = (m) =>
    m === 'high' ? '🔴 HIGH (must-win / elimination pressure)'
    : m === 'low'  ? '🟡 LOW (already qualified / dead rubber)'
    : '⚪ NORMAL';

  const formFmt = (f) =>
    f === 'excellent' ? '🟢 Excellent (4+ wins from last 5)'
    : f === 'good'    ? '🟢 Good (3 wins from last 5)'
    : f === 'poor'    ? '🔴 Poor (1-2 wins from last 5)'
    : '⚪ Normal';

  return `Interpret the pre-match intelligence for this World Cup 2026 match and assess its probability impact.

MATCH: ${home.name} vs ${away.name}
Stage: ${stage} | Date: ${scheduledDate}

── INJURIES / UNAVAILABILITIES ────────────────────────────────────
  ${home.name}: ${listOrNone(domainData.homeInjuries)}
  ${away.name}: ${listOrNone(domainData.awayInjuries)}

── SQUAD ROTATION ─────────────────────────────────────────────────
  ${home.name} rotating squad: ${domainData.homeRotating ? 'YES — starters being rested' : 'No'}
  ${away.name} rotating squad: ${domainData.awayRotating ? 'YES — starters being rested' : 'No'}

── CURRENT FORM (narrative) ───────────────────────────────────────
  ${home.name}: ${formFmt(domainData.homeForm)}
  ${away.name}: ${formFmt(domainData.awayForm)}

── MOTIVATION ─────────────────────────────────────────────────────
  ${home.name}: ${motivFmt(domainData.homeMotivation)}
  ${away.name}: ${motivFmt(domainData.awayMotivation)}

── KEY SUMMARY ────────────────────────────────────────────────────
  ${domainData.keySummary ?? 'No key summary available'}

── DATA QUALITY ───────────────────────────────────────────────────
  LLM-parsed: ${domainData.llmParsed ? 'Yes (Claude extraction)' : 'No (regex fallback — lower reliability)'}

Based on this intelligence, assess the probability impact. If multiple factors compound (e.g. injuries + rotation + low motivation for the same team), their effects are additive. If the intel is sparse or regex-only, lower your confidence and weight.`;
}

// ── Agent singleton ───────────────────────────────────────────────
const agent = new Agent({
  name:         'IntelAgent',
  role:         'Pre-Match Intelligence Interpreter',
  model:        QWEN_MODELS.PLUS,
  systemPrompt: SYSTEM_PROMPT,
});

module.exports = { agent, buildPrompt, fetchDomainData };
