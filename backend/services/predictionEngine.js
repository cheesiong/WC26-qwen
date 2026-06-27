/**
 * ═══════════════════════════════════════════════════════════════════
 *  WORLD CUP 2026 — PREDICTION ENGINE (v2)
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Backbone: Dixon-Coles bivariate Poisson with online attack/defense
 *  rating updates. Each team has `log_alpha` (attack strength) and
 *  `log_beta` (defence weakness) stored in the teams table, initialised
 *  from FIFA points + per-team scoring averages and nudged after every
 *  completed match by a regularised Poisson MLE gradient step.
 *
 *    λ_home = exp(log_α_home + log_β_away + home_adv)
 *    λ_away = exp(log_α_away + log_β_home)
 *
 *  The scoreline matrix is built with the Dixon-Coles τ low-score
 *  correction (the well-known fix for over-predicting 1-1 and
 *  under-predicting 0-0/1-0/0-1 under independent Poisson). Win/draw/loss
 *  AND most-likely scoreline are derived from the SAME matrix — no more
 *  internal inconsistency.
 *
 *  Adjustment signals (each produces a W/D/L probability vector that
 *  nudges the backbone via LOG-POOLING — geometric mean of probabilities
 *  raised to a per-signal exponent — instead of arithmetic averaging
 *  which systematically dragged confidence toward 0.33/0.33/0.33):
 *
 *    Head-to-Head (real 47k match dataset)   weight 0.30 when ≥2 meetings
 *    Recent form (opponent-quality weighted) weight 0.20
 *    Pre-match intelligence (LLM-parsed)     weight 0.20 when LLM succeeded
 *    Confirmed lineup (~1 hr before KO)      weight 0.40 when available
 *    Rest days difference                    weight 0.10 when ≥1 day delta
 *
 *  Output: win/draw/loss probabilities, expected score, most likely
 *  scoreline, top-3 scorelines, confidence tier, factors list, LLM
 *  insight.
 */

const { getDb } = require('../database/db');
const { TEAMS, TEAM_STATS } = require('../data/teams');
const { fetchTeamForm, fetchWebIntel } = require('./dataService');
const { h2hToProbs } = require('./h2hService');
const { fetchLineup, lineupToProbs } = require('./lineupService');

const { chatComplete, QWEN_MODELS } = require('./qwenClient');

// Lazy-loaded to break the circular dependency:
// predictionEngine → orchestratorAgent → (specialist agents) → predictionEngine
let _runMultiAgentPrediction;
function getOrchestrator() {
  if (!_runMultiAgentPrediction) {
    ({ runMultiAgentPrediction: _runMultiAgentPrediction } = require('./agents/orchestratorAgent'));
  }
  return _runMultiAgentPrediction;
}

// Feature flag: env var takes precedence, then DB model_config
function isMultiAgentEnabled(db) {
  if (process.env.USE_MULTI_AGENT === 'true')  return true;
  if (process.env.USE_MULTI_AGENT === 'false') return false;
  const row = db.prepare("SELECT value FROM model_config WHERE key = 'use_multi_agent'").get();
  return Number(row?.value ?? 0) === 1;
}

// ── Host nations for WC 2026 ───────────────────────────────────────
const HOST_NATIONS = new Set(['USA', 'CAN', 'MEX']);

// ── Backbone hyperparameters (tuned on 4,239-match backtest) ──────
const BACKBONE = {
  HOME_ADV_LOG: Math.log(1.30),  // home team scores ~30% more goals
  DC_RHO: -0.18,                 // Dixon-Coles low-score correction (WC group stage is more cagey; -0.18 fits better than generic -0.13)
  MAX_GOALS: 8,
  LEARNING_RATE: 0.06,
  REG_STRENGTH: 0.002,
  CLIP_LOG_MIN: Math.log(0.35),
  CLIP_LOG_MAX: Math.log(3.2),
  CLIP_GRAD: 2.0,
  // WC scoring rates differ markedly between group and knockout phases.
  //   Groups (WC 2018+2022):    2.69 goals/match
  //   Knockouts (WC 2018+2022): 2.40 goals/match (~11% lower — cagier games)
  // Backbone lambdas from international form data average ~3.21/game, so
  // these factors re-calibrate to each phase's tournament-level rate.
  WC_GOAL_SCALE_GROUP: 0.82,
  WC_GOAL_SCALE_KO:    0.72,
};

// Map match stage → goal-scale phase. GROUP is the only group-phase stage;
// everything else (R32, R16, QF, SF, F, THIRD_PLACE) is knockout.
function wcGoalScaleFor(stage) {
  if (stage === 'GROUP') return BACKBONE.WC_GOAL_SCALE_GROUP;
  return BACKBONE.WC_GOAL_SCALE_KO;
}

// ── Adjustment-signal log-pool weights ────────────────────────────
const SIGNAL_WEIGHTS = {
  BACKBONE: 1.0,
  H2H: 0.30,
  FORM: 0.20,
  INTEL: 0.20,
  LINEUP: 0.40,
  REST: 0.10,
};

// ── WC 2026 venue conditions (altitude / heat affect goal expectation)
const VENUE_CONDITIONS = {
  'Estadio Azteca':          { altitudeM: 2240, heatIndex: 0.0 },
  'Estadio Akron':           { altitudeM: 1560, heatIndex: 0.0 },
  'Estadio BBVA':            { altitudeM: 538,  heatIndex: 0.1 },
  'AT&T Stadium':            { altitudeM: 200,  heatIndex: 0.4 },
  'Hard Rock Stadium':       { altitudeM: 5,    heatIndex: 0.8 },
  'Arrowhead Stadium':       { altitudeM: 340,  heatIndex: 0.3 },
  'NRG Stadium':             { altitudeM: 15,   heatIndex: 0.7 },
  'Bank of America Stadium': { altitudeM: 230,  heatIndex: 0.3 },
  'BMO Field':               { altitudeM: 77,   heatIndex: 0.0 },
  'BC Place':                { altitudeM: 5,    heatIndex: 0.0 },
};

function getVenueEffect(venueName) {
  const key = venueName
    ? Object.keys(VENUE_CONDITIONS).find(k => (venueName || '').toLowerCase().includes(k.toLowerCase()))
    : null;
  const cond = key ? VENUE_CONDITIONS[key] : { altitudeM: 0, heatIndex: 0 };
  const altitudeFactor = 1 - (cond.altitudeM / 500) * 0.015;
  const heatFactor = 1 - cond.heatIndex * 0.03;
  return {
    lambdaScale: Math.max(0.80, altitudeFactor * heatFactor),
    altitudeM: cond.altitudeM,
    heatIndex: cond.heatIndex,
    description: cond.altitudeM > 1000
      ? `High altitude (${cond.altitudeM}m) — reduced goal expectation`
      : cond.heatIndex > 0.5
      ? `High heat/humidity — fatigue factor active`
      : null,
  };
}

