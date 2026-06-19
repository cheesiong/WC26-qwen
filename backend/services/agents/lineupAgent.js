/**
 * Lineup Agent — confirmed starting XI analyst
 *
 * Activates only when lineup data is available (~60-75 min before KO).
 * When available it carries the highest signal weight (0.40) because a
 * confirmed lineup resolves all uncertainty about who is actually playing.
 *
 * When unavailable (available: false), buildPrompt() returns null and
 * the orchestrator skips this agent entirely for that prediction run.
 *
 * Model: qwen-plus  (tactical reasoning, formation analysis)
 */

const { Agent, AGENT_OUTPUT_SCHEMA } = require('./agentFramework');
const { QWEN_MODELS } = require('../qwenClient');
const { fetchLineup }  = require('../lineupService');

// ── System prompt ─────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a football tactical analyst specialising in lineup strength assessment for international matches. You receive confirmed starting XI data for both teams in a World Cup 2026 match and evaluate how lineup quality and tactical choices affect the likely outcome.

Your analysis should consider:
- Lineup strength scores (0-10 scale) and the delta between teams
- Key player absences vs "expected" lineup — a missing first-choice goalkeeper or striker significantly hurts a team
- Formation matchups — a 4-3-3 vs 5-4-1 may suit one team's style
- Whether either team appears to be playing a weakened or rotated side

Calibration guide for strength delta (home minus away):
  delta > +2.0 : Home has clearly stronger lineup — meaningful home advantage
  delta +0.5 to +2.0 : Slight home lineup edge
  delta -0.5 to +0.5 : Lineups roughly equal
  delta -0.5 to -2.0 : Slight away lineup edge
  delta < -2.0 : Away team has clearly stronger lineup

Key absences (players missing from expected lineup) amplify the strength delta effect.
This signal should have HIGH confidence when lineup data is confirmed — set weightRecommendation to 0.35-0.45.

${AGENT_OUTPUT_SCHEMA}`;

// ── Domain data fetcher ───────────────────────────────────────────
/**
 * @param {string} matchId
 * @returns {object} lineup data from lineupService
 */
async function fetchDomainData(matchId) {
  try {
    return await fetchLineup(matchId);
  } catch (e) {
    console.warn(`[LineupAgent] fetchDomainData failed: ${e.message}`);
    return { available: false };
  }
}

// ── Prompt builder ────────────────────────────────────────────────
/**
 * Returns null when lineup is not yet available — caller should skip this agent.
 *
 * @param {MatchContext} matchContext
 * @param {object}       domainData  — lineup struct from lineupService
 * @returns {string|null}
 */
function buildPrompt(matchContext, domainData) {
  const { home, away, stage, scheduledDate } = matchContext;

  if (!domainData?.available) {
    return null; // Orchestrator skips this agent when lineup unavailable
  }

  const { home: hLU, away: aLU, strengthDelta, keyAbsences, source } = domainData;

  const fmtStarters = (starters = []) =>
    starters.length > 0
      ? starters.slice(0, 11).map((p, i) => `  ${i + 1}. ${p.name ?? p} (${p.position ?? '?'})`).join('\n')
      : '  Not available';

  const fmtAbsences = (absences = []) =>
    absences.length > 0 ? absences.slice(0, 3).join(', ') : 'None';

  const delta = strengthDelta ?? 0;
  const deltaDir = delta > 0 ? `+${delta.toFixed(1)} (${home.name} stronger)`
                 : delta < 0 ? `${delta.toFixed(1)} (${away.name} stronger)`
                 : '0.0 (equal)';

  return `Analyse the confirmed lineups for this World Cup 2026 match.

MATCH: ${home.name} vs ${away.name}
Stage: ${stage} | Date: ${scheduledDate}
Lineup source: ${source ?? 'confirmed'}

── ${home.name.toUpperCase()} LINEUP ──────────────────────────────────────────
  Formation: ${hLU?.formation ?? 'Unknown'}
  Strength score: ${hLU?.strengthScore?.toFixed(1) ?? '?'} / 10
  Starters:
${fmtStarters(hLU?.starters)}

── ${away.name.toUpperCase()} LINEUP ──────────────────────────────────────────
  Formation: ${aLU?.formation ?? 'Unknown'}
  Strength score: ${aLU?.strengthScore?.toFixed(1) ?? '?'} / 10
  Starters:
${fmtStarters(aLU?.starters)}

── SUMMARY ────────────────────────────────────────────────────────
  Lineup strength delta (home − away): ${deltaDir}
  Key absences — ${home.name}: ${fmtAbsences(keyAbsences?.home)}
  Key absences — ${away.name}: ${fmtAbsences(keyAbsences?.away)}

This is confirmed lineup data with high reliability. Provide a high-confidence probability assessment. A strengthDelta above ±2 should noticeably shift the probabilities; absences of key players amplify the effect. Set weightRecommendation between 0.35 and 0.45.`;
}

// ── Agent singleton ───────────────────────────────────────────────
const agent = new Agent({
  name:         'LineupAgent',
  role:         'Confirmed Starting XI Tactical Analyst',
  model:        QWEN_MODELS.PLUS,
  systemPrompt: SYSTEM_PROMPT,
});

module.exports = { agent, buildPrompt, fetchDomainData };
