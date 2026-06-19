/**
 * Betting Odds Service
 *
 * Fetches real bookmaker odds via The Odds API (https://the-odds-api.com)
 * Free tier: 500 requests/month, refreshes monthly.
 *
 * Setup: set ODDS_API_KEY in .env
 * Odds are cached in web_intel_cache for 30 minutes to preserve quota.
 *
 * Returns:
 *  { available, bookmakers, consensus, modelEdge }
 *
 * consensus = average across bookmakers → { homeWin, draw, awayWin } in decimal odds
 * implied   = { home, draw, away } in raw probabilities (before vig removal)
 * noVig     = { home, draw, away } normalised (sum to 1.00)
 * modelEdge = our prediction minus no-vig implied prob (+ = model likes it more than market)
 */

const https = require('https');
const { getDb } = require('../database/db');

const ODDS_API_KEY = process.env.ODDS_API_KEY || '';
const CACHE_MINUTES = 30;
const SPORT_KEY = 'soccer_fifa_world_cup';   // The Odds API sport key for WC

// ── Fetch helper ──────────────────────────────────────────────────
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

// ── Convert decimal odds → implied probability ───────────────────
function decimalToImplied(decimal) {
  if (!decimal || decimal <= 1) return 0;
  return 1 / decimal;
}

// ── Remove bookmaker vig, normalise to 1.00 ──────────────────────
function removeVig(home, draw, away) {
  const total = home + draw + away;
  if (total <= 0) return { home: 0.33, draw: 0.33, away: 0.34 };
  return { home: home / total, draw: draw / total, away: away / total };
}

// ── Fetch odds from The Odds API ─────────────────────────────────
async function fetchOddsFromApi(homeTeam, awayTeam) {
  if (!ODDS_API_KEY) return null;

  const url = `https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal`;

  try {
    const { status, data } = await httpsGet(url);
    if (status !== 200 || !Array.isArray(data)) return null;

    // Find the event matching our teams (fuzzy name match)
    const norm = name => name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const hNorm = norm(homeTeam);
    const aNorm = norm(awayTeam);

    const event = data.find(e => {
      const h = norm(e.home_team || '');
      const a = norm(e.away_team || '');
      return (h.includes(hNorm) || hNorm.includes(h)) &&
             (a.includes(aNorm) || aNorm.includes(a));
    });

    if (!event) return null;
    return event;
  } catch (e) {
    console.error('Odds API error:', e.message);
    return null;
  }
}

// ── Parse bookmaker data → consensus odds ────────────────────────
function parseOddsEvent(event, _homeTeamName, _awayTeamName) {
  const bookmakers = [];

  for (const bm of (event.bookmakers || [])) {
    const h2h = bm.markets?.find(m => m.key === 'h2h');
    if (!h2h) continue;

    const homeOutcome = h2h.outcomes?.find(o => o.name === event.home_team);
    const drawOutcome = h2h.outcomes?.find(o => o.name === 'Draw');
    const awayOutcome = h2h.outcomes?.find(o => o.name === event.away_team);

    if (!homeOutcome || !awayOutcome) continue;

    bookmakers.push({
      name: bm.title,
      home: homeOutcome.price,
      draw: drawOutcome?.price ?? null,
      away: awayOutcome.price,
      lastUpdate: h2h.last_update,
    });
  }

  if (bookmakers.length === 0) return null;

  // Average across bookmakers
  const avgHome = bookmakers.reduce((s, b) => s + b.home, 0) / bookmakers.length;
  const avgDraw = bookmakers.filter(b => b.draw).reduce((s, b) => s + (b.draw || 0), 0) / (bookmakers.filter(b => b.draw).length || 1);
  const avgAway = bookmakers.reduce((s, b) => s + b.away, 0) / bookmakers.length;

  const impliedHome = decimalToImplied(avgHome);
  const impliedDraw = decimalToImplied(avgDraw);
  const impliedAway = decimalToImplied(avgAway);

  const noVig = removeVig(impliedHome, impliedDraw, impliedAway);

  return {
    bookmakers,
    consensus: { home: avgHome, draw: avgDraw, away: avgAway },
    implied: { home: impliedHome, draw: impliedDraw, away: impliedAway },
    noVig,
    overround: (impliedHome + impliedDraw + impliedAway - 1).toFixed(3),
    eventId: event.id,
    commenceTime: event.commence_time,
  };
}

