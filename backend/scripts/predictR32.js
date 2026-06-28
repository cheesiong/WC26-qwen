/**
 * Predict all R32 matches and advance bracket
 * For draws, predict winner via ET/penalties
 */
const { getDb } = require('../database/db');
const { predict } = require('../services/predictionEngine');

const db = getDb();

async function main() {
  // Get all R32 matches
  const r32Matches = db.prepare("SELECT id, home_team, away_team FROM matches WHERE stage = 'R32' ORDER BY id").all([]);
  console.log(`Found ${r32Matches.length} R32 matches`);

  const results = [];

  for (const match of r32Matches) {
    console.log(`\n=== ${match.id}: ${match.home_team} vs ${match.away_team} ===`);

    try {
      // Generate prediction
      const pred = await predict(match.id, true);
      console.log(`Prediction: ${match.home_team} ${(pred.prob_home * 100).toFixed(1)}% | Draw ${(pred.prob_draw * 100).toFixed(1)}% | ${match.away_team} ${(pred.prob_away * 100).toFixed(1)}%`);
      console.log(`Most likely score: ${pred.most_likely_score}`);

      // Determine winner (for knockout, must have winner)
      let winner;
      let winnerMethod = '90min';

      if (pred.prob_home > pred.prob_away) {
        winner = match.home_team;
      } else if (pred.prob_away > pred.prob_home) {
        winner = match.away_team;
      } else {
        // Equal probability - use most_likely_score to break tie
        const [h, a] = pred.most_likely_score.split('-').map(Number);
        if (h > a) winner = match.home_team;
        else if (a > h) winner = match.away_team;
        else {
          // True draw - pick team with higher ELO or random
          winner = Math.random() > 0.5 ? match.home_team : match.away_team;
          winnerMethod = 'penalties';
        }
      }

      console.log(`Winner: ${winner} (${winnerMethod})`);

      results.push({
        matchId: match.id,
        homeTeam: match.home_team,
        awayTeam: match.away_team,
        probHome: pred.prob_home,
        probDraw: pred.prob_draw,
        probAway: pred.prob_away,
        mostLikelyScore: pred.most_likely_score,
        winner,
        winnerMethod,
      });

    } catch (e) {
      console.error(`Error predicting ${match.id}:`, e.message);
    }
  }

  // Update matches with winners and advance bracket
  console.log('\n=== Updating bracket ===');
  const { advanceKnockoutWinner } = require('../services/bracketService');
  for (const r of results) {
    console.log(`${r.matchId}: ${r.winner} wins`);
    db.prepare("UPDATE matches SET winner = ?, status = 'COMPLETED' WHERE id = ?").run([r.winner, r.matchId]);
    advanceKnockoutWinner(r.matchId, r.winner);
  }

  console.log('\nDone!');
  console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);
