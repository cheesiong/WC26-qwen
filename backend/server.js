require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { getDb } = require('./database/db');
const { syncLiveResults } = require('./services/dataService');
const { predict } = require('./services/predictionEngine');
const { translatePredictionToZh } = require('./services/i18nService');
const { recordMatchResult, getModelAccuracy, getGroupStandings } = require('./services/analysisService');
const { fetchLineup } = require('./services/lineupService');
const { getRealH2H } = require('./services/h2hService');
const { SIM_COUNT, ensureKnockoutStubs, runTournamentSimulation, invalidateSimulationCache, generateRoadToFinal, simulateKnockoutBracket } = require('./services/bracketService');
const { getGroupScenarios } = require('./services/scenarioService');
const { getSuspensionsForMatch, getTeamSuspensions, getAllSuspensions } = require('./services/suspensionService');
const { notifyIndexNow } = require('./services/indexNow');

const app = express();
const PORT = process.env.PORT || 6173;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:6001' }));
app.use(express.json());

// ── TEAMS ──────────────────────────────────────────────────────────
app.get('/api/teams', (req, res) => {
  const db = getDb();
  const teams = db.prepare(`
    SELECT * FROM teams ORDER BY
      CASE group_code
        WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4
        WHEN 'E' THEN 5 WHEN 'F' THEN 6 WHEN 'G' THEN 7 WHEN 'H' THEN 8
        WHEN 'I' THEN 9 WHEN 'J' THEN 10 WHEN 'K' THEN 11 WHEN 'L' THEN 12
      END, gs_pts DESC, fifa_rank ASC
  `).all();
  res.json(teams);
});

app.get('/api/teams/:id', (req, res) => {
  const db = getDb();
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  // Get their matches
  const matches = db.prepare(`
    SELECT m.*,
           ht.name as home_name, ht.flag as home_flag, ht.elo as home_elo,
           at.name as away_name, at.flag as away_flag, at.elo as away_elo,
           p.prob_home, p.prob_draw, p.prob_away, p.most_likely_score, p.confidence
    FROM matches m
    LEFT JOIN teams ht ON m.home_team = ht.id
    LEFT JOIN teams at ON m.away_team = at.id
    LEFT JOIN predictions p ON p.match_id = m.id AND p.id = (
      SELECT MAX(id) FROM predictions WHERE match_id = m.id
    )
    WHERE m.home_team = ? OR m.away_team = ?
    ORDER BY m.scheduled_date
  `).all([req.params.id, req.params.id]);

  // ELO history
  const eloHistory = db.prepare(`
    SELECT e.*, t.name as opponent_name, t.flag as opponent_flag
    FROM elo_history e
    LEFT JOIN teams t ON e.opponent_id = t.id
    WHERE e.team_id = ?
    ORDER BY e.recorded_at ASC
  `).all(req.params.id);

  // Group-mates
  const groupTeams = team.group_code ? db.prepare(`
    SELECT id, name, flag, gs_pts, gs_gf, gs_ga, gs_played, fifa_rank
    FROM teams WHERE group_code = ? ORDER BY gs_pts DESC, (gs_gf - gs_ga) DESC
  `).all(team.group_code) : [];

  res.json({ team, matches, eloHistory, groupTeams });
});

// ── GROUPS ────────────────────────────────────────────────────────
app.get('/api/groups', (req, res) => {
  const groups = {};

  for (const g of 'ABCDEFGHIJKL'.split('')) {
    groups[g] = getGroupStandings(g);
  }

  res.json(groups);
});

app.get('/api/groups/:group', (req, res) => {
  const group = req.params.group.toUpperCase();
  if (group.length !== 1 || !'ABCDEFGHIJKL'.includes(group)) {
    return res.status(400).json({ error: 'Invalid group' });
  }
  res.json(getGroupStandings(group));
});