// ── Main: get odds for a match (with caching) ────────────────────
async function getMatchOdds(matchId) {
  const db = getDb();

  // Check cache
  const cached = db.prepare(`
    SELECT content, fetched_at FROM web_intel_cache
    WHERE match_id = ? AND intel_type = 'odds'
    ORDER BY fetched_at DESC LIMIT 1
  `).get(matchId);

  if (cached) {
    const ageMinutes = (Date.now() - new Date(cached.fetched_at).getTime()) / 60000;
    if (ageMinutes < CACHE_MINUTES) {
      const parsed = JSON.parse(cached.content);
      return { ...parsed, cached: true, cachedAt: cached.fetched_at };
    }
  }

  // Need fresh data — get match details first
  const match = db.prepare(`
    SELECT m.*, ht.name as home_name, at.name as away_name
    FROM matches m
    JOIN teams ht ON m.home_team = ht.id
    JOIN teams at ON m.away_team = at.id
    WHERE m.id = ?
  `).get(matchId);

  if (!match) return { available: false, reason: 'Match not found' };

  if (!ODDS_API_KEY) {
    // Return mock/illustrative odds based on model predictions
    return getMockOdds(matchId, db);
  }

  // Fetch live odds
  const event = await fetchOddsFromApi(match.home_name, match.away_name);
  if (!event) {
    return { available: false, reason: 'Match not found in odds feed (may not be listed yet)' };
  }

  const oddsData = parseOddsEvent(event, match.home_name, match.away_name);
  if (!oddsData) return { available: false, reason: 'No bookmaker data available' };

  // Compute model edge
  const latestPred = db.prepare(`
    SELECT prob_home, prob_draw, prob_away
    FROM predictions WHERE match_id = ?
    ORDER BY generated_at DESC LIMIT 1
  `).get(matchId);

  const result = {
    available: true,
    ...oddsData,
    modelComparison: latestPred ? {
      edgeHome: (latestPred.prob_home - oddsData.noVig.home).toFixed(3),
      edgeDraw: (latestPred.prob_draw - oddsData.noVig.draw).toFixed(3),
      edgeAway: (latestPred.prob_away - oddsData.noVig.away).toFixed(3),
      modelProbs: { home: latestPred.prob_home, draw: latestPred.prob_draw, away: latestPred.prob_away },
    } : null,
    fetchedAt: new Date().toISOString(),
  };

  // Cache the result
  db.prepare(`
    INSERT INTO web_intel_cache (match_id, intel_type, content, fetched_at, expires_at)
    VALUES (?, 'odds', ?, datetime('now'), datetime('now', '+30 minutes'))
  `).run([matchId, JSON.stringify(result)]);

  return result;
}

// ── Fallback mock odds when no API key ───────────────────────────
function getMockOdds(matchId, db) {
  const pred = db.prepare(`
    SELECT prob_home, prob_draw, prob_away
    FROM predictions WHERE match_id = ?
    ORDER BY generated_at DESC LIMIT 1
  `).get(matchId);

  if (!pred) return { available: false, reason: 'No API key configured and no prediction available for illustration' };

  // Convert our model probs → plausible decimal odds (add ~5% vig)
  const vig = 0.05;
  const factor = 1 + vig;
  const homeDecimal = pred.prob_home > 0.01 ? parseFloat((1 / (pred.prob_home * factor) * factor).toFixed(2)) : null;
  const drawDecimal = pred.prob_draw > 0.01 ? parseFloat((1 / (pred.prob_draw * factor) * factor).toFixed(2)) : null;
  const awayDecimal = pred.prob_away > 0.01 ? parseFloat((1 / (pred.prob_away * factor) * factor).toFixed(2)) : null;

  const impliedHome = homeDecimal ? decimalToImplied(homeDecimal) : 0;
  const impliedDraw = drawDecimal ? decimalToImplied(drawDecimal) : 0;
  const impliedAway = awayDecimal ? decimalToImplied(awayDecimal) : 0;
  const noVig = removeVig(impliedHome, impliedDraw, impliedAway);

  return {
    available: true,
    mock: true,
    bookmakers: [{ name: 'Illustrative (model-derived)', home: homeDecimal, draw: drawDecimal, away: awayDecimal }],
    consensus: { home: homeDecimal, draw: drawDecimal, away: awayDecimal },
    implied: { home: impliedHome, draw: impliedDraw, away: impliedAway },
    noVig,
    overround: ((impliedHome + impliedDraw + impliedAway) - 1).toFixed(3),
    modelComparison: {
      edgeHome: '0.000', edgeDraw: '0.000', edgeAway: '0.000',
      modelProbs: { home: pred.prob_home, draw: pred.prob_draw, away: pred.prob_away },
    },
    note: 'Set ODDS_API_KEY in .env to see real bookmaker odds',
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { getMatchOdds };