// ── DIXON-COLES BACKBONE ──────────────────────────────────────────
function poissonPMF(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 1; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

function dcTau(h, a, lH, lA, rho) {
  if (h === 0 && a === 0) return 1 - lH * lA * rho;
  if (h === 0 && a === 1) return 1 + lH * rho;
  if (h === 1 && a === 0) return 1 + lA * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1;
}

function dcScoreMatrix(lH, lA, rho = BACKBONE.DC_RHO, maxGoals = BACKBONE.MAX_GOALS) {
  const cells = {};
  let total = 0;
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const v = Math.max(0, poissonPMF(h, lH) * poissonPMF(a, lA) * dcTau(h, a, lH, lA, rho));
      cells[`${h}-${a}`] = v;
      total += v;
    }
  }
  if (total > 0) for (const k of Object.keys(cells)) cells[k] /= total;
  return cells;
}

function probsFromMatrix(matrix) {
  let pH = 0, pD = 0, pA = 0;
  for (const [s, p] of Object.entries(matrix)) {
    const [h, a] = s.split('-').map(Number);
    if (h > a) pH += p;
    else if (h === a) pD += p;
    else pA += p;
  }
  return { winHome: pH, draw: pD, winAway: pA };
}

// ── RATING INITIALISATION ─────────────────────────────────────────
function fifaPriorFromPoints(fifaPoints) {
  if (!fifaPoints) return { alpha: 1.4, beta: 1.4 };
  const z = (fifaPoints - 1500) / 250;
  const sig = 1 / (1 + Math.exp(-z));
  return { alpha: 0.95 + sig * 1.0, beta: 1.85 - sig * 0.95 };
}

function ensureRatings(team) {
  if (team.log_alpha != null && team.log_beta != null) return team;
  const db = getDb();
  const fifaPoints = team.fifa_points
    || TEAMS.find(t => t.id === team.id)?.fifaPoints
    || 1500;
  const prior = fifaPriorFromPoints(fifaPoints);
  const stats = TEAM_STATS[team.id];
  const alpha = stats ? 0.5 * prior.alpha + 0.5 * stats.avgScored : prior.alpha;
  const beta = stats ? 0.5 * prior.beta + 0.5 * stats.avgConceded : prior.beta;
  const logA = Math.log(Math.max(0.5, alpha));
  const logB = Math.log(Math.max(0.5, beta));
  db.prepare(`
    UPDATE teams SET log_alpha = ?, log_beta = ?, log_alpha_prior = ?, log_beta_prior = ?
    WHERE id = ?
  `).run([logA, logB, logA, logB, team.id]);
  team.log_alpha = logA; team.log_beta = logB;
  team.log_alpha_prior = logA; team.log_beta_prior = logB;
  return team;
}

// ── HOME ADVANTAGE ────────────────────────────────────────────────
// In WC 2026 all matches are played in USA/CAN/MEX. Home advantage
// applies only when one of the playing teams is a host nation.
function homeAdvantageFor(homeId, awayId) {
  if (HOST_NATIONS.has(homeId)) return { logHA: BACKBONE.HOME_ADV_LOG, side: 'HOME' };
  if (HOST_NATIONS.has(awayId)) return { logHA: -BACKBONE.HOME_ADV_LOG, side: 'AWAY' };
  return { logHA: 0, side: 'NEUTRAL' };
}

// ── LOG-POOL BLEND ────────────────────────────────────────────────
// p_combined ∝ ∏ p_i^w_i — geometric mean of probabilities, raised to
// per-signal exponents, then renormalised. Preserves confidence (unlike
// arithmetic averaging which collapses everything toward 1/3,1/3,1/3).
function logPool(signals) {
  let logH = 0, logD = 0, logA = 0;
  let wTotal = 0;
  for (const { probs, weight } of signals) {
    if (!probs || weight <= 0) continue;
    const ph = Math.max(probs.winHome, 1e-3);
    const pd = Math.max(probs.draw,    1e-3);
    const pa = Math.max(probs.winAway, 1e-3);
    logH += Math.log(ph) * weight;
    logD += Math.log(pd) * weight;
    logA += Math.log(pa) * weight;
    wTotal += weight;
  }
  if (wTotal === 0) return { winHome: 1/3, draw: 1/3, winAway: 1/3 };
  const m = Math.max(logH, logD, logA);
  const eH = Math.exp(logH - m);
  const eD = Math.exp(logD - m);
  const eA = Math.exp(logA - m);
  const z = eH + eD + eA;
  return { winHome: eH / z, draw: eD / z, winAway: eA / z };
}

// ── ADJUSTMENT SIGNALS ────────────────────────────────────────────
// Competition importance weight — makes WC/qual results count more than friendlies
function competitionWeight(competition) {
  if (!competition) return 0.7;
  const c = competition.toLowerCase();
  if (c.includes('world cup') && !c.includes('qual') && !c.includes('round') && !c.includes('prepar')) return 2.0;
  if (c.includes('world cup') || c.includes('qualifier') || c.includes('qualifying')) return 1.5;
  if (c.includes('euro') || c.includes('copa america') || c.includes('afcon') ||
      c.includes('gold cup') || c.includes('nations cup') || c.includes('africa cup')) return 1.3;
  if (c.includes('nations league') || c.includes('confederation') || c.includes('concacaf')) return 1.1;
  if (c.includes('friendly') || c.includes('international') || c.includes('test')) return 0.5;
  return 0.8;
}

function computeFormScore(recent) {
  if (!recent || recent.length === 0) return 0.5;
  const n = recent.length;
  let pts = 0, wt = 0;
  recent.slice(0, 10).forEach((m, i) => {
    const timeFactor = 1 - (i / n) * 0.7;
    const compFactor = competitionWeight(m.competition);
    const w = timeFactor * compFactor;
    const p = m.result === 'W' ? 3 : m.result === 'D' ? 1 : 0;
    pts += p * w;
    wt += 3 * w;
  });
  return wt > 0 ? pts / wt : 0.5;
}

function formToProbs(formA, formB) {
  const diff = formA - formB;
  const winBoost = 0.5 + diff * 0.35;
  // Higher baseline (0.27) and slower compression (0.25) so draws aren't
  // systematically under-weighted when teams have only a modest form gap.
  const drawProb = 0.27 * (1 - Math.abs(diff) * 0.25);
  const lossProb = 1 - winBoost - drawProb;
  return {
    winHome: Math.max(0.05, winBoost),
    draw:    Math.max(0.05, drawProb),
    winAway: Math.max(0.05, lossProb),
  };
}

