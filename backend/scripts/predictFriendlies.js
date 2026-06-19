/**
 * Predict scorelines for pre-WC2026 friendlies using the production engine.
 * Temporarily inserts non-WC teams and match stubs, runs predictions, then cleans up.
 *
 * Usage: node backend/scripts/predictFriendlies.js
 */

'use strict';

const { getDb } = require('../database/db');
const { predict } = require('../services/predictionEngine');

// ── Non-WC2026 teams (synthesized from FIFA points + historical stats) ─────
// log_alpha/log_beta pre-computed so ensureRatings() skips re-init:
//   z = (fifaPoints - 1500) / 250
//   sig = 1 / (1 + exp(-z))
//   prior.alpha = 0.95 + sig * 1.0
//   prior.beta  = 1.85 - sig * 0.95
//   alpha = 0.5 * prior.alpha + 0.5 * avgScored
//   beta  = 0.5 * prior.beta  + 0.5 * avgConceded
const EXTRA_TEAMS = [
  // Chile: FIFA ~37, ~1515 pts
  { id: 'CHL', name: 'Chile',     fifaRank: 37, fifaPoints: 1515,
    logAlpha: Math.log(Math.max(0.5, 0.5 * (0.95 + 1/(1+Math.exp(-(1515-1500)/250))) + 0.5 * 1.6)),
    logBeta:  Math.log(Math.max(0.5, 0.5 * (1.85 - 1/(1+Math.exp(-(1515-1500)/250)) * 0.95) + 0.5 * 1.2)) },
  // Venezuela: FIFA ~53, ~1455 pts
  { id: 'VEN', name: 'Venezuela', fifaRank: 53, fifaPoints: 1455,
    logAlpha: Math.log(Math.max(0.5, 0.5 * (0.95 + 1/(1+Math.exp(-(1455-1500)/250))) + 0.5 * 1.3)),
    logBeta:  Math.log(Math.max(0.5, 0.5 * (1.85 - 1/(1+Math.exp(-(1455-1500)/250)) * 0.95) + 0.5 * 1.3)) },
  // Honduras: FIFA ~88, ~1320 pts
  { id: 'HON', name: 'Honduras',  fifaRank: 88, fifaPoints: 1320,
    logAlpha: Math.log(Math.max(0.5, 0.5 * (0.95 + 1/(1+Math.exp(-(1320-1500)/250))) + 0.5 * 1.1)),
    logBeta:  Math.log(Math.max(0.5, 0.5 * (1.85 - 1/(1+Math.exp(-(1320-1500)/250)) * 0.95) + 0.5 * 1.5)) },
  // Jamaica: FIFA ~96, ~1295 pts
  { id: 'JAM', name: 'Jamaica',   fifaRank: 96, fifaPoints: 1295,
    logAlpha: Math.log(Math.max(0.5, 0.5 * (0.95 + 1/(1+Math.exp(-(1295-1500)/250))) + 0.5 * 1.0)),
    logBeta:  Math.log(Math.max(0.5, 0.5 * (1.85 - 1/(1+Math.exp(-(1295-1500)/250)) * 0.95) + 0.5 * 1.4)) },
];

const FRIENDLIES = [
  { num: 1,  home: 'BEL', away: 'TUN',  label: 'Belgium vs Tunisia' },
  { num: 2,  home: 'POR', away: 'CHL',  label: 'Portugal vs Chile' },
  { num: 3,  home: 'USA', away: 'GER',  label: 'United States vs Germany' },
  { num: 4,  home: 'PAN', away: 'BIH',  label: 'Panama vs Bosnia-Herzegovina' },
  { num: 5,  home: 'SUI', away: 'AUS',  label: 'Switzerland vs Australia' },
  { num: 6,  home: 'ENG', away: 'NZL',  label: 'England vs New Zealand' },
  { num: 7,  home: 'BRA', away: 'EGY',  label: 'Brazil vs Egypt' },
  { num: 8,  home: 'VEN', away: 'TUR',  label: 'Venezuela vs Türkiye' },
  { num: 9,  home: 'ARG', away: 'HON',  label: 'Argentina vs Honduras' },
  { num: 10, home: 'JAM', away: 'ZAF',  label: 'Jamaica vs South Africa' },
];

async function main() {
  const db = getDb();

  // ── Insert non-WC teams ────────────────────────────────────────────
  const insertTeam = db.prepare(`
    INSERT OR IGNORE INTO teams
      (id, name, flag, confederation, fifa_rank, fifa_points, elo,
       avg_scored, avg_conceded, log_alpha, log_beta, log_alpha_prior, log_beta_prior)
    VALUES (?, ?, '🏳', 'OTHER', ?, ?, ?, 1.2, 1.3, ?, ?, ?, ?)
  `);
  for (const t of EXTRA_TEAMS) {
    insertTeam.run([t.id, t.name, t.fifaRank, t.fifaPoints, t.fifaPoints,
                    t.logAlpha, t.logBeta, t.logAlpha, t.logBeta]);
  }

  // ── Insert friendly match stubs ────────────────────────────────────
  const insertMatch = db.prepare(`
    INSERT OR IGNORE INTO matches
      (id, stage, group_code, home_team, away_team, scheduled_date, scheduled_time, status)
    VALUES (?, 'FRIENDLY', null, ?, ?, '2026-06-07', '00:00', 'SCHEDULED')
  `);
  const matchIds = FRIENDLIES.map(f => `FRIENDLY_TMP_${f.num}`);
  for (const f of FRIENDLIES) {
    insertMatch.run([`FRIENDLY_TMP_${f.num}`, f.home, f.away]);
  }

  // ── Run predictions ────────────────────────────────────────────────
  console.log('\nRunning prediction engine for 10 friendlies…\n');

  const results = [];
  for (const f of FRIENDLIES) {
    process.stdout.write(`  [${f.num}/10] ${f.label}… `);
    try {
      const pred = await predict(`FRIENDLY_TMP_${f.num}`, true);
      results.push({ f, pred });
      console.log(`${pred.most_likely_score} ✓`);
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      results.push({ f, pred: null });
    }
  }

  // ── Print table ────────────────────────────────────────────────────
  console.log('\n');
  console.log('| # | Match | Most Likely | Top 3 Scorelines | Win% Home / Draw / Away | Confidence |');
  console.log('|---|-------|-------------|------------------|-------------------------|------------|');

  for (const { f, pred } of results) {
    if (!pred) {
      console.log(`| ${f.num} | ${f.label} | — | — | — | — |`);
      continue;
    }
    const top3 = (pred.top_scores || []).map(s => s.score).join(', ');
    const pH = (pred.prob_home * 100).toFixed(0);
    const pD = (pred.prob_draw * 100).toFixed(0);
    const pA = (pred.prob_away * 100).toFixed(0);
    console.log(`| ${f.num} | ${f.label} | **${pred.most_likely_score}** | ${top3} | ${pH}% / ${pD}% / ${pA}% | ${pred.confidence} |`);
  }

  console.log('\n* Friendly goal scale not applied — engine uses WC calibration (0.70×), scorelines lean low-scoring.\n');
  console.log('* Non-WC teams (Chile, Venezuela, Honduras, Jamaica) use FIFA-points-derived ratings with no historical form signal.\n');

  // ── Cleanup ────────────────────────────────────────────────────────
  for (const id of matchIds) {
    db.prepare('DELETE FROM predictions WHERE match_id = ?').run(id);
    db.prepare('DELETE FROM matches WHERE id = ?').run(id);
  }
  for (const t of EXTRA_TEAMS) {
    db.prepare('DELETE FROM teams WHERE id = ?').run(t.id);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
