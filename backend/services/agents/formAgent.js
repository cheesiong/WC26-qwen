/**
 * Form Agent — recent match form analyst
 *
 * Fetches the last 10 results for each team and evaluates current
 * momentum, scoring/conceding trends, and opponent quality weighting.
 *
 * Competition weighting is presented in the prompt so the LLM can
 * apply judgment (a W vs Germany matters more than a W vs a minnow).
 *
 * Model: qwen-turbo  (structured result pattern recognition)
 */

const { Agent, AGENT_OUTPUT_SCHEMA } = require('./agentFramework');
const { QWEN_MODELS }  = require('../qwenClient');
const { fetchTeamForm } = require('../dataService');

// ── System prompt ─────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a football form analyst specialising in recent team performance trends for international sides. You receive the last 10 match results for both teams in an upcoming World Cup 2026 match and assess which team is in better current form.

Your analysis should consider:
- Win/draw/loss sequence and momentum (recent results carry more weight than older ones)
- Goals scored and conceded — a team winning 1-0 every game is in different form to one winning 4-0
- Competition quality — World Cup qualifiers and major finals carry more weight than friendlies
- Whether a team is on a winning or losing run, and how long
- Context: teams often rest key players in friendlies — flag this if visible

Use the competition names to judge quality:
  World Cup / Copa América / AFCON / Euros = highest quality
  World Cup qualifiers / Confederations = high
  Nations League / Gold Cup = medium
  Friendly / International = low

${AGENT_OUTPUT_SCHEMA}`;

// ── Domain data fetcher ───────────────────────────────────────────
/**
 * Fetches recent form for both teams in parallel.
 * @param {string} homeId
 * @param {string} awayId
 * @returns {{ homeForm: object[], awayForm: object[] }}
 */
async function fetchDomainData(homeId, awayId) {
  const [homeForm, awayForm] = await Promise.all([
    fetchTeamForm(homeId).catch(() => []),
    fetchTeamForm(awayId).catch(() => []),
  ]);
  return { homeForm, awayForm };
}

// ── Format a single form entry for the prompt ─────────────────────
function fmtMatch(m, idx) {
  const recency = idx === 0 ? ' (most recent)' : '';
  const score   = m.goalsFor != null ? `${m.goalsFor}-${m.goalsAgainst}` : '?-?';
  const opp     = m.opponent ?? 'Unknown opponent';
  const comp    = m.competition ?? 'Unknown competition';
  const synth   = m.synthetic ? ' [synthetic]' : '';
  return `  ${idx + 1}. ${m.result ?? '?'} ${score} vs ${opp} (${comp})${recency}${synth}`;
}

// ── Prompt builder ────────────────────────────────────────────────
/**
 * @param {MatchContext} matchContext
 * @param {{ homeForm: object[], awayForm: object[] }} domainData
 */
function buildPrompt(matchContext, domainData) {
  const { home, away, stage, scheduledDate } = matchContext;
  const { homeForm = [], awayForm = [] } = domainData;

  const homeLines = homeForm.length > 0
    ? homeForm.slice(0, 10).map(fmtMatch).join('\n')
    : '  No recent form data available';

  const awayLines = awayForm.length > 0
    ? awayForm.slice(0, 10).map(fmtMatch).join('\n')
    : '  No recent form data available';

  // Quick summary counts
  const summary = (form) => {
    const slice = form.slice(0, 10);
    const w = slice.filter(m => m.result === 'W').length;
    const d = slice.filter(m => m.result === 'D').length;
    const l = slice.filter(m => m.result === 'L').length;
    const gf = slice.reduce((s, m) => s + (m.goalsFor  ?? 0), 0);
    const ga = slice.reduce((s, m) => s + (m.goalsAgainst ?? 0), 0);
    return `${w}W-${d}D-${l}L | GF ${gf} GA ${ga}`;
  };

  return `Analyse the recent form for this World Cup 2026 match.

MATCH: ${home.name} vs ${away.name}
Stage: ${stage} | Date: ${scheduledDate}

── ${home.name.toUpperCase()} — LAST ${Math.min(homeForm.length, 10)} MATCHES ──────────────────────────
Summary: ${summary(homeForm)}
${homeLines}

── ${away.name.toUpperCase()} — LAST ${Math.min(awayForm.length, 10)} MATCHES ──────────────────────────
Summary: ${summary(awayForm)}
${awayLines}

Based on this form data, assess which team is in better shape heading into this match and how strongly their recent momentum should influence the outcome probabilities. Flag any concerns about data quality (e.g. too many synthetics or friendly-only data).`;
}

// ── Agent singleton ───────────────────────────────────────────────
const agent = new Agent({
  name:         'FormAgent',
  role:         'Recent Match Form Analyst',
  model:        QWEN_MODELS.TURBO,
  systemPrompt: SYSTEM_PROMPT,
});

module.exports = { agent, buildPrompt, fetchDomainData };
