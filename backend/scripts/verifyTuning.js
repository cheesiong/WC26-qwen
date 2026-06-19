#!/usr/bin/env node
'use strict';
/**
 * Verify tuned engine predictions: compare stored R1 actuals with
 * what the tuned model would produce from pre-R1 (FIFA-prior) ratings.
 */
const { getDb } = require('../database/db');
const PE = require('../services/predictionEngine');
const BACKBONE = PE.BACKBONE || {};

const db = getDb();

// 1. Get all completed R1 matches with actual results
const r1Matches = db.prepare(`
  SELECT id, home_team, away_team, home_score, away_score, stage
  FROM matches WHERE status = 'COMPLETED' AND stage = 'GROUP'
  ORDER BY scheduled_date, scheduled_time
`).all();

console.log(`\n=== VERIFICATION: ${r1Matches.length} completed R1 matches ===\n`);

// 2. Get the stored (old engine) predictions for R1 matches
const oldPreds = {};
for (const m of r1Matches) {
  const p = db.prepare(`
    SELECT * FROM predictions WHERE match_id = ? ORDER BY id DESC LIMIT 1
  `).get(m.id);
  if (p) oldPreds[m.id] = p;
}
console.log(`Old predictions found: ${Object.keys(oldPreds).length}/${r1Matches.length}`);

// 3. Compute old-engine accuracy on R1
let oldOutcomeCorrect = 0, oldS1 = 0, oldS23 = 0, oldOutcome1 = 0;
let oldBrierSum = 0, oldLogLossSum = 0;
let oldTotalGoalsPred = 0, oldTotalGoalsActual = 0;

for (const m of r1Matches) {
  const p = oldPreds[m.id];
  if (!p) continue;

  const actualScore = `${m.home_score}-${m.away_score}`;
  const actualOutcome = m.home_score > m.away_score ? 'H' : m.home_score < m.away_score ? 'A' : 'D';

  // Predicted outcome
  const predOutcome = p.prob_home > p.prob_away
    ? (p.prob_home > p.prob_draw ? 'H' : 'D')
    : (p.prob_away > p.prob_draw ? 'A' : 'D');

  if (predOutcome === actualOutcome) oldOutcomeCorrect++;

  // Points scoring
  const rawTopScores = JSON.parse(p.top_scores || '[]');
  const topScoreStrings = rawTopScores.map(ts => typeof ts === 'string' ? ts : ts.score);
  const s1 = topScoreStrings[0] || p.most_likely_score;
  if (s1 === actualScore) oldS1++;
  else if (topScoreStrings[1] === actualScore || topScoreStrings[2] === actualScore) oldS23++;
  else {
    const s1Outcome = s1 ? (parseInt(s1.split('-')[0]) > parseInt(s1.split('-')[1]) ? 'H' : parseInt(s1.split('-')[0]) < parseInt(s1.split('-')[1]) ? 'A' : 'D') : null;
    if (s1Outcome === actualOutcome) oldOutcome1++;
  }

  // Brier & log-loss
  const y = actualOutcome === 'H' ? [1,0,0] : actualOutcome === 'D' ? [0,1,0] : [0,0,1];
  oldBrierSum += (p.prob_home - y[0])**2 + (p.prob_draw - y[1])**2 + (p.prob_away - y[2])**2;
  const pActual = actualOutcome === 'H' ? p.prob_home : actualOutcome === 'D' ? p.prob_draw : p.prob_away;
  oldLogLossSum += -Math.log(Math.max(pActual, 1e-12));

  oldTotalGoalsPred += p.expected_score_home + p.expected_score_away;
  oldTotalGoalsActual += m.home_score + m.away_score;
}

const n = r1Matches.length;
console.log(`\n── OLD ENGINE (R1 predictions as stored) ──`);
console.log(`  Outcome accuracy:    ${oldOutcomeCorrect}/${n} = ${(oldOutcomeCorrect/n*100).toFixed(1)}%`);
console.log(`  Exact S1 (3pts):     ${oldS1}/${n} = ${(oldS1/n*100).toFixed(1)}%`);
console.log(`  Exact S2/S3 (2pts):  ${oldS23}/${n} = ${(oldS23/n*100).toFixed(1)}%`);
console.log(`  Outcome-only (1pt):  ${oldOutcome1}/${n}`);
console.log(`  Total points:        ${oldS1*3 + oldS23*2 + oldOutcome1*1}/${n*3}`);
console.log(`  Avg Brier:           ${(oldBrierSum/n).toFixed(4)}`);
console.log(`  Avg LogLoss:         ${(oldLogLossSum/n).toFixed(4)}`);
console.log(`  Avg predicted goals: ${(oldTotalGoalsPred/n).toFixed(2)}  actual: ${(oldTotalGoalsActual/n).toFixed(2)}`);

