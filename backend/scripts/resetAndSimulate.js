/**
 * Reset QF/SF/FINAL/THIRD and re-run bracket simulation from R32 results forward.
 */
const { getDb } = require('../database/db');
const { simulateKnockoutBracket } = require('../services/bracketService');

const db = getDb();

async function main() {
  // 1. Reset QF, SF, FINAL, THIRD — clear teams and winners
  console.log('=== Resetting QF/SF/FINAL/THIRD ===');
  const stagesToReset = ['QF', 'SF', 'F', 'THIRD_PLACE'];
  for (const stage of stagesToReset) {
    const matches = db.prepare('SELECT id FROM matches WHERE stage = ?').all(stage);
    for (const m of matches) {
      db.prepare('UPDATE matches SET home_team = NULL, away_team = NULL, winner = NULL, home_score = NULL, away_score = NULL, status = ? WHERE id = ?')
        .run(stage === 'F' ? 'SCHEDULED' : 'SCHEDULED', m.id);
      console.log(`  Reset ${m.id}`);
    }
  }

  // Also reset R16 (will be re-predicted)
  const r16Matches = db.prepare("SELECT id FROM matches WHERE stage = 'R16'").all();
  for (const m of r16Matches) {
    db.prepare("UPDATE matches SET home_team = NULL, away_team = NULL, winner = NULL, home_score = NULL, away_score = NULL, status = 'SCHEDULED' WHERE id = ?")
      .run(m.id);
    console.log(`  Reset ${m.id}`);
  }

  // 2. Re-run full bracket simulation
  console.log('\n=== Running bracket simulation ===');
  const result = await simulateKnockoutBracket();

  // 3. Print summary
  console.log('\n=== BRACKET RESULTS ===');
  for (const r of result.bracket) {
    const tb = r.tiebreaker ? ` (${r.tiebreaker})` : '';
    const real = r.real ? ' [REAL]' : '';
    console.log(`${r.stage} ${r.matchId}: ${r.home?.name} vs ${r.away?.name} → ${r.winner?.name}${tb}${real}`);
  }
  if (result.champion) {
    console.log(`\n🏆 CHAMPION: ${result.champion.name}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
