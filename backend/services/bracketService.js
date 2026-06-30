/**
 * ═══════════════════════════════════════════════════════════════════
 *  BRACKET AUTO-PROGRESSION SERVICE — WC 2026
 * ═══════════════════════════════════════════════════════════════════
 *
 *  WC 2026 format:
 *   • 48 teams in 12 groups of 4 (A–L)
 *   • Top 2 from each group qualify (24 teams)
 *   • Best 8 third-place teams qualify  (8 teams)
 *   • Total 32 teams → R32 → R16 → QF → SF → Final
 *
 *  This service:
 *   1. After a group completes: marks 1st/2nd/3rd-place teams
 *   2. After ALL groups complete: determines best 8 third-place teams
 *   3. Fills the R32 match slots with the qualified teams
 *   4. After each knockout match: advances winner to next round
 *
 *  R32 Bracket (FIFA WC 2026 official draw):
 *   The bracket is seeded so group winners generally face runners-up
 *   from adjacent groups. Slots below follow the confirmed FIFA bracket.
 */

const { getDb } = require('../database/db');

// ── Official FIFA WC 2026 third-place combination table ───────────
// 495 combinations: which group's 3rd-place team faces each group winner
// Key = sorted string of 8 qualifying groups; value maps winner slot → opponent group
const THIRD_PLACE_COMBINATIONS = require('../data/thirdPlaceCombinations.json');

// ── WC 2026 R32 bracket — official FIFA draw (Dec 2023) ───────────
// Slots: "1X" = group X winner, "2X" = group X runner-up
// "3rd-1X" = best-3rd team assigned to face group X winner (combo table)
const R32_BRACKET = [
  { matchId: 'R32-01', homeSlot: '2A',    awaySlot: '2B'    },  // M73: 2A vs 2B
  { matchId: 'R32-02', homeSlot: '1E',    awaySlot: '3rd-1E'},  // M74: 1E vs best-3rd A/B/C/D/F
  { matchId: 'R32-03', homeSlot: '1F',    awaySlot: '2C'    },  // M75: 1F vs 2C
  { matchId: 'R32-04', homeSlot: '1C',    awaySlot: '2F'    },  // M76: 1C vs 2F
  { matchId: 'R32-05', homeSlot: '1I',    awaySlot: '3rd-1I'},  // M77: 1I vs best-3rd C/D/F/G/H
  { matchId: 'R32-06', homeSlot: '2E',    awaySlot: '2I'    },  // M78: 2E vs 2I
  { matchId: 'R32-07', homeSlot: '1A',    awaySlot: '3rd-1A'},  // M79: 1A vs best-3rd C/E/F/H/I
  { matchId: 'R32-08', homeSlot: '1L',    awaySlot: '3rd-1L'},  // M80: 1L vs best-3rd E/H/I/J/K
  { matchId: 'R32-09', homeSlot: '1D',    awaySlot: '3rd-1D'},  // M81: 1D vs best-3rd B/E/F/I/J
  { matchId: 'R32-10', homeSlot: '1G',    awaySlot: '3rd-1G'},  // M82: 1G vs best-3rd A/E/H/I/J
  { matchId: 'R32-11', homeSlot: '2K',    awaySlot: '2L'    },  // M83: 2K vs 2L
  { matchId: 'R32-12', homeSlot: '1H',    awaySlot: '2J'    },  // M84: 1H vs 2J
  { matchId: 'R32-13', homeSlot: '1B',    awaySlot: '3rd-1B'},  // M85: 1B vs best-3rd E/F/G/I/J
  { matchId: 'R32-14', homeSlot: '1J',    awaySlot: '2H'    },  // M86: 1J vs 2H
  { matchId: 'R32-15', homeSlot: '1K',    awaySlot: '3rd-1K'},  // M87: 1K vs best-3rd D/E/I/J/L
  { matchId: 'R32-16', homeSlot: '2D',    awaySlot: '2G'    },  // M88: 2D vs 2G
];

// ── R16 bracket (official FIFA pairings M89–M96) ─────────────────
const R16_BRACKET = [
  { matchId: 'R16-01', homeSource: 'R32-01', awaySource: 'R32-03' }, // M90: W(M73) vs W(M75)
  { matchId: 'R16-02', homeSource: 'R32-02', awaySource: 'R32-05' }, // M89: W(M74) vs W(M77)
  { matchId: 'R16-03', homeSource: 'R32-04', awaySource: 'R32-06' }, // M91: W(M76) vs W(M78)
  { matchId: 'R16-04', homeSource: 'R32-07', awaySource: 'R32-08' }, // M92: W(M79) vs W(M80)
  { matchId: 'R16-05', homeSource: 'R32-11', awaySource: 'R32-12' }, // M93: W(M83) vs W(M84)
  { matchId: 'R16-06', homeSource: 'R32-09', awaySource: 'R32-10' }, // M94: W(M81) vs W(M82)
  { matchId: 'R16-07', homeSource: 'R32-14', awaySource: 'R32-16' }, // M95: W(M86) vs W(M88)
  { matchId: 'R16-08', homeSource: 'R32-13', awaySource: 'R32-15' }, // M96: W(M85) vs W(M87)
];

const QF_BRACKET = [
  { matchId: 'QF-01', homeSource: 'R16-02', awaySource: 'R16-01' }, // M97: W(M89) vs W(M90)
  { matchId: 'QF-02', homeSource: 'R16-05', awaySource: 'R16-06' }, // M98: W(M93) vs W(M94)
  { matchId: 'QF-03', homeSource: 'R16-03', awaySource: 'R16-04' }, // M99: W(M91) vs W(M92)
  { matchId: 'QF-04', homeSource: 'R16-07', awaySource: 'R16-08' }, // M100: W(M95) vs W(M96)
];

const SF_BRACKET = [
  { matchId: 'SF-01', homeSource: 'QF-01', awaySource: 'QF-02' },
  { matchId: 'SF-02', homeSource: 'QF-03', awaySource: 'QF-04' },
];

const FINAL = { matchId: 'FINAL', homeSource: 'SF-01', awaySource: 'SF-02' };
const THIRD_PLACE = { matchId: 'THIRD', homeSource: 'SF-01-loser', awaySource: 'SF-02-loser' };

// ── Display order for a visual bracket where match j of round N is
//    fed by display-adjacent matches 2j and 2j+1 of round N-1. FIFA's
//    R32→R16 wiring is non-adjacent (e.g. R16-01 = W(R32-01) vs W(R32-03)),
//    so rendering matches in raw definition order produces crossed lines.
//    Order computed by walking backwards from the FINAL.
const DISPLAY_ORDER = {
  R32: ['R32-02','R32-05','R32-01','R32-03','R32-11','R32-12','R32-09','R32-10',
        'R32-04','R32-06','R32-07','R32-08','R32-14','R32-16','R32-13','R32-15'],
  R16: ['R16-02','R16-01','R16-05','R16-06','R16-03','R16-04','R16-07','R16-08'],
  QF:  ['QF-01','QF-02','QF-03','QF-04'],
  SF:  ['SF-01','SF-02'],
  F:   ['FINAL'],
};

