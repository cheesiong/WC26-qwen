const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  poissonMatchProbs,
  eloToMatchProbs,
  dcScoreMatrix,
  probsFromMatrix,
  logPool,
  fifaPriorFromPoints,
  pickTopScoresForPoints,
  expectedPointsFromMatrix,
  pointsForResult,
  reweightMatrixToOutcomeProbs,
  outcomeOf,
  formGoalNudge,
  intelGoalNudge,
  wcGoalScaleFor,
  BACKBONE,
} = require('./predictionEngine');

describe('poissonMatchProbs (legacy, used as sanity helper)', () => {
  it('probabilities sum to ~1', () => {
    const { winHome, draw, winAway } = poissonMatchProbs(1.5, 1.2);
    assert.ok(Math.abs(winHome + draw + winAway - 1) < 0.01);
  });

  it('equal lambdas give roughly symmetric win probs', () => {
    const { winHome, winAway } = poissonMatchProbs(1.3, 1.3);
    assert.ok(Math.abs(winHome - winAway) < 0.02);
  });

  it('higher home lambda gives higher home win probability', () => {
    const { winHome } = poissonMatchProbs(2.5, 0.8);
    const { winAway } = poissonMatchProbs(0.8, 2.5);
    assert.ok(winHome > 0.7);
    assert.ok(winAway > 0.7);
  });

  it('returns mostLikely scoreline', () => {
    const { mostLikely } = poissonMatchProbs(1.5, 1.2);
    assert.match(mostLikely, /^\d+-\d+$/);
  });
});

describe('eloToMatchProbs (legacy sanity helper)', () => {
  it('probabilities sum to 1', () => {
    const { winHome, draw, winAway } = eloToMatchProbs(1800, 1800);
    assert.ok(Math.abs(winHome + draw + winAway - 1) < 0.001);
  });

  it('higher home ELO gives higher home win prob', () => {
    const { winHome: high } = eloToMatchProbs(2000, 1500);
    const { winHome: low } = eloToMatchProbs(1500, 2000);
    assert.ok(high > low);
    assert.ok(high > 0.6);
  });

  it('draw probability peaks near equal ELOs', () => {
    const { draw: equalDraw } = eloToMatchProbs(1800, 1800);
    const { draw: unequalDraw } = eloToMatchProbs(2100, 1400);
    assert.ok(equalDraw > unequalDraw);
  });
});

describe('dcScoreMatrix (v2 backbone)', () => {
  it('cells sum to 1 after Dixon-Coles normalisation', () => {
    const m = dcScoreMatrix(1.5, 1.2);
    const total = Object.values(m).reduce((s, v) => s + v, 0);
    assert.ok(Math.abs(total - 1) < 1e-9);
  });

  it('DC correction shifts low-score cell probabilities vs independent Poisson', () => {
    const indep = dcScoreMatrix(1.4, 1.4, 0);   // ρ=0 → no correction
    const dc    = dcScoreMatrix(1.4, 1.4, -0.13);
    // With ρ<0 in our convention: τ(0,0) and τ(1,1) > 1 (boost), τ(0,1) and τ(1,0) < 1 (reduce).
    // After renormalisation these shifts must remain visible.
    assert.ok(dc['0-0'] > indep['0-0'], 'DC should up-weight 0-0');
    assert.ok(dc['0-1'] < indep['0-1'], 'DC should down-weight 0-1');
    assert.ok(dc['1-0'] < indep['1-0'], 'DC should down-weight 1-0');
  });

  it('W/D/L derived from matrix matches the cell sums', () => {
    const m = dcScoreMatrix(2.0, 1.0);
    const { winHome, draw, winAway } = probsFromMatrix(m);
    assert.ok(Math.abs(winHome + draw + winAway - 1) < 1e-9);
    assert.ok(winHome > winAway, 'higher home lambda → home favoured');
  });
});

