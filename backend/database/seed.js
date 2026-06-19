/**
 * Seed the database with WC2026 teams and group stage fixtures.
 * Run once: node database/seed.js
 */
require('dotenv').config({ path: '../.env' });
const { getDb } = require('./db');
const { TEAMS, TEAM_STATS, GROUP_MATCHES } = require('../data/teams');

function seed() {
  const db = getDb();

  const existing = db.prepare('SELECT COUNT(*) as count FROM teams').get([]);
  if (existing.count > 0) {
    console.log('⏭️  Database already seeded, skipping.');
    return;
  }

  console.log('🌱 Seeding teams...');
  const insertTeam = db.prepare(`
    INSERT OR REPLACE INTO teams
      (id, name, flag, group_code, confederation, fifa_rank, fifa_points, elo,
       avg_scored, avg_conceded, wc_appearances, last_wc_round)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN');
  try {
    for (const t of TEAMS) {
      const stats = TEAM_STATS[t.id] || { avgScored: 1.2, avgConceded: 1.3, wcAppearances: 0, lastWcRound: null };
      insertTeam.run([
        t.id, t.name, t.flag, t.group, t.confederation,
        t.fifaRank, t.fifaPoints,
        t.fifaPoints,  // ELO starts equal to FIFA points
        stats.avgScored, stats.avgConceded,
        stats.wcAppearances, stats.lastWcRound,
      ]);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  console.log(`  ✓ ${TEAMS.length} teams seeded`);

  console.log('🌱 Seeding group stage fixtures...');
  const insertMatch = db.prepare(`
    INSERT OR REPLACE INTO matches
      (id, stage, group_code, home_team, away_team, scheduled_date, scheduled_time, venue)
    VALUES (?, 'GROUP', ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN');
  try {
    for (const m of GROUP_MATCHES) {
      insertMatch.run([m.id, m.group, m.home, m.away, m.date, m.time, m.venue]);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  console.log(`  ✓ ${GROUP_MATCHES.length} group stage matches seeded`);

  console.log('✅ Seed complete!');
  process.exit(0);
}

seed();
