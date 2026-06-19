/**
 * Re-grade every model_performance row under the current rules.
 *
 * Rewrites points, predicted_outcome, and was_correct from the LATEST
 * prediction for each match (matching what the UI shows and what
 * recordMatchResult now uses).  Run after changing the scoring rule so
 * existing rows match what new gradings would produce.
 *
 * Usage: node scripts/backfillPoints.js
 */

const { getDb } = require('../database/db');
const { computePoints } = require('../services/analysisService');

function outcomeFromScore(scoreStr) {
  if (!scoreStr) return null;
  const [h, a] = scoreStr.split('-').map(Number);
  if (isNaN(h) || isNaN(a)) return null;
  return h > a ? 'HOME' : h < a ? 'AWAY' : 'DRAW';
}

function predictedOutcomeFor(prediction) {
  return outcomeFromScore(prediction?.most_likely_score)
      ?? (prediction?.prob_home > prediction?.prob_draw && prediction?.prob_home > prediction?.prob_away ? 'HOME'
          : prediction?.prob_away > prediction?.prob_draw && prediction?.prob_away > prediction?.prob_home ? 'AWAY'
          : 'DRAW');
}

function main() {
  const db = getDb();

  const rows = db.prepare(`
    SELECT mp.id, mp.match_id,
           mp.points AS old_points,
           mp.predicted_outcome AS old_pred,
           mp.was_correct AS old_correct,
           mp.actual_outcome,
           m.home_score, m.away_score
    FROM model_performance mp
    JOIN matches m ON m.id = mp.match_id
    WHERE m.status = 'COMPLETED'
    ORDER BY mp.id
  `).all();

  const update = db.prepare(`
    UPDATE model_performance
    SET points = ?, predicted_outcome = ?, was_correct = ?
    WHERE id = ?
  `);
  let changed = 0;

  for (const row of rows) {
    const prediction = db.prepare(`
      SELECT * FROM predictions WHERE match_id = ? ORDER BY id DESC LIMIT 1
    `).get(row.match_id);

    const newPoints = computePoints(row.home_score, row.away_score, prediction);
    const newPred = predictedOutcomeFor(prediction);
    const newCorrect = newPred === row.actual_outcome ? 1 : 0;

    const before = `pts=${row.old_points ?? 0} pred=${row.old_pred} correct=${row.old_correct}`;
    const after  = `pts=${newPoints} pred=${newPred} correct=${newCorrect}`;

    if (before !== after) {
      update.run([newPoints, newPred, newCorrect, row.id]);
      changed += 1;
      console.log(`  ${row.match_id}: ${before} → ${after}`);
    } else {
      console.log(`  ${row.match_id}: ${after} (unchanged)`);
    }
  }

  console.log(`\nDone. ${changed} row(s) updated, ${rows.length - changed} unchanged.`);
}

main();