describe('logPool (v2 blending)', () => {
  it('preserves a unanimous confident vector', () => {
    const sig = [
      { probs: { winHome: 0.7, draw: 0.2, winAway: 0.1 }, weight: 1.0 },
      { probs: { winHome: 0.7, draw: 0.2, winAway: 0.1 }, weight: 0.3 },
    ];
    const out = logPool(sig);
    assert.ok(out.winHome > 0.65, 'should stay confident under agreement');
  });

  it('does NOT collapse to uniform when one signal is uniform (arithmetic-mean failure mode)', () => {
    const sig = [
      { probs: { winHome: 0.70, draw: 0.20, winAway: 0.10 }, weight: 1.0 },
      { probs: { winHome: 1/3,  draw: 1/3,  winAway: 1/3  }, weight: 0.3 },
    ];
    const out = logPool(sig);
    assert.ok(out.winHome > 0.55, `uniform side-signal should barely dent confidence (got ${out.winHome.toFixed(3)})`);
  });

  it('output sums to 1', () => {
    const out = logPool([
      { probs: { winHome: 0.4, draw: 0.3, winAway: 0.3 }, weight: 1.0 },
      { probs: { winHome: 0.5, draw: 0.2, winAway: 0.3 }, weight: 0.4 },
    ]);
    assert.ok(Math.abs(out.winHome + out.draw + out.winAway - 1) < 1e-9);
  });

  it('returns uniform if all weights are zero', () => {
    const out = logPool([{ probs: { winHome: 0.7, draw: 0.2, winAway: 0.1 }, weight: 0 }]);
    assert.ok(Math.abs(out.winHome - 1/3) < 1e-6);
  });
});

describe('pickTopScoresForPoints (expected-points-optimal picker)', () => {
  // Helper: minimal hand-built matrix
  function buildMatrix(cells) {
    const m = {};
    let total = 0;
    for (const [s, p] of Object.entries(cells)) { m[s] = p; total += p; }
    for (const k of Object.keys(m)) m[k] /= total;
    return m;
  }

  function pickNaive(matrix) {
    const top = Object.entries(matrix).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return [top[0][0], top[1][0], top[2][0]];
  }

  it('picks S1 from the highest-outcome-class scoreline', () => {
    // 50/30/20 home-favoured: most likely home-win scoreline is 2-1
    const m = buildMatrix({
      '2-1': 0.10, '1-0': 0.09, '2-0': 0.085, '3-1': 0.05, // H = 0.325
      '1-1': 0.08, '0-0': 0.06, '2-2': 0.04,               // D = 0.18
      '1-2': 0.05, '0-1': 0.04, '0-2': 0.03,               // A = 0.12
    });
    const { mostLikely } = pickTopScoresForPoints(m);
    assert.equal(outcomeOf(mostLikely), 'HOME');
  });

  it('hedges S2/S3 toward different outcomes when within-class probs are close', () => {
    // Home favoured but draw cells are concentrated → cross-outcome picks
    // should beat same-outcome ones for S2/S3.
    const m = buildMatrix({
      '2-1': 0.10, '1-0': 0.09, '2-0': 0.085, '3-1': 0.05,
      '1-1': 0.08, '0-0': 0.06, '2-2': 0.04,
      '1-2': 0.05, '0-1': 0.04, '0-2': 0.03,
    });
    const { top } = pickTopScoresForPoints(m);
    const picks = top.map(t => t.score);
    assert.equal(picks[0], '2-1');
    // S2 or S3 should include at least one non-home scoreline
    const nonHomeInS2S3 = picks.slice(1).some(s => outcomeOf(s) !== 'HOME');
    assert.ok(nonHomeInS2S3, `expected hedge across outcomes, got ${picks.join(', ')}`);
  });

  it('beats the naive top-3-by-probability picker in expected points', () => {
    const m = buildMatrix({
      '2-1': 0.10, '1-0': 0.09, '2-0': 0.085, '3-1': 0.05,
      '1-1': 0.08, '0-0': 0.06, '2-2': 0.04,
      '1-2': 0.05, '0-1': 0.04, '0-2': 0.03,
    });
    const optimalPicks = pickTopScoresForPoints(m).top.map(t => t.score);
    const naivePicks = pickNaive(m);
    const eOpt = expectedPointsFromMatrix(m, optimalPicks);
    const eNaive = expectedPointsFromMatrix(m, naivePicks);
    assert.ok(eOpt > eNaive, `optimal (${eOpt.toFixed(4)}) should beat naive (${eNaive.toFixed(4)})`);
  });

  it('matches naive picker when the favourite is overwhelming', () => {
    // 80% home win, concentrated within home-win cells
    const m = buildMatrix({
      '2-1': 0.18, '1-0': 0.15, '2-0': 0.12, '3-1': 0.08, '3-0': 0.07,
      '1-1': 0.06, '0-0': 0.03,
      '1-2': 0.02, '0-1': 0.02,
    });
    const optimalPicks = pickTopScoresForPoints(m).top.map(t => t.score);
    const eOpt = expectedPointsFromMatrix(m, optimalPicks);
    const eNaive = expectedPointsFromMatrix(m, pickNaive(m));
    assert.ok(eOpt >= eNaive - 1e-9, 'optimal should never be worse than naive');
  });

  it('returns three distinct scorelines', () => {
    const m = buildMatrix({
      '1-1': 0.20, '0-0': 0.15, '2-1': 0.12, '1-0': 0.10,
      '1-2': 0.10, '0-1': 0.08, '2-2': 0.07, '2-0': 0.05,
    });
    const picks = pickTopScoresForPoints(m).top.map(t => t.score);
    assert.equal(new Set(picks).size, 3);
  });
});

