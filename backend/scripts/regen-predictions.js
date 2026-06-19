#!/usr/bin/env node
'use strict';
const { getDb } = require('../database/db');
const { predict } = require('../services/predictionEngine');

const db = getDb();
const matches = db.prepare(`
  SELECT id, home_team, away_team FROM matches
  WHERE status = 'SCHEDULED' AND home_team IS NOT NULL AND away_team IS NOT NULL
  ORDER BY scheduled_date, scheduled_time
`).all();

console.log(`Regenerating ${matches.length} predictions with updated WC_GOAL_SCALE + adjusted scorelines...`);
let done = 0, failed = 0;

(async () => {
  for (const m of matches) {
    try {
      const p = await predict(m.id, true);
      done++;
      if (done <= 10 || done % 15 === 0)
        console.log(`[${done}/${matches.length}] ${m.home_team} vs ${m.away_team} → ${p.most_likely_score}`);
    } catch (e) {
      failed++;
      console.error(`  ERR match ${m.id}: ${e.message}`);
    }
  }
  console.log(`\nDone. Generated: ${done}  Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