function intelToProbs(webIntel) {
  if (!webIntel) return null;
  let homeAdj = 0, awayAdj = 0;
  homeAdj -= Math.min(0.20, (webIntel.homeInjuries?.length || 0) * 0.05);
  awayAdj -= Math.min(0.20, (webIntel.awayInjuries?.length || 0) * 0.05);
  const formMap = { excellent: 0.07, good: 0.03, normal: 0, poor: -0.06 };
  homeAdj += formMap[webIntel.homeForm] ?? 0;
  awayAdj += formMap[webIntel.awayForm] ?? 0;
  if (webIntel.homeRotating) homeAdj -= 0.08;
  if (webIntel.awayRotating) awayAdj -= 0.08;
  const motivMap = { high: 0.04, normal: 0, low: -0.05 };
  homeAdj += motivMap[webIntel.homeMotivation] ?? 0;
  awayAdj += motivMap[webIntel.awayMotivation] ?? 0;

  const base = 1 / 3;
  const winHome = Math.max(0.05, base + homeAdj - awayAdj * 0.5);
  const winAway = Math.max(0.05, base + awayAdj - homeAdj * 0.5);
  const draw    = Math.max(0.05, 1 - winHome - winAway);
  const total   = winHome + draw + winAway;
  return { winHome: winHome / total, draw: draw / total, winAway: winAway / total };
}

// ── GOAL-CHANNEL NUDGES ───────────────────────────────────────────
// Form and intel signals naturally have a goal-expectation component:
// a team on a hot streak scores more and concedes less; key injuries
// suppress goal output. Letting them nudge λ before the matrix is built
// shapes scoreline picks correctly. Magnitudes are kept conservative so
// the W/D/L log-pool blend still dominates outcome probability.
function formGoalNudge(formHome, formAway) {
  const K = 0.15; // log-space; at form gap 0.5 this is ~7.5% λ swing
  const dH = formHome - 0.5;
  const dA = formAway - 0.5;
  return {
    logScaleHome: K * (dH - 0.5 * dA),
    logScaleAway: K * (dA - 0.5 * dH),
  };
}

function intelGoalNudge(webIntel) {
  if (!webIntel) return { logScaleHome: 0, logScaleAway: 0 };
  const hInj = Math.min(3, webIntel.homeInjuries?.length || 0);
  const aInj = Math.min(3, webIntel.awayInjuries?.length || 0);
  // Own-injury reduces own λ; opponent-injury slightly lifts own λ.
  let logH = -0.03 * hInj + 0.015 * aInj;
  let logA = -0.03 * aInj + 0.015 * hInj;
  if (webIntel.homeRotating) logH -= 0.04;
  if (webIntel.awayRotating) logA -= 0.04;
  if (webIntel.homeMotivation === 'high') logH += 0.03;
  if (webIntel.awayMotivation === 'high') logA += 0.03;
  if (webIntel.homeMotivation === 'low')  logH -= 0.03;
  if (webIntel.awayMotivation === 'low')  logA -= 0.03;
  return { logScaleHome: logH, logScaleAway: logA };
}

function restDaysProbs(db, matchDate, homeId, awayId) {
  const getLast = db.prepare(`
    SELECT scheduled_date FROM matches
    WHERE (home_team = ? OR away_team = ?) AND status = 'COMPLETED'
      AND scheduled_date < ?
    ORDER BY scheduled_date DESC LIMIT 1
  `);
  const calcDays = (row) => row
    ? Math.max(0, Math.round((new Date(matchDate) - new Date(row.scheduled_date)) / 86400000))
    : 7;
  const homeRest = calcDays(getLast.get([homeId, homeId, matchDate]));
  const awayRest = calcDays(getLast.get([awayId, awayId, matchDate]));

  const penalty = (d) => d <= 2 ? -0.08 : d <= 3 ? -0.04 : d === 4 ? -0.01 : 0;
  const net = penalty(awayRest) - penalty(homeRest);
  const nudge = net * 0.4;
  const base = 1 / 3;
  const wH = Math.max(0.10, base + nudge);
  const wA = Math.max(0.10, base - nudge);
  const wD = Math.max(0.15, 1 - wH - wA);
  const t  = wH + wD + wA;
  return {
    winHome: wH / t, draw: wD / t, winAway: wA / t,
    homeRest, awayRest,
  };
}

// ── CONFIDENCE & SCORELINE DERIVATION ─────────────────────────────
function calcConfidence(probs) {
  const max = Math.max(probs.winHome, probs.draw, probs.winAway);
  if (max >= 0.65) return 'VERY_HIGH';
  if (max >= 0.50) return 'HIGH';
  if (max >= 0.40) return 'MEDIUM';
  return 'LOW';
}

// Reweight backbone matrix so outcome-class totals match the blended
// W/D/L probabilities, preserving the within-class scoreline shape.
// This propagates the H2H/form/intel/lineup/rest signal into the
// scoreline picker without the heuristic lambda nudge.
function reweightMatrixToOutcomeProbs(matrix, backboneProbs, finalProbs) {
  const scale = {
    HOME: finalProbs.winHome / Math.max(backboneProbs.winHome, 1e-9),
    DRAW: finalProbs.draw    / Math.max(backboneProbs.draw,    1e-9),
    AWAY: finalProbs.winAway / Math.max(backboneProbs.winAway, 1e-9),
  };
  const out = {};
  let total = 0;
  for (const [s, p] of Object.entries(matrix)) {
    const [h, a] = s.split('-').map(Number);
    const k = h > a ? 'HOME' : h === a ? 'DRAW' : 'AWAY';
    const v = p * scale[k];
    out[s] = v;
    total += v;
  }
  if (total > 0) for (const k of Object.keys(out)) out[k] /= total;
  return out;
}

function outcomeOf(score) {
  const [h, a] = score.split('-').map(Number);
  return h > a ? 'HOME' : h === a ? 'DRAW' : 'AWAY';
}

