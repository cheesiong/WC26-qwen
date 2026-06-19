/**
 * V2 model — Dixon-Coles bivariate Poisson with online attack/defense updates.
 *
 * Each team has two log-space parameters:
 *   logAlpha — attack strength (exp form ≈ goals scored per match vs avg defence)
 *   logBeta  — defence weakness (exp form ≈ goals conceded per match vs avg attack)
 *
 * Lambdas:
 *   λ_home = exp(logAlpha[home] + logBeta[away] + homeAdv)
 *   λ_away = exp(logAlpha[away] + logBeta[home])
 *
 * Scoreline matrix uses Dixon-Coles τ correction for low-score cells
 * (well-known fix for the independence-of-goals assumption that causes
 * over-prediction of 1-1 and under-prediction of 0-0/1-0/0-1).
 *
 * W/D/L AND most-likely scoreline come from the same matrix — internally
 * consistent.
 *
 * Updates: log-space Poisson MLE gradient with Gaussian regularisation
 * toward a per-team prior derived from FIFA TEAM_STATS at init.
 */

const { TEAMS, TEAM_STATS } = require('../data/teams');

// Inlined to keep the backtest entrypoint dependency-free
// (predictionEngine pulls DB, Qwen client, network services at module
// load). Identical math to predictionEngine.pickTopScoresForPoints.
function outcomeOf(s) {
  const [h, a] = s.split('-').map(Number);
  return h > a ? 'HOME' : h === a ? 'DRAW' : 'AWAY';
}
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
  return { mostLikely: s1, top: [
    { score: s1, prob: matrix[s1] },
    { score: rest[0].s, prob: matrix[rest[0].s] },
    { score: rest[1].s, prob: matrix[rest[1].s] },
  ]};
}

const DEFAULTS = {
  LEARNING_RATE: 0.02,
  REG_STRENGTH: 0.005,
  HOME_ADV_LOG: Math.log(1.30),
  DC_RHO: -0.13,
  MAX_GOALS: 8,
  CLIP_LOG_MIN: Math.log(0.35),
  CLIP_LOG_MAX: Math.log(3.2),
  CLIP_GRAD: 2.0,
  // Tournament weight on update gradient — friendlies are low-effort and
  // experimental, so they should move ratings less than competitive matches.
  COMP_WEIGHT_DEFAULT: 1.0,
};

// Tournament → update-weight multiplier (mirrors h2hService.competitionWeight
// but tuned for rating updates: friendlies still count, just less).
function compWeight(tournament) {
  const t = (tournament || '').toLowerCase();
  if (t.includes('fifa world cup') && !t.includes('qualif')) return 1.5;
  if (t.includes('uefa euro') && !t.includes('qualif')) return 1.4;
  if (t.includes('copa america') || t.includes('africa cup') ||
      t.includes('asian cup') || t.includes('gold cup')) return 1.3;
  if (t.includes('world cup qualif') || t.includes('wc qualif')) return 1.2;
  if (t.includes('qualif') || t.includes('qualifier')) return 1.1;
  if (t.includes('nations league') || t.includes('confederations')) return 1.05;
  if (t.includes('friendly')) return 0.4;
  return 1.0;
}

// Derive a goals-per-match expectation from FIFA points.
// Empirically: top-rated teams average ~1.8-2.1 gs and ~0.7-0.9 ga;
// bottom-rated teams average ~0.9-1.2 gs and ~1.5-1.8 ga.
// Map FIFA points (range ~1100-1900) to (alpha, beta) using a sigmoid.
function fifaPriorFromPoints(fifaPoints) {
  if (!fifaPoints) return { alpha: 1.4, beta: 1.4 };
  // Center around 1500 (~world average), spread by 250 points
  const z = (fifaPoints - 1500) / 250;
  const sig = 1 / (1 + Math.exp(-z)); // 0..1
  // sig = 0 (weak team) → alpha 0.95, beta 1.85
  // sig = 0.5 (average)   → alpha 1.40, beta 1.40
  // sig = 1 (strong team) → alpha 1.95, beta 0.90
  const alpha = 0.95 + sig * 1.0;
  const beta = 1.85 - sig * 0.95;
  return { alpha, beta };
}

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

function scoreMatrix(lH, lA, rho, maxGoals) {
  const cells = {};
  let total = 0;
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = poissonPMF(h, lH) * poissonPMF(a, lA) * dcTau(h, a, lH, lA, rho);
      const v = Math.max(0, p);
      cells[`${h}-${a}`] = v;
      total += v;
    }
  }
  if (total > 0) {
    for (const k of Object.keys(cells)) cells[k] /= total;
  }
  return cells;
}

