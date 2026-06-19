#!/usr/bin/env node
'use strict';
/**
 * DRY-RUN: Compare old vs new engine on completed R1 matches.
 * Does NOT write anything to the DB.
 */
const { getDb } = require('../database/db');
const PE = require('../services/predictionEngine');

const db = getDb();
const { dcScoreMatrix, probsFromMatrix, reweightMatrixToOutcomeProbs,
        pickTopScoresForPoints, ensureRatings, wcGoalScaleFor, BACKBONE } = PE;

// Read fitted params
const tempRow = db.prepare("SELECT value FROM model_config WHERE key = 'calibration_temperature'").get();
const rhoRow  = db.prepare("SELECT value FROM model_config WHERE key = 'dc_rho'").get();
const T   = tempRow?.value || 1.0;
const rho = rhoRow?.value ?? BACKBONE.DC_RHO;

const HOST_NATIONS = new Set(['USA', 'CAN', 'MEX']);
const HOME_ADV_LOG = BACKBONE.HOME_ADV_LOG || 0.15;

function homeAdvLog(homeId, awayId) {
  if (HOST_NATIONS.has(homeId)) return HOME_ADV_LOG;
  if (HOST_NATIONS.has(awayId)) return -HOME_ADV_LOG;
  return 0;
}

function applyTemp(probs, temp) {
  if (!temp || temp === 1.0) return probs;
  const logH = Math.log(Math.max(probs.winHome, 1e-6)) / temp;
  const logD = Math.log(Math.max(probs.draw, 1e-6)) / temp;
  const logA = Math.log(Math.max(probs.winAway, 1e-6)) / temp;
  const m = Math.max(logH, logD, logA);
  const eH = Math.exp(logH - m), eD = Math.exp(logD - m), eA = Math.exp(logA - m);
  const z = eH + eD + eA;
  return { winHome: eH/z, draw: eD/z, winAway: eA/z };
}

function outcomeOf(score) {
  const [h, a] = score.split('-').map(Number);
  return h > a ? 'HOME' : h < a ? 'AWAY' : 'DRAW';
}

function pointsFor(actual, s1, s2, s3) {
  if (actual === s1) return 3;
  if (actual === s2 || actual === s3) return 2;
  const actualOutcome = outcomeOf(actual);
  if (outcomeOf(s1) === actualOutcome) return 1;
  return 0;
}

// ── Get all completed R1 matches ──
const matches = db.prepare(`
  SELECT id, home_team, away_team, home_score, away_score, stage, venue
  FROM matches WHERE status = 'COMPLETED' AND stage = 'GROUP'
  ORDER BY scheduled_date, scheduled_time
`).all();

console.log(`\n${'═'.repeat(80)}`);
console.log(`  DRY-RUN: Old vs New Engine on ${matches.length} completed R1 matches`);
console.log(`  Engine params: T=${T}, ρ=${rho}, GOAL_SCALE=${BACKBONE.WC_GOAL_SCALE_GROUP}`);
console.log(`${'═'.repeat(80)}\n`);

let oldPoints = 0, newPoints = 0;
let oldS1Hits = 0, oldS23Hits = 0, oldOutcomeHits = 0, oldZeroHits = 0;
let newS1Hits = 0, newS23Hits = 0, newOutcomeHits = 0, newZeroHits = 0;
let oldOutcomeCorrect = 0, newOutcomeCorrect = 0;

const rows = [];