// Pick S1, S2, S3 to MAXIMISE expected points under the scoring rule:
//   3 pts if actual = S1, 2 pts if actual ∈ {S2, S3},
//   1 pt if actual outcome = O(S1) and no exact hit, else 0.
//
// Expected points (with S1, S2, S3 distinct):
//   E = 2·M[S1] + M[O(S1)] + Σᵢ M[Sᵢ]·(2 − 𝟙[O(Sᵢ)=O(S1)])
//
// → S1 maximises 2·M[s] + M[O(s)]  (raw cell value + its outcome-class total)
// → S2, S3 maximise M[s]·(2 if different outcome from S1, else 1).
function pickTopScoresForPoints(matrix) {
  const totals = { HOME: 0, DRAW: 0, AWAY: 0 };
  for (const [s, p] of Object.entries(matrix)) totals[outcomeOf(s)] += p;

  let s1 = null, bestV1 = -Infinity;
  for (const [s, p] of Object.entries(matrix)) {
    const v1 = 2 * p + totals[outcomeOf(s)];
    if (v1 > bestV1) { bestV1 = v1; s1 = s; }
  }
  const o1 = outcomeOf(s1);

  const rest = [];
  for (const [s, p] of Object.entries(matrix)) {
    if (s === s1) continue;
    rest.push({ s, p, v2: p * (outcomeOf(s) === o1 ? 1 : 2) });
  }
  rest.sort((a, b) => b.v2 - a.v2 || b.p - a.p);
  const s2 = rest[0].s;
  const s3 = rest[1].s;

  return {
    mostLikely: s1,
    top: [
      { score: s1, prob: +matrix[s1].toFixed(4) },
      { score: s2, prob: +matrix[s2].toFixed(4) },
      { score: s3, prob: +matrix[s3].toFixed(4) },
    ],
  };
}

// Expected points for a given top-3 pick under matrix M (used in tests
// and for backtest reporting).
function expectedPointsFromMatrix(matrix, picks) {
  const [s1, s2, s3] = picks;
  const totals = { HOME: 0, DRAW: 0, AWAY: 0 };
  for (const [s, p] of Object.entries(matrix)) totals[outcomeOf(s)] += p;
  const o1 = outcomeOf(s1);
  const m = (s) => matrix[s] || 0;
  return 2 * m(s1) + totals[o1] + m(s2) * (outcomeOf(s2) === o1 ? 1 : 2)
                                + m(s3) * (outcomeOf(s3) === o1 ? 1 : 2);
}

// Realised points for an observed scoreline given a top-3 pick (for backtest).
function pointsForResult(actualScore, picks) {
  const [s1, s2, s3] = picks;
  if (actualScore === s1) return 3;
  if (actualScore === s2 || actualScore === s3) return 2;
  if (outcomeOf(actualScore) === outcomeOf(s1)) return 1;
  return 0;
}

// ── FACTOR DISPLAY (admin sees weights; public sees descriptions) ─
function buildFactors(homeTeam, awayTeam, ctx) {
  const factors = [];
  const totalW = Object.values(ctx.weightsUsed).reduce((s, v) => s + v, 0) || 1;
  const pct = (w) => +(w / totalW * 100).toFixed(1);

  // Backbone summary
  const lambdaRatio = ctx.lambdaHome / ctx.lambdaAway;
  factors.push({
    name: 'Attack/Defence Rating',
    description: `${homeTeam.name} attack ${Math.exp(homeTeam.log_alpha).toFixed(2)} / defence ${Math.exp(homeTeam.log_beta).toFixed(2)} — expected ${ctx.lambdaHome.toFixed(2)} goals vs ${ctx.lambdaAway.toFixed(2)} for ${awayTeam.name}.`,
    favors: lambdaRatio > 1.10 ? 'HOME' : lambdaRatio < 1 / 1.10 ? 'AWAY' : 'NEUTRAL',
    impact: Math.min(1, Math.abs(Math.log(lambdaRatio))),
    weight: pct(ctx.weightsUsed.BACKBONE || 0),
  });

  // H2H
  const h = ctx.h2hData;
  if (h && h.matchCount > 0) {
    const raw = h.rawRecord || {};
    let desc = `${raw.aWins || 0}W–${raw.draws || 0}D–${raw.bWins || 0}L in last ${h.matchCount} meetings`;
    if (h.wcMeetings > 0) desc += ` (${h.wcMeetings} at World Cup)`;
    if (h.lastMeeting) desc += ` · Last: ${h.lastMeeting.date?.slice(0, 7)} ${h.lastMeeting.tournament}`;
    factors.push({
      name: 'Head-to-Head History',
      description: desc,
      favors: h.weightedAdvantage > 0.1 ? 'HOME' : h.weightedAdvantage < -0.1 ? 'AWAY' : 'NEUTRAL',
      impact: Math.min(0.5, Math.abs(h.weightedAdvantage || 0)),
      weight: pct(ctx.weightsUsed.H2H || 0),
      dataQuality: h.dataQuality,
    });
  }

  // Form (opponent-quality-weighted)
  factors.push({
    name: 'Recent Form',
    description: `${homeTeam.name} form ${(ctx.formHome * 100).toFixed(0)}% | ${awayTeam.name} form ${(ctx.formAway * 100).toFixed(0)}%`,
    favors: ctx.formHome > ctx.formAway + 0.1 ? 'HOME' : ctx.formAway > ctx.formHome + 0.1 ? 'AWAY' : 'NEUTRAL',
    impact: Math.abs(ctx.formHome - ctx.formAway),
    weight: pct(ctx.weightsUsed.FORM || 0),
  });

  // Pre-match intel
  if (ctx.webIntel) {
    const parts = [];
    if (ctx.webIntel.homeInjuries?.length) parts.push(`${homeTeam.name} missing: ${ctx.webIntel.homeInjuries.join(', ')}`);
    if (ctx.webIntel.awayInjuries?.length) parts.push(`${awayTeam.name} missing: ${ctx.webIntel.awayInjuries.join(', ')}`);
    if (ctx.webIntel.homeRotating) parts.push(`${homeTeam.name} expected to rotate squad`);
    if (ctx.webIntel.awayRotating) parts.push(`${awayTeam.name} expected to rotate squad`);
    if (ctx.webIntel.homeMotivation === 'high') parts.push(`${homeTeam.name} in must-win situation`);
    if (ctx.webIntel.awayMotivation === 'high') parts.push(`${awayTeam.name} in must-win situation`);
    if (ctx.webIntel.keySummary) parts.push(ctx.webIntel.keySummary);
    if (parts.length > 0) {
      const ih = ctx.webIntel.homeInjuries?.length || 0;
      const ia = ctx.webIntel.awayInjuries?.length || 0;
      factors.push({
        name: 'Pre-Match Intelligence',
        description: parts.join(' · '),
        favors: ih > ia ? 'AWAY' : ia > ih ? 'HOME' : 'NEUTRAL',
        impact: Math.min(0.4, (ih + ia) * 0.05),
        weight: pct(ctx.weightsUsed.INTEL || 0),
        llmParsed: ctx.webIntel.llmParsed || false,
      });
    }
  }

  // Confirmed lineup
  if (ctx.lineupData?.available) {
    const delta = ctx.lineupData.strengthDelta || 0;
    const hAbs = ctx.lineupData.keyAbsences?.home || [];
    const aAbs = ctx.lineupData.keyAbsences?.away || [];
    const hScore = ctx.lineupData.home?.strengthScore?.toFixed(1) || '?';
    const aScore = ctx.lineupData.away?.strengthScore?.toFixed(1) || '?';
    let desc = `Lineup strength — ${homeTeam.name}: ${hScore}/10 | ${awayTeam.name}: ${aScore}/10`;
    if (hAbs.length) desc += ` · ${homeTeam.name} missing: ${hAbs.slice(0, 2).join(', ')}`;
    if (aAbs.length) desc += ` · ${awayTeam.name} missing: ${aAbs.slice(0, 2).join(', ')}`;
    factors.push({
      name: 'Confirmed Lineup',
      description: desc,
      favors: delta > 0.5 ? 'HOME' : delta < -0.5 ? 'AWAY' : 'NEUTRAL',
      impact: Math.min(0.4, Math.abs(delta) / 3),
      weight: pct(ctx.weightsUsed.LINEUP || 0),
      source: ctx.lineupData.source,
    });
  }

  // Rest days
  if (ctx.restData && Math.abs(ctx.restData.homeRest - ctx.restData.awayRest) >= 1) {
    const diff = ctx.restData.homeRest - ctx.restData.awayRest;
    factors.push({
      name: 'Rest & Recovery',
      description: `${homeTeam.name}: ${ctx.restData.homeRest} rest days | ${awayTeam.name}: ${ctx.restData.awayRest} rest days. ${diff >= 0 ? homeTeam.name : awayTeam.name} have the fresher legs.`,
      favors: diff > 0 ? 'HOME' : 'AWAY',
      impact: Math.min(0.15, Math.abs(diff) * 0.04),
      weight: pct(ctx.weightsUsed.REST || 0),
    });
  }

  // Host nation (informational — folded into backbone home advantage)
  if (ctx.homeAdv.side !== 'NEUTRAL') {
    const hostTeam = ctx.homeAdv.side === 'HOME' ? homeTeam : awayTeam;
    factors.push({
      name: 'Host Nation Advantage',
      description: `${hostTeam.name} are playing on home soil — crowd support, no travel fatigue, familiar conditions.`,
      favors: ctx.homeAdv.side,
      impact: 0.13,
      weight: 0,
    });
  }

  // Venue conditions (informational — already in backbone lambdas)
  if (ctx.venueEffect?.description) {
    factors.push({
      name: 'Venue Conditions',
      description: ctx.venueEffect.description,
      favors: 'NEUTRAL',
      impact: Math.abs(1 - ctx.venueEffect.lambdaScale) * 2,
      weight: 0,
    });
  }

  return factors.sort((a, b) => b.impact - a.impact);
}

