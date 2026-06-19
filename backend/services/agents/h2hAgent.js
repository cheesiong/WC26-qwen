/**
 * H2H Agent — head-to-head history interpreter
 *
 * Fetches the competition-weighted H2H record from the martj42 dataset
 * (~47k international matches) and interprets whether the historical
 * pattern meaningfully favours one side in a World Cup context.
 *
 * Skips (returns null) when fewer than 2 meetings exist — not enough
 * signal to blend into the pool.
 *
 * Model: qwen-turbo  (pattern recognition over structured record data)
 */

const { Agent, AGENT_OUTPUT_SCHEMA } = require('./agentFramework');
const { QWEN_MODELS } = require('../qwenClient');
const { h2hToProbs }  = require('../h2hService');

// ── System prompt ─────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a football historian specialising in head-to-head records between international teams. You receive a competition-weighted H2H record and assess whether the historical pattern meaningfully predicts the upcoming World Cup match.

Your analysis should consider:
- Win/draw/loss ratio and whether it reflects genuine dominance or small-sample noise
- World Cup meetings specifically — these carry the most predictive weight
- Recency of meetings — a record from the 1970s matters far less than one from the last 4 years
- Quality weighting: WC finals count more than friendlies
- When the sample is too small (<5 meetings) or evenly split, flag LOW confidence

Do not overstate H2H patterns when the sample is small or old.

${AGENT_OUTPUT_SCHEMA}`;

// ── Domain data fetcher ───────────────────────────────────────────
/**
 * @param {string} homeId — team ID e.g. 'ESP'
 * @param {string} awayId — team ID e.g. 'FRA'
 * @returns {object|null} h2h data from h2hService, or null if unavailable
 */
async function fetchDomainData(homeId, awayId) {
  try {
    return await h2hToProbs(homeId, awayId);
  } catch (e) {
    console.warn(`[H2HAgent] fetchDomainData failed: ${e.message}`);
    return null;
  }
}

// ── Prompt builder ────────────────────────────────────────────────
/**
 * @param {MatchContext} matchContext
 * @param {object|null} domainData — result of h2hToProbs()
 */
function buildPrompt(matchContext, domainData) {
  const { home, away, stage, scheduledDate } = matchContext;

  if (!domainData || domainData.matchCount < 2) {
    return `MATCH: ${home.name} vs ${away.name} | ${stage} | ${scheduledDate}

H2H DATA: Fewer than 2 historical meetings found between these teams.

With insufficient head-to-head history, you should return a near-uniform probability distribution reflecting deep uncertainty, with very low confidence and low weight recommendation.`;
  }

  const raw = domainData.rawRecord ?? {};
  const last = domainData.lastMeeting;
  const pctFmt = (v) => v != null ? `${(v * 100).toFixed(1)}%` : 'N/A';

  return `Analyse the head-to-head history for this World Cup 2026 match.

MATCH: ${home.name} vs ${away.name}
Stage: ${stage} | Date: ${scheduledDate}

── H2H RECORD (competition-weighted, martj42 dataset) ─────────────
  Total meetings analysed: ${domainData.matchCount}
  World Cup meetings:      ${domainData.wcMeetings ?? 0}
  ${home.name} wins:  ${raw.aWins  ?? '?'}
  Draws:              ${raw.draws  ?? '?'}
  ${away.name} wins:  ${raw.bWins  ?? '?'}

── WEIGHTED PROBABILITIES (from H2H alone) ────────────────────────
  P(${home.name} win): ${pctFmt(domainData.winHome)}
  P(draw):             ${pctFmt(domainData.draw)}
  P(${away.name} win): ${pctFmt(domainData.winAway)}
  Weighted advantage score: ${domainData.weightedAdvantage?.toFixed(3) ?? 'N/A'}
  (+ve favours ${home.name}, -ve favours ${away.name})

── MOST RECENT MEETING ────────────────────────────────────────────
  ${last
    ? `${last.date?.slice(0, 7) ?? '?'} | ${last.tournament ?? '?'} | Score: ${last.score ?? '?'}`
    : 'No recent meeting recorded'
  }

── DATA QUALITY ───────────────────────────────────────────────────
  ${domainData.dataQuality ?? 'standard'}

Interpret this H2H record and give your probability assessment. Consider how much weight the historical record should carry given the sample size, recency, and competition level of those meetings.`;
}

// ── Agent singleton ───────────────────────────────────────────────
const agent = new Agent({
  name:         'H2HAgent',
  role:         'Head-to-Head History Specialist',
  model:        QWEN_MODELS.TURBO,
  systemPrompt: SYSTEM_PROMPT,
});

module.exports = { agent, buildPrompt, fetchDomainData };