describe('pointsForResult', () => {
  it('awards 3 for exact match to S1', () => {
    assert.equal(pointsForResult('2-1', ['2-1', '1-1', '0-0']), 3);
  });
  it('awards 2 for exact match to S2 or S3', () => {
    assert.equal(pointsForResult('1-1', ['2-1', '1-1', '0-0']), 2);
    assert.equal(pointsForResult('0-0', ['2-1', '1-1', '0-0']), 2);
  });
  it('awards 1 for correct outcome via S1, no exact match', () => {
    assert.equal(pointsForResult('3-2', ['2-1', '1-1', '0-0']), 1);
  });
  it('awards 0 for wrong outcome', () => {
    assert.equal(pointsForResult('1-3', ['2-1', '1-1', '0-0']), 0);
  });
});

describe('reweightMatrixToOutcomeProbs', () => {
  it('makes outcome-class totals match the target W/D/L', () => {
    const m = dcScoreMatrix(1.5, 1.2);
    const backbone = probsFromMatrix(m);
    const target = { winHome: 0.50, draw: 0.30, winAway: 0.20 };
    const r = reweightMatrixToOutcomeProbs(m, backbone, target);
    const got = probsFromMatrix(r);
    assert.ok(Math.abs(got.winHome - target.winHome) < 1e-9);
    assert.ok(Math.abs(got.draw    - target.draw)    < 1e-9);
    assert.ok(Math.abs(got.winAway - target.winAway) < 1e-9);
  });

  it('preserves cell ordering within an outcome class', () => {
    const m = dcScoreMatrix(2.0, 1.0);
    const backbone = probsFromMatrix(m);
    const r = reweightMatrixToOutcomeProbs(m, backbone, { winHome: 0.4, draw: 0.4, winAway: 0.2 });
    // Within home-win cells: 2-1 was a top cell in original; should remain the top home cell
    const homeCellsOrig = Object.entries(m).filter(([s]) => outcomeOf(s) === 'HOME').sort((a, b) => b[1] - a[1]);
    const homeCellsNew  = Object.entries(r).filter(([s]) => outcomeOf(s) === 'HOME').sort((a, b) => b[1] - a[1]);
    assert.equal(homeCellsOrig[0][0], homeCellsNew[0][0]);
  });
});

