/**
 * Re-learn Round 1 team ratings with the tuned learning rate.
 *
 * Resets all log_alpha / log_beta to FIFA priors, then replays the 24
 * Round 1 matches through updateAfterMatch() so teams that performed
 * well in R1 get a stronger rating boost for R2/R3 predictions.
 *
 * Usage: node scripts/relearnR1.js
 */

const { getDb } = require('../database/db');
const { updateAfterMatch, ensureRatings, fifaPriorFromPoints } = require('../services/predictionEngine');
const { TEAMS, TEAM_STATS } = require('../data/teams');

function main() {
  const db = getDb();

  // ── 1. Reset all teams to FIFA priors ────────────────────────────
  const teams = db.prepare('SELECT * FROM teams').all();
  const reset = db.prepare(`
    UPDATE teams SET log_alpha = ?, log_beta = ?, log_alpha_prior = ?, log_beta_prior = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `);

  for (const team of teams) {
    const fifaPoints = team.fifa_points
      || TEAMS.find(t => t.id === team.id)?.fifaPoints
      || 1500;
    const prior = fifaPriorFromPoints(fifaPoints);
    const stats = TEAM_STATS[team.id];
    const alpha = stats ? 0.5 * prior.alpha + 0.5 * stats.avgScored : prior.alpha;
    const beta = stats ? 0.5 * prior.beta + 0.5 * stats.avgConceded : prior.beta;
    const logA = Math.log(Math.max(0.5, alpha));
    const logB = Math.log(Math.max(0.5, beta));
    reset.run([logA, logB, logA, logB, team.id]);
  }
  console.log(`Reset ${teams.length} teams to FIFA priors.`);

  // ── 2. Replay Round 1 matches ────────────────────────────────────
  const r1Matches = db.prepare(`
    SELECT id, home_team, away_team, home_score, away_score, stage
    FROM matches
    WHERE status = 'COMPLETED' AND stage = 'GROUP'
    ORDER BY scheduled_date, id
  `).all();

  console.log(`\nReplaying ${r1Matches.length} Round 1 matches (LR=0.06, REG=0.002)...`);
  for (const m of r1Matches) {
    const result = updateAfterMatch(m.home_team, m.away_team, m.home_score, m.away_score, m.id, m.stage);
    const home = db.prepare('SELECT log_alpha, log_beta FROM teams WHERE id = ?').get(m.home_team);
    const away = db.prepare('SELECT log_alpha, log_beta FROM teams WHERE id = ?').get(m.away_team);
    console.log(`  ${m.id} ${m.home_team} ${m.home_score}-${m.away_score} ${m.away_team}  ELO Δ=${result.change > 0 ? '+' : ''}${result.change.toFixed(1)}`);
  }

  // ── 3. Summary ──────────────────────────────────────────────────
  console.log('\nUpdated team ratings:');
  const updated = db.prepare('SELECT id, log_alpha, log_beta, elo FROM teams ORDER BY elo DESC').all();
  for (const t of updated) {
    console.log(`  ${t.id.padEnd(4)} elo=${Math.round(t.elo)}  α=${Math.exp(t.log_alpha).toFixed(3)}  β=${Math.exp(t.log_beta).toFixed(3)}`);
  }
}

main();
