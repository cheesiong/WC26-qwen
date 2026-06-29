/**
 * ═══════════════════════════════════════════════════════════════════
 *  LINEUP SERVICE
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Fetches the confirmed starting XI (released ~60–75 min before KO).
 *
 *  Sources (in priority order):
 *   1. football-data.org API  /matches/{id}  (lineup field)
 *   2. ESPN match page scrape
 *   3. BBC Sport scrape
 *
 *  Output:
 *   {
 *     available: true/false,
 *     home: { formation, starters: [...], bench: [...], coach },
 *     away: { formation, starters: [...], bench: [...], coach },
 *     strengthDelta: number,   // +ve = home stronger lineup, -ve = away stronger
 *     keyAbsences: [...],      // notable missing players vs "expected" lineup
 *     impactScore: {           // −1.0 to +1.0, fed into prediction engine
 *       home: number,
 *       away: number,
 *     }
 *   }
 *
 *  Strength model:
 *   Each position has a base importance weight.
 *   A player's contribution = position_weight × (player_rating / 100).
 *   Player ratings approximate from: FIFA API if available, else ELO-based default.
 *
 *  Position importance weights (sum to 10):
 *   GK  = 1.5  (one mistake kills you)
 *   CB  = 1.0 each (×2) = 2.0
 *   WB/FB = 0.6 each (×2) = 1.2
 *   DM/CM = 0.8 each (×2) = 1.6
 *   AM/W  = 0.7 each (×2) = 1.4
 *   ST    = 1.3
 *   Total = 10.0
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { getDb } = require('../database/db');


// Position → importance weight
const POSITION_WEIGHTS = {
  Goalkeeper: 1.5, GK: 1.5,
  'Centre-Back': 1.0, CB: 1.0, Defender: 0.9,
  'Left-Back': 0.6, 'Right-Back': 0.6, 'Wing-Back': 0.65, LB: 0.6, RB: 0.6,
  'Defensive Midfield': 0.85, DM: 0.85, CDM: 0.85,
  'Central Midfield': 0.8, CM: 0.8, Midfield: 0.75,
  'Attacking Midfield': 0.75, AM: 0.75, CAM: 0.75,
  'Left Winger': 0.7, 'Right Winger': 0.7, LW: 0.7, RW: 0.7,
  'Second Striker': 0.9, 'Centre-Forward': 1.3, ST: 1.3, Forward: 1.1,
};

function positionWeight(pos) {
  return POSITION_WEIGHTS[pos] || 0.7; // default for unknown positions
}

// ── Schema ────────────────────────────────────────────────────────
function ensureLineupTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS lineups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      side TEXT NOT NULL,           -- 'home' or 'away'
      formation TEXT,
      coach TEXT,
      starters TEXT,                -- JSON array of player objects
      bench TEXT,                   -- JSON array
      strength_score REAL,          -- computed lineup strength 0–10
      fetched_at TEXT DEFAULT (datetime('now')),
      source TEXT,                  -- 'api' | 'espn' | 'bbc' | 'manual'
      UNIQUE(match_id, team_id)
    );
  `);
}

// ── Fetch from football-data.org API ─────────────────────────────
async function fetchLineupFromAPI(matchId, apiMatchId) {
  const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
  if (!API_KEY || !apiMatchId) return null;

  try {
    const resp = await axios.get(
      `https://api.football-data.org/v4/matches/${apiMatchId}`,
      { headers: { 'X-Auth-Token': API_KEY }, timeout: 8000 }
    );

    const match = resp.data;
    if (!match.lineups || match.lineups.length < 2) return null;

    return match.lineups.map(side => ({
      formation: side.formation,
      coach: side.coach?.name || null,
      starters: (side.startXI || []).map(p => ({
        name: p.player?.name || p.name,
        position: p.position || p.player?.position,
        shirtNumber: p.shirtNumber || p.player?.shirtNumber,
      })),
      bench: (side.substitutes || []).map(p => ({
        name: p.player?.name || p.name,
        position: p.position || p.player?.position,
      })),
    }));
  } catch {
    return null;
  }
}

// ── Scrape from ESPN ──────────────────────────────────────────────
async function scrapeLineupESPN(homeTeamName, awayTeamName, matchDate) {
  try {
    const query = encodeURIComponent(`${homeTeamName} vs ${awayTeamName} lineup ${matchDate} site:espn.com`);
    const searchResp = await axios.get(`https://www.google.com/search?q=${query}&num=3`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      timeout: 7000,
    });

    const $ = cheerio.load(searchResp.data);
    const espnUrl = $('a[href*="espn.com/soccer"]').first().attr('href');
    if (!espnUrl) return null;

    const matchUrl = espnUrl.match(/https?:\/\/espn\.com[^\s"&]+/)?.[0];
    if (!matchUrl) return null;

    const pageResp = await axios.get(matchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      timeout: 8000,
    });

    const $page = cheerio.load(pageResp.data);
    const lineups = [];

    // ESPN lineup structure
    $page('.lineup__list').each((sideIdx, sideEl) => {
      if (sideIdx >= 2) return false;
      const starters = [];
      $page(sideEl).find('.lineup__player').each((i, el) => {
        const name = $page(el).find('.lineup__displayName').text().trim();
        const pos = $page(el).find('.lineup__pos').text().trim();
        if (name) starters.push({ name, position: pos });
      });
      lineups.push({ starters, bench: [], formation: null, coach: null });
    });

    return lineups.length === 2 ? lineups : null;
  } catch {
    return null;
  }
}

// ── Scrape from Google search (multi-source) ──────────────────────
// Searches for lineup data across multiple football sites
async function scrapeLineupGoogle(homeTeamName, awayTeamName, matchDate) {
  try {
    const query = encodeURIComponent(`${homeTeamName} ${awayTeamName} lineup formation ${matchDate}`);
    const searchResp = await axios.get(`https://www.google.com/search?q=${query}&num=5`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      timeout: 7000,
    });

    const $ = cheerio.load(searchResp.data);
    const lineups = [];

    // Try to find lineup data in Google's featured snippets or knowledge panels
    // Look for formation patterns like "4-3-3", "4-4-2", "3-5-2" etc.
    const pageText = $.text();
    const formationMatch = pageText.match(/(\d-\d-\d[-\d]*)/);

    // Look for player names in structured data
    // Google often shows lineup info in rich results
    $('div[data-attrid], div[data-md], .kP1Bkf, .wDYxhc').each((_, el) => {
      const text = $(el).text();
      const playerLines = text.split('\n').filter(l => l.trim());
      for (const line of playerLines) {
        // Match patterns like "1. Player Name - Position" or "Player Name (Position)"
        const playerMatch = line.match(/^\d+[\.\)]\s*(.+?)(?:\s*[-–]\s*(.+))?$/);
        if (playerMatch) {
          const name = playerMatch[1].trim();
          const pos = playerMatch[2]?.trim() || '';
          if (name && name.length > 2 && name.length < 40) {
            lineups.push({ name, position: pos });
          }
        }
      }
    });

    if (lineups.length >= 11) {
      // Split into two teams (first 11 = home, rest = away)
      const homeStarters = lineups.slice(0, 11);
      const awayStarters = lineups.slice(11, 22);
      if (awayStarters.length >= 11) {
        return [
          { starters: homeStarters, bench: [], formation: formationMatch?.[1] || null, coach: null },
          { starters: awayStarters, bench: [], formation: null, coach: null },
        ];
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ── Scrape from Sofascore web page (SEO-rendered HTML) ───────────
async function scrapeLineupSofascore(homeTeamName, awayTeamName, matchDate) {
  try {
    // Sofascore URL pattern: /football/{tournament}/{home}-{away}/{eventId}
    // We search for the match page first
    const query = encodeURIComponent(`${homeTeamName} ${awayTeamName} ${matchDate} site:sofascore.com`);
    const searchResp = await axios.get(`https://www.google.com/search?q=${query}&num=3`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 7000,
    });

    const $ = cheerio.load(searchResp.data);
    const sofaUrl = $('a[href*="sofascore.com"]').first().attr('href');
    if (!sofaUrl) return null;

    const matchUrl = sofaUrl.match(/https?:\/\/www\.sofascore\.com[^\s"&]+/)?.[0];
    if (!matchUrl) return null;

    const pageResp = await axios.get(matchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 8000,
    });

    const $page = cheerio.load(pageResp.data);
    const lineups = [];

    // Sofascore uses structured data in script tags for SEO
    const scriptContent = $page('script[type="application/ld+json"]').html();
    if (scriptContent) {
      try {
        const data = JSON.parse(scriptContent);
        // Extract lineup from structured data if available
        if (data?.performer?.member) {
          for (const team of data.performer.member) {
            const starters = (team.player || []).map(p => ({
              name: p.name,
              position: p.position?.name || '',
              shirtNumber: p.uniformNumber,
            })).filter(p => p.name);
            if (starters.length > 0) {
              lineups.push({ starters, bench: [], formation: null, coach: null });
            }
          }
        }
      } catch { /* ignore parse errors */ }
    }

    // Fallback: look for lineup in meta tags or visible text
    if (lineups.length < 2) {
      const metaDesc = $page('meta[name="description"]').attr('content') || '';
      const bodyText = $page('body').text();

      // Try to find player names near formation info
      const formationMatch = bodyText.match(/(\d-\d-\d[-\d]*)/);
      const playerPattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g;
      const names = [...bodyText.matchAll(playerPattern)].map(m => m[1]);

      // Filter to likely player names (2-3 words, not common words)
      const skipWords = new Set(['The', 'And', 'For', 'Not', 'But', 'World', 'Cup', 'Football', 'Match', 'Lineup', 'Formation']);
      const playerNames = names.filter(n => {
        const words = n.split(' ');
        return words.length >= 2 && words.length <= 3 && !skipWords.has(words[0]);
      });

      if (playerNames.length >= 22) {
        const homeStarters = playerNames.slice(0, 11).map(name => ({ name, position: '' }));
        const awayStarters = playerNames.slice(11, 22).map(name => ({ name, position: '' }));
        lineups.length = 0;
        lineups.push(
          { starters: homeStarters, bench: [], formation: formationMatch?.[1] || null, coach: null },
          { starters: awayStarters, bench: [], formation: null, coach: null },
        );
      }
    }

    return lineups.length === 2 ? lineups : null;
  } catch {
    return null;
  }
}