function createV2Model(opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const logAlpha = {};
  const logBeta = {};
  const logAlphaPrior = {};
  const logBetaPrior = {};

  function init(teamIds) {
    const fifaById = Object.fromEntries(TEAMS.map(t => [t.id, t.fifaPoints]));
    for (const id of teamIds) {
      const fifaPrior = fifaPriorFromPoints(fifaById[id]);
      const stats = TEAM_STATS[id];
      // Blend FIFA-derived prior with hand-typed avg_scored/conceded
      // (50/50). Either alone is noisy; together they're more robust.
      const alpha = stats ? 0.5 * fifaPrior.alpha + 0.5 * stats.avgScored : fifaPrior.alpha;
      const beta = stats ? 0.5 * fifaPrior.beta + 0.5 * stats.avgConceded : fifaPrior.beta;
      logAlpha[id] = Math.log(Math.max(0.5, alpha));
      logBeta[id] = Math.log(Math.max(0.5, beta));
      logAlphaPrior[id] = logAlpha[id];
      logBetaPrior[id] = logBeta[id];
    }
  }

  function lambdas(home, away, isNeutral) {
    const ha = isNeutral ? 0 : cfg.HOME_ADV_LOG;
    const lH = Math.exp((logAlpha[home] ?? 0) + (logBeta[away] ?? 0) + ha);
    const lA = Math.exp((logAlpha[away] ?? 0) + (logBeta[home] ?? 0));
    return {
      lH: Math.max(0.15, Math.min(5.5, lH)),
      lA: Math.max(0.15, Math.min(5.5, lA)),
    };
  }

  function predict(homeId, awayId, isNeutral) {
    const { lH, lA } = lambdas(homeId, awayId, isNeutral);
    const matrix = scoreMatrix(lH, lA, cfg.DC_RHO, cfg.MAX_GOALS);
    let pH = 0, pD = 0, pA = 0;
    for (const [s, p] of Object.entries(matrix)) {
      const [h, a] = s.split('-').map(Number);
      if (h > a) pH += p;
      else if (h === a) pD += p;
      else pA += p;
    }
    const { mostLikely, top } = pickTopScoresForPoints(matrix);
    return {
      pHome: pH, pDraw: pD, pAway: pA,
      mostLikely,
      topScores: top.map(t => t.score),
      matrix,
      lambdaHome: lH, lambdaAway: lA,
    };
  }

  function clipGrad(g) {
    return Math.max(-cfg.CLIP_GRAD, Math.min(cfg.CLIP_GRAD, g));
  }

  function clipLog(v) {
    return Math.max(cfg.CLIP_LOG_MIN, Math.min(cfg.CLIP_LOG_MAX, v));
  }

  function ensureInit(id) {
    if (logAlpha[id] !== undefined) return;
    const fifaPoints = TEAMS.find(t => t.id === id)?.fifaPoints;
    const fifaPrior = fifaPriorFromPoints(fifaPoints);
    const stats = TEAM_STATS[id];
    const alpha = stats ? 0.5 * fifaPrior.alpha + 0.5 * stats.avgScored : fifaPrior.alpha;
    const beta = stats ? 0.5 * fifaPrior.beta + 0.5 * stats.avgConceded : fifaPrior.beta;
    logAlpha[id] = Math.log(Math.max(0.5, alpha));
    logBeta[id] = Math.log(Math.max(0.5, beta));
    logAlphaPrior[id] = logAlpha[id];
    logBetaPrior[id] = logBeta[id];
  }

  function update(homeId, awayId, homeScore, awayScore, isNeutral, tournament) {
    ensureInit(homeId);
    ensureInit(awayId);

    const { lH, lA } = lambdas(homeId, awayId, isNeutral);
    const w = tournament ? compWeight(tournament) : cfg.COMP_WEIGHT_DEFAULT;
    const lr = cfg.LEARNING_RATE * w;

    // Poisson log-lik gradient on log-parameters: ∂ℓ/∂log_α_home = y_home - λ_home
    const gAlphaH = clipGrad(homeScore - lH);
    const gAlphaA = clipGrad(awayScore - lA);
    const gBetaH  = clipGrad(awayScore - lA);  // home's defence affects how much away scores
    const gBetaA  = clipGrad(homeScore - lH);  // away's defence affects how much home scores

    logAlpha[homeId] = clipLog(logAlpha[homeId] + lr * gAlphaH
                                                 - cfg.REG_STRENGTH * (logAlpha[homeId] - logAlphaPrior[homeId]));
    logAlpha[awayId] = clipLog(logAlpha[awayId] + lr * gAlphaA
                                                 - cfg.REG_STRENGTH * (logAlpha[awayId] - logAlphaPrior[awayId]));
    logBeta[homeId]  = clipLog(logBeta[homeId]  + lr * gBetaH
                                                 - cfg.REG_STRENGTH * (logBeta[homeId]  - logBetaPrior[homeId]));
    logBeta[awayId]  = clipLog(logBeta[awayId]  + lr * gBetaA
                                                 - cfg.REG_STRENGTH * (logBeta[awayId]  - logBetaPrior[awayId]));
  }

  return {
    init,
    predict,
    update,
    config: cfg,
    _state: { logAlpha, logBeta },
  };
}

module.exports = { createV2Model, scoreMatrix, dcTau, poissonPMF };
