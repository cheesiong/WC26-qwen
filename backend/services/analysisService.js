/**
 * Post-Match Analysis & Learning Service
 *
 * After each match this service:
 *  1. Compares our prediction vs actual result
 *  2. Computes Brier score (probability calibration)
 *  3. Updates model weights based on errors
 *  4. Updates group standings
 *  5. Generates insight narrative about what we got right/wrong
 *  6. Updates ELO ratings
 */

const { getDb } = require('../database/db');
const { updateAfterMatch } = require('./predictionEngine');
const { advanceGroupToR32, advanceKnockoutWinner } = require('./bracketService');
const { refitTemperature, refitDcRho } = require('./calibrationService');

// ──────────────────────────────────────────────────────────────────
//  POINTS SCORING  (max 3 per match)
//  3 → actual scoreline == most_likely_score (the headline "Predict" pick)
//  2 → actual scoreline appears in top_scores[0..2] but isn't the headline
//  1 → outcome of most_likely_score matches actual outcome
//  0 → otherwise
//
//  Ranks line up with what the /predictions page displays: the headline
//  scoreline gives 3 pts, anything in the Top 3 chips below gives 2 pts.
//  Outcome credit is derived from the same headline scoreline so the
//  /api/analytics/accuracy outcome metric matches the 1-pt rule.
// ──────────────────────────────────────────────────────────────────
function outcomeFromScore(scoreStr) {
  if (!scoreStr) return null;
  const [h, a] = scoreStr.split('-').map(Number);
  if (isNaN(h) || isNaN(a)) return null;
  return h > a ? 'HOME' : h < a ? 'AWAY' : 'DRAW';
}

function computePoints(homeScore, awayScore, prediction) {
  if (!prediction) return 0;

  const actualStr = `${homeScore}-${awayScore}`;

  if (prediction.most_likely_score && prediction.most_likely_score === actualStr) return 3;

  let topScores = [];
  try { topScores = JSON.parse(prediction.top_scores || '[]'); } catch {}
  for (const s of topScores.slice(0, 3)) {
    if (s?.score === actualStr) return 2;
  }

  const predOtc = outcomeFromScore(prediction.most_likely_score);
  if (predOtc) {
    const actualOtc = homeScore > awayScore ? 'HOME' : homeScore < awayScore ? 'AWAY' : 'DRAW';
    if (predOtc === actualOtc) return 1;
  }

  return 0;
}

// ──────────────────────────────────────────────────────────────────
//  BRIER SCORE  (lower = better, 0 = perfect, 2 = worst)
//  BS = (p_home - y_home)^2 + (p_draw - y_draw)^2 + (p_away - y_away)^2
// ──────────────────────────────────────────────────────────────────
function computeBrierScore(probHome, probDraw, probAway, outcome) {
  const y = { HOME: [1, 0, 0], DRAW: [0, 1, 0], AWAY: [0, 0, 1] };
  const actuals = y[outcome];
  return (
    Math.pow(probHome - actuals[0], 2) +
    Math.pow(probDraw - actuals[1], 2) +
    Math.pow(probAway - actuals[2], 2)
  );
}