// Qualification scenarios for a specific group
app.get('/api/groups/:group/scenarios', (req, res) => {
  const group = req.params.group.toUpperCase();
  if (group.length !== 1 || !'ABCDEFGHIJKL'.includes(group)) {
    return res.status(400).json({ error: 'Invalid group' });
  }
  try {
    res.json(getGroupScenarios(group));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── MATCHES ──────────────────────────────────────────────────────
app.get('/api/matches', (req, res) => {
  const db = getDb();
  const { stage, status, date, group } = req.query;

  let query = `
    SELECT m.*,
           ht.name as home_name, ht.flag as home_flag, ht.elo as home_elo,
           at.name as away_name, at.flag as away_flag, at.elo as away_elo,
           p.prob_home, p.prob_draw, p.prob_away,
           p.most_likely_score, p.confidence, p.top_scores,
           mp.points as graded_points
    FROM matches m
    LEFT JOIN teams ht ON m.home_team = ht.id
    LEFT JOIN teams at ON m.away_team = at.id
    LEFT JOIN predictions p ON p.match_id = m.id AND p.id = (
      SELECT MAX(id) FROM predictions WHERE match_id = m.id
    )
    LEFT JOIN model_performance mp ON mp.match_id = m.id AND mp.id = (
      SELECT MAX(id) FROM model_performance WHERE match_id = m.id
    )
    WHERE 1=1
  `;
  const params = [];

  if (stage) { query += ' AND m.stage = ?'; params.push(stage.toUpperCase()); }
  if (status) { query += ' AND m.status = ?'; params.push(status.toUpperCase()); }
  if (date)   { query += ' AND m.scheduled_date = ?'; params.push(date); }
  if (group)  { query += ' AND m.group_code = ?'; params.push(group.toUpperCase()); }

  query += ' ORDER BY m.scheduled_date, m.id';

  res.json(db.prepare(query).all(params));
});

app.get('/api/matches/today', (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  const matches = db.prepare(`
    SELECT m.*,
           ht.name as home_name, ht.flag as home_flag, ht.elo as home_elo,
           at.name as away_name, at.flag as away_flag, at.elo as away_elo,
           p.prob_home, p.prob_draw, p.prob_away,
           p.most_likely_score, p.confidence, p.insight
    FROM matches m
    LEFT JOIN teams ht ON m.home_team = ht.id
    LEFT JOIN teams at ON m.away_team = at.id
    LEFT JOIN predictions p ON p.match_id = m.id AND p.id = (
      SELECT MAX(id) FROM predictions WHERE match_id = m.id
    )
    WHERE m.scheduled_date = ?
    ORDER BY m.id
  `).all(today);

  res.json(matches);
});

app.get('/api/matches/upcoming', (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  // Find the next date that has scheduled matches
  const firstDay = db.prepare(`
    SELECT scheduled_date FROM matches
    WHERE scheduled_date >= ? AND status != 'COMPLETED'
    ORDER BY scheduled_date ASC LIMIT 1
  `).get(today);

  if (!firstDay) {
    return res.json({ dates: [] });
  }

  // Return that day plus the next 3 calendar days (use UTC to avoid timezone drift)
  const startDate = firstDay.scheduled_date;
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const endDateStr = new Date(Date.UTC(sy, sm - 1, sd + 3)).toISOString().split('T')[0];

  const matches = db.prepare(`
    SELECT m.*,
           ht.name as home_name, ht.flag as home_flag, ht.elo as home_elo,
           at.name as away_name, at.flag as away_flag, at.elo as away_elo,
           p.prob_home, p.prob_draw, p.prob_away,
           p.most_likely_score, p.confidence, p.insight
    FROM matches m
    LEFT JOIN teams ht ON m.home_team = ht.id
    LEFT JOIN teams at ON m.away_team = at.id
    LEFT JOIN predictions p ON p.match_id = m.id AND p.id = (
      SELECT MAX(id) FROM predictions WHERE match_id = m.id
    )
    WHERE m.scheduled_date >= ? AND m.scheduled_date <= ?
      AND m.status != 'COMPLETED'
    ORDER BY m.scheduled_date, m.id
  `).all([startDate, endDateStr]);

  const grouped = {};
  for (const m of matches) {
    const sgtKey = m.scheduled_time
      ? new Date(new Date(`${m.scheduled_date}T${m.scheduled_time}:00Z`).getTime() + 8 * 60 * 60 * 1000)
          .toISOString().split('T')[0]
      : m.scheduled_date;
    if (!grouped[sgtKey]) grouped[sgtKey] = [];
    grouped[sgtKey].push(m);
  }

  const dates = Object.keys(grouped).sort().map(date => ({ date, matches: grouped[date] }));
  res.json({ dates });
});

// Upcoming upset-watch matches (ELO favourite has <45% win probability)
app.get('/api/matches/upset-watch', (req, res) => {
  const db = getDb();
  const matches = db.prepare(`
    SELECT m.*,
           ht.name as home_name, ht.flag as home_flag, ht.elo as home_elo,
           at.name as away_name, at.flag as away_flag, at.elo as away_elo,
           p.prob_home, p.prob_draw, p.prob_away, p.confidence, p.most_likely_score
    FROM matches m
    LEFT JOIN teams ht ON m.home_team = ht.id
    LEFT JOIN teams at ON m.away_team = at.id
    LEFT JOIN predictions p ON p.match_id = m.id AND p.id = (
      SELECT MAX(id) FROM predictions WHERE match_id = m.id
    )
    WHERE m.status = 'SCHEDULED'
      AND p.prob_home IS NOT NULL
    ORDER BY m.scheduled_date ASC
    LIMIT 60
  `).all();

  const upsets = matches.filter(m => {
    const homeIsFav = (m.home_elo || 1500) >= (m.away_elo || 1500);
    const favWinProb = homeIsFav ? (m.prob_home || 0) : (m.prob_away || 0);
    const eloDiff = Math.abs((m.home_elo || 1500) - (m.away_elo || 1500));
    return eloDiff >= 50 && favWinProb < 0.45;
  }).map(m => {
    const homeIsFav = (m.home_elo || 1500) >= (m.away_elo || 1500);
    const favTeam = homeIsFav ? m.home_name : m.away_name;
    const favFlag = homeIsFav ? m.home_flag : m.away_flag;
    const favWinProb = homeIsFav ? m.prob_home : m.prob_away;
    const underdogTeam = homeIsFav ? m.away_name : m.home_name;
    const underdogFlag = homeIsFav ? m.away_flag : m.home_flag;
    const underdogWinProb = homeIsFav ? m.prob_away : m.prob_home;
    const eloDiff = Math.abs((m.home_elo || 1500) - (m.away_elo || 1500));
    return {
      ...m,
      favTeam, favFlag, favWinProb,
      underdogTeam, underdogFlag, underdogWinProb,
      eloDiff: Math.round(eloDiff),
      upsetProbability: underdogWinProb,
    };
  }).sort((a, b) => b.upsetProbability - a.upsetProbability);

  res.json(upsets.slice(0, 10));
});

app.get('/api/matches/:id', (req, res) => {
  const db = getDb();
  const match = db.prepare(`
    SELECT m.*,
           ht.name as home_name, ht.flag as home_flag, ht.elo as home_elo,
           ht.avg_scored as home_avg_scored, ht.wc_appearances as home_wc_apps,
           at.name as away_name, at.flag as away_flag, at.elo as away_elo,
           at.avg_scored as away_avg_scored, at.wc_appearances as away_wc_apps
    FROM matches m
    LEFT JOIN teams ht ON m.home_team = ht.id
    LEFT JOIN teams at ON m.away_team = at.id
    WHERE m.id = ?
  `).get(req.params.id);

  if (!match) return res.status(404).json({ error: 'Match not found' });
  res.json(match);
});

// Submit result
app.post('/api/matches/:id/result', async (req, res) => {
  try {
    const { homeScore, awayScore } = req.body;
    if (typeof homeScore !== 'number' || typeof awayScore !== 'number') {
      return res.status(400).json({ error: 'homeScore and awayScore must be numbers' });
    }
    const homePens = req.body.homePens != null ? Number(req.body.homePens) : null;
    const awayPens = req.body.awayPens != null ? Number(req.body.awayPens) : null;
    if ((homePens != null && isNaN(homePens)) || (awayPens != null && isNaN(awayPens))) {
      return res.status(400).json({ error: 'homePens and awayPens must be numbers' });
    }

    const result = await recordMatchResult(req.params.id, homeScore, awayScore, homePens, awayPens);
    invalidateSimulationCache();
    res.json(result);
    notifyIndexNow([`/matches/${req.params.id}`, '/', '/predictions']);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── LINEUP ────────────────────────────────────────────────────────
app.get('/api/matches/:id/lineup', async (req, res) => {
  try {
    const lineup = await fetchLineup(req.params.id);
    res.json(lineup);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── HEAD-TO-HEAD ──────────────────────────────────────────────────
app.get('/api/h2h/:teamA/:teamB', async (req, res) => {
  try {
    const data = await getRealH2H(req.params.teamA, req.params.teamB, 20);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ── PREDICTIONS ──────────────────────────────────────────────────
app.get('/api/matches/:id/prediction', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const lang = req.query.lang;
    let prediction = await predict(req.params.id, forceRefresh);
    if (lang === 'zh') {
      prediction = await translatePredictionToZh(prediction, req.params.id);
    }
    res.json(prediction);
    if (forceRefresh && !prediction.fromCache) {
      notifyIndexNow(`/matches/${req.params.id}`);
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Full multi-agent session log for a match (latest prediction run)
app.get('/api/matches/:id/agent-session', (req, res) => {
  const db = getDb();

  // Find the latest prediction with an agent session for this match
  const pred = db.prepare(`
    SELECT agent_session_id FROM predictions
    WHERE match_id = ? AND agent_session_id IS NOT NULL
    ORDER BY generated_at DESC LIMIT 1
  `).get(req.params.id);

  if (!pred?.agent_session_id) {
    return res.json({ available: false, reason: 'No multi-agent session found for this match' });
  }

  const sid = pred.agent_session_id;

  const session = db.prepare('SELECT * FROM agent_sessions WHERE id = ?').get(sid);
  const messages = db.prepare(`
    SELECT id, round, agent, role, probability, confidence, evidence, latency_ms, created_at
    FROM agent_messages WHERE session_id = ? ORDER BY round, id
  `).all(sid);
  const conflicts = db.prepare(
    'SELECT * FROM agent_conflicts WHERE session_id = ? ORDER BY id'
  ).all(sid);

  res.json({
    available: true,
    session: {
      ...session,
      agents_used: JSON.parse(session.agents_used || '[]'),
    },
    messages: messages.map(m => ({
      ...m,
      probability: JSON.parse(m.probability || 'null'),
      evidence:    JSON.parse(m.evidence    || '[]'),
    })),
    conflicts,
  });
});

// All predictions (history) for a single match
app.get('/api/matches/:id/predictions', (req, res) => {
  const db = getDb();
  const history = db.prepare(`
    SELECT id, match_id, generated_at,
           prob_home, prob_draw, prob_away,
           most_likely_score, confidence, methodology, insight,
           actual_outcome, was_correct, brier_score
    FROM predictions
    WHERE match_id = ?
    ORDER BY generated_at ASC
  `).all(req.params.id);
  res.json(history);
});

// Batch generate predictions — active tournament stage (group through final)
app.post('/api/predictions/generate-all', async (req, res) => {
  const db = getDb();

  // Stage priority: GROUP < R32 < R16 < QF < SF < F = THIRD_PLACE
  const stagePriority = `CASE stage
    WHEN 'GROUP'       THEN 1
    WHEN 'R32'         THEN 2
    WHEN 'R16'         THEN 3
    WHEN 'QF'          THEN 4
    WHEN 'SF'          THEN 5
    WHEN 'F'           THEN 6
    WHEN 'THIRD_PLACE' THEN 6
    ELSE 99 END`;

  // All scheduled, team-populated matches belonging to the earliest active stage.
  // F and THIRD_PLACE share priority 6 so both are included after the semis.
  const upcoming = db.prepare(`
    SELECT id, stage FROM matches
    WHERE status = 'SCHEDULED' AND home_team IS NOT NULL AND away_team IS NOT NULL
      AND ${stagePriority} = (
        SELECT MIN(${stagePriority}) FROM matches
        WHERE status = 'SCHEDULED' AND home_team IS NOT NULL AND away_team IS NOT NULL
      )
    ORDER BY scheduled_date, scheduled_time
  `).all();

  if (upcoming.length === 0) return res.json({ generated: 0, results: [] });

  const COOLDOWN_MINUTES = 30;
  const activeStage = upcoming[0].stage;
  const results = [];
  for (const m of upcoming) {
    const last = db.prepare(
      `SELECT generated_at FROM predictions WHERE match_id = ? ORDER BY id DESC LIMIT 1`
    ).get(m.id);
    if (last) {
      const ageMinutes = (Date.now() - new Date(last.generated_at + 'Z').getTime()) / 60000;
      if (ageMinutes < COOLDOWN_MINUTES) {
        results.push({ matchId: m.id, ok: true, skipped: true });
        continue;
      }
    }
    try {
      await predict(m.id, true);
      results.push({ matchId: m.id, ok: true });
    } catch (e) {
      results.push({ matchId: m.id, ok: false, error: e.message });
    }
  }

  const generated = results.filter(r => r.ok && !r.skipped).length;
  res.json({ generated, stage: activeStage, results });

  const generatedIds = results.filter(r => r.ok && !r.skipped).map(r => r.matchId);
  if (generatedIds.length > 0) {
    notifyIndexNow([
      ...generatedIds.map(id => `/matches/${id}`),
      '/',
      '/predictions',
    ]);
  }
});

// ── TOURNAMENT ────────────────────────────────────────────────────
app.get('/api/tournament/bracket', (req, res) => {
  const db = getDb();
  const knockoutMatches = db.prepare(`
    SELECT m.*,
           ht.name as home_name, ht.flag as home_flag,
           at.name as away_name, at.flag as away_flag,
           p.prob_home, p.prob_draw, p.prob_away, p.confidence
    FROM matches m
    LEFT JOIN teams ht ON m.home_team = ht.id
    LEFT JOIN teams at ON m.away_team = at.id
    LEFT JOIN predictions p ON p.match_id = m.id AND p.id = (
      SELECT MAX(id) FROM predictions WHERE match_id = m.id
    )
    WHERE m.stage != 'GROUP'
    ORDER BY m.scheduled_date, m.id
  `).all();

  res.json(knockoutMatches);
});

// Simulate tournament winner from current state
app.get('/api/tournament/winner-probabilities', (req, res) => {
  const db = getDb();
  const probabilities = runTournamentSimulation(db);
  res.json({ simCount: SIM_COUNT, probabilities });
});

// Road to the Final — predicted/actual snapshots per round
app.get('/api/tournament/road-to-final', (req, res) => {
  try {
    res.json(generateRoadToFinal());
  } catch (e) {
    console.error('road-to-final error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Simulate full knockout bracket using prediction engine.
app.post('/api/tournament/simulate-knockout', async (req, res) => {
  try {
    const result = await simulateKnockoutBracket();
    invalidateSimulationCache();
    console.log(`🏆 Simulation complete. Champion: ${result.champion?.name}`);
    res.json(result);
  } catch (e) {
    console.error('simulate-knockout error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── SUSPENSIONS ──────────────────────────────────────────────────
app.get('/api/suspensions', (req, res) => {
  res.json(getAllSuspensions());
});

app.get('/api/matches/:id/suspensions', (req, res) => {
  res.json(getSuspensionsForMatch(req.params.id));
});

app.get('/api/teams/:id/suspensions', (req, res) => {
  res.json(getTeamSuspensions(req.params.id));
});

// ── ANALYTICS ────────────────────────────────────────────────────
app.get('/api/analytics/accuracy', (req, res) => {
  res.json(getModelAccuracy());
});

app.get('/api/analytics/model-weights', (req, res) => {
  const db = getDb();
  const weights = db.prepare('SELECT * FROM model_config ORDER BY key').all();
  res.json(weights);
});

// Multi-agent performance overview
app.get('/api/analytics/agent-performance', (req, res) => {
  const db = getDb();

  const summary = db.prepare(`
    SELECT
      COUNT(*)                                          AS total_sessions,
      SUM(conflicts_detected)                           AS total_conflicts,
      SUM(conflicts_resolved)                           AS total_resolved,
      ROUND(AVG(wall_time_ms))                          AS avg_wall_time_ms,
      ROUND(AVG(rounds), 2)                             AS avg_rounds,
      SUM(CASE WHEN conflicts_detected > 0 THEN 1 END) AS sessions_with_conflicts
    FROM agent_sessions
  `).get();

  const byAgent = db.prepare(`
    SELECT agent, role,
      COUNT(*)                         AS messages,
      ROUND(AVG(confidence), 3)        AS avg_confidence,
      ROUND(AVG(latency_ms))           AS avg_latency_ms
    FROM agent_messages WHERE round = 1
    GROUP BY agent ORDER BY messages DESC
  `).all();

  const recentConflicts = db.prepare(`
    SELECT ac.*, s.match_id
    FROM agent_conflicts ac
    JOIN agent_sessions s ON s.id = ac.session_id
    ORDER BY ac.created_at DESC LIMIT 20
  `).all();

  res.json({ summary, byAgent, recentConflicts });
});


// ── SYNC ──────────────────────────────────────────────────────────
app.post('/api/sync', async (req, res) => {
  try {
    const updated = await syncLiveResults();
    invalidateSimulationCache();
    res.json({ updated, count: updated.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── SCHEDULED JOBS ────────────────────────────────────────────────
// Sync live results every 5 minutes during the tournament
cron.schedule('*/5 * * * *', async () => {
  try {
    await syncLiveResults();
  } catch (e) {
    console.error('Cron sync failed:', e.message);
  }
});

// Regenerate predictions for next 3 match days (SCHEDULED matches only; LIVE/COMPLETED are frozen by predictionEngine)
// Runs hourly midnight–noon SGT, plus 20:30 and 21:30 SGT; stops after 22 Jul 2026 when WC ends
async function runPredictionCron() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
  if (now >= new Date('2026-07-23T00:00:00')) return; // WC 2026 ended

  const db = getDb();
  // SGT date today — used as the floor so a stuck-SCHEDULED past match
  // (e.g. live sync failed to record the result) can't trap the cron on a
  // past day forever.
  const todaySgt = now.toISOString().slice(0, 10);
  const next = db.prepare(`
    SELECT MIN(scheduled_date) as next_day FROM matches
    WHERE status = 'SCHEDULED' AND home_team IS NOT NULL AND away_team IS NOT NULL
      AND scheduled_date >= ?
  `).get([todaySgt]);

  if (!next?.next_day) return;

  const endDay = db.prepare(`SELECT DATE(?, '+2 days') as d`).get(next.next_day).d;

  const matches = db.prepare(`
    SELECT id FROM matches
    WHERE status = 'SCHEDULED' AND home_team IS NOT NULL AND away_team IS NOT NULL
      AND scheduled_date >= ? AND scheduled_date <= ?
    ORDER BY scheduled_date, scheduled_time
  `).all([next.next_day, endDay]);

  console.log(`[cron] prediction run: ${matches.length} matches (${next.next_day} – ${endDay})`);
  let ok = 0;
  for (const m of matches) {
    try { await predict(m.id, true); ok++; } catch (e) { console.error(`[cron] predict ${m.id} failed:`, e.message); }
  }
  console.log(`[cron] done: ${ok}/${matches.length} predictions updated`);
}

cron.schedule('0 0-12 * * *',   runPredictionCron, { timezone: 'Asia/Singapore' }); // hourly midnight–noon
cron.schedule('0 14,16,18 * * *', runPredictionCron, { timezone: 'Asia/Singapore' }); // 2pm, 4pm, 6pm SGT
cron.schedule('30 20,21,22 * * *', runPredictionCron, { timezone: 'Asia/Singapore' }); // 8:30pm, 9:30pm, 10:30pm SGT

// Fetch lineups for matches within 2 hours of kickoff, every 15 minutes
async function runLineupCron() {
  const now = new Date();
  if (now >= new Date('2026-07-23T00:00:00Z')) return;

  const db = getDb();
  const matches = db.prepare(`
    SELECT id, scheduled_date, scheduled_time FROM matches
    WHERE status = 'SCHEDULED' AND home_team IS NOT NULL AND away_team IS NOT NULL
    ORDER BY scheduled_date, scheduled_time
  `).all();

  const upcoming = matches.filter(m => {
    const timeStr = m.scheduled_time ? `T${m.scheduled_time}:00Z` : 'T18:00:00Z';
    const ko = new Date(m.scheduled_date + timeStr);
    const hoursUntil = (ko - now) / 3600000;
    return hoursUntil >= 0 && hoursUntil <= 2;
  });

  if (upcoming.length === 0) return;
  console.log(`[cron] lineup run: ${upcoming.length} match(es) within 2h of KO`);

  for (const m of upcoming) {
    try {
      const result = await fetchLineup(m.id);
      if (result?.available) {
        console.log(`[cron] lineup fetched for ${m.id} (${result.source})`);
      }
    } catch (e) {
      console.error(`[cron] lineup ${m.id} failed:`, e.message);
    }
  }
}

cron.schedule('*/15 * * * *', runLineupCron);

// Serve React frontend in production
const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// Seed knockout match stubs before accepting connections (avoids lock race with incoming requests)
try { ensureKnockoutStubs(); } catch (e) { console.error('ensureKnockoutStubs failed:', e.message); }

app.listen(PORT, () => {
  console.log(`\n⚽  WC2026 Prediction API running on http://localhost:${PORT}`);
  console.log(`📊  Open http://localhost:6001 for the dashboard\n`);

  // Background: fill any missing predictions for the next 3 match days
  setImmediate(async () => {
    const db = getDb();
    const next = db.prepare(`
      SELECT MIN(scheduled_date) as next_day FROM matches
      WHERE status = 'SCHEDULED' AND home_team IS NOT NULL AND away_team IS NOT NULL
    `).get();

    if (!next?.next_day) return;

    const endDay = db.prepare(`SELECT DATE(?, '+2 days') as d`).get(next.next_day).d;

    const missing = db.prepare(`
      SELECT m.id FROM matches m
      LEFT JOIN predictions p ON p.match_id = m.id
      WHERE m.status = 'SCHEDULED'
        AND m.home_team IS NOT NULL
        AND m.away_team IS NOT NULL
        AND m.scheduled_date >= ?
        AND m.scheduled_date <= ?
        AND p.id IS NULL
      ORDER BY m.scheduled_date, m.scheduled_time
    `).all([next.next_day, endDay]);

    if (missing.length > 0) {
      console.log(`⚡ Generating predictions for ${missing.length} matches (${next.next_day}–${endDay})…`);
      for (const m of missing) {
        try { await predict(m.id, false); } catch { /* silent — non-critical */ }
      }
      console.log('✅ Background prediction generation complete');
    }
  });
});