// ── Per-match schedule data (official FIFA 2026 venues + dates) ───
const KNOCKOUT_SCHEDULE = {
  // R32 — June 28 – July 3
  'R32-01': { date: '2026-06-28', time: '19:00', venue: 'SoFi Stadium, Los Angeles' },
  'R32-02': { date: '2026-06-29', time: '18:00', venue: 'Gillette Stadium, Boston' },
  'R32-03': { date: '2026-06-29', time: '21:00', venue: 'Estadio BBVA, Monterrey' },
  'R32-04': { date: '2026-06-30', time: '21:00', venue: 'NRG Stadium, Houston' },
  'R32-05': { date: '2026-06-30', time: '21:00', venue: 'MetLife Stadium, New York' },
  'R32-06': { date: '2026-06-30', time: '18:00', venue: 'AT&T Stadium, Dallas' },
  'R32-07': { date: '2026-06-30', time: '21:00', venue: 'Estadio Azteca, Mexico City' },
  'R32-08': { date: '2026-07-01', time: '21:00', venue: 'Mercedes-Benz Stadium, Atlanta' },
  'R32-09': { date: '2026-07-01', time: '21:00', venue: "Levi's Stadium, San Francisco" },
  'R32-10': { date: '2026-07-01', time: '18:00', venue: 'Lumen Field, Seattle' },
  'R32-11': { date: '2026-07-02', time: '21:00', venue: 'BMO Field, Toronto' },
  'R32-12': { date: '2026-07-02', time: '21:00', venue: 'SoFi Stadium, Los Angeles' },
  'R32-13': { date: '2026-07-02', time: '18:00', venue: 'BC Place, Vancouver' },
  'R32-14': { date: '2026-07-03', time: '21:00', venue: 'Hard Rock Stadium, Miami' },
  'R32-15': { date: '2026-07-03', time: '18:00', venue: 'Arrowhead Stadium, Kansas City' },
  'R32-16': { date: '2026-07-03', time: '21:00', venue: 'AT&T Stadium, Dallas' },
  // R16 — July 4–7
  'R16-01': { date: '2026-07-04', time: '18:00', venue: 'NRG Stadium, Houston' },
  'R16-02': { date: '2026-07-04', time: '21:00', venue: 'Lincoln Financial Field, Philadelphia' },
  'R16-03': { date: '2026-07-05', time: '21:00', venue: 'MetLife Stadium, New York' },
  'R16-04': { date: '2026-07-05', time: '21:00', venue: 'Estadio Azteca, Mexico City' },
  'R16-05': { date: '2026-07-06', time: '18:00', venue: 'AT&T Stadium, Dallas' },
  'R16-06': { date: '2026-07-06', time: '21:00', venue: 'Lumen Field, Seattle' },
  'R16-07': { date: '2026-07-07', time: '18:00', venue: 'Mercedes-Benz Stadium, Atlanta' },
  'R16-08': { date: '2026-07-07', time: '21:00', venue: 'BC Place, Vancouver' },
  // QF — July 9–11
  'QF-01':  { date: '2026-07-09', time: '20:00', venue: 'Gillette Stadium, Boston' },
  'QF-02':  { date: '2026-07-10', time: '20:00', venue: 'SoFi Stadium, Los Angeles' },
  'QF-03':  { date: '2026-07-11', time: '21:00', venue: 'Hard Rock Stadium, Miami' },
  'QF-04':  { date: '2026-07-11', time: '20:00', venue: 'Arrowhead Stadium, Kansas City' },
  // SF — July 14–15
  'SF-01':  { date: '2026-07-14', time: '20:00', venue: 'AT&T Stadium, Dallas' },
  'SF-02':  { date: '2026-07-15', time: '19:00', venue: 'Mercedes-Benz Stadium, Atlanta' },
  'THIRD':  { date: '2026-07-18', time: '21:00', venue: 'Hard Rock Stadium, Miami' },
  'FINAL':  { date: '2026-07-19', time: '20:00', venue: 'MetLife Stadium, New York' },
};

