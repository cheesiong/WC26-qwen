/**
 * Statistical Agent — Dixon-Coles backbone interpreter
 *
 * Receives the pre-computed backbone output (λ values, ELO ratings,
 * attack/defence α/β parameters, home advantage, venue effect) and
 * translates the mathematics into a natural-language probability opinion.
 *
 * It does NOT rerun the Poisson math — that stays in predictionEngine.js.
 * Its job is to contextualise the numbers and flag statistical anomalies
 * (e.g. unusually high λ, large ELO gap, significant venue penalty).
 *
 * Model: qwen-plus  (needs numerical reasoning, not just pattern recall)
 */

const { Agent, AGENT_OUTPUT_SCHEMA } = require('./agentFramework');
const { QWEN_MODELS } = require('../qwenClient');

// ── System prompt ─────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a statistical football analyst specialising in bivariate Poisson goal models and ELO rating systems. You receive pre-computed Dixon-Coles model output for a World Cup 2026 match and translate it into a win/draw/loss probability assessment with clear statistical reasoning.

Focus your analysis on:
- What the expected goal values (λ) imply about attacking intent and defensive quality
- How significant the ELO rating gap is historically (each 100-point gap ≈ 14% win-probability swing)
- Attack (α) and defence (β) rating differentials — higher α means more goals scored, higher β means more conceded
- Whether host-nation home advantage or venue conditions materially shift the numbers
- Whether the statistical picture is clear-cut or genuinely uncertain

Do not invent information not present in the data. Flag if data is incomplete.

${AGENT_OUTPUT_SCHEMA}`;

// ── Prompt builder ────────────────────────────────────────────────
/**
 * @param {MatchContext} matchContext
 * @param {object} domainData
 * @param {number} domainData.lambdaHome
 * @param {number} domainData.lambdaAway
 * @param {{ winHome, draw, winAway }} domainData.backboneProbs
 * @param {{ side: string, logHA: number }} domainData.homeAdv
 * @param {{ lambdaScale: number, description: string|null }} domainData.venueEffect
 */
function buildPrompt(matchContext, domainData) {
  const { home, away, stage, venue, scheduledDate } = matchContext;
  const { lambdaHome, lambdaAway, backboneProbs, homeAdv, venueEffect } = domainData;

  const eloDiff   = Math.round((home.elo || 1500) - (away.elo || 1500));
  const eloFavour = eloDiff >= 0 ? home.name : away.name;

  const homeAlpha = home.log_alpha != null ? Math.exp(home.log_alpha).toFixed(3) : 'N/A';
  const homeBeta  = home.log_beta  != null ? Math.exp(home.log_beta ).toFixed(3) : 'N/A';
  const awayAlpha = away.log_alpha != null ? Math.exp(away.log_alpha).toFixed(3) : 'N/A';
  const awayBeta  = away.log_beta  != null ? Math.exp(away.log_beta ).toFixed(3) : 'N/A';

  const pctFmt = (v) => v != null ? `${(v * 100).toFixed(1)}%` : 'N/A';

  return `Analyse this World Cup 2026 match using the statistical model output below.

MATCH: ${home.name} vs ${away.name}
Stage: ${stage} | Date: ${scheduledDate} | Venue: ${venue ?? 'TBD'}

── DIXON-COLES OUTPUT ─────────────────────────────────────────────
  λ_home (expected goals, home): ${lambdaHome?.toFixed(3) ?? 'N/A'}
  λ_away (expected goals, away): ${lambdaAway?.toFixed(3) ?? 'N/A'}
  Backbone P(home win): ${pctFmt(backboneProbs?.winHome)}
  Backbone P(draw):     ${pctFmt(backboneProbs?.draw)}
  Backbone P(away win): ${pctFmt(backboneProbs?.winAway)}

── ELO RATINGS ────────────────────────────────────────────────────
  ${home.name}: ${Math.round(home.elo ?? 1500)} ELO  (FIFA rank #${home.fifa_rank ?? '?'})
  ${away.name}: ${Math.round(away.elo ?? 1500)} ELO  (FIFA rank #${away.fifa_rank ?? '?'})
  Differential: ${Math.abs(eloDiff)} pts in favour of ${eloFavour}

── ATTACK / DEFENCE RATINGS ───────────────────────────────────────
  ${home.name}: attack α=${homeAlpha}  defence β=${homeBeta}
  ${away.name}: attack α=${awayAlpha}  defence β=${awayBeta}
  (α > 1.5 = strong attack; β > 1.5 = leaky defence)

── CONTEXTUAL FACTORS ─────────────────────────────────────────────
  Home advantage: ${homeAdv?.side ?? 'NEUTRAL'}${
    homeAdv?.side !== 'NEUTRAL'
      ? ` — ${homeAdv.side === 'HOME' ? home.name : away.name} is a 2026 host nation`
      : ' — neither team is a host nation'
  }
  Venue effect: ${venueEffect?.description ?? 'None'} (λ scale factor: ${venueEffect?.lambdaScale?.toFixed(3) ?? '1.000'})

Provide your statistical probability assessment. Your output should be consistent with but not identical to the backbone probabilities — use them as your anchor and adjust for any statistical factors you observe.`;
}

// ── Agent singleton ───────────────────────────────────────────────
const agent = new Agent({
  name:         'StatisticalAgent',
  role:         'Dixon-Coles Statistical Backbone Interpreter',
  model:        QWEN_MODELS.PLUS,
  systemPrompt: SYSTEM_PROMPT,
});

module.exports = { agent, buildPrompt };