for (const m of matches) {
  const actualScore = `${m.home_score}-${m.away_score}`;
  const actualOutcome = m.home_score > m.away_score ? 'HOME' : m.home_score < m.away_score ? 'AWAY' : 'DRAW';

  // ── OLD ENGINE: read stored prediction ──
  const oldPred = db.prepare(`
    SELECT * FROM predictions WHERE match_id = ? ORDER BY id DESC LIMIT 1
  `).get(m.id);

  let oldPts = 0;
  if (oldPred) {
    const oldTS = JSON.parse(oldPred.top_scores || '[]').map(t => typeof t === 'string' ? t : t.score);
    const oldS1 = oldTS[0] || oldPred.most_likely_score;
    const oldS2 = oldTS[1] || '', oldS3 = oldTS[2] || '';
    oldPts = pointsFor(actualScore, oldS1, oldS2, oldS3);

    const oldPredOutcome = oldPred.prob_home > oldPred.prob_away
      ? (oldPred.prob_home > oldPred.prob_draw ? 'HOME' : 'DRAW')
      : (oldPred.prob_away > oldPred.prob_draw ? 'AWAY' : 'DRAW');
    if (oldPredOutcome === actualOutcome) oldOutcomeCorrect++;
  }

  // ── NEW ENGINE: compute from current ratings (dry-run, no DB write) ──
  let homeTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(m.home_team);
  let awayTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(m.away_team);
  homeTeam = ensureRatings(homeTeam);
  awayTeam = ensureRatings(awayTeam);

  const wcScale = wcGoalScaleFor(m.stage);
  const logLamH = homeTeam.log_alpha + awayTeam.log_beta + homeAdvLog(m.home_team, m.away_team);
  const logLamA = awayTeam.log_alpha + homeTeam.log_beta;
  const lambdaH = Math.max(0.20, Math.min(5.5, Math.exp(logLamH) * wcScale));
  const lambdaA = Math.max(0.20, Math.min(5.5, Math.exp(logLamA) * wcScale));

  const matrix = dcScoreMatrix(lambdaH, lambdaA, rho);
  const backboneProbs = probsFromMatrix(matrix);
  let finalProbs = applyTemp({ winHome: backboneProbs.winHome, draw: backboneProbs.draw, winAway: backboneProbs.winAway }, T);

  const blendedMatrix = reweightMatrixToOutcomeProbs(matrix, backboneProbs, finalProbs);
  const { mostLikely, top } = pickTopScoresForPoints(blendedMatrix);
  const newS1 = top[0]?.score || mostLikely;
  const newS2 = top[1]?.score || '';
  const newS3 = top[2]?.score || '';

  const newPts = pointsFor(actualScore, newS1, newS2, newS3);

  const newPredOutcome = finalProbs.winHome > finalProbs.winAway
    ? (finalProbs.winHome > finalProbs.draw ? 'HOME' : 'DRAW')
    : (finalProbs.winAway > finalProbs.draw ? 'AWAY' : 'DRAW');
  if (newPredOutcome === actualOutcome) newOutcomeCorrect++;

  // Accumulate
  oldPoints += oldPts;
  newPoints += newPts;

  if (oldPts === 3) oldS1Hits++; else if (oldPts === 2) oldS23Hits++; else if (oldPts === 1) oldOutcomeHits++; else oldZeroHits++;
  if (newPts === 3) newS1Hits++; else if (newPts === 2) newS23Hits++; else if (newPts === 1) newOutcomeHits++; else newZeroHits++;

  rows.push({
    match: m.id,
    home: m.home_team, away: m.away_team,
    actual: actualScore,
    oldS1: oldPred ? (JSON.parse(oldPred.top_scores || '[]').map(t => typeof t === 'string' ? t : t.score)[0] || oldPred.most_likely_score) : '?',
    newS1, newS2, newS3,
    oldPts, newPts,
    delta: newPts - oldPts,
    lambdaH: lambdaH.toFixed(2), lambdaA: lambdaA.toFixed(2),
  });
}

// ── PRINT MATCH-BY-MATCH ──
console.log('Match-by-match comparison:');
console.log('─'.repeat(120));
console.log(
  'Match'.padEnd(8) + 'Home'.padEnd(6) + 'Away'.padEnd(6) +
  'Actual'.padEnd(7) + 'Old S1'.padEnd(7) + 'New S1'.padEnd(7) +
  'New S2'.padEnd(7) + 'New S3'.padEnd(7) +
  'Old'.padEnd(5) + 'New'.padEnd(5) + 'Δ'.padEnd(4)
);
console.log('─'.repeat(120));

for (const r of rows) {
  const deltaStr = r.delta > 0 ? `+${r.delta}` : `${r.delta}`;
  const deltaColor = r.delta > 0 ? ' ✓' : r.delta < 0 ? ' ✗' : '';
  console.log(
    r.match.padEnd(8) +
    r.home.padEnd(6) +
    r.away.padEnd(6) +
    r.actual.padEnd(7) +
    r.oldS1.padEnd(7) +
    r.newS1.padEnd(7) +
    r.newS2.padEnd(7) +
    r.newS3.padEnd(7) +
    `${r.oldPts}`.padEnd(5) +
    `${r.newPts}`.padEnd(5) +
    (deltaStr + deltaColor)
  );
}
console.log('─'.repeat(120));

