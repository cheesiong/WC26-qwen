/**
 * Qualification Scenarios Service
 *
 * For a group with remaining matches, enumerate every possible result combination
 * and compute who qualifies (1st, 2nd, best-3rd contender) in each scenario.
 *
 * For performance we limit to groups with ≤ 3 remaining matches (3^3 = 27 combos).
 * Groups with 0 remaining matches return the already-determined standings.
 */

const { getDb } = require('../database/db');

/**
 * Compute final standings for a set of teams given their current stats
 * plus a list of hypothetical results.
 */
function simulateGroup(teams, remainingMatches, hypotheticalResults) {
  // Deep-copy current standings
  const standings = teams.map(t => ({
    id: t.id,
    name: t.name,
    flag: t.flag,
    pts: t.gs_pts,
    gf: t.gs_gf,
    ga: t.gs_ga,
    played: t.gs_played,
    fifa_rank: t.fifa_rank,
  }));

  const byId = Object.fromEntries(standings.map(s => [s.id, s]));

  remainingMatches.forEach((match, idx) => {
    const result = hypotheticalResults[idx]; // 'HOME' | 'DRAW' | 'AWAY'
    const home = byId[match.home_team];
    const away = byId[match.away_team];
    if (!home || !away) return;

    home.played++;
    away.played++;

    if (result === 'HOME') {
      home.pts += 3; home.gf += 1; away.ga += 1;
    } else if (result === 'AWAY') {
      away.pts += 3; away.gf += 1; home.ga += 1;
    } else {
      home.pts += 1; away.pts += 1;
      home.gf += 1; home.ga += 1;
      away.gf += 1; away.ga += 1;
    }
  });

  // Sort: pts → gd → gf → fifa_rank
  standings.sort((a, b) =>
    b.pts - a.pts ||
    (b.gf - b.ga) - (a.gf - a.ga) ||
    b.gf - a.gf ||
    a.fifa_rank - b.fifa_rank
  );

  return standings;
}

/**
 * Get all possible qualification scenarios for a group.
 * Returns:
 *   - standings: current standings
 *   - remainingMatches: matches not yet played
 *   - scenarios: array of { results, outcome: {first, second, third} }
 *   - summary: for each team, { alwaysQualifies, neverQualifies, qualifyCount, totalScenarios }
 */
function getGroupScenarios(groupCode) {
  const db = getDb();

  const teams = db.prepare(`
    SELECT id, name, flag, group_code, fifa_rank,
           gs_pts, gs_gf, gs_ga, gs_played, gs_won, gs_drawn, gs_lost
    FROM teams WHERE group_code = ?
    ORDER BY gs_pts DESC, (gs_gf - gs_ga) DESC, gs_gf DESC, fifa_rank ASC
  `).all(groupCode);

  const allMatches = db.prepare(`
    SELECT m.id, m.home_team, m.away_team, m.status, m.home_score, m.away_score,
           ht.name as home_name, at.name as away_name
    FROM matches m
    JOIN teams ht ON m.home_team = ht.id
    JOIN teams at ON m.away_team = at.id
    WHERE m.stage = 'GROUP' AND m.group_code = ?
    ORDER BY m.scheduled_date
  `).all(groupCode);

  const remaining = allMatches.filter(m => m.status !== 'COMPLETED');
  const completed = allMatches.filter(m => m.status === 'COMPLETED');

  // If the group is done, return determined standings
  if (remaining.length === 0) {
    return {
      groupCode,
      complete: true,
      standings: teams,
      completedMatches: completed,
      remainingMatches: [],
      scenarios: [],
      summary: teams.map((t, i) => ({
        id: t.id, name: t.name, flag: t.flag,
        position: i + 1,
        qualifies: i < 2 ? 'YES' : 'THIRD_PLACE_CONTENDER',
        alwaysQualifies: i < 2, neverQualifies: i >= 3,
        qualifyCount: i < 2 ? 1 : 0, totalScenarios: 1,
      })),
    };
  }

  const outcomes = ['HOME', 'DRAW', 'AWAY'];
  const totalScenarios = Math.pow(3, remaining.length);

  const scenarios = [];
  const qualifyCounts = {}; // teamId → count of scenarios where they finish 1st or 2nd
  teams.forEach(t => { qualifyCounts[t.id] = 0; });

  for (let i = 0; i < totalScenarios; i++) {
    // Decode i into a base-3 result array
    const results = [];
    let n = i;
    for (let j = 0; j < remaining.length; j++) {
      results.push(outcomes[n % 3]);
      n = Math.floor(n / 3);
    }

    const finalStandings = simulateGroup(teams, remaining, results);
    const first  = finalStandings[0];
    const second = finalStandings[1];
    const third  = finalStandings[2];

    qualifyCounts[first.id]++;
    qualifyCounts[second.id]++;

    scenarios.push({
      results: remaining.map((m, idx) => ({
        matchId: m.id,
        homeName: m.home_name,
        awayName: m.away_name,
        result: results[idx],
      })),
      outcome: {
        first:  { id: first.id,  name: first.name,  pts: first.pts,  gd: first.gf - first.ga },
        second: { id: second.id, name: second.name, pts: second.pts, gd: second.gf - second.ga },
        third:  { id: third?.id, name: third?.name, pts: third?.pts, gd: (third?.gf ?? 0) - (third?.ga ?? 0) },
      },
    });
  }

  const summary = teams.map(t => ({
    id: t.id,
    name: t.name,
    flag: t.flag,
    currentPts: t.gs_pts,
    currentGD: t.gs_gf - t.gs_ga,
    qualifyCount: qualifyCounts[t.id],
    totalScenarios,
    qualifyPct: Math.round((qualifyCounts[t.id] / totalScenarios) * 100),
    alwaysQualifies: qualifyCounts[t.id] === totalScenarios,
    neverQualifies: qualifyCounts[t.id] === 0,
    eliminated: qualifyCounts[t.id] === 0,
  }));

  return {
    groupCode,
    complete: false,
    standings: teams,
    completedMatches: completed,
    remainingMatches: remaining,
    totalScenarios,

    scenarios,
    summary,
  };
}

module.exports = { getGroupScenarios };
