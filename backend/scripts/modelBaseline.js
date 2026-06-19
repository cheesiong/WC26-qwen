/**
 * Baseline model — faithful reduction of the current predictionEngine.js
 * backbone for backtest purposes.
 *
 * Includes the structural factors that work on purely historical data:
 *   • ELO rating (28% weight)         — eloToMatchProbs
 *   • Poisson goal model (22% weight) — eloRatio-mixed lambdas
 *   • Recent form (18% weight)        — last-10 weighted win rate
 *
 * Excludes:
 *   • H2H factor — predicting backtest matches from the H2H dataset itself
 *     would be circular
 *   • Web intel, lineup, WC experience, host nation, rest days — these
 *     either require external scraping (unavailable for historical matches)
 *     or are situational adjustments that wouldn't move backbone accuracy
 *
 * Weight re-normalisation: 0.28 + 0.22 + 0.18 = 0.68 → renormalise so the
 * three factors sum to 1.0, matching how the engine handles missing factors.
 */

const { TEAMS, TEAM_STATS } = require('../data/teams');

const K_FACTOR = 40;
const HOME_ELO_BUMP = 100; // ELO equivalent of home advantage when not neutral
const GLOBAL_AVG_GOALS = 2.7;

// Weights from current engine (re-normalised for the 3 backtestable factors)
const W_ELO_RAW = 0.28;
const W_POISSON_RAW = 0.22;
const W_FORM_RAW = 0.18;
const W_SUM = W_ELO_RAW + W_POISSON_RAW + W_FORM_RAW;
const W_ELO = W_ELO_RAW / W_SUM;
const W_POISSON = W_POISSON_RAW / W_SUM;
const W_FORM = W_FORM_RAW / W_SUM;