// 4. Now simulate what the NEW engine would predict from FIFA priors
// We use the current team ratings (post re-learning) to make predictions
// but we need pre-R1 ratings. Instead, we compare distributions.
console.log(`\n── NEW ENGINE (remaining 48 group matches) ──`);
const newGroupPreds = db.prepare(`
  SELECT p.*, m.home_team, m.away_team, m.id as mid
  FROM predictions p
  JOIN matches m ON p.match_id = m.id
  WHERE m.stage = 'GROUP' AND m.status = 'SCHEDULED'
  AND p.id = (SELECT MAX(id) FROM predictions WHERE match_id = m.id)
`).all();

console.log(`  Predictions found: ${newGroupPreds.length}/48`);

let newAvgGoals = 0, newDrawSum = 0;
let newProbHomeSum = 0, newProbDrawSum = 0, newProbAwaySum = 0;
const scoreDistrib = {};

for (const p of newGroupPreds) {
  newAvgGoals += p.expected_score_home + p.expected_score_away;
  newDrawSum += p.prob_draw;
  newProbHomeSum += p.prob_home;
  newProbDrawSum += p.prob_draw;
  newProbAwaySum += p.prob_away;
  const s = p.most_likely_score;
  scoreDistrib[s] = (scoreDistrib[s] || 0) + 1;
}

const ng = newGroupPreds.length;
console.log(`  Avg predicted goals: ${(newAvgGoals/ng).toFixed(2)}`);
console.log(`  Avg draw prob:       ${(newDrawSum/ng*100).toFixed(1)}%`);
console.log(`  Avg outcome probs:   H=${(newProbHomeSum/ng*100).toFixed(1)}% D=${(newProbDrawSum/ng*100).toFixed(1)}% A=${(newProbAwaySum/ng*100).toFixed(1)}%`);
console.log(`  Top predicted scores:`);
Object.entries(scoreDistrib).sort((a,b) => b[1]-a[1]).slice(0,10)
  .forEach(([s,c]) => console.log(`    ${s}: ${c} times`));

// 5. Knockout predictions summary
console.log(`\n── KNOCKOUT PREDICTIONS ──`);
const koPreds = db.prepare(`
  SELECT p.*, m.id as mid, m.stage, m.home_team, m.away_team
  FROM predictions p
  JOIN matches m ON p.match_id = m.id
  WHERE m.stage NOT IN ('GROUP')
  AND p.id = (SELECT MAX(id) FROM predictions WHERE match_id = m.id)
  ORDER BY
    CASE m.stage WHEN 'R32' THEN 1 WHEN 'R16' THEN 2 WHEN 'QF' THEN 3 WHEN 'SF' THEN 4 WHEN 'F' THEN 5 WHEN 'THIRD_PLACE' THEN 6 ELSE 7 END,
    m.id
`).all();

console.log(`  Total knockout predictions: ${koPreds.length}/32`);

let koAvgGoals = 0, koDrawSum = 0;
const stageResults = {};
for (const p of koPreds) {
  koAvgGoals += p.expected_score_home + p.expected_score_away;
  koDrawSum += p.prob_draw;
  if (!stageResults[p.stage]) stageResults[p.stage] = [];
  stageResults[p.stage].push(p);
}

const nk = koPreds.length;
if (nk > 0) {
  console.log(`  Avg predicted goals: ${(koAvgGoals/nk).toFixed(2)}`);
  console.log(`  Avg draw prob:       ${(koDrawSum/nk*100).toFixed(1)}%`);
  for (const [stage, preds] of Object.entries(stageResults)) {
    console.log(`  ${stage} (${preds.length} matches):`);
    for (const p of preds) {
      console.log(`    ${p.mid}: ${p.home_team} vs ${p.away_team} → ${p.most_likely_score} (H:${(p.prob_home*100).toFixed(0)}% D:${(p.prob_draw*100).toFixed(0)}% A:${(p.prob_away*100).toFixed(0)}%)`);
    }
  }
}

// 6. Engine parameters summary
console.log(`\n── ENGINE PARAMETERS ──`);
const tempRow = db.prepare("SELECT value FROM model_config WHERE key = 'calibration_temperature'").get();
const rhoRow = db.prepare("SELECT value FROM model_config WHERE key = 'dc_rho'").get();
console.log(`  Temperature: ${tempRow?.value || 'not fitted (1.0)'}`);
console.log(`  DC rho:      ${rhoRow?.value || 'not fitted (0.0)'}`);

console.log(`\n✅ Verification complete.`);
