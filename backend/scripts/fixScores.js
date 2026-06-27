/**
 * Fix completed group stage match scores in the DB.
 * All scores verified against Wikipedia 2026 FIFA World Cup group stage.
 * Run once: node scripts/fixScores.js
 */
const { getDb } = require('../database/db');

const db = getDb();

// Matches that should be COMPLETED with their correct scores
// (home_score, away_score) from DB home/away team perspective
const completedMatches = [
  // Group A final matchday
  { id: 'A5', homeScore: 1, awayScore: 0, winner: 'ZAF' },  // ZAF 1-0 KOR
  { id: 'A6', homeScore: 0, awayScore: 3, winner: 'MEX' },  // CZE 0-3 MEX

  // Group B final matchday
  { id: 'B5', homeScore: 1, awayScore: 3, winner: 'BIH' },  // QAT 1-3 BIH
  { id: 'B6', homeScore: 2, awayScore: 1, winner: 'SUI' },  // SUI 2-1 CAN

  // Group C final matchday
  { id: 'C1', homeScore: 3, awayScore: 0, winner: 'BRA' },  // BRA 3-0 SCO
  { id: 'C2', homeScore: 4, awayScore: 2, winner: 'MAR' },  // MAR 4-2 HTI

  // Group D final matchday
  { id: 'D5', homeScore: 0, awayScore: 0, winner: null },   // AUS 0-0 PAR (draw)
  { id: 'D6', homeScore: 3, awayScore: 2, winner: 'TUR' },  // TUR 3-2 USA

  // Group E final matchday
  { id: 'E3', homeScore: 1, awayScore: 2, winner: 'ECU' },  // GER 1-2 ECU
  { id: 'E4', homeScore: 0, awayScore: 2, winner: 'CIV' },  // CUW 0-2 CIV

  // Group F final matchday
  { id: 'F1', homeScore: 3, awayScore: 1, winner: 'NED' },  // NED 3-1 TUN
  { id: 'F2', homeScore: 1, awayScore: 1, winner: null },   // JPN 1-1 SWE (draw)

  // Group G final matchday
  { id: 'G1', homeScore: 5, awayScore: 1, winner: 'BEL' },  // BEL 5-1 NZL
  { id: 'G2', homeScore: 1, awayScore: 1, winner: null },   // IRN 1-1 EGY (draw)

  // Group H final matchday
  { id: 'H5', homeScore: 0, awayScore: 0, winner: null },   // KSA 0-0 CPV (draw)
  { id: 'H6', homeScore: 0, awayScore: 1, winner: 'ESP' },  // URU 0-1 ESP

  // Group I
  { id: 'I1', homeScore: 3, awayScore: 0, winner: 'FRA' },  // FRA 3-0 IRQ
  { id: 'I2', homeScore: 2, awayScore: 3, winner: 'NOR' },  // SEN 2-3 NOR
  { id: 'I5', homeScore: 5, awayScore: 0, winner: 'SEN' },  // SEN 5-0 IRQ
  { id: 'I6', homeScore: 1, awayScore: 4, winner: 'FRA' },  // NOR 1-4 FRA

  // Group J
  { id: 'J4', homeScore: 1, awayScore: 2, winner: 'ALG' },  // JOR 1-2 ALG

  // Group K
  { id: 'K1', homeScore: 5, awayScore: 0, winner: 'POR' },  // POR 5-0 UZB
  { id: 'K2', homeScore: 1, awayScore: 0, winner: 'COL' },  // COL 1-0 COD

  // Group L
  { id: 'L3', homeScore: 0, awayScore: 0, winner: null },   // ENG 0-0 GHA (draw)
  { id: 'L4', homeScore: 0, awayScore: 1, winner: 'CRO' },  // PAN 0-1 CRO
];

const updateMatch = db.prepare(`
  UPDATE matches
  SET status = 'COMPLETED',
      home_score = ?,
      away_score = ?,
      winner = ?,
      completed_at = datetime('now')
  WHERE id = ?
`);

let updated = 0;
let skipped = 0;

db.exec('BEGIN');
try {
  for (const m of completedMatches) {
    const existing = db.prepare(`SELECT status, home_score, away_score FROM matches WHERE id = ?`).get([m.id]);
    if (!existing) {
      console.log(`SKIP ${m.id}: not found in DB`);
      skipped++;
      continue;
    }
    if (existing.status === 'COMPLETED') {
      console.log(`SKIP ${m.id}: already COMPLETED (${existing.home_score}-${existing.away_score})`);
      skipped++;
      continue;
    }
    updateMatch.run([m.homeScore, m.awayScore, m.winner, m.id]);
    console.log(`UPDATED ${m.id}: ${m.homeScore}-${m.awayScore} winner=${m.winner}`);
    updated++;
  }
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}

console.log(`\nDone: ${updated} updated, ${skipped} skipped`);

// Print final state
console.log('\n--- All group stage matches ---');
const all = db.prepare(`SELECT id, home_team, away_team, status, home_score, away_score FROM matches WHERE stage='GROUP' ORDER BY id`).all([]);
for (const m of all) {
  const score = m.status === 'COMPLETED' ? `${m.home_score}-${m.away_score}` : m.status;
  process.stdout.write(`${m.id} ${m.home_team} ${score} ${m.away_team}\n`);
}