// ── SUMMARY ──
const n = matches.length;
console.log(`\n${'═'.repeat(60)}`);
console.log(`  SUMMARY`);
console.log(`${'═'.repeat(60)}`);
console.log(`\n  ${'Metric'.padEnd(30)} ${'OLD'.padStart(10)} ${'NEW'.padStart(10)} ${'Δ'.padStart(8)}`);
console.log(`  ${'─'.repeat(58)}`);
console.log(`  ${'Total points'.padEnd(30)} ${String(oldPoints).padStart(10)} ${String(newPoints).padStart(10)} ${String(newPoints - oldPoints).padStart(8)}`);
console.log(`  ${'Avg points/match'.padEnd(30)} ${(oldPoints/n).toFixed(2).padStart(10)} ${(newPoints/n).toFixed(2).padStart(10)} ${((newPoints-oldPoints)/n).toFixed(2).padStart(8)}`);
console.log(`  ${'Exact S1 (3pts)'.padEnd(30)} ${String(oldS1Hits).padStart(10)} ${String(newS1Hits).padStart(10)} ${String(newS1Hits-oldS1Hits).padStart(8)}`);
console.log(`  ${'Top-3 S2/S3 (2pts)'.padEnd(30)} ${String(oldS23Hits).padStart(10)} ${String(newS23Hits).padStart(10)} ${String(newS23Hits-oldS23Hits).padStart(8)}`);
console.log(`  ${'Outcome only (1pt)'.padEnd(30)} ${String(oldOutcomeHits).padStart(10)} ${String(newOutcomeHits).padStart(10)} ${String(newOutcomeHits-oldOutcomeHits).padStart(8)}`);
console.log(`  ${'Zero (0pts)'.padEnd(30)} ${String(oldZeroHits).padStart(10)} ${String(newZeroHits).padStart(10)} ${String(newZeroHits-oldZeroHits).padStart(8)}`);
console.log(`  ${'Outcome correct (W/D/A)'.padEnd(30)} ${(`${oldOutcomeCorrect}/${n}`).padStart(10)} ${(`${newOutcomeCorrect}/${n}`).padStart(10)} ${String(newOutcomeCorrect-oldOutcomeCorrect).padStart(8)}`);
console.log(`  ${'Outcome accuracy'.padEnd(30)} ${(`${(oldOutcomeCorrect/n*100).toFixed(1)}%`).padStart(10)} ${(`${(newOutcomeCorrect/n*100).toFixed(1)}%`).padStart(10)} ${(`${(newOutcomeCorrect-oldOutcomeCorrect)/n*100 > 0 ? '+' : ''}${((newOutcomeCorrect-oldOutcomeCorrect)/n*100).toFixed(1)}pp`).padStart(8)}`);
console.log(`  ${'Max possible points'.padEnd(30)} ${String(n*3).padStart(10)}`);
console.log(`  ${'Points as % of max'.padEnd(30)} ${(`${(oldPoints/(n*3)*100).toFixed(1)}%`).padStart(10)} ${(`${(newPoints/(n*3)*100).toFixed(1)}%`).padStart(10)}`);

// ── Breakdown by actual outcome type ──
console.log(`\n\n  Points breakdown by actual outcome:`);
const byOutcome = { HOME: { old: 0, new: 0, n: 0 }, AWAY: { old: 0, new: 0, n: 0 }, DRAW: { old: 0, new: 0, n: 0 } };
for (let i = 0; i < rows.length; i++) {
  const m = matches[i];
  const outcome = m.home_score > m.away_score ? 'HOME' : m.home_score < m.away_score ? 'AWAY' : 'DRAW';
  byOutcome[outcome].old += rows[i].oldPts;
  byOutcome[outcome].new += rows[i].newPts;
  byOutcome[outcome].n++;
}
console.log(`  ${'Outcome'.padEnd(10)} ${'Count'.padStart(6)} ${'OLD pts'.padStart(10)} ${'NEW pts'.padStart(10)} ${'Δ'.padStart(8)}`);
console.log(`  ${'─'.repeat(44)}`);
for (const [o, d] of Object.entries(byOutcome)) {
  if (d.n === 0) continue;
  console.log(`  ${o.padEnd(10)} ${String(d.n).padStart(6)} ${String(d.old).padStart(10)} ${String(d.new).padStart(10)} ${String(d.new - d.old).padStart(8)}`);
}

console.log(`\n${'═'.repeat(60)}\n`);
