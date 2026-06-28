/**
 * Advance bracket using existing predictions (no new API calls).
 * For each round: read latest prediction, determine winner, advance.
 * Draws resolved via H2H then ELO.
 */
const { getDb } = require('../database/db');
const { advanceKnockoutWinner } = require('../services/bracketService');
const { h2hToProbs } = require('../services/h2hService');

const db = getDb();

const R32_BRACKET = [
  { matchId: 'R32-01', homeSlot: '2A', awaySlot: '2B' },
  { matchId: 'R32-02', homeSlot: '1E', awaySlot: '3rd-1E' },
  { matchId: 'R32-03', homeSlot: '1F', awaySlot: '2C' },
  { matchId: 'R32-04', homeSlot: '1C', awaySlot: '2F' },
  { matchId: 'R32-05', homeSlot: '1I', awaySlot: '3rd-1I' },
  { matchId: 'R32-06', homeSlot: '2E', awaySlot: '2I' },
  { matchId: 'R32-07', homeSlot: '1A', awaySlot: '3rd-1A' },
  { matchId: 'R32-08', homeSlot: '1L', awaySlot: '3rd-1L' },
  { matchId: 'R32-09', homeSlot: '1D', awaySlot: '3rd-1D' },
  { matchId: 'R32-10', homeSlot: '1G', awaySlot: '3rd-1G' },
  { matchId: 'R32-11', homeSlot: '2K', awaySlot: '2L' },
  { matchId: 'R32-12', homeSlot: '1H', awaySlot: '2J' },
  { matchId: 'R32-13', homeSlot: '1B', awaySlot: '3rd-1B' },
  { matchId: 'R32-14', homeSlot: '1J', awaySlot: '2H' },
  { matchId: 'R32-15', homeSlot: '1K', awaySlot: '3rd-1K' },
  { matchId: 'R32-16', homeSlot: '2D', awaySlot: '2G' },
];

const R16_BRACKET = [
  { matchId: 'R16-01', homeSource: 'R32-01', awaySource: 'R32-03' },
  { matchId: 'R16-02', homeSource: 'R32-02', awaySource: 'R32-05' },
  { matchId: 'R16-03', homeSource: 'R32-04', awaySource: 'R32-06' },
  { matchId: 'R16-04', homeSource: 'R32-07', awaySource: 'R32-08' },
  { matchId: 'R16-05', homeSource: 'R32-11', awaySource: 'R32-12' },
  { matchId: 'R16-06', homeSource: 'R32-09', awaySource: 'R32-10' },
  { matchId: 'R16-07', homeSource: 'R32-14', awaySource: 'R32-16' },
  { matchId: 'R16-08', homeSource: 'R32-13', awaySource: 'R32-15' },
];

const QF_BRACKET = [
  { matchId: 'QF-01', homeSource: 'R16-02', awaySource: 'R16-01' },
  { matchId: 'QF-02', homeSource: 'R16-05', awaySource: 'R16-06' },
  { matchId: 'QF-03', homeSource: 'R16-03', awaySource: 'R16-04' },
  { matchId: 'QF-04', homeSource: 'R16-07', awaySource: 'R16-08' },
];

const SF_BRACKET = [
  { matchId: 'SF-01', homeSource: 'QF-01', awaySource: 'QF-02' },
  { matchId: 'SF-02', homeSource: 'QF-03', awaySource: 'QF-04' },
];

const FINAL = { matchId: 'FINAL', homeSource: 'SF-01', awaySource: 'SF-02' };
const THIRD_PLACE = { matchId: 'THIRD', homeSource: 'SF-01-loser', awaySource: 'SF-02-loser' };

function getTeam(id) {
  return db.prepare('SELECT * FROM teams WHERE id = ?').get(id);
}

function getLatestPred(matchId) {
  return db.prepare(
    'SELECT prob_home, prob_draw, prob_away, most_likely_score FROM predictions WHERE match_id = ? ORDER BY id DESC LIMIT 1'
  ).get(matchId);
}

async function resolveWinner(matchId, homeTeam, awayTeam) {
  const pred = getLatestPred(matchId);
  if (!pred) {
    // Fallback: ELO
    const winner = homeTeam.elo >= awayTeam.elo ? homeTeam : awayTeam;
    return { winner, tiebreaker: 'ELO (no prediction)' };
  }

  const { prob_home, prob_draw, prob_away } = pred;

  if (prob_home > prob_draw && prob_home > prob_away) {
    return { winner: homeTeam, tiebreaker: null };
  } else if (prob_away > prob_draw && prob_away > prob_home) {
    return { winner: awayTeam, tiebreaker: null };
  } else {
    // Draw — resolve via H2H then ELO
    try {
      const h2h = await h2hToProbs(homeTeam.id, awayTeam.id);
      if (h2h && h2h.matchCount >= 2 && Math.abs(h2h.weightedAdvantage) > 0.1) {
        const winner = h2h.weightedAdvantage > 0 ? homeTeam : awayTeam;
        return { winner, tiebreaker: `H2H (${h2h.matchCount} meetings)` };
      }
    } catch { /* ignore */ }
    const winner = homeTeam.elo >= awayTeam.elo ? homeTeam : awayTeam;
    return { winner, tiebreaker: 'ELO' };
  }
}