// ── Compute lineup strength score ────────────────────────────────
function computeStrengthScore(starters, teamElo) {
  if (!starters || starters.length === 0) return 5.0; // neutral default

  // ELO → expected per-player baseline rating
  // ELO 1900 → ~88 player rating, ELO 1400 → ~72 player rating
  const baseRating = 72 + ((teamElo - 1400) / 500) * 16;

  let totalWeight = 0;
  let weightedRating = 0;

  starters.forEach(player => {
    const w = positionWeight(player.position);
    // Approximate individual player rating (we don't have real data per player)
    // Slight variance around team baseline: captain/star gets +3, rotation -3
    const rating = player.isCaptain ? baseRating + 3
                 : player.isRotation ? baseRating - 3
                 : baseRating;

    weightedRating += (rating / 100) * w;
    totalWeight += w;
  });

  // Normalise to 0–10 scale
  const avgWeightedRating = totalWeight > 0 ? (weightedRating / totalWeight) : 0.80;
  return Math.min(10, Math.max(0, avgWeightedRating * 10));
}

/**
 * Detect key absences by comparing current starters against
 * the team's recent starting lineup patterns (stored in the DB
 * from previous match lineups). Falls back to squad-size check.
 */
function detectKeyAbsences(currentStarters, teamId, matchId) {
  const db = getDb();

  // Get previous lineups for this team
  const prevLineups = db.prepare(`
    SELECT starters FROM lineups
    WHERE team_id = ? AND match_id != ?
    ORDER BY fetched_at DESC LIMIT 5
  `).all([teamId, matchId]);

  if (prevLineups.length === 0) return [];

  // Find players who regularly start but aren't in this lineup
  const playerFrequency = {};
  for (const prev of prevLineups) {
    const starters = JSON.parse(prev.starters || '[]');
    for (const p of starters) {
      playerFrequency[p.name] = (playerFrequency[p.name] || 0) + 1;
    }
  }

  const currentNames = new Set(currentStarters.map(p => p.name));
  const regularStarters = Object.entries(playerFrequency)
    .filter(([, count]) => count >= 3) // appeared in 3+ of last 5
    .map(([name]) => name);

  const absences = regularStarters.filter(name => !currentNames.has(name));
  return absences;
}