// ── INSIGHT (Ollama LLM with template fallback) ───────────────────
function generateInsightFallback(homeTeam, awayTeam, finalProbs, factors) {
  const favourite = finalProbs.winHome > finalProbs.winAway ? homeTeam.name : awayTeam.name;
  const favProb = Math.max(finalProbs.winHome, finalProbs.winAway);
  const topFactor = factors[0];

  let insight = `${favourite} enter as `;
  insight += favProb > 0.65 ? 'clear' : favProb > 0.50 ? 'slight' : 'marginal';
  insight += ` favourites (${(favProb * 100).toFixed(0)}% win probability). `;
  if (topFactor && topFactor.impact > 0.05) {
    insight += `The biggest differentiator is ${topFactor.name.toLowerCase()}, which `;
    insight += topFactor.favors === 'HOME' ? `favours ${homeTeam.name}. `
             : topFactor.favors === 'AWAY' ? `favours ${awayTeam.name}. `
             : 'is evenly balanced. ';
  }
  if (finalProbs.draw > 0.27) {
    insight += `A draw (${(finalProbs.draw * 100).toFixed(0)}%) is a genuine possibility — these sides are closely matched.`;
  }
  return insight.trim();
}

async function generateInsight(homeTeam, awayTeam, finalProbs, factors, webIntel, topScores) {
  const context = [
    `Match: ${homeTeam.name} (home) vs ${awayTeam.name} (away)`,
    `Win probabilities: ${homeTeam.name} ${(finalProbs.winHome * 100).toFixed(0)}% | Draw ${(finalProbs.draw * 100).toFixed(0)}% | ${awayTeam.name} ${(finalProbs.winAway * 100).toFixed(0)}%`,
    `FIFA rankings: ${homeTeam.name} #${homeTeam.fifa_rank} | ${awayTeam.name} #${awayTeam.fifa_rank}`,
    topScores?.length ? `Top scorelines: ${topScores.map(s => `${s.score} (${(s.prob * 100).toFixed(1)}%)`).join(', ')}` : '',
    ...factors.filter(f => f.impact > 0.05).map(f => `${f.name}: ${f.description} [favours ${f.favors}]`),
    webIntel?.keySummary ? `Latest intel: ${webIntel.keySummary}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `You are a concise football analyst writing a pre-match insight for a World Cup 2026 prediction app.

Given this match data:
${context}

Write a 2-3 sentence analyst insight in plain English. Be specific — mention team names, actual numbers, and the most decisive factors. Do not use bullet points, headers, or markdown. Do not start with "Based on" or "According to". Write as if you are a pundit giving a sharp take before kickoff.

CRITICAL: Only mention player absences if they appear in the factors above. Do NOT claim any player is injured, suspended, or missing based on your own knowledge. If no injuries are listed, all players are available.`;

  try {
    const result = await chatComplete({
      model: QWEN_MODELS.TURBO,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      maxTokens: 256,
    });
    let insight = result.text?.length > 20 ? result.text : null;
    // Post-process: remove any player absence claims not in the validated injuries list
    if (insight) {
      const validatedInjuries = [
        ...(webIntel?.homeInjuries || []),
        ...(webIntel?.awayInjuries || []),
      ];
      // Pattern: "missing/without/no/absent [PlayerName]" — catches separators like spaces, em-dashes, colons
      const absenceRe = /(?:missing\s+|without\s+|no\s+|absent[:\s]*)([A-Z][a-zA-Z0-9]+(?:\s+(?!and\b|or\b)[A-Z][a-zA-Z0-9]+)*)/gi;
      let match;
      while ((match = absenceRe.exec(insight)) !== null) {
        const player = match[1];
        const isInInjuries = validatedInjuries.some(
          inj => inj.toLowerCase() === player.toLowerCase()
        );
        if (!isInInjuries) {
          console.warn(`[generateInsight] Insight mentions "${player}" as absent but not in validated injuries — removing claim`);
          // Remove the absence claim from the insight
          insight = insight.replace(match[0], '');
        }
      }
      // Clean up any double spaces or awkward phrasing from removals
      insight = insight.replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',').replace(/[-—]\s*[-—]/g, '—').trim();
    }
    return insight || generateInsightFallback(homeTeam, awayTeam, finalProbs, factors);
  } catch (e) {
    console.warn('Qwen insight generation failed, using fallback:', e.message);
  }
  return generateInsightFallback(homeTeam, awayTeam, finalProbs, factors);
}

// ── TEMPERATURE CALIBRATION ───────────────────────────────────────
// Read fitted temperature from model_config; default 1.0 = no scaling.
function getTemperature(db) {
  const row = db.prepare("SELECT value FROM model_config WHERE key = 'calibration_temperature'").get();
  return row?.value || 1.0;
}

// Read fitted Dixon-Coles ρ from model_config; falls back to backbone prior.
function getDcRho(db) {
  const row = db.prepare("SELECT value FROM model_config WHERE key = 'dc_rho'").get();
  return row?.value ?? BACKBONE.DC_RHO;
}

function applyTemperature(probs, T) {
  if (!T || T === 1.0) return probs;
  // Softer T>1 → less confident; T<1 → more confident
  const logH = Math.log(Math.max(probs.winHome, 1e-6)) / T;
  const logD = Math.log(Math.max(probs.draw,    1e-6)) / T;
  const logA = Math.log(Math.max(probs.winAway, 1e-6)) / T;
  const m = Math.max(logH, logD, logA);
  const eH = Math.exp(logH - m);
  const eD = Math.exp(logD - m);
  const eA = Math.exp(logA - m);
  const z = eH + eD + eA;
  return { winHome: eH / z, draw: eD / z, winAway: eA / z };
}

// ── MAIN: predict(matchId) ────────────────────────────────────────
async function predict(matchId, forceRefresh = false) {
  const db = getDb();

  if (!forceRefresh) {
    const cached = db.prepare(`
      SELECT * FROM predictions WHERE match_id = ? ORDER BY generated_at DESC LIMIT 1
    `).get(matchId);
    if (cached && !cached.actual_outcome) {
      return {
        ...cached,
        factors: JSON.parse(cached.factors || '[]'),
        top_scores: JSON.parse(cached.top_scores || '[]'),
        web_intel: JSON.parse(cached.web_intel || 'null'),
        fromCache: true,
      };
    }
  }

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!match) throw new Error(`Match ${matchId} not found`);
  if (match.status === 'COMPLETED' || match.status === 'LIVE') {
    const prev = db.prepare('SELECT * FROM predictions WHERE match_id = ? ORDER BY generated_at DESC LIMIT 1').get(matchId);
    if (prev) {
      return {
        ...prev,
        factors: JSON.parse(prev.factors || '[]'),
        top_scores: JSON.parse(prev.top_scores || '[]'),
        web_intel: JSON.parse(prev.web_intel || 'null'),
      };
    }
  }

  let homeTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(match.home_team);
  let awayTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(match.away_team);
  if (!homeTeam || !awayTeam) throw new Error('Teams not found for match');
  homeTeam = ensureRatings(homeTeam);
  awayTeam = ensureRatings(awayTeam);

  // ── MULTI-AGENT PATH ──────────────────────────────────────────
  // When enabled, compute a pure DC backbone (no form/intel λ-nudges —
  // the specialist agents handle those signals independently) then
  // delegate the entire orchestration to orchestratorAgent.js.
  if (isMultiAgentEnabled(db)) {
    const homeAdv_ma     = homeAdvantageFor(match.home_team, match.away_team);
    const venueEffect_ma = getVenueEffect(match.venue);
    const wcScale_ma     = wcGoalScaleFor(match.stage);
    const dcRho_ma       = getDcRho(db);
    const logLamH_ma     = homeTeam.log_alpha + awayTeam.log_beta + homeAdv_ma.logHA;
    const logLamA_ma     = awayTeam.log_alpha + homeTeam.log_beta;
    const lambdaHome_ma  = Math.max(0.20, Math.min(5.5, Math.exp(logLamH_ma) * venueEffect_ma.lambdaScale * wcScale_ma));
    const lambdaAway_ma  = Math.max(0.20, Math.min(5.5, Math.exp(logLamA_ma) * venueEffect_ma.lambdaScale * wcScale_ma));
    const matrix_ma      = dcScoreMatrix(lambdaHome_ma, lambdaAway_ma, dcRho_ma);
    const backboneProbs_ma = probsFromMatrix(matrix_ma);

    return getOrchestrator()(matchId, {
      match, homeTeam, awayTeam,
      lambdaHome:    lambdaHome_ma,
      lambdaAway:    lambdaAway_ma,
      backboneProbs: backboneProbs_ma,
      matrix:        matrix_ma,
      homeAdv:       homeAdv_ma,
      venueEffect:   venueEffect_ma,
      dcRho:         dcRho_ma,
    });
  }
  // ── END MULTI-AGENT PATH ──────────────────────────────────────

  // ── SIGNAL FETCH (form/intel needed before backbone so they can
  //    nudge λ; H2H/lineup/rest are W/D/L-only so they can wait) ───
  let formHomeScore = 0.5, formAwayScore = 0.5, formProbs = null;
  try {
    const [hForm, aForm] = await Promise.all([
      fetchTeamForm(match.home_team),
      fetchTeamForm(match.away_team),
    ]);
    formHomeScore = computeFormScore(hForm);
    formAwayScore = computeFormScore(aForm);
    formProbs = formToProbs(formHomeScore, formAwayScore);
  } catch (e) {
    console.warn('Form fetch failed:', e.message);
  }

  let webIntel = null, intelProbs = null;
  try {
    webIntel = await fetchWebIntel(match.home_team, match.away_team, match.scheduled_date, match.stage);
    if (webIntel?.llmParsed) intelProbs = intelToProbs(webIntel);
  } catch (e) {
    console.warn('Web intel fetch failed:', e.message);
  }

  // ── BACKBONE (with form/intel goal-channel nudges) ────────────
  const homeAdv = homeAdvantageFor(match.home_team, match.away_team);
  const venueEffect = getVenueEffect(match.venue);

  const formNudge = formProbs ? formGoalNudge(formHomeScore, formAwayScore)
                              : { logScaleHome: 0, logScaleAway: 0 };
  const intelNudge = intelGoalNudge(webIntel);

  const logLamH = homeTeam.log_alpha + awayTeam.log_beta + homeAdv.logHA
                + formNudge.logScaleHome + intelNudge.logScaleHome;
  const logLamA = awayTeam.log_alpha + homeTeam.log_beta
                + formNudge.logScaleAway + intelNudge.logScaleAway;
  const wcScale = wcGoalScaleFor(match.stage);
  const lambdaHome = Math.max(0.20, Math.min(5.5, Math.exp(logLamH) * venueEffect.lambdaScale * wcScale));
  const lambdaAway = Math.max(0.20, Math.min(5.5, Math.exp(logLamA) * venueEffect.lambdaScale * wcScale));

  const dcRho = getDcRho(db);
  const matrix = dcScoreMatrix(lambdaHome, lambdaAway, dcRho);
  const backboneProbs = probsFromMatrix(matrix);

  // ── REMAINING SIGNALS (W/D/L-only) ─────────────────────────────
  let h2hProbs = null, h2hData = null;
  try {
    h2hData = await h2hToProbs(match.home_team, match.away_team);
    if (h2hData && h2hData.matchCount >= 2) {
      h2hProbs = { winHome: h2hData.winHome, draw: h2hData.draw, winAway: h2hData.winAway };
    }
  } catch (e) {
    console.warn('H2H lookup failed:', e.message);
  }

  // Lineup
  let lineupProbsResult = null, lineupData = null;
  try {
    lineupData = await fetchLineup(matchId);
    if (lineupData?.available) {
      const lp = lineupToProbs(lineupData);
      lineupProbsResult = { winHome: lp.winHome, draw: lp.draw, winAway: lp.winAway };
    }
  } catch (e) {
    console.warn('Lineup fetch failed:', e.message);
  }

  // Rest days
  let restProbs = null, restData = null;
  try {
    restData = restDaysProbs(db, match.scheduled_date, match.home_team, match.away_team);
    if (Math.abs(restData.homeRest - restData.awayRest) >= 1) {
      restProbs = { winHome: restData.winHome, draw: restData.draw, winAway: restData.winAway };
    }
  } catch (e) {
    console.warn('Rest days calc failed:', e.message);
  }

  // ── LOG-POOL BLEND ────────────────────────────────────────────
  const weightsUsed = { BACKBONE: SIGNAL_WEIGHTS.BACKBONE };
  const signals = [{ probs: backboneProbs, weight: SIGNAL_WEIGHTS.BACKBONE }];
  if (h2hProbs)         { signals.push({ probs: h2hProbs,    weight: SIGNAL_WEIGHTS.H2H    }); weightsUsed.H2H    = SIGNAL_WEIGHTS.H2H; }
  if (formProbs)        { signals.push({ probs: formProbs,   weight: SIGNAL_WEIGHTS.FORM   }); weightsUsed.FORM   = SIGNAL_WEIGHTS.FORM; }
  if (intelProbs)       { signals.push({ probs: intelProbs,  weight: SIGNAL_WEIGHTS.INTEL  }); weightsUsed.INTEL  = SIGNAL_WEIGHTS.INTEL; }
  if (lineupProbsResult){ signals.push({ probs: lineupProbsResult, weight: SIGNAL_WEIGHTS.LINEUP }); weightsUsed.LINEUP = SIGNAL_WEIGHTS.LINEUP; }
  if (restProbs)        { signals.push({ probs: restProbs,   weight: SIGNAL_WEIGHTS.REST   }); weightsUsed.REST   = SIGNAL_WEIGHTS.REST; }

  let finalProbs = logPool(signals);
  finalProbs = applyTemperature(finalProbs, getTemperature(db));

  // ── SCORELINE DERIVATION (expected-points-optimal) ───────────────
  // Reweight the backbone matrix so outcome-class totals match the
  // blended W/D/L, then pick S1/S2/S3 to maximise expected points under
  // the scoring rule (3/2/2/1/0).
  const blendedMatrix = reweightMatrixToOutcomeProbs(matrix, backboneProbs, finalProbs);
  const { mostLikely: mostLikelyScore, top: topScores } = pickTopScoresForPoints(blendedMatrix);

  let expHome = 0, expAway = 0;
  for (const [s, p] of Object.entries(blendedMatrix)) {
    const [h, a] = s.split('-').map(Number);
    expHome += h * p;
    expAway += a * p;
  }

  // ── PACKAGE OUTPUT ────────────────────────────────────────────
  const ctx = {
    lambdaHome, lambdaAway,
    homeAdv, venueEffect,
    h2hData, formHome: formHomeScore, formAway: formAwayScore,
    webIntel, lineupData, restData,
    weightsUsed,
  };

  const factors = buildFactors(homeTeam, awayTeam, ctx);
  const confidence = calcConfidence(finalProbs);
  const expectedScoreHome = +expHome.toFixed(2);
  const expectedScoreAway = +expAway.toFixed(2);

  const insight = await generateInsight(homeTeam, awayTeam, finalProbs, factors, webIntel, topScores);

  const activeNames = Object.keys(weightsUsed);
  const totalW = Object.values(weightsUsed).reduce((s, v) => s + v, 0);
  const methodology = activeNames
    .map(n => `${n}(${(weightsUsed[n] / totalW * 100).toFixed(0)}%)`)
    .join(' + ');

  const result = db.prepare(`
    INSERT INTO predictions
      (match_id, prob_home, prob_draw, prob_away, expected_score_home, expected_score_away,
       most_likely_score, top_scores, confidence, factors, web_intel, insight, methodology,
       lambda_home, lambda_away)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run([
    matchId,
    finalProbs.winHome, finalProbs.draw, finalProbs.winAway,
    expectedScoreHome, expectedScoreAway,
    mostLikelyScore, JSON.stringify(topScores), confidence,
    JSON.stringify(factors),
    JSON.stringify({ ...webIntel, lineup: lineupData }),
    insight, methodology,
    lambdaHome, lambdaAway,
  ]);

  const { generated_at } = db.prepare('SELECT generated_at FROM predictions WHERE id = ?').get(result.lastInsertRowid);

  return {
    id: result.lastInsertRowid,
    match_id: matchId,
    generated_at,
    homeTeam, awayTeam,
    prob_home: finalProbs.winHome,
    prob_draw: finalProbs.draw,
    prob_away: finalProbs.winAway,
    expected_score_home: expectedScoreHome,
    expected_score_away: expectedScoreAway,
    most_likely_score: mostLikelyScore,
    top_scores: topScores,
    confidence,
    factors,
    web_intel: webIntel,
    lineup: lineupData,
    insight,
    methodology,
    fromCache: false,
  };
}

// ── POST-MATCH RATING UPDATES ─────────────────────────────────────
// Updates BOTH legacy ELO (used by team profile / Monte Carlo simulation)
// AND the v2 attack/defense ratings (used by predict()).
function updateAfterMatch(homeTeamId, awayTeamId, homeGoals, awayGoals, matchId = null, stage = null) {
  const db = getDb();
  const weights = {};
  db.prepare('SELECT key, value FROM model_config').all().forEach(r => { weights[r.key] = r.value; });

  let home = db.prepare('SELECT * FROM teams WHERE id = ?').get(homeTeamId);
  let away = db.prepare('SELECT * FROM teams WHERE id = ?').get(awayTeamId);
  if (!home || !away) return;
  home = ensureRatings(home);
  away = ensureRatings(away);

  // ── 1. Legacy ELO update (preserved for team page / Monte Carlo) ──
  const K = weights.elo_k_factor || 40;
  const expHome = 1 / (1 + Math.pow(10, (away.elo - home.elo) / 400));
  const expAway = 1 - expHome;
  const actualHome = homeGoals > awayGoals ? 1 : homeGoals === awayGoals ? 0.5 : 0;
  const actualAway = 1 - actualHome;
  const gd = Math.abs(homeGoals - awayGoals);
  const gdMult = gd <= 1 ? 1 : gd === 2 ? 1.5 : 1.75 + (gd - 3) * 0.1;
  const newEloHome = home.elo + K * gdMult * (actualHome - expHome);
  const newEloAway = away.elo + K * gdMult * (actualAway - expAway);

  db.prepare("UPDATE teams SET elo = ?, updated_at = datetime('now') WHERE id = ?").run([newEloHome, homeTeamId]);
  db.prepare("UPDATE teams SET elo = ?, updated_at = datetime('now') WHERE id = ?").run([newEloAway, awayTeamId]);

  if (matchId) {
    const insertElo = db.prepare(`
      INSERT OR IGNORE INTO elo_history (team_id, match_id, elo_before, elo_after, opponent_id, result, stage)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const hRes = actualHome === 1 ? 'W' : actualHome === 0.5 ? 'D' : 'L';
    const aRes = actualAway === 1 ? 'W' : actualAway === 0.5 ? 'D' : 'L';
    insertElo.run([homeTeamId, matchId, home.elo, newEloHome, awayTeamId, hRes, stage]);
    insertElo.run([awayTeamId, matchId, away.elo, newEloAway, homeTeamId, aRes, stage]);
  }

  // ── 2. v2 attack/defense rating update ────────────────────────
  const homeAdv = homeAdvantageFor(homeTeamId, awayTeamId);
  const lH = Math.exp(home.log_alpha + away.log_beta + homeAdv.logHA);
  const lA = Math.exp(away.log_alpha + home.log_beta);

  const clipGrad = (g) => Math.max(-BACKBONE.CLIP_GRAD, Math.min(BACKBONE.CLIP_GRAD, g));
  const clipLog  = (v) => Math.max(BACKBONE.CLIP_LOG_MIN, Math.min(BACKBONE.CLIP_LOG_MAX, v));
  const lr = BACKBONE.LEARNING_RATE;
  const reg = BACKBONE.REG_STRENGTH;

  const gAlphaH = clipGrad(homeGoals - lH);
  const gAlphaA = clipGrad(awayGoals - lA);
  const gBetaH  = clipGrad(awayGoals - lA);
  const gBetaA  = clipGrad(homeGoals - lH);

  const newLogAlphaH = clipLog(home.log_alpha + lr * gAlphaH - reg * (home.log_alpha - home.log_alpha_prior));
  const newLogAlphaA = clipLog(away.log_alpha + lr * gAlphaA - reg * (away.log_alpha - away.log_alpha_prior));
  const newLogBetaH  = clipLog(home.log_beta  + lr * gBetaH  - reg * (home.log_beta  - home.log_beta_prior));
  const newLogBetaA  = clipLog(away.log_beta  + lr * gBetaA  - reg * (away.log_beta  - away.log_beta_prior));

  db.prepare("UPDATE teams SET log_alpha = ?, log_beta = ?, updated_at = datetime('now') WHERE id = ?")
    .run([newLogAlphaH, newLogBetaH, homeTeamId]);
  db.prepare("UPDATE teams SET log_alpha = ?, log_beta = ?, updated_at = datetime('now') WHERE id = ?")
    .run([newLogAlphaA, newLogBetaA, awayTeamId]);

  return { newEloHome, newEloAway, change: newEloHome - home.elo };
}

// Used by unit tests as a simpler sanity-check alternative to dcScoreMatrix.
// Legacy export: arithmetic-blend version of poissonMatchProbs used by
// the unit tests. The PRODUCTION engine uses dcScoreMatrix → probsFromMatrix
// instead. This function is preserved for the test surface only.
function poissonMatchProbs(lambdaHome, lambdaAway) {
  const MAX = 8;
  let winHome = 0, draw = 0, winAway = 0;
  const scoreMatrix = {};
  for (let h = 0; h <= MAX; h++) {
    for (let a = 0; a <= MAX; a++) {
      const p = poissonPMF(h, lambdaHome) * poissonPMF(a, lambdaAway);
      if (h > a) winHome += p;
      else if (h === a) draw += p;
      else winAway += p;
      scoreMatrix[`${h}-${a}`] = p;
    }
  }
  const mostLikely = Object.entries(scoreMatrix).sort((a, b) => b[1] - a[1])[0][0];
  return { winHome, draw, winAway, scoreMatrix, mostLikely };
}

// Legacy export kept for the test file — produces the ELO-only sigmoid
// W/D/L vector. Still useful as a sanity-check helper.
function eloToMatchProbs(eloHome, eloAway) {
  const eloAdv = eloHome - eloAway;
  const rawWin = 1 / (1 + Math.exp(-eloAdv / 200));
  const drawProb = 0.28 * Math.exp(-Math.pow(eloAdv / 350, 2));
  let winHome = rawWin * (1 - drawProb);
  let winAway = (1 - rawWin) * (1 - drawProb);
  const total = winHome + drawProb + winAway;
  return { winHome: winHome / total, draw: drawProb / total, winAway: winAway / total };
}

module.exports = {
  predict,
  updateAfterMatch,
  // Helpers exposed for tests / diagnostics
  poissonPMF,
  poissonMatchProbs,
  eloToMatchProbs,
  dcScoreMatrix,
  probsFromMatrix,
  logPool,
  ensureRatings,
  fifaPriorFromPoints,
  reweightMatrixToOutcomeProbs,
  pickTopScoresForPoints,
  expectedPointsFromMatrix,
  pointsForResult,
  outcomeOf,
  formGoalNudge,
  intelGoalNudge,
  wcGoalScaleFor,
  BACKBONE,
};