// ── Ensure third-place tracking table exists ──────────────────────
function ensureThirdPlaceTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS third_place_tracking (
      group_code TEXT PRIMARY KEY,
      team_id    TEXT REFERENCES teams(id),
      recorded_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

// ── Ensure knockout match stubs exist in the DB ───────────────────
function ensureKnockoutStubs() {
  const db = getDb();
  ensureThirdPlaceTable();

  const insertMatch = db.prepare(`
    INSERT OR IGNORE INTO matches (id, stage, status, scheduled_date, scheduled_time, venue)
    VALUES (?, ?, 'SCHEDULED', ?, ?, ?)
  `);
  // Use REPLACE so slot names get updated when the bracket definition changes
  const insertSlot = db.prepare(`
    INSERT OR REPLACE INTO bracket_slots (match_id, slot_home, slot_away)
    VALUES (?, ?, ?)
  `);

  const allBracket = [
    ...R32_BRACKET.map(m => ({ ...m, stage: 'R32' })),
    ...R16_BRACKET.map(m => ({ ...m, stage: 'R16', homeSlot: `W(${m.homeSource})`, awaySlot: `W(${m.awaySource})` })),
    ...QF_BRACKET.map(m => ({ ...m, stage: 'QF', homeSlot: `W(${m.homeSource})`, awaySlot: `W(${m.awaySource})` })),
    ...SF_BRACKET.map(m => ({ ...m, stage: 'SF', homeSlot: `W(${m.homeSource})`, awaySlot: `W(${m.awaySource})` })),
    { matchId: FINAL.matchId, stage: 'F', homeSlot: `W(${FINAL.homeSource})`, awaySlot: `W(${FINAL.awaySource})` },
    { matchId: THIRD_PLACE.matchId, stage: 'TPP', homeSlot: `L(${THIRD_PLACE.homeSource})`, awaySlot: `L(${THIRD_PLACE.awaySource})` },
  ];

  try {
    db.exec('BEGIN');
    for (const m of allBracket) {
      const stage = m.stage === 'TPP' ? 'THIRD_PLACE' : m.stage;
      const sched = KNOCKOUT_SCHEDULE[m.matchId] || { date: '2026-07-15', time: null, venue: null };
      insertMatch.run([m.matchId, stage, sched.date, sched.time, sched.venue]);
      insertSlot.run([m.matchId, m.homeSlot, m.awaySlot]);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    insertMatch.finalize();
    insertSlot.finalize();
  }

  console.log('🏆 Knockout match stubs ensured');
}

// ── Get ranked group standings ────────────────────────────────────
function getGroupStandings(groupCode) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM teams WHERE group_code = ?
    ORDER BY gs_pts DESC, (gs_gf - gs_ga) DESC, gs_gf DESC, name ASC
  `).all(groupCode);
}

// ── Check if all matches in a group are complete ──────────────────
function isGroupComplete(groupCode) {
  const db = getDb();
  const result = db.prepare(`
    SELECT COUNT(*) as total,
           SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as done
    FROM matches WHERE stage = 'GROUP' AND group_code = ?
  `).get(groupCode);
  return result && result.total > 0 && result.total === result.done;
}

// ── After a group completes: fill R32 slots for 1st and 2nd place ─
function advanceGroupToR32(groupCode) {
  if (!isGroupComplete(groupCode)) return { advanced: false, reason: 'Group not complete' };

  const db = getDb();
  const standings = getGroupStandings(groupCode);
  if (standings.length < 2) return { advanced: false, reason: 'Not enough teams' };

  const first  = standings[0];
  const second = standings[1];
  const third  = standings[2];

  console.log(`🏆 Group ${groupCode} complete: 1st=${first.name}, 2nd=${second.name}, 3rd=${third?.name}`);

  // Find R32 matches for this group
  const slot1st = `1${groupCode}`;
  const slot2nd = `2${groupCode}`;

  const matchFor1st = R32_BRACKET.find(m => m.homeSlot === slot1st || m.awaySlot === slot1st);
  const matchFor2nd = R32_BRACKET.find(m => m.homeSlot === slot2nd || m.awaySlot === slot2nd);

  if (matchFor1st) {
    const isHome1st = matchFor1st.homeSlot === slot1st;
    db.prepare(`
      UPDATE matches SET ${isHome1st ? 'home_team' : 'away_team'} = ? WHERE id = ?
    `).run([first.id, matchFor1st.matchId]);
  }

  if (matchFor2nd) {
    const isHome2nd = matchFor2nd.homeSlot === slot2nd;
    db.prepare(`
      UPDATE matches SET ${isHome2nd ? 'home_team' : 'away_team'} = ? WHERE id = ?
    `).run([second.id, matchFor2nd.matchId]);
  }

  // Store third-place team for best-3rd calculation
  if (third) {
    ensureThirdPlaceTable();
    db.prepare(`
      INSERT OR REPLACE INTO third_place_tracking (group_code, team_id)
      VALUES (?, ?)
    `).run([groupCode, third.id]);
  }

  // Check if all 12 groups are complete → fill 3rd-place R32 slots
  const allGroupsComplete = 'ABCDEFGHIJKL'.split('').every(g => isGroupComplete(g));
  if (allGroupsComplete) {
    fillBest8ThirdPlace();
  }

  return { advanced: true, first: first.name, second: second.name, third: third?.name };
}

// ── Maps which R32 match (and side) corresponds to each 3rd-place slot ──
// Key is the winner slot label (e.g. '1A'), value is { matchId, side }
const THIRD_PLACE_MATCH_MAP = {
  '1A': { matchId: 'R32-07', side: 'away' },
  '1B': { matchId: 'R32-13', side: 'away' },
  '1D': { matchId: 'R32-09', side: 'away' },
  '1E': { matchId: 'R32-02', side: 'away' },
  '1G': { matchId: 'R32-10', side: 'away' },
  '1I': { matchId: 'R32-05', side: 'away' },
  '1K': { matchId: 'R32-15', side: 'away' },
  '1L': { matchId: 'R32-08', side: 'away' },
};

// ── After all groups: determine best 8 third-place teams ──────────
function fillBest8ThirdPlace() {
  const db = getDb();
  ensureThirdPlaceTable();

  // Get all third-place teams from dedicated tracking table
  const rows = db.prepare('SELECT team_id FROM third_place_tracking').all();

  const thirdPlaceTeams = rows.map(r => {
    return db.prepare('SELECT * FROM teams WHERE id = ?').get(r.team_id);
  }).filter(Boolean);

  // Rank by: pts DESC, gd DESC, gf DESC, elo DESC
  const ranked = thirdPlaceTeams.sort((a, b) =>
    b.gs_pts - a.gs_pts ||
    (b.gs_gf - b.gs_ga) - (a.gs_gf - a.gs_ga) ||
    b.gs_gf - a.gs_gf ||
    b.elo - a.elo
  );

  const best8 = ranked.slice(0, 8);
  console.log('🏆 Best 8 third-place teams:', best8.map(t => t.name).join(', '));

  // Build group→team lookup
  const thirdByGroup = {};
  for (const t of best8) thirdByGroup[t.group_code] = t;

  // Look up the official combination for these 8 groups
  const key = best8.map(t => t.group_code).sort().join('');
  const combo = THIRD_PLACE_COMBINATIONS[key];
  if (!combo) {
    console.warn(`⚠ No combination found for groups ${key} — using fallback ranking order`);
    // Fallback: assign in ranking order (not perfectly accurate but safe)
    const thirdMatches = [
      { matchId: 'R32-02', side: 'away' }, { matchId: 'R32-05', side: 'away' },
      { matchId: 'R32-07', side: 'away' }, { matchId: 'R32-08', side: 'away' },
      { matchId: 'R32-09', side: 'away' }, { matchId: 'R32-10', side: 'away' },
      { matchId: 'R32-13', side: 'away' }, { matchId: 'R32-15', side: 'away' },
    ];
    best8.forEach((team, i) => {
      const { matchId, side } = thirdMatches[i];
      db.prepare(`UPDATE matches SET ${side}_team = ? WHERE id = ?`).run([team.id, matchId]);
    });
  } else {
    // Assign each winner slot's opponent using the combination table
    for (const [winnerSlot, { matchId, side }] of Object.entries(THIRD_PLACE_MATCH_MAP)) {
      const opponentGroup = combo[winnerSlot];
      const team = thirdByGroup[opponentGroup];
      if (team) {
        db.prepare(`UPDATE matches SET ${side}_team = ? WHERE id = ?`).run([team.id, matchId]);
      }
    }
  }

  console.log('✅ Best 8 third-place bracket filled');
}

// ── After a knockout match: advance winner to next round ──────────
function advanceKnockoutWinner(matchId, winnerId) {
  const db = getDb();

  // Third-place playoff: place the loser only when a real winner is recorded
  if (matchId === 'SF-01' || matchId === 'SF-02') {
    const row = db.prepare('SELECT winner, home_team, away_team FROM matches WHERE id = ?').get(matchId);
    if (row?.winner) {
      const loserId = row.winner === row.home_team ? row.away_team : row.home_team;
      if (loserId) {
        const isFirst = matchId === 'SF-01';
        db.prepare(`UPDATE matches SET ${isFirst ? 'home_team' : 'away_team'} = ? WHERE id = 'THIRD'`).run([loserId]);
        console.log(`🥉 ${loserId} placed in THIRD (${isFirst ? 'home' : 'away'})`);
      }
    }
  }

  // Find which R16/QF/SF/Final match uses this match's winner
  const allNext = [...R16_BRACKET, ...QF_BRACKET, ...SF_BRACKET, FINAL];

  for (const nextMatch of allNext) {
    if (nextMatch.homeSource === matchId) {
      db.prepare('UPDATE matches SET home_team = ? WHERE id = ?').run([winnerId, nextMatch.matchId]);
      console.log(`⚽ ${winnerId} advances to ${nextMatch.matchId} (home)`);
      return;
    }
    if (nextMatch.awaySource === matchId) {
      db.prepare('UPDATE matches SET away_team = ? WHERE id = ?').run([winnerId, nextMatch.matchId]);
      console.log(`⚽ ${winnerId} advances to ${nextMatch.matchId} (away)`);
      return;
    }
  }
}

// ── Prediction-based group placements (module-scope, shared) ─────
// Uses stored match predictions (most-likely outcome) for remaining group
// matches; falls back to ELO for any match that has no prediction yet.
function getPredictionBasedPlacements() {
  const db = getDb();
  const teams = db.prepare('SELECT * FROM teams').all();
  const teamsById = {};
  for (const t of teams) teamsById[t.id] = t;

  const allGroupPreds = db.prepare(`
    SELECT p.match_id, p.prob_home, p.prob_draw, p.prob_away,
           m.home_team, m.away_team, m.status, m.group_code
    FROM predictions p
    JOIN matches m ON p.match_id = m.id
    WHERE m.stage = 'GROUP'
    ORDER BY p.id DESC
  `).all();
  const predByMatch = {};
  for (const r of allGroupPreds) {
    if (!predByMatch[r.match_id]) predByMatch[r.match_id] = r;
  }

  const p = {};
  const thirds = [];

  for (const g of 'ABCDEFGHIJKL'.split('')) {
    if (isGroupComplete(g)) {
      const ranked = getGroupStandings(g);
      p[`1${g}`] = ranked[0];
      p[`2${g}`] = ranked[1];
      if (ranked[2]) thirds.push({ team: ranked[2], pts: ranked[2].gs_pts, gd: ranked[2].gs_gf - ranked[2].gs_ga, gf: ranked[2].gs_gf });
      continue;
    }

    const groupTeams = teams.filter(t => t.group_code === g);
    const pts = {}, gd = {}, gf = {};
    for (const t of groupTeams) {
      pts[t.id] = t.gs_pts;
      gd[t.id]  = t.gs_gf - t.gs_ga;
      gf[t.id]  = t.gs_gf;
    }

    const remaining = db.prepare(`
      SELECT id, home_team, away_team FROM matches
      WHERE stage = 'GROUP' AND group_code = ? AND status != 'COMPLETED'
    `).all(g);

    for (const m of remaining) {
      const pred = predByMatch[m.id];
      let homeWin, awayWin;
      if (pred) {
        homeWin = pred.prob_home >= pred.prob_draw && pred.prob_home >= pred.prob_away;
        awayWin = pred.prob_away > pred.prob_home && pred.prob_away >= pred.prob_draw;
      } else {
        const homeTeam = teamsById[m.home_team];
        const awayTeam = teamsById[m.away_team];
        homeWin = homeTeam && awayTeam && homeTeam.elo >= awayTeam.elo;
        awayWin = !homeWin;
      }

      if (homeWin) {
        pts[m.home_team] = (pts[m.home_team] || 0) + 3;
        gd[m.home_team]  = (gd[m.home_team]  || 0) + 1;
        gd[m.away_team]  = (gd[m.away_team]  || 0) - 1;
        gf[m.home_team]  = (gf[m.home_team]  || 0) + 1;
      } else if (awayWin) {
        pts[m.away_team] = (pts[m.away_team] || 0) + 3;
        gd[m.away_team]  = (gd[m.away_team]  || 0) + 1;
        gd[m.home_team]  = (gd[m.home_team]  || 0) - 1;
        gf[m.away_team]  = (gf[m.away_team]  || 0) + 1;
      } else {
        pts[m.home_team] = (pts[m.home_team] || 0) + 1;
        pts[m.away_team] = (pts[m.away_team] || 0) + 1;
        gf[m.home_team]  = (gf[m.home_team]  || 0) + 1;
        gf[m.away_team]  = (gf[m.away_team]  || 0) + 1;
      }
    }

    const ranked = [...groupTeams].sort((a, b) =>
      (pts[b.id] || 0) - (pts[a.id] || 0) ||
      (gd[b.id]  || 0) - (gd[a.id]  || 0) ||
      (gf[b.id]  || 0) - (gf[a.id]  || 0) ||
      a.fifa_rank - b.fifa_rank
    );

    p[`1${g}`] = ranked[0];
    p[`2${g}`] = ranked[1];
    if (ranked[2]) thirds.push({ team: ranked[2], pts: pts[ranked[2].id] || 0, gd: gd[ranked[2].id] || 0, gf: gf[ranked[2].id] || 0 });
  }

  const best8thirds = thirds.sort((a, b) =>
    b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || b.team.elo - a.team.elo
  ).slice(0, 8);

  // Assign 3rd-place teams to the correct winner slots using the FIFA combination table
  const thirdByGroup = {};
  for (const { team } of best8thirds) thirdByGroup[team.group_code] = team;
  const key = best8thirds.map(({ team }) => team.group_code).sort().join('');
  const combo = THIRD_PLACE_COMBINATIONS[key];
  if (combo) {
    for (const [winnerSlot, groupCode] of Object.entries(combo)) {
      p[`3rd-${winnerSlot}`] = thirdByGroup[groupCode]; // e.g. p['3rd-1A'] = teamFromGroupE
    }
  } else {
    // Fallback: assign by rank order to each winner slot
    const slots = ['3rd-1A','3rd-1B','3rd-1D','3rd-1E','3rd-1G','3rd-1I','3rd-1K','3rd-1L'];
    best8thirds.forEach(({ team }, i) => { if (slots[i]) p[slots[i]] = team; });
  }

  return p;
}

// ── Simulate full knockout bracket using x-factor prediction engine ─
// Called once all 72 group predictions exist. Fills R32 match stubs with
// predicted group qualifiers, runs predict() for every knockout match,
// and resolves predicted draws via ELO + H2H. Winners advance through
// R16 → QF → SF → Final. Results are persisted (predictions table +
// home_team/away_team fields in matches table) so the bracket view
// updates automatically.
async function simulateKnockoutBracket() {
  const db = getDb();
  const { predict } = require('./predictionEngine');
  const { h2hToProbs } = require('./h2hService');

  async function resolveWinner(matchId, homeTeam, awayTeam) {
    const pred = await predict(matchId, true);
    const { prob_home, prob_draw, prob_away, most_likely_score } = pred;

    let winner, tiebreaker = null;

    if (prob_home > prob_draw && prob_home > prob_away) {
      winner = homeTeam;
    } else if (prob_away > prob_draw && prob_away > prob_home) {
      winner = awayTeam;
    } else {
      // Draw predicted — resolve via H2H then ELO
      tiebreaker = 'ELO';
      try {
        const h2h = await h2hToProbs(homeTeam.id, awayTeam.id);
        if (h2h && h2h.matchCount >= 2 && Math.abs(h2h.weightedAdvantage) > 0.1) {
          winner = h2h.weightedAdvantage > 0 ? homeTeam : awayTeam;
          tiebreaker = `H2H (${h2h.matchCount} meetings, adv=${h2h.weightedAdvantage.toFixed(2)})`;
        } else {
          winner = homeTeam.elo >= awayTeam.elo ? homeTeam : awayTeam;
        }
      } catch {
        winner = homeTeam.elo >= awayTeam.elo ? homeTeam : awayTeam;
      }
    }

    return { winner, pred, tiebreaker };
  }

  // 1. Compute predicted group standings from the 72 group predictions
  const db2 = getDb();
  const predCount = db2.prepare(
    "SELECT COUNT(DISTINCT match_id) as n FROM predictions p JOIN matches m ON p.match_id = m.id WHERE m.stage = 'GROUP'"
  ).get().n;
  if (predCount < 72) {
    throw new Error(`Only ${predCount}/72 group predictions exist — generate all 72 first before simulating the bracket`);
  }
  const placements = getPredictionBasedPlacements();

  // R32 verification: confirm each slot has a predicted team
  const r32Pairings = R32_BRACKET.map(({ matchId, homeSlot, awaySlot }) => ({
    matchId,
    homeSlot,
    home: placements[homeSlot] ? { id: placements[homeSlot].id, name: placements[homeSlot].name, flag: placements[homeSlot].flag } : null,
    awaySlot,
    away: placements[awaySlot] ? { id: placements[awaySlot].id, name: placements[awaySlot].name, flag: placements[awaySlot].flag } : null,
    verified: !!(placements[homeSlot] && placements[awaySlot]),
  }));

  const results = [];

  // Helper: read real winner already recorded in DB (null if unplayed)
  const getRealWinner = (matchId) => {
    const row = db.prepare('SELECT winner, home_team, away_team FROM matches WHERE id = ?').get(matchId);
    if (!row?.winner) return null;
    return db.prepare('SELECT * FROM teams WHERE id = ?').get(row.winner);
  };

  // 2. Simulate R32 — skip matches with a real result, fill+predict the rest
  console.log('🏟️  Simulating R32…');
  for (const { matchId, homeSlot, awaySlot } of R32_BRACKET) {
    // If this match already has a real recorded winner, respect it and carry forward
    const realWinner = getRealWinner(matchId);
    if (realWinner) {
      advanceKnockoutWinner(matchId, realWinner.id);
      const dbRow = db.prepare('SELECT home_team, away_team FROM matches WHERE id = ?').get(matchId);
      const homeTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(dbRow.home_team);
      const awayTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(dbRow.away_team);
      results.push({
        matchId, stage: 'R32', real: true,
        home: { id: homeTeam?.id, name: homeTeam?.name, flag: homeTeam?.flag, slot: homeSlot },
        away: { id: awayTeam?.id, name: awayTeam?.name, flag: awayTeam?.flag, slot: awaySlot },
        winner: { id: realWinner.id, name: realWinner.name, flag: realWinner.flag },
      });
      console.log(`  ${matchId}: ${homeTeam?.name} vs ${awayTeam?.name} → ${realWinner.name} (REAL)`);
      continue;
    }

    const homeTeam = placements[homeSlot];
    const awayTeam = placements[awaySlot];
    if (!homeTeam || !awayTeam) {
      console.warn(`  ⚠ ${matchId}: missing team(s) — ${homeSlot}=${homeTeam?.name}, ${awaySlot}=${awayTeam?.name}`);
      continue;
    }

    db.prepare('UPDATE matches SET home_team = ?, away_team = ? WHERE id = ?')
      .run([homeTeam.id, awayTeam.id, matchId]);

    const { winner, pred, tiebreaker } = await resolveWinner(matchId, homeTeam, awayTeam);
    advanceKnockoutWinner(matchId, winner.id);

    results.push({
      matchId, stage: 'R32', real: false,
      home: { id: homeTeam.id, name: homeTeam.name, flag: homeTeam.flag, slot: homeSlot },
      away: { id: awayTeam.id, name: awayTeam.name, flag: awayTeam.flag, slot: awaySlot },
      winner: { id: winner.id, name: winner.name, flag: winner.flag },
      prob_home: +pred.prob_home.toFixed(3),
      prob_draw: +pred.prob_draw.toFixed(3),
      prob_away: +pred.prob_away.toFixed(3),
      most_likely_score: pred.most_likely_score,
      tiebreaker,
    });
    console.log(`  ${matchId}: ${homeTeam.name} vs ${awayTeam.name} → ${winner.name}${tiebreaker ? ` (${tiebreaker})` : ''}`);
  }

  // 3. Simulate R16, QF, SF, Final — skip matches with real results
  const knockoutRounds = [
    { defs: R16_BRACKET, stage: 'R16' },
    { defs: QF_BRACKET,  stage: 'QF'  },
    { defs: SF_BRACKET,  stage: 'SF'  },
    { defs: [FINAL],     stage: 'Final' },
  ];

  for (const { defs, stage } of knockoutRounds) {
    console.log(`🏟️  Simulating ${stage}…`);
    for (const { matchId } of defs) {
      // Respect real results already in the DB
      const realWinner = getRealWinner(matchId);
      if (realWinner) {
        advanceKnockoutWinner(matchId, realWinner.id);
        const dbRow = db.prepare('SELECT home_team, away_team FROM matches WHERE id = ?').get(matchId);
        const homeTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(dbRow.home_team);
        const awayTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(dbRow.away_team);
        results.push({
          matchId, stage, real: true,
          home: { id: homeTeam?.id, name: homeTeam?.name, flag: homeTeam?.flag },
          away: { id: awayTeam?.id, name: awayTeam?.name, flag: awayTeam?.flag },
          winner: { id: realWinner.id, name: realWinner.name, flag: realWinner.flag },
        });
        console.log(`  ${matchId}: ${homeTeam?.name} vs ${awayTeam?.name} → ${realWinner.name} (REAL)`);
        continue;
      }

      const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
      if (!match?.home_team || !match?.away_team) {
        console.warn(`  ⚠ ${matchId}: teams not filled yet`);
        continue;
      }

      const homeTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(match.home_team);
      const awayTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(match.away_team);

      const { winner, pred, tiebreaker } = await resolveWinner(matchId, homeTeam, awayTeam);
      advanceKnockoutWinner(matchId, winner.id);

      // For semi-finals: place loser directly into 3rd-place match (don't rely on DB winner field)
      if (matchId === 'SF-01' || matchId === 'SF-02') {
        const loser = winner.id === homeTeam.id ? awayTeam : homeTeam;
        const isFirst = matchId === 'SF-01';
        db.prepare(`UPDATE matches SET ${isFirst ? 'home_team' : 'away_team'} = ? WHERE id = 'THIRD'`).run([loser.id]);
        console.log(`🥉 ${loser.name} placed in THIRD (${isFirst ? 'home' : 'away'})`);
      }

      results.push({
        matchId, stage, real: false,
        home: { id: homeTeam.id, name: homeTeam.name, flag: homeTeam.flag },
        away: { id: awayTeam.id, name: awayTeam.name, flag: awayTeam.flag },
        winner: { id: winner.id, name: winner.name, flag: winner.flag },
        prob_home: +pred.prob_home.toFixed(3),
        prob_draw: +pred.prob_draw.toFixed(3),
        prob_away: +pred.prob_away.toFixed(3),
        most_likely_score: pred.most_likely_score,
        tiebreaker,
      });
      console.log(`  ${matchId}: ${homeTeam.name} vs ${awayTeam.name} → ${winner.name}${tiebreaker ? ` (${tiebreaker})` : ''}`);
    }
  }

  // 4. Simulate 3rd-place match if both teams are filled
  const thirdMatch = db.prepare('SELECT * FROM matches WHERE id = ?').get('THIRD');
  if (thirdMatch?.home_team && thirdMatch?.away_team) {
    console.log('🏟️  Simulating Third-place playoff…');
    const realWinner = getRealWinner('THIRD');
    const homeTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(thirdMatch.home_team);
    const awayTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(thirdMatch.away_team);
    if (realWinner) {
      results.push({ matchId: 'THIRD', stage: 'THIRD', real: true,
        home: { id: homeTeam?.id, name: homeTeam?.name, flag: homeTeam?.flag },
        away: { id: awayTeam?.id, name: awayTeam?.name, flag: awayTeam?.flag },
        winner: { id: realWinner.id, name: realWinner.name, flag: realWinner.flag } });
    } else if (homeTeam && awayTeam) {
      const { winner: tw, pred: tp, tiebreaker: ttb } = await resolveWinner('THIRD', homeTeam, awayTeam);
      results.push({ matchId: 'THIRD', stage: 'THIRD', real: false,
        home: { id: homeTeam.id, name: homeTeam.name, flag: homeTeam.flag },
        away: { id: awayTeam.id, name: awayTeam.name, flag: awayTeam.flag },
        winner: { id: tw.id, name: tw.name, flag: tw.flag },
        prob_home: +tp.prob_home.toFixed(3), prob_draw: +tp.prob_draw.toFixed(3), prob_away: +tp.prob_away.toFixed(3),
        most_likely_score: tp.most_likely_score, tiebreaker: ttb });
      console.log(`  THIRD: ${homeTeam.name} vs ${awayTeam.name} → ${tw.name}`);
    }
  }

  const finalMatch = results.find(r => r.matchId === 'FINAL');
  const champion = finalMatch?.winner || null;

  // Build group placements summary for verification output
  const groupSummary = {};
  for (const g of 'ABCDEFGHIJKL'.split('')) {
    groupSummary[g] = {
      '1st': placements[`1${g}`] ? { id: placements[`1${g}`].id, name: placements[`1${g}`].name, flag: placements[`1${g}`].flag } : null,
      '2nd': placements[`2${g}`] ? { id: placements[`2${g}`].id, name: placements[`2${g}`].name, flag: placements[`2${g}`].flag } : null,
    };
  }
  const thirdSlots = ['3rd-1A','3rd-1B','3rd-1D','3rd-1E','3rd-1G','3rd-1I','3rd-1K','3rd-1L'];
  const best8Third = thirdSlots.map(s => placements[s]).filter(Boolean)
    .map(t => ({ id: t.id, name: t.name, flag: t.flag }));

  return {
    groupStandings: groupSummary,
    best8ThirdPlace: best8Third,
    r32Pairings,
    bracket: results,
    champion,
  };
}

// ── Monte Carlo simulation ────────────────────────────────────────
const SIM_COUNT = 50000;

let simulationCache = null;

function invalidateSimulationCache() {
  simulationCache = null;
}

// ── Monte Carlo simulation ────────────────────────────────────────

function eloGroupMatchOutcome(eloA, eloB) {
  // Returns 'A', 'D', or 'B' using same draw model as predictionEngine
  const eloAdv = eloA - eloB;
  const rawWin = 1 / (1 + Math.exp(-eloAdv / 200));
  const pDraw = 0.28 * Math.exp(-Math.pow(eloAdv / 350, 2));
  const pA = rawWin * (1 - pDraw);
  const r = Math.random();
  if (r < pA) return 'A';
  if (r < pA + pDraw) return 'D';
  return 'B';
}

function eloKnockoutWinner(teamA, teamB) {
  // No draws in knockouts — straight ELO win probability
  const pA = 1 / (1 + Math.pow(10, (teamB.elo - teamA.elo) / 400));
  return Math.random() < pA ? teamA : teamB;
}

// Use DC prediction probabilities when available; fall back to ELO for unknown pairings.
// predMap key = "homeId|awayId" → { pH, pD, pA }.
// Returns 'A' (first team wins), 'D' (draw), 'B' (second team wins).
function dcGroupMatchOutcome(a, b, predMap) {
  const predAHome = predMap && predMap[`${a.id}|${b.id}`];
  const predBHome = predMap && predMap[`${b.id}|${a.id}`];
  let pH, pD, pA;
  if (predAHome) {
    pH = predAHome.pH; pD = predAHome.pD; pA = predAHome.pA;
  } else if (predBHome) {
    // b is the home side — swap win probabilities
    pH = predBHome.pA; pD = predBHome.pD; pA = predBHome.pH;
  } else {
    return eloGroupMatchOutcome(a.elo, b.elo);
  }
  const r = Math.random();
  if (r < pH) return 'A';
  if (r < pH + pD) return 'D';
  return 'B';
}

function simulateGroupOnce(teams, predMap) {
  const stats = {};
  teams.forEach(t => { stats[t.id] = { ...t, simPts: 0, simGD: 0, simGF: 0 }; });

  // Round-robin: every pair plays once
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const a = teams[i];
      const b = teams[j];
      const outcome = dcGroupMatchOutcome(a, b, predMap);
      // Simple goal model: win = 1-0, draw = 0-0 (only used for GD/GF tiebreaker)
      if (outcome === 'A') {
        stats[a.id].simPts += 3;
        stats[a.id].simGD += 1; stats[a.id].simGF += 1;
        stats[b.id].simGD -= 1;
      } else if (outcome === 'D') {
        stats[a.id].simPts += 1;
        stats[b.id].simPts += 1;
      } else {
        stats[b.id].simPts += 3;
        stats[b.id].simGD += 1; stats[b.id].simGF += 1;
        stats[a.id].simGD -= 1;
      }
    }
  }

  return Object.values(stats).sort((a, b) =>
    b.simPts - a.simPts || b.simGD - a.simGD || b.simGF - a.simGF || b.elo - a.elo
  );
}

function simulateTournamentOnce(groupedTeams, predMap) {
  // 1. Simulate all 12 groups
  const standings = {};
  for (const [g, teams] of Object.entries(groupedTeams)) {
    standings[g] = simulateGroupOnce(teams, predMap);
  }

  // 2. Map slots to teams
  const slot = {};
  for (const [g, ranked] of Object.entries(standings)) {
    slot[`1${g}`] = ranked[0];
    slot[`2${g}`] = ranked[1];
    if (ranked[2]) slot[`3${g}`] = ranked[2];
  }

  // 3. Best 8 third-place teams (ranked by pts, GD, GF, ELO)
  const best8 = 'ABCDEFGHIJKL'.split('')
    .map(g => slot[`3${g}`])
    .filter(Boolean)
    .sort((a, b) => b.simPts - a.simPts || b.simGD - a.simGD || b.simGF - a.simGF || b.elo - a.elo)
    .slice(0, 8);

  // Assign to correct winner slots via combination table
  const thirdByGroupSim = {};
  for (const t of best8) thirdByGroupSim[t.group_code] = t;
  const simKey = best8.map(t => t.group_code).sort().join('');
  const simCombo = THIRD_PLACE_COMBINATIONS[simKey];
  if (simCombo) {
    for (const [winnerSlot, groupCode] of Object.entries(simCombo)) {
      slot[`3rd-${winnerSlot}`] = thirdByGroupSim[groupCode];
    }
  } else {
    const simSlots = ['3rd-1A','3rd-1B','3rd-1D','3rd-1E','3rd-1G','3rd-1I','3rd-1K','3rd-1L'];
    best8.forEach((t, i) => { if (simSlots[i]) slot[simSlots[i]] = t; });
  }

  // 4. Run knockout rounds following the actual bracket
  const w = {}; // matchId -> winning team

  for (const { matchId, homeSlot, awaySlot } of R32_BRACKET) {
    const home = slot[homeSlot];
    const away = slot[awaySlot];
    if (home && away) w[matchId] = eloKnockoutWinner(home, away);
  }
  for (const { matchId, homeSource, awaySource } of R16_BRACKET) {
    const home = w[homeSource];
    const away = w[awaySource];
    if (home && away) w[matchId] = eloKnockoutWinner(home, away);
  }
  for (const { matchId, homeSource, awaySource } of QF_BRACKET) {
    const home = w[homeSource];
    const away = w[awaySource];
    if (home && away) w[matchId] = eloKnockoutWinner(home, away);
  }
  for (const { matchId, homeSource, awaySource } of SF_BRACKET) {
    const home = w[homeSource];
    const away = w[awaySource];
    if (home && away) w[matchId] = eloKnockoutWinner(home, away);
  }

  const finHome = w[FINAL.homeSource];
  const finAway = w[FINAL.awaySource];
  return finHome && finAway ? eloKnockoutWinner(finHome, finAway) : null;
}

function runTournamentSimulation(db) {
  if (simulationCache) return simulationCache;

  const allTeams = db.prepare('SELECT * FROM teams').all();

  const groupedTeams = {};
  for (const t of allTeams) {
    if (!groupedTeams[t.group_code]) groupedTeams[t.group_code] = [];
    groupedTeams[t.group_code].push(t);
  }

  // Build predMap from DC predictions and actual results.
  // Key = "homeId|awayId"; value = { pH, pD, pA } where completed matches
  // use deterministic {1,0,0}/{0,1,0}/{0,0,1} so they always resolve the same way.
  const predMap = {};
  const groupRows = db.prepare(`
    SELECT m.home_team, m.away_team, m.status, m.home_score, m.away_score,
           p.prob_home, p.prob_draw, p.prob_away
    FROM matches m
    LEFT JOIN predictions p ON p.match_id = m.id
      AND p.id = (SELECT MAX(id) FROM predictions WHERE match_id = m.id)
    WHERE m.stage = 'GROUP' AND m.home_team IS NOT NULL AND m.away_team IS NOT NULL
  `).all();
  for (const r of groupRows) {
    const key = `${r.home_team}|${r.away_team}`;
    if (r.status === 'COMPLETED' && r.home_score != null) {
      const hs = Number(r.home_score), as_ = Number(r.away_score);
      predMap[key] = hs > as_ ? { pH: 1, pD: 0, pA: 0 }
                   : hs < as_ ? { pH: 0, pD: 0, pA: 1 }
                   :            { pH: 0, pD: 1, pA: 0 };
    } else if (r.prob_home != null) {
      predMap[key] = { pH: r.prob_home, pD: r.prob_draw, pA: r.prob_away };
    }
  }

  const wins = {};
  allTeams.forEach(t => { wins[t.id] = 0; });

  for (let i = 0; i < SIM_COUNT; i++) {
    const winner = simulateTournamentOnce(groupedTeams, predMap);
    if (winner) wins[winner.id] = (wins[winner.id] || 0) + 1;
  }

  simulationCache = allTeams
    .map(t => ({
      teamId: t.id,
      name: t.name,
      flag: t.flag,
      elo: t.elo,
      probability: (wins[t.id] || 0) / SIM_COUNT,
    }))
    .sort((a, b) => b.probability - a.probability);

  return simulationCache;
}

// ── Road to the Final snapshots ───────────────────────────────────
function generateRoadToFinal() {
  const db = getDb();

  const teams = db.prepare('SELECT * FROM teams').all();
  const teamsById = {};
  for (const t of teams) teamsById[t.id] = t;

  const dbMatches = db.prepare(
    "SELECT id, stage, status, home_team, away_team, home_score, away_score, winner FROM matches WHERE stage IN ('R32','R16','QF','SF','F') ORDER BY id"
  ).all();
  const matchById = {};
  for (const m of dbMatches) matchById[m.id] = m;

  // Load latest Dixon-Coles predictions for knockout matches
  const predRows = db.prepare(
    "SELECT match_id, prob_home, prob_away FROM predictions WHERE match_id IN (SELECT id FROM matches WHERE stage IN ('R32','R16','QF','SF','F','FINAL','THIRD')) ORDER BY generated_at DESC"
  ).all();
  const predByMatch = {};
  for (const p of predRows) {
    if (!predByMatch[p.match_id]) predByMatch[p.match_id] = p; // first = latest
  }

  const stageOrder = ['R32', 'R16', 'QF', 'SF', 'F'];
  const byStage = { R32: [], R16: [], QF: [], SF: [], F: [] };
  for (const m of dbMatches) {
    if (byStage[m.stage]) byStage[m.stage].push(m);
  }
  const stageComplete = {};
  for (const s of stageOrder) {
    const ms = byStage[s];
    stageComplete[s] = ms.length > 0 && ms.every(m => m.status === 'COMPLETED');
  }

  // ELO win probability for knockout (no draw)
  function eloP(a, b) {
    return Math.round(100 / (1 + Math.pow(10, (b.elo - a.elo) / 400)));
  }

  // Model 1: ELO-based group placements (when group not done, rank by ELO)
  function getEloBasedPlacements() {
    const p = {};
    const thirds = [];
    for (const g of 'ABCDEFGHIJKL'.split('')) {
      const ranked = isGroupComplete(g)
        ? getGroupStandings(g)
        : teams.filter(t => t.group_code === g).sort((a, b) => b.elo - a.elo);
      p[`1${g}`] = ranked[0];
      p[`2${g}`] = ranked[1];
      if (ranked[2]) thirds.push(ranked[2]);
    }
    const best8elo = thirds.sort((a, b) => b.elo - a.elo).slice(0, 8);
    const thirdByGroupElo = {};
    for (const t of best8elo) thirdByGroupElo[t.group_code] = t;
    const eloKey = best8elo.map(t => t.group_code).sort().join('');
    const eloCombo = THIRD_PLACE_COMBINATIONS[eloKey];
    if (eloCombo) {
      for (const [winnerSlot, groupCode] of Object.entries(eloCombo)) {
        p[`3rd-${winnerSlot}`] = thirdByGroupElo[groupCode];
      }
    } else {
      const eloSlots = ['3rd-1A','3rd-1B','3rd-1D','3rd-1E','3rd-1G','3rd-1I','3rd-1K','3rd-1L'];
      best8elo.forEach((t, i) => { if (eloSlots[i]) p[eloSlots[i]] = t; });
    }
    return p;
  }

  // Model 2: 6-factor prediction-based group placements (delegates to module-scope fn)
  function get6FactorPlacements() {
    return getPredictionBasedPlacements();
  }

  const stageLabels = { R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarter-finals', SF: 'Semi-finals', F: 'Final' };
  const allDefs = { R32: R32_BRACKET, R16: R16_BRACKET, QF: QF_BRACKET, SF: SF_BRACKET, F: [FINAL] };

  function buildSnapshot(completedStages, placementsFn) {
    const done = new Set(completedStages);
    const winners = {};
    const placements = placementsFn();

    return stageOrder.map(stage => {
      const isActual = done.has(stage);

      const matches = allDefs[stage].map(bm => {
        const dbM = matchById[bm.matchId];
        let home = null, away = null, winner = null, score = null;

        if (isActual && dbM) {
          home = teamsById[dbM.home_team] || null;
          away = teamsById[dbM.away_team] || null;
          winner = dbM.winner ? teamsById[dbM.winner] || null : null;
          if (dbM.home_score != null) score = `${dbM.home_score}–${dbM.away_score}`;
        } else {
          if (stage === 'R32') {
            home = (dbM?.home_team ? teamsById[dbM.home_team] : null) || placements[bm.homeSlot] || null;
            away = (dbM?.away_team ? teamsById[dbM.away_team] : null) || placements[bm.awaySlot] || null;
          } else {
            home = winners[bm.homeSource] || null;
            away = winners[bm.awaySource] || null;
          }
          if (home && away) {
            const pred = predByMatch[bm.matchId];
            if (pred) {
              winner = pred.prob_home >= pred.prob_away ? home : away;
            } else {
              winner = eloP(home, away) >= 50 ? home : away;
            }
          }
        }

        if (winner) winners[bm.matchId] = winner;
        const pred = home && away ? predByMatch[bm.matchId] : null;
        const pHome = pred
          ? Math.round(pred.prob_home / (pred.prob_home + pred.prob_away) * 100)
          : (home && away ? eloP(home, away) : null);

        // For actual matches, determine prediction accuracy
        let predictedWinner = null;
        let predictionCorrect = null;
        if (isActual && dbM && home && away) {
          const matchPred = predByMatch[bm.matchId];
          if (matchPred) {
            predictedWinner = matchPred.prob_home >= matchPred.prob_away ? home : away;
            predictionCorrect = dbM.winner && predictedWinner && dbM.winner === predictedWinner.id;
          }
        }

        return {
          id: bm.matchId,
          home: home ? { id: home.id, name: home.name, flag: home.flag, winPct: pHome } : null,
          away: away ? { id: away.id, name: away.name, flag: away.flag, winPct: pHome != null ? 100 - pHome : null } : null,
          winner: winner ? { id: winner.id, name: winner.name, flag: winner.flag } : null,
          score,
          isActual,
          predictedWinner: predictedWinner ? { id: predictedWinner.id } : null,
          predictionCorrect,
        };
      });

      const order = DISPLAY_ORDER[stage];
      if (order) {
        const indexOf = id => {
          const i = order.indexOf(id);
          return i === -1 ? order.length : i;
        };
        matches.sort((a, b) => indexOf(a.id) - indexOf(b.id));
      }

      return { stage, label: stageLabels[stage], isActual, matches };
    });
  }

  function buildSnapshotList(placementsFn) {
    const snapshots = [];
    snapshots.push({ id: 'pre_tournament', label: 'Pre-tournament Prediction', rounds: buildSnapshot([], placementsFn) });

    const cumulative = [];
    for (const s of stageOrder) {
      if (stageComplete[s]) {
        cumulative.push(s);
        snapshots.push({ id: `after_${s.toLowerCase()}`, label: `After ${stageLabels[s]}`, rounds: buildSnapshot([...cumulative], placementsFn) });
      }
    }
    return snapshots.reverse();
  }

  return {
    elo:       buildSnapshotList(getEloBasedPlacements),
    predicted: buildSnapshotList(get6FactorPlacements),
  };
}

module.exports = {
  SIM_COUNT,
  ensureKnockoutStubs,
  advanceGroupToR32,
  advanceKnockoutWinner,
  isGroupComplete,
  getGroupStandings,
  getPredictionBasedPlacements,
  simulateKnockoutBracket,
  runTournamentSimulation,
  invalidateSimulationCache,
  generateRoadToFinal,
};
