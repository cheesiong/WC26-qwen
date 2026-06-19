/**
 * Suspension Tracker Service
 *
 * Tracks yellow-card accumulation and red-card suspensions across the tournament.
 *
 * WC 2026 rules (FIFA):
 *  - 2 yellows in group stage  → 1-match ban
 *  - 2 yellows up to and including R16 → 1-match ban
 *  - Yellow cards are wiped after the semi-finals
 *  - Red card → automatic 1-match ban (plus possible additional bans)
 */

const { getDb } = require('../database/db');

// ── Add / update a suspension ─────────────────────────────────────
function addSuspension({ teamId, playerName, reason, yellowCards, suspendedForMatchId, notes, source }) {
  const db = getDb();

  // Check if record already exists for this player + match
  const existing = db.prepare(`
    SELECT id FROM suspensions
    WHERE team_id = ? AND player_name = ? AND suspended_for_match_id = ?
  `).get([teamId, playerName, suspendedForMatchId || null]);

  if (existing) {
    db.prepare(`
      UPDATE suspensions SET
        reason = ?, yellow_cards = ?, notes = ?, source = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run([reason, yellowCards || 0, notes || null, source || 'manual', existing.id]);
    return { id: existing.id, updated: true };
  }

  const result = db.prepare(`
    INSERT INTO suspensions (team_id, player_name, reason, yellow_cards, suspended_for_match_id, notes, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run([teamId, playerName, reason, yellowCards || 0, suspendedForMatchId || null, notes || null, source || 'manual']);

  return { id: result.lastInsertRowid, updated: false };
}

// ── Get suspensions for a specific match ─────────────────────────
function getSuspensionsForMatch(matchId) {
  const db = getDb();

  const match = db.prepare('SELECT home_team, away_team FROM matches WHERE id = ?').get(matchId);
  if (!match) return { available: false, reason: 'Match not found' };

  const homeSuspensions = db.prepare(`
    SELECT s.*, t.name as team_name, t.flag as team_flag
    FROM suspensions s
    JOIN teams t ON s.team_id = t.id
    WHERE s.suspended_for_match_id = ? AND s.team_id = ?
    ORDER BY s.player_name
  `).all([matchId, match.home_team]);

  const awaySuspensions = db.prepare(`
    SELECT s.*, t.name as team_name, t.flag as team_flag
    FROM suspensions s
    JOIN teams t ON s.team_id = t.id
    WHERE s.suspended_for_match_id = ? AND s.team_id = ?
    ORDER BY s.player_name
  `).all([matchId, match.away_team]);

  // Also get players on 1 yellow who might be at risk
  const homeYellowWatch = getYellowWatch(match.home_team, matchId);
  const awayYellowWatch = getYellowWatch(match.away_team, matchId);

  return {
    available: true,
    matchId,
    home: {
      suspended: homeSuspensions,
      yellowWatch: homeYellowWatch,
    },
    away: {
      suspended: awaySuspensions,
      yellowWatch: awayYellowWatch,
    },
    totalSuspended: homeSuspensions.length + awaySuspensions.length,
  };
}

// ── Get players on yellow card watch (1 away from ban) ────────────
function getYellowWatch(teamId, matchId) {
  const db = getDb();

  // Get the match's stage to determine threshold
  const match = matchId ? db.prepare('SELECT stage FROM matches WHERE id = ?').get(matchId) : null;
  const stage = match?.stage || 'GROUP';

  // Yellow wipe happens after SF, so threshold = 2 for GROUP through R16
  const threshold = ['GROUP', 'R32', 'R16'].includes(stage) ? 1 : 0;

  // Find players with yellow cards equal to threshold (one more = ban)
  const players = db.prepare(`
    SELECT player_name, yellow_cards, notes
    FROM suspensions
    WHERE team_id = ? AND reason = 'yellow_accumulation' AND yellow_cards = ?
    AND (suspended_for_match_id IS NULL OR suspended_for_match_id != ?)
  `).all([teamId, threshold, matchId || '']);

  return players;
}

// ── Get all suspensions for a team ───────────────────────────────
function getTeamSuspensions(teamId) {
  const db = getDb();
  return db.prepare(`
    SELECT s.*, m.stage, m.scheduled_date,
           ht.name as home_name, at.name as away_name
    FROM suspensions s
    LEFT JOIN matches m ON s.suspended_for_match_id = m.id
    LEFT JOIN teams ht ON m.home_team = ht.id
    LEFT JOIN teams at ON m.away_team = at.id
    WHERE s.team_id = ?
    ORDER BY s.created_at DESC
  `).all(teamId);
}

// ── Delete a suspension ───────────────────────────────────────────
function deleteSuspension(id) {
  const db = getDb();
  const result = db.prepare('DELETE FROM suspensions WHERE id = ?').run(id);
  return { deleted: result.changes > 0 };
}

// ── Get tournament-wide suspension summary ────────────────────────
function getAllSuspensions() {
  const db = getDb();
  return db.prepare(`
    SELECT s.*, t.name as team_name, t.flag as team_flag,
           m.stage, m.scheduled_date,
           ht.name as home_name, at.name as away_name
    FROM suspensions s
    JOIN teams t ON s.team_id = t.id
    LEFT JOIN matches m ON s.suspended_for_match_id = m.id
    LEFT JOIN teams ht ON m.home_team = ht.id
    LEFT JOIN teams at ON m.away_team = at.id
    ORDER BY s.created_at DESC
  `).all();
}

module.exports = {
  addSuspension,
  getSuspensionsForMatch,
  getTeamSuspensions,
  getAllSuspensions,
  deleteSuspension,
};