// ──────────────────────────────────────────────────────────────────
//  RECORD MATCH RESULT & ANALYSE PREDICTION
// ──────────────────────────────────────────────────────────────────
async function recordMatchResult(matchId, homeScore, awayScore, homePens, awayPens) {
  const db = getDb();

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!match) throw new Error(`Match ${matchId} not found`);

  // Idempotency guard: if this match has already been recorded with the same
  // score, skip the side-effects (group standings +1, ELO update, duplicate
  // model_performance INSERT) so a re-run from a racing sync cron doesn't
  // double-count. Only the score+status pair counts as a duplicate; if scores
  // genuinely change, fall through and let the writes correct the record.
  // Use Number() to guard against string/integer type mismatch.
  if (
    match.status === 'COMPLETED' &&
    Number(match.home_score) === Number(homeScore) &&
    Number(match.away_score) === Number(awayScore)
  ) {
    return { matchId, result: { homeScore, awayScore, outcome: null, winner: match.winner }, analysis: null, alreadyRecorded: true };
  }

  // Determine outcome
  const outcome = homeScore > awayScore ? 'HOME' : homeScore === awayScore ? 'DRAW' : 'AWAY';
  const winner = homeScore > awayScore ? match.home_team
               : awayScore > homeScore ? match.away_team
               : null;

  // For knockout stages, determine winner from penalties if drawn
  const knockoutWinner = homePens != null && awayPens != null
    ? (homePens > awayPens ? match.home_team : match.away_team)
    : winner;

  // Update match record
  db.prepare(`
    UPDATE matches SET
      status = 'COMPLETED',
      home_score = ?, away_score = ?,
      home_score_pens = ?, away_score_pens = ?,
      winner = ?,
      completed_at = datetime('now')
    WHERE id = ?
  `).run([homeScore, awayScore, homePens ?? null, awayPens ?? null, knockoutWinner, matchId]);

  // Update group standings (group stage only)
  if (match.stage === 'GROUP') {
    updateGroupStandings(match.home_team, match.away_team, homeScore, awayScore);
    // Auto-advance to R32 if this was the group's final match
    try { advanceGroupToR32(match.group_code); } catch (e) { console.error('bracketService error:', e.message); }
  }

  // For knockout stages, advance winner to next round
  if (match.stage !== 'GROUP' && knockoutWinner) {
    try { advanceKnockoutWinner(matchId, knockoutWinner); } catch (e) { console.error('bracketService error:', e.message); }
  }

  // Update BOTH legacy ELO (for team profile / Monte Carlo) AND the v2
  // attack/defence ratings (used by the production prediction backbone).
  const eloChange = updateAfterMatch(match.home_team, match.away_team, homeScore, awayScore, matchId, match.stage);

  // Find the pre-match prediction — latest snapshot is what users see, so
  // that is what we grade against (MAX(id) = most recent prediction run).
  const prediction = db.prepare(`
    SELECT * FROM predictions WHERE match_id = ? ORDER BY id DESC LIMIT 1
  `).get(matchId);

  let analysis = null;
  if (prediction) {
    const brierScore = computeBrierScore(
      prediction.prob_home,
      prediction.prob_draw,
      prediction.prob_away,
      outcome
    );

    // Predicted outcome is derived from the headline most_likely_score so it
    // lines up with the 1-pt rule and the /predictions Predict cell. 90-minute
    // result only — extra time and penalties don't count toward outcome.
    const predictedOutcome = outcomeFromScore(prediction.most_likely_score)
      ?? (prediction.prob_home > prediction.prob_draw && prediction.prob_home > prediction.prob_away
            ? 'HOME'
            : prediction.prob_away > prediction.prob_draw && prediction.prob_away > prediction.prob_home
              ? 'AWAY'
              : 'DRAW');

    const wasCorrect = predictedOutcome === outcome ? 1 : 0;
    const points = computePoints(homeScore, awayScore, prediction);

    const probPredicted = outcome === 'HOME' ? prediction.prob_home
                        : outcome === 'AWAY' ? prediction.prob_away
                        : prediction.prob_draw;

    const isUpset = (
      (outcome === 'HOME' && prediction.prob_home < 0.35) ||
      (outcome === 'AWAY' && prediction.prob_away < 0.35)
    ) ? 1 : 0;

    // Update prediction record with result
    db.prepare(`
      UPDATE predictions SET
        actual_outcome = ?, was_correct = ?, brier_score = ?, upset = ?
      WHERE id = ?
    `).run([outcome, wasCorrect, brierScore, isUpset, prediction.id]);

    // Save to model_performance
    const analysisNotes = generateAnalysisNotes(prediction, outcome, brierScore, wasCorrect, isUpset, homeScore, awayScore);

    db.prepare(`
      INSERT INTO model_performance
        (match_id, stage, predicted_outcome, actual_outcome, was_correct,
         brier_score, prob_predicted, confidence, upset, analysis_notes, points)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run([matchId, match.stage, predictedOutcome, outcome, wasCorrect,
           brierScore, probPredicted, prediction.confidence, isUpset, analysisNotes, points]);

    analysis = {
      predictedOutcome,
      actualOutcome: outcome,
      wasCorrect: wasCorrect === 1,
      brierScore: parseFloat(brierScore.toFixed(4)),
      isUpset: isUpset === 1,
      notes: analysisNotes,
      eloChange,
    };

    // Refit output calibration temperature whenever we cross a 10-result
    // boundary. This replaces the old single-match adaptWeights nudge,
    // which was noise-fitting on tiny samples.
    try {
      const completed = db.prepare(`SELECT COUNT(*) AS c FROM model_performance`).get();
      if (completed?.c >= 20 && completed.c % 10 === 0) {
        refitTemperature();
        refitDcRho();
      }
    } catch (e) {
      console.warn('Calibration refit failed:', e.message);
    }
  }

  return {
    matchId,
    result: { homeScore, awayScore, outcome, winner: knockoutWinner },
    analysis,
  };
}

// ──────────────────────────────────────────────────────────────────
//  GROUP STANDINGS UPDATE
// ──────────────────────────────────────────────────────────────────
function updateGroupStandings(homeId, awayId, homeGoals, awayGoals) {
  // Legacy signature kept for backward-compat, but we now recalculate
  // the entire group from completed matches to prevent double-counting.
  const db = getDb();
  const match = db.prepare(
    "SELECT group_code FROM matches WHERE (home_team = ? OR away_team = ?) AND status = 'COMPLETED' LIMIT 1"
  ).get(homeId, homeId);
  if (!match || !match.group_code) return;
  recalculateGroupStandings(match.group_code);
}

/**
 * Recalculate group standings from scratch using all completed matches.
 * Idempotent — safe to call any number of times.
 */
function recalculateGroupStandings(groupCode) {
  const db = getDb();

  // Reset all teams in this group
  db.prepare(`
    UPDATE teams SET gs_played = 0, gs_won = 0, gs_drawn = 0, gs_lost = 0,
                     gs_gf = 0, gs_ga = 0, gs_pts = 0
    WHERE group_code = ?
  `).run(groupCode);

  // Fetch all completed group matches
  const completed = db.prepare(`
    SELECT home_team, away_team, home_score, away_score
    FROM matches
    WHERE group_code = ? AND status = 'COMPLETED'
  `).all(groupCode);

  for (const m of completed) {
    const hg = m.home_score, ag = m.away_score;
    const homeWin = hg > ag, awayWin = ag > hg, draw = hg === ag;

    db.prepare(`
      UPDATE teams SET
        gs_played = gs_played + 1,
        gs_won   = gs_won + ?,
        gs_drawn = gs_drawn + ?,
        gs_lost  = gs_lost + ?,
        gs_gf    = gs_gf + ?,
        gs_ga    = gs_ga + ?,
        gs_pts   = gs_pts + ?
      WHERE id = ?
    `).run([
      homeWin ? 1 : 0, draw ? 1 : 0, awayWin ? 1 : 0,
      hg, ag,
      homeWin ? 3 : draw ? 1 : 0,
      m.home_team,
    ]);

    db.prepare(`
      UPDATE teams SET
        gs_played = gs_played + 1,
        gs_won   = gs_won + ?,
        gs_drawn = gs_drawn + ?,
        gs_lost  = gs_lost + ?,
        gs_gf    = gs_gf + ?,
        gs_ga    = gs_ga + ?,
        gs_pts   = gs_pts + ?
      WHERE id = ?
    `).run([
      awayWin ? 1 : 0, draw ? 1 : 0, homeWin ? 1 : 0,
      ag, hg,
      awayWin ? 3 : draw ? 1 : 0,
      m.away_team,
    ]);
  }
}

// ──────────────────────────────────────────────────────────────────
//  ANALYSIS NARRATIVE
// ──────────────────────────────────────────────────────────────────
function generateAnalysisNotes(prediction, outcome, brierScore, wasCorrect, isUpset, homeScore, awayScore) {
  const notes = [];

  if (wasCorrect) {
    notes.push(`✅ Correct outcome predicted (${outcome}).`);
    if (brierScore < 0.15) notes.push('Excellent calibration — high confidence, correct result.');
    else if (brierScore < 0.30) notes.push('Good calibration.');
    else notes.push('Correct but low confidence — model was uncertain.');
  } else {
    notes.push(`❌ Incorrect prediction — actual: ${outcome}.`);
    if (isUpset) notes.push('🔴 UPSET: Heavy favourite was defeated. Check what factors we missed.');
    if (brierScore > 0.6) notes.push('Poor calibration — model was very wrong. High weight adjustment triggered.');
  }

  const actualScore = `${homeScore}-${awayScore}`;
  notes.push(`Score: ${actualScore}. Brier score: ${brierScore.toFixed(3)}.`);

  return notes.join(' ');
}

// ──────────────────────────────────────────────────────────────────
//  GET MODEL ACCURACY STATS
// ──────────────────────────────────────────────────────────────────
function getModelAccuracy() {
  const db = getDb();

  // Use only the latest model_performance row per match to avoid double-counting
  // when a match gets re-graded (e.g. live sync fires twice).
  const deduped = `(SELECT * FROM model_performance WHERE id = (SELECT MAX(id) FROM model_performance mp2 WHERE mp2.match_id = model_performance.match_id))`;

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(was_correct) as correct,
      SUM(COALESCE(points, 0)) as total_points,
      COUNT(*) * 3 as max_points,
      ROUND(AVG(brier_score), 4) as avg_brier,
      ROUND(100.0 * SUM(COALESCE(points, 0)) / (COUNT(*) * 3), 1) as accuracy_pct,
      CASE WHEN COUNT(*) > 0
        THEN ROUND(100.0 * SUM(was_correct) / COUNT(*), 1)
        ELSE NULL
      END as outcome_accuracy_pct,
      SUM(upset) as upsets_occurred,
      SUM(CASE WHEN upset = 1 AND was_correct = 0 THEN 1 ELSE 0 END) as upsets_missed
    FROM ${deduped}
  `).get();

  const byStage = db.prepare(`
    SELECT
      stage,
      COUNT(*) as total,
      SUM(was_correct) as correct,
      ROUND(AVG(brier_score), 4) as avg_brier,
      ROUND(100.0 * SUM(was_correct) / COUNT(*), 1) as accuracy_pct
    FROM ${deduped}
    GROUP BY stage
    ORDER BY total DESC
  `).all();

  const byConfidence = db.prepare(`
    SELECT
      confidence,
      COUNT(*) as total,
      SUM(was_correct) as correct,
      ROUND(100.0 * SUM(was_correct) / COUNT(*), 1) as accuracy_pct,
      ROUND(AVG(brier_score), 4) as avg_brier
    FROM ${deduped}
    WHERE confidence IS NOT NULL
    GROUP BY confidence
    ORDER BY total DESC
  `).all();

  const recent10 = db.prepare(`
    SELECT mp.*, m.home_team, m.away_team, m.home_score, m.away_score
    FROM model_performance mp
    JOIN matches m ON mp.match_id = m.id
    ORDER BY mp.created_at DESC LIMIT 10
  `).all();

  const currentWeights = db.prepare(`
    SELECT key, value, description FROM model_config
    WHERE key LIKE 'w_%'
    ORDER BY key
  `).all();

  return { stats, byStage, byConfidence, recent10, currentWeights };
}

// ──────────────────────────────────────────────────────────────────
//  GET GROUP STANDINGS
// ──────────────────────────────────────────────────────────────────
function getGroupStandings(groupCode) {
  const db = getDb();

  const teams = db.prepare(`
    SELECT * FROM teams WHERE group_code = ?
    ORDER BY gs_pts DESC,
             (gs_gf - gs_ga) DESC,
             gs_gf DESC,
             name ASC
  `).all(groupCode);

  const matches = db.prepare(`
    SELECT m.*, ht.name as home_name, ht.flag as home_flag,
           at.name as away_name, at.flag as away_flag
    FROM matches m
    JOIN teams ht ON m.home_team = ht.id
    JOIN teams at ON m.away_team = at.id
    WHERE m.group_code = ?
    ORDER BY m.scheduled_date
  `).all(groupCode);

  return { teams, matches };
}

module.exports = {
  recordMatchResult,
  getModelAccuracy,
  getGroupStandings,
  updateGroupStandings,
  recalculateGroupStandings,
  computeBrierScore,
  computePoints,
};