function poissonPMF(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 1; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

function poissonMatchProbs(lambdaHome, lambdaAway) {
  const MAX = 8;
  let winHome = 0, draw = 0, winAway = 0;
  const matrix = {};
  for (let h = 0; h <= MAX; h++) {
    for (let a = 0; a <= MAX; a++) {
      const p = poissonPMF(h, lambdaHome) * poissonPMF(a, lambdaAway);
      matrix[`${h}-${a}`] = p;
      if (h > a) winHome += p;
      else if (h === a) draw += p;
      else winAway += p;
    }
  }
  return { winHome, draw, winAway, matrix };
}

function outcomeOf(s) {
  const [h, a] = s.split('-').map(Number);
  return h > a ? 'HOME' : h === a ? 'DRAW' : 'AWAY';
}

function reweightMatrix(matrix, raw, target) {
  const scale = {
    HOME: target.winHome / Math.max(raw.winHome, 1e-9),
    DRAW: target.draw    / Math.max(raw.draw,    1e-9),
    AWAY: target.winAway / Math.max(raw.winAway, 1e-9),
  };
  const out = {};
  let total = 0;
  for (const [s, p] of Object.entries(matrix)) {
    const v = p * scale[outcomeOf(s)];
    out[s] = v;
    total += v;
  }
  if (total > 0) for (const k of Object.keys(out)) out[k] /= total;
  return out;
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
  return [s1, rest[0].s, rest[1].s];
}

function eloToMatchProbs(eloHome, eloAway) {
  const eloAdv = eloHome - eloAway;
  const rawWin = 1 / (1 + Math.exp(-eloAdv / 200));
  const drawProb = 0.28 * Math.exp(-Math.pow(eloAdv / 350, 2));
  let winHome = rawWin * (1 - drawProb);
  let winAway = (1 - rawWin) * (1 - drawProb);
  const total = winHome + drawProb + winAway;
  return { winHome: winHome / total, draw: drawProb / total, winAway: winAway / total };
}

function formToProbs(formA, formB) {
  const diff = formA - formB;
  const winBoost = 0.5 + diff * 0.35;
  const drawProb = 0.25 * (1 - Math.abs(diff) * 0.4);
  const lossProb = 1 - winBoost - drawProb;
  return {
    winHome: Math.max(0.05, winBoost),
    draw: Math.max(0.05, drawProb),
    winAway: Math.max(0.05, lossProb),
  };
}

function computeFormScore(recent) {
  if (!recent || recent.length === 0) return 0.5;
  const n = recent.length;
  let pts = 0, wt = 0;
  recent.slice(0, 10).forEach((r, i) => {
    const w = 1 - (i / n) * 0.7;
    const p = r === 'W' ? 3 : r === 'D' ? 1 : 0;
    pts += p * w;
    wt += 3 * w;
  });
  return wt > 0 ? pts / wt : 0.5;
}

function blend(probsList, weights) {
  let h = 0, d = 0, a = 0, w = 0;
  for (let i = 0; i < probsList.length; i++) {
    h += probsList[i].winHome * weights[i];
    d += probsList[i].draw * weights[i];
    a += probsList[i].winAway * weights[i];
    w += weights[i];
  }
  const tot = (h + d + a) / w;
  return { winHome: h / w / tot, draw: d / w / tot, winAway: a / w / tot };
}

function createBaselineModel() {
  const ratings = {};      // teamId → ELO
  const avgScored = {};    // teamId → static avg goals scored
  const avgConceded = {};  // teamId → static avg goals conceded
  const recentForm = {};   // teamId → ['W','D','L', ...] most-recent first

  function init(teamIds) {
    const fifaPointsById = Object.fromEntries(TEAMS.map(t => [t.id, t.fifaPoints]));
    for (const id of teamIds) {
      ratings[id] = fifaPointsById[id] || 1500;
      avgScored[id] = TEAM_STATS[id]?.avgScored ?? 1.4;
      avgConceded[id] = TEAM_STATS[id]?.avgConceded ?? 1.4;
      recentForm[id] = [];
    }
  }

  function predict(homeId, awayId, isNeutral) {
    const eloHome = ratings[homeId] + (isNeutral ? 0 : HOME_ELO_BUMP);
    const eloAway = ratings[awayId];

    // 1. ELO
    const eloProbs = eloToMatchProbs(eloHome, eloAway);

    // 2. Poisson (Dixon-Coles-ish with eloRatio mixed in — matches current engine)
    const perTeamAvg = GLOBAL_AVG_GOALS / 2;
    const eloRatio = eloHome / eloAway;
    const aS_home = avgScored[homeId] ?? 1.4;
    const aS_away = avgScored[awayId] ?? 1.4;
    const aC_home = avgConceded[homeId] ?? 1.4;
    const aC_away = avgConceded[awayId] ?? 1.4;
    let lambdaHome = aS_home * (aC_away / perTeamAvg) * Math.pow(eloRatio, 0.8);
    let lambdaAway = aS_away * (aC_home / perTeamAvg) * Math.pow(1 / eloRatio, 0.8);
    lambdaHome = Math.max(0.85, Math.min(4.5, lambdaHome));
    lambdaAway = Math.max(0.85, Math.min(4.5, lambdaAway));
    const poissonProbs = poissonMatchProbs(lambdaHome, lambdaAway);
    const poissonV = { winHome: poissonProbs.winHome, draw: poissonProbs.draw, winAway: poissonProbs.winAway };

    // 3. Form
    const fH = computeFormScore(recentForm[homeId] || []);
    const fA = computeFormScore(recentForm[awayId] || []);
    const formProbs = formToProbs(fH, fA);

    const final = blend(
      [eloProbs, poissonV, formProbs],
      [W_ELO, W_POISSON, W_FORM]
    );

    const blendedMatrix = reweightMatrix(poissonProbs.matrix, poissonV, final);
    const topScores = pickTopScoresForPoints(blendedMatrix);

    return {
      pHome: final.winHome, pDraw: final.draw, pAway: final.winAway,
      mostLikely: topScores[0],
      topScores,
      matrix: blendedMatrix,
    };
  }

  function update(homeId, awayId, homeScore, awayScore /*, isNeutral */) {
    // ELO update (mirrors updateEloAfterMatch in predictionEngine.js)
    const home = ratings[homeId];
    const away = ratings[awayId];
    const expHome = 1 / (1 + Math.pow(10, (away - home) / 400));
    const expAway = 1 - expHome;
    const actualHome = homeScore > awayScore ? 1 : homeScore === awayScore ? 0.5 : 0;
    const actualAway = 1 - actualHome;
    const gd = Math.abs(homeScore - awayScore);
    const gdMult = gd <= 1 ? 1 : gd === 2 ? 1.5 : 1.75 + (gd - 3) * 0.1;
    ratings[homeId] = home + K_FACTOR * gdMult * (actualHome - expHome);
    ratings[awayId] = away + K_FACTOR * gdMult * (actualAway - expAway);

    // Form tracking — push most-recent to front, keep last 10
    const resultHome = homeScore > awayScore ? 'W' : homeScore === awayScore ? 'D' : 'L';
    const resultAway = awayScore > homeScore ? 'W' : awayScore === homeScore ? 'D' : 'L';
    recentForm[homeId] = [resultHome, ...(recentForm[homeId] || [])].slice(0, 10);
    recentForm[awayId] = [resultAway, ...(recentForm[awayId] || [])].slice(0, 10);
  }

  return { init, predict, update, _state: { ratings, recentForm } };
}

module.exports = { createBaselineModel };
