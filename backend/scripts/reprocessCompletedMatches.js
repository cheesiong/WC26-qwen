/**
 * Re-process newly completed matches to create model_performance records,
 * update ELO, and trigger bracket advancement.
 *
 * Strategy: temporarily set match back to SCHEDULED, then call
 * recordMatchResult() which handles all side effects.
 *
 * Usage: node scripts/reprocessCompletedMatches.js
 */
const { getDb } = require('../database/db');
const { recordMatchResult } = require('../services/analysisService');

const MATCH_IDS = [
  'A5', 'A6',
  'B5', 'B6',
  'C1', 'C2',
  'D5', 'D6',
  'E3', 'E4',
  'F1', 'F2',
  'G1', 'G2',
  'H5', 'H6',
  'I1', 'I2', 'I5', 'I6',
  'J4',
  'K1', 'K2',
  'L3', 'L4',
];

async function main() {
  const db = getDb();
  let ok = 0, fail = 0;

  for (const id of MATCH_IDS) {
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get([id]);
    if (!match) {
      console.log(`SKIP ${id}: not found`);
      continue;
    }
    if (match.status !== 'COMPLETED') {
      console.log(`SKIP ${id}: status=${match.status}`);
      continue;
    }

    const hs = match.home_score;
    const as_ = match.away_score;

    // Temporarily reset to SCHEDULED so recordMatchResult won't skip
    db.prepare("UPDATE matches SET status='SCHEDULED', home_score=NULL, away_score=NULL, winner=NULL WHERE id=?").run([id]);

    try {
      await recordMatchResult(id, hs, as_, null, null);
      console.log(`OK ${id}: ${hs}-${as_}`);
      ok++;
    } catch (e) {
      console.error(`FAIL ${id}: ${e.message}`);
      // Restore manually on failure
      db.prepare("UPDATE matches SET status='COMPLETED', home_score=?, away_score=?, completed_at=datetime('now') WHERE id=?").run([hs, as_, id]);
      fail++;
    }
  }

  console.log(`\nDone: ${ok} OK, ${fail} failed`);
}

main().catch(e => { console.error(e); process.exit(1); });