// ── Main: fetchLineup(matchId) ────────────────────────────────────
async function fetchLineup(matchId) {
  ensureLineupTable();
  const db = getDb();

  // Check cache
  const cached = db.prepare(`
    SELECT * FROM lineups WHERE match_id = ? ORDER BY fetched_at DESC LIMIT 2
  `).all(matchId);

  if (cached.length === 2) {
    const home = cached.find(r => r.side === 'home');
    const away = cached.find(r => r.side === 'away');
    if (home && away) {
      return buildLineupResult(home, away, matchId);
    }
  }

  // Load match
  const match = db.prepare(`
    SELECT m.*, ht.name as home_name, ht.elo as home_elo,
                at.name as away_name, at.elo as away_elo
    FROM matches m
    JOIN teams ht ON m.home_team = ht.id
    JOIN teams at ON m.away_team = at.id
    WHERE m.id = ?
  `).get(matchId);

  if (!match) return { available: false, reason: 'Match not found' };

  // Is it close enough to kickoff? (lineup released ~60–75 min before)
  const timeStr = match.scheduled_time ? `T${match.scheduled_time}:00Z` : 'T18:00:00Z';
  const matchTime = new Date(match.scheduled_date + timeStr);
  const now = new Date();
  const hoursUntilKO = (matchTime - now) / 3600000;

  if (hoursUntilKO > 2) {
    return {
      available: false,
      reason: `Lineups typically released 60–75 min before kickoff. Check back closer to ${match.scheduled_date}.`,
      hoursUntilKO: Math.round(hoursUntilKO),
    };
  }

  // ── Try sources in order ────────────────────────────────────────
  let rawLineups = null;
  let source = 'none';

  // 1. football-data.org API
  const apiMatchId = null; // Would need to map our match ID to their ID
  if (process.env.FOOTBALL_DATA_API_KEY) {
    rawLineups = await fetchLineupFromAPI(matchId, apiMatchId);
    if (rawLineups) source = 'api';
  }

  // 2. ESPN scrape
  if (!rawLineups) {
    rawLineups = await scrapeLineupESPN(match.home_name, match.away_name, match.scheduled_date);
    if (rawLineups) source = 'espn';
  }

  // 3. Sofascore (SEO-rendered HTML + structured data)
  if (!rawLineups) {
    rawLineups = await scrapeLineupSofascore(match.home_name, match.away_name, match.scheduled_date);
    if (rawLineups) source = 'sofascore';
  }

  // 4. Google multi-source search
  if (!rawLineups) {
    rawLineups = await scrapeLineupGoogle(match.home_name, match.away_name, match.scheduled_date);
    if (rawLineups) source = 'google';
  }

  if (!rawLineups || rawLineups.length < 2) {
    return {
      available: false,
      reason: 'Lineup not yet announced or could not be retrieved. Try again closer to kickoff.',
    };
  }

  const [homeRaw, awayRaw] = rawLineups;

  // Compute strength scores
  const homeStrength = computeStrengthScore(homeRaw.starters, match.home_elo);
  const awayStrength = computeStrengthScore(awayRaw.starters, match.away_elo);

  // Store in DB
  const save = db.prepare(`
    INSERT OR REPLACE INTO lineups
      (match_id, team_id, side, formation, coach, starters, bench, strength_score, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  save.run([matchId, match.home_team, 'home',
    homeRaw.formation, homeRaw.coach,
    JSON.stringify(homeRaw.starters), JSON.stringify(homeRaw.bench),
    homeStrength, source]);

  save.run([matchId, match.away_team, 'away',
    awayRaw.formation, awayRaw.coach,
    JSON.stringify(awayRaw.starters), JSON.stringify(awayRaw.bench),
    awayStrength, source]);

  return buildLineupResult(
    { side: 'home', team_id: match.home_team, ...homeRaw, strength_score: homeStrength, source },
    { side: 'away', team_id: match.away_team, ...awayRaw, strength_score: awayStrength, source },
    matchId
  );
}

function buildLineupResult(homeRow, awayRow, matchId) {
  const homeStarters = typeof homeRow.starters === 'string'
    ? JSON.parse(homeRow.starters || '[]') : (homeRow.starters || []);
  const awayStarters = typeof awayRow.starters === 'string'
    ? JSON.parse(awayRow.starters || '[]') : (awayRow.starters || []);

  const homeAbsences = detectKeyAbsences(homeStarters, homeRow.team_id, matchId);
  const awayAbsences = detectKeyAbsences(awayStarters, awayRow.team_id, matchId);

  const homeScore = homeRow.strength_score || 5.0;
  const awayScore = awayRow.strength_score || 5.0;

  // Impact score: how much does this lineup deviate from "expected full strength"?
  // Converts to a −1 to +1 signal fed into prediction engine
  const delta = homeScore - awayScore;         // raw difference
  const impactHome = Math.max(-1, Math.min(1, delta / 3));   // normalise
  const impactAway = -impactHome;

  return {
    available: true,
    source: homeRow.source || 'cached',
    home: {
      formation: homeRow.formation,
      coach: homeRow.coach,
      starters: homeStarters,
      bench: typeof homeRow.bench === 'string' ? JSON.parse(homeRow.bench || '[]') : (homeRow.bench || []),
      strengthScore: homeScore,
      keyAbsences: homeAbsences,
    },
    away: {
      formation: awayRow.formation,
      coach: awayRow.coach,
      starters: awayStarters,
      bench: typeof awayRow.bench === 'string' ? JSON.parse(awayRow.bench || '[]') : (awayRow.bench || []),
      strengthScore: awayScore,
      keyAbsences: awayAbsences,
    },
    strengthDelta: parseFloat(delta.toFixed(2)),
    impactScore: { home: parseFloat(impactHome.toFixed(3)), away: parseFloat(impactAway.toFixed(3)) },
    keyAbsences: {
      home: homeAbsences,
      away: awayAbsences,
    },
  };
}

/**
 * Manual lineup entry — allows you to type in the lineup yourself
 * when scraping fails (common for less-covered matches).
 */
async function submitManualLineup(matchId, side, starters, formation) {
  ensureLineupTable();
  const db = getDb();

  const match = db.prepare(`
    SELECT m.*, ht.elo as home_elo, at.elo as away_elo
    FROM matches m
    JOIN teams ht ON m.home_team = ht.id
    JOIN teams at ON m.away_team = at.id
    WHERE m.id = ?
  `).get(matchId);

  if (!match) throw new Error('Match not found');

  const teamId = side === 'home' ? match.home_team : match.away_team;
  const teamElo = side === 'home' ? match.home_elo : match.away_elo;
  const strengthScore = computeStrengthScore(starters, teamElo);

  db.prepare(`
    INSERT OR REPLACE INTO lineups
      (match_id, team_id, side, formation, starters, bench, strength_score, source)
    VALUES (?, ?, ?, ?, ?, '[]', ?, 'manual')
  `).run([matchId, teamId, side, formation || null, JSON.stringify(starters), strengthScore]);

  return { ok: true, strengthScore };
}

/**
 * Convert lineup impact into win/draw/loss probability adjustment.
 * Called by predictionEngine.js as the 7th factor.
 */
function lineupToProbs(lineupData) {
  if (!lineupData || !lineupData.available) {
    return { winHome: 0.33, draw: 0.34, winAway: 0.33, available: false };
  }

  const impact = lineupData.impactScore?.home || 0;  // −1 to +1

  // Translate to probability nudge
  const base = 1 / 3;
  const nudge = impact * 0.12;  // max ±12% shift from lineup alone

  const winHome = Math.max(0.05, Math.min(0.90, base + nudge));
  const winAway = Math.max(0.05, Math.min(0.90, base - nudge));
  const draw    = Math.max(0.05, 1 - winHome - winAway);
  const total   = winHome + draw + winAway;

  return {
    winHome: winHome / total,
    draw: draw / total,
    winAway: winAway / total,
    available: true,
    strengthDelta: lineupData.strengthDelta,
  };
}

module.exports = { fetchLineup, submitManualLineup, lineupToProbs };