async function main() {
  const teams = db.prepare('SELECT * FROM teams').all();
  const teamsById = {};
  for (const t of teams) teamsById[t.id] = t;

  // Get prediction-based group placements
  const { getPredictionBasedPlacements } = require('../services/bracketService');
  const placements = getPredictionBasedPlacements();

  const winners = {}; // matchId -> team

  // 1. R32
  console.log('=== R32 ===');
  for (const { matchId, homeSlot, awaySlot } of R32_BRACKET) {
    const homeTeam = placements[homeSlot];
    const awayTeam = placements[awaySlot];
    if (!homeTeam || !awayTeam) {
      console.warn(`  ${matchId}: missing teams (${homeSlot}/${awaySlot})`);
      continue;
    }
    // Ensure teams are set in DB
    db.prepare('UPDATE matches SET home_team=?, away_team=? WHERE id=?').run([homeTeam.id, awayTeam.id, matchId]);

    const { winner, tiebreaker } = await resolveWinner(matchId, homeTeam, awayTeam);
    winners[matchId] = winner;
    advanceKnockoutWinner(matchId, winner.id);
    const tb = tiebreaker ? ` (${tiebreaker})` : '';
    console.log(`  ${matchId}: ${homeTeam.name} vs ${awayTeam.name} → ${winner.name}${tb}`);
  }

  // 2. R16
  console.log('\n=== R16 ===');
  for (const { matchId, homeSource, awaySource } of R16_BRACKET) {
    const homeTeam = winners[homeSource];
    const awayTeam = winners[awaySource];
    if (!homeTeam || !awayTeam) {
      console.warn(`  ${matchId}: missing teams`);
      continue;
    }
    db.prepare('UPDATE matches SET home_team=?, away_team=? WHERE id=?').run([homeTeam.id, awayTeam.id, matchId]);

    const { winner, tiebreaker } = await resolveWinner(matchId, homeTeam, awayTeam);
    winners[matchId] = winner;
    advanceKnockoutWinner(matchId, winner.id);
    const tb = tiebreaker ? ` (${tiebreaker})` : '';
    console.log(`  ${matchId}: ${homeTeam.name} vs ${awayTeam.name} → ${winner.name}${tb}`);
  }

  // 3. QF
  console.log('\n=== QF ===');
  for (const { matchId, homeSource, awaySource } of QF_BRACKET) {
    const homeTeam = winners[homeSource];
    const awayTeam = winners[awaySource];
    if (!homeTeam || !awayTeam) {
      console.warn(`  ${matchId}: missing teams`);
      continue;
    }
    db.prepare('UPDATE matches SET home_team=?, away_team=? WHERE id=?').run([homeTeam.id, awayTeam.id, matchId]);

    const { winner, tiebreaker } = await resolveWinner(matchId, homeTeam, awayTeam);
    winners[matchId] = winner;
    advanceKnockoutWinner(matchId, winner.id);
    const tb = tiebreaker ? ` (${tiebreaker})` : '';
    console.log(`  ${matchId}: ${homeTeam.name} vs ${awayTeam.name} → ${winner.name}${tb}`);
  }

  // 4. SF
  console.log('\n=== SF ===');
  for (const { matchId, homeSource, awaySource } of SF_BRACKET) {
    const homeTeam = winners[homeSource];
    const awayTeam = winners[awaySource];
    if (!homeTeam || !awayTeam) {
      console.warn(`  ${matchId}: missing teams`);
      continue;
    }
    db.prepare('UPDATE matches SET home_team=?, away_team=? WHERE id=?').run([homeTeam.id, awayTeam.id, matchId]);

    const { winner, tiebreaker } = await resolveWinner(matchId, homeTeam, awayTeam);
    winners[matchId] = winner;
    advanceKnockoutWinner(matchId, winner.id);

    // Place loser in third-place match
    const loser = winner.id === homeTeam.id ? awayTeam : homeTeam;
    const isFirst = matchId === 'SF-01';
    db.prepare(`UPDATE matches SET ${isFirst ? 'home_team' : 'away_team'} = ? WHERE id = 'THIRD'`).run([loser.id]);

    const tb = tiebreaker ? ` (${tiebreaker})` : '';
    console.log(`  ${matchId}: ${homeTeam.name} vs ${awayTeam.name} → ${winner.name}${tb}`);
    console.log(`  🥉 ${loser.name} → THIRD (${isFirst ? 'home' : 'away'})`);
  }

  // 5. Final
  console.log('\n=== FINAL ===');
  const finHome = winners[FINAL.homeSource];
  const finAway = winners[FINAL.awaySource];
  if (finHome && finAway) {
    db.prepare('UPDATE matches SET home_team=?, away_team=? WHERE id=?').run([finHome.id, finAway.id, 'FINAL']);
    const { winner, tiebreaker } = await resolveWinner('FINAL', finHome, finAway);
    const tb = tiebreaker ? ` (${tiebreaker})` : '';
    console.log(`  FINAL: ${finHome.name} vs ${finAway.name} → ${winner.name}${tb}`);
    console.log(`\n🏆 CHAMPION: ${winner.name}`);
  }

  // 6. Third place
  console.log('\n=== THIRD PLACE ===');
  const thirdMatch = db.prepare('SELECT home_team, away_team FROM matches WHERE id = ?').get('THIRD');
  if (thirdMatch?.home_team && thirdMatch?.away_team) {
    const tHome = getTeam(thirdMatch.home_team);
    const tAway = getTeam(thirdMatch.away_team);
    if (tHome && tAway) {
      const { winner } = await resolveWinner('THIRD', tHome, tAway);
      console.log(`  THIRD: ${tHome.name} vs ${tAway.name} → ${winner.name}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
