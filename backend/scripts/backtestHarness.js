/**
 * Walk-forward backtest harness.
 *
 * Takes a model with the interface:
 *   model.init(teamIds)
 *   model.predict(home, away, isNeutral) → { pHome, pDraw, pAway }
 *   model.update(home, away, homeScore, awayScore, isNeutral)
 *
 * For each historical match (in chronological order) we:
 *   1. Predict using current state
 *   2. Score the prediction (Brier, log-loss, accuracy)
 *   3. Update the model with the actual result
 *
 * To avoid scoring the first matches before ratings have stabilised, we
 * run `warmupMatches` updates without scoring before metric accumulation
 * begins.
 */

function gradeOutcome(homeScore, awayScore) {
  if (homeScore > awayScore) return 'H';
  if (homeScore < awayScore) return 'A';
  return 'D';
}

function brierScore(probs, outcome) {
  const y = { H: [1, 0, 0], D: [0, 1, 0], A: [0, 0, 1] }[outcome];
  return (probs.pHome - y[0]) ** 2 + (probs.pDraw - y[1]) ** 2 + (probs.pAway - y[2]) ** 2;
}

function predictedLabel(probs) {
  let best = 'H';
  let bestP = probs.pHome;
  if (probs.pDraw > bestP) { best = 'D'; bestP = probs.pDraw; }
  if (probs.pAway > bestP) { best = 'A'; }
  return best;
}

function outcomeFromScore(s) {
  const [h, a] = s.split('-').map(Number);
  return h > a ? 'H' : h === a ? 'D' : 'A';
}

// Scoring rule: 3 if exact = S1, 2 if exact ∈ {S2,S3}, 1 if O(S1)=actual outcome, else 0.
function pointsForResult(actualScore, picks, actualOutcome) {
  if (!picks || picks.length < 1) return 0;
  if (actualScore === picks[0]) return 3;
  if (actualScore === picks[1] || actualScore === picks[2]) return 2;
  if (outcomeFromScore(picks[0]) === actualOutcome) return 1;
  return 0;
}

// E[points] under the model's own matrix, given its top-3 picks.
function expectedPoints(matrix, picks) {
  if (!matrix || !picks || picks.length < 3) return 0;
  const totals = { H: 0, D: 0, A: 0 };
  for (const [s, p] of Object.entries(matrix)) totals[outcomeFromScore(s)] += p;
  const m = (s) => matrix[s] || 0;
  const o1 = outcomeFromScore(picks[0]);
  return 2 * m(picks[0]) + totals[o1]
       + m(picks[1]) * (outcomeFromScore(picks[1]) === o1 ? 1 : 2)
       + m(picks[2]) * (outcomeFromScore(picks[2]) === o1 ? 1 : 2);
}

// E[points] for the NAIVE top-3-by-raw-probability picker, evaluated under
// the same matrix. Used to A/B the optimal picker against natural sort.
function naivePicksAndExpected(matrix) {
  const entries = Object.entries(matrix).sort((a, b) => b[1] - a[1]);
  const picks = [entries[0][0], entries[1][0], entries[2][0]];
  return { picks, expected: expectedPoints(matrix, picks) };
}

function runBacktest(model, matches, { warmupMatches = 500, verbose = false } = {}) {
  const teamIds = [...new Set(matches.flatMap(m => [m.home, m.away]))];
  model.init(teamIds);

  let n = 0;
  let correct = 0;
  let brierSum = 0;
  let logLossSum = 0;
  let logScoreCounts = { H: 0, D: 0, A: 0 };
  let realisedPointsSum = 0;
  let expectedPointsSum = 0;
  let naiveExpectedPointsSum = 0;
  let naiveRealisedPointsSum = 0;
  let scoresEvaluated = 0;
  const calibrationBuckets = Array.from({ length: 10 }, () => ({ predicted: 0, actual: 0, count: 0 }));

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const probs = model.predict(m.home, m.away, m.neutral);

    if (i >= warmupMatches) {
      const outcome = gradeOutcome(m.homeScore, m.awayScore);
      const pActual =
        outcome === 'H' ? probs.pHome : outcome === 'D' ? probs.pDraw : probs.pAway;

      brierSum += brierScore(probs, outcome);
      logLossSum += -Math.log(Math.max(pActual, 1e-12));
      logScoreCounts[outcome]++;

      const predicted = predictedLabel(probs);
      if (predicted === outcome) correct++;

      const pPredicted = Math.max(probs.pHome, probs.pDraw, probs.pAway);
      const bucket = Math.min(9, Math.floor(pPredicted * 10));
      calibrationBuckets[bucket].predicted += pPredicted;
      calibrationBuckets[bucket].actual += predicted === outcome ? 1 : 0;
      calibrationBuckets[bucket].count++;
      n++;

      if (probs.topScores && probs.matrix) {
        const actualScore = `${m.homeScore}-${m.awayScore}`;
        realisedPointsSum += pointsForResult(actualScore, probs.topScores, outcome);
        expectedPointsSum += expectedPoints(probs.matrix, probs.topScores);
        const naive = naivePicksAndExpected(probs.matrix);
        naiveExpectedPointsSum += naive.expected;
        naiveRealisedPointsSum += pointsForResult(actualScore, naive.picks, outcome);
        scoresEvaluated++;
      }
    }

    model.update(m.home, m.away, m.homeScore, m.awayScore, m.neutral, m.tournament);

    if (verbose && (i + 1) % 1000 === 0) {
      const acc = n > 0 ? (correct / n) : 0;
      console.log(`  ${i + 1}/${matches.length} matches — running accuracy ${(acc * 100).toFixed(1)}%`);
    }
  }

  const calibration = calibrationBuckets
    .filter(b => b.count > 0)
    .map(b => ({
      avgPredicted: +(b.predicted / b.count).toFixed(3),
      observedRate: +(b.actual / b.count).toFixed(3),
      n: b.count,
    }));

  return {
    n,
    accuracy: +(correct / n).toFixed(4),
    avgBrier: +(brierSum / n).toFixed(4),
    avgLogLoss: +(logLossSum / n).toFixed(4),
    outcomeMix: logScoreCounts,
    calibration,
    points: scoresEvaluated > 0 ? {
      n: scoresEvaluated,
      avgRealised: +(realisedPointsSum / scoresEvaluated).toFixed(4),
      avgExpected: +(expectedPointsSum / scoresEvaluated).toFixed(4),
      avgRealisedNaive: +(naiveRealisedPointsSum / scoresEvaluated).toFixed(4),
      avgExpectedNaive: +(naiveExpectedPointsSum / scoresEvaluated).toFixed(4),
    } : null,
  };
}

module.exports = { runBacktest, brierScore, gradeOutcome, predictedLabel };