describe('formGoalNudge', () => {
  it('returns zero scale when both teams have neutral form', () => {
    const n = formGoalNudge(0.5, 0.5);
    assert.ok(Math.abs(n.logScaleHome) < 1e-9);
    assert.ok(Math.abs(n.logScaleAway) < 1e-9);
  });

  it('boosts home λ when home in good form and away in poor form', () => {
    const n = formGoalNudge(0.8, 0.3);
    assert.ok(n.logScaleHome > 0, 'home λ should rise');
    assert.ok(n.logScaleAway < 0, 'away λ should drop');
  });

  it('swapping inputs swaps outputs (team symmetry)', () => {
    const n1 = formGoalNudge(0.7, 0.4);
    const n2 = formGoalNudge(0.4, 0.7);
    assert.ok(Math.abs(n1.logScaleHome - n2.logScaleAway) < 1e-9);
    assert.ok(Math.abs(n1.logScaleAway - n2.logScaleHome) < 1e-9);
  });

  it('keeps the nudge conservative (≤25% λ swing at extreme form gap)', () => {
    const n = formGoalNudge(1.0, 0.0);
    const multHome = Math.exp(n.logScaleHome);
    assert.ok(multHome < 1.25, `home multiplier too large: ${multHome.toFixed(3)}`);
    assert.ok(multHome > 1.10, `home multiplier too small: ${multHome.toFixed(3)}`);
  });
});

describe('intelGoalNudge', () => {
  it('returns zero scale for null intel', () => {
    const n = intelGoalNudge(null);
    assert.equal(n.logScaleHome, 0);
    assert.equal(n.logScaleAway, 0);
  });

  it('reduces home λ when home has injuries', () => {
    const n = intelGoalNudge({ homeInjuries: ['Star Striker', 'Key Midfielder'], awayInjuries: [] });
    assert.ok(n.logScaleHome < 0);
    assert.ok(n.logScaleAway > 0, 'away gets small lift from facing weakened defence');
  });

  it('caps injury impact at 3 missing players', () => {
    const n3 = intelGoalNudge({ homeInjuries: ['a', 'b', 'c'], awayInjuries: [] });
    const n5 = intelGoalNudge({ homeInjuries: ['a', 'b', 'c', 'd', 'e'], awayInjuries: [] });
    assert.equal(n3.logScaleHome, n5.logScaleHome, 'should cap');
  });

  it('rotation and motivation flags compose with injuries', () => {
    const n = intelGoalNudge({ homeInjuries: [], awayInjuries: [], homeRotating: true, awayMotivation: 'high' });
    assert.ok(n.logScaleHome < 0);
    assert.ok(n.logScaleAway > 0);
  });
});

describe('wcGoalScaleFor', () => {
  it('returns the group scale for GROUP stage', () => {
    assert.equal(wcGoalScaleFor('GROUP'), BACKBONE.WC_GOAL_SCALE_GROUP);
  });

  it('returns the knockout scale for every knockout stage', () => {
    for (const s of ['R32', 'R16', 'QF', 'SF', 'F', 'THIRD_PLACE']) {
      assert.equal(wcGoalScaleFor(s), BACKBONE.WC_GOAL_SCALE_KO);
    }
  });

  it('knockout scale is meaningfully lower than group scale', () => {
    assert.ok(BACKBONE.WC_GOAL_SCALE_KO < BACKBONE.WC_GOAL_SCALE_GROUP);
    assert.ok(BACKBONE.WC_GOAL_SCALE_KO / BACKBONE.WC_GOAL_SCALE_GROUP < 0.95,
      'expected ≥5% reduction for knockout');
  });

  it('defaults to knockout scale for unknown stages (safer for cagey games)', () => {
    assert.equal(wcGoalScaleFor(null), BACKBONE.WC_GOAL_SCALE_KO);
    assert.equal(wcGoalScaleFor('UNKNOWN'), BACKBONE.WC_GOAL_SCALE_KO);
  });
});

describe('fifaPriorFromPoints', () => {
  it('higher FIFA points → stronger attack, weaker defence', () => {
    const top = fifaPriorFromPoints(1900);
    const bot = fifaPriorFromPoints(1200);
    assert.ok(top.alpha > bot.alpha, 'stronger team scores more');
    assert.ok(top.beta < bot.beta, 'stronger team concedes less');
  });

  it('average team gets a sensible total-goal envelope', () => {
    const avg = fifaPriorFromPoints(1500);
    // α + β should sit around the global 2-team scoring envelope (~2.7-3.0).
    assert.ok(avg.alpha + avg.beta > 2.5 && avg.alpha + avg.beta < 3.2,
      `unexpected envelope α+β=${(avg.alpha + avg.beta).toFixed(2)}`);
    assert.ok(Math.abs(avg.alpha - avg.beta) < 0.15, 'roughly balanced for average teams');
  });
});
