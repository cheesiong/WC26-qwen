/**
 * Data Service — fetches live data from:
 *   1. football-data.org API (free tier)
 *   2. Web scraping (injury news, form, lineups) as fallback
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { getDb } = require('../database/db');
// Lazy-loaded to break the circular dependency:
// predictionEngine → dataService → analysisService → predictionEngine
let _recordMatchResult;
function getRecordMatchResult() {
  if (!_recordMatchResult) ({ recordMatchResult: _recordMatchResult } = require('./analysisService'));
  return _recordMatchResult;
}

const FOOTBALL_DATA_API = 'https://api.football-data.org/v4';
const API_KEY = process.env.FOOTBALL_DATA_API_KEY || '';

const { chatComplete, QWEN_MODELS } = require('./qwenClient');

// API client
const apiClient = axios.create({
  baseURL: FOOTBALL_DATA_API,
  headers: { 'X-Auth-Token': API_KEY },
  timeout: 10000,
});

// Cache TTL constants (ms)
const CACHE_HOURS = {
  form: 12,
  h2h: 24,
  intel: 4,    // refresh injury news more frequently
};

function isCacheValid(fetchedAt, hours) {
  if (!fetchedAt) return false;
  const age = Date.now() - new Date(fetchedAt).getTime();
  return age < hours * 3600 * 1000;
}

// ──────────────────────────────────────────────────────────────────
//  TEAM RECENT FORM
// ──────────────────────────────────────────────────────────────────

// Map our team IDs to football-data.org team IDs.
// Verified 2026-06-12 against /competitions/WC/teams — the previous map was
// almost entirely stale (e.g. MEX:764 was actually Brazil, TUR:769 was
// actually Mexico) which made syncLiveResults skip every finished match.
const TEAM_ID_MAP = {
  ALG: 778,  ARG: 762,  AUS: 779,  AUT: 816,  BEL: 805,  BIH: 1060,
  BRA: 764,  CAN: 828,  CIV: 1935, COD: 1934, COL: 818,  CPV: 1930,
  CRO: 799,  CUW: 9460, CZE: 798,  ECU: 791,  EGY: 825,  ENG: 770,
  ESP: 760,  FRA: 773,  GER: 759,  GHA: 763,  HTI: 836,  IRN: 840,
  IRQ: 8062, JOR: 8049, JPN: 766,  KOR: 772,  KSA: 801,  MAR: 815,
  MEX: 769,  NED: 8601, NOR: 8872, NZL: 783,  PAN: 1836, PAR: 761,
  POR: 765,  QAT: 8030, SCO: 8873, SEN: 804,  SUI: 788,  SWE: 792,
  TUN: 802,  TUR: 803,  URU: 758,  USA: 771,  UZB: 8070, ZAF: 774,
};

// Reverse map: football-data.org team ID → our 3-letter code
const API_TO_TEAM_ID = Object.entries(TEAM_ID_MAP).reduce((acc, [k, v]) => {
  if (v) acc[v] = k;
  return acc;
}, {});

async function fetchTeamForm(teamId) {
  const db = getDb();

  // Check cache
  const cached = db.prepare(`
    SELECT * FROM web_intel_cache
    WHERE team_id = ? AND intel_type = 'form'
    ORDER BY fetched_at DESC LIMIT 1
  `).get(teamId);

  if (cached && isCacheValid(cached.fetched_at, CACHE_HOURS.form)) {
    return JSON.parse(cached.content);
  }

  // Try API
  const apiTeamId = TEAM_ID_MAP[teamId];
  if (API_KEY && apiTeamId) {
    try {
      const resp = await apiClient.get(`/teams/${apiTeamId}/matches?status=FINISHED&limit=10`);
      const matches = resp.data.matches || [];
      const form = matches.map(m => {
        const isHome = m.homeTeam.id === apiTeamId;
        const homeGoals = m.score.fullTime.home;
        const awayGoals = m.score.fullTime.away;
        let result;
        if (isHome) result = homeGoals > awayGoals ? 'W' : homeGoals === awayGoals ? 'D' : 'L';
        else result = awayGoals > homeGoals ? 'W' : awayGoals === homeGoals ? 'D' : 'L';
        return {
          date: m.utcDate,
          opponent: isHome ? m.awayTeam.name : m.homeTeam.name,
          result,
          goalsFor: isHome ? homeGoals : awayGoals,
          goalsAgainst: isHome ? awayGoals : homeGoals,
          competition: m.competition.name,
        };
      });

      // Cache it
      db.prepare(`
        INSERT INTO web_intel_cache (team_id, intel_type, content, fetched_at, expires_at)
        VALUES (?, 'form', ?, datetime('now'), datetime('now', '+${CACHE_HOURS.form} hours'))
      `).run([teamId, JSON.stringify(form)]);

      return form;
    } catch (e) {
      console.warn(`API form fetch failed for ${teamId}:`, e.message);
    }
  }

  // Fallback: web scrape from FIFA or ESPN
  let form;
  try {
    form = await scrapeTeamForm(teamId);
  } catch (e) {
    console.warn(`Scrape form failed for ${teamId}:`, e.message);
    form = generateDefaultForm(teamId);
  }

  // Cache fallback so we don't retry the network on every prediction call
  db.prepare(`
    INSERT INTO web_intel_cache (team_id, intel_type, content, fetched_at, expires_at)
    VALUES (?, 'form', ?, datetime('now'), datetime('now', '+${CACHE_HOURS.form} hours'))
  `).run([teamId, JSON.stringify(form)]);

  return form;
}

async function scrapeTeamForm(teamId) {
  // Try ESPN
  const teamNames = {
    ARG: 'argentina', BRA: 'brazil', ENG: 'england', FRA: 'france',
    GER: 'germany', ESP: 'spain', POR: 'portugal', NED: 'netherlands',
    BEL: 'belgium', CRO: 'croatia', URU: 'uruguay', MEX: 'mexico',
    USA: 'usa', KOR: 'south-korea', JPN: 'japan', MAR: 'morocco',
    SEN: 'senegal', COL: 'colombia', SUI: 'switzerland', NOR: 'norway',
    CAN: 'canada', ECU: 'ecuador', AUT: 'austria', ALG: 'algeria',
    SCO: 'scotland', TUR: 'turkey',
  };

  const espnName = teamNames[teamId];
  if (!espnName) return generateDefaultForm(teamId);

  const url = `https://www.espn.com/soccer/club/_/id/4/type/national/${espnName}`;
  const resp = await axios.get(url, {
    timeout: 8000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WC2026Predictor/1.0)' },
  });

  // Parse last 5 results from ESPN
  const $ = cheerio.load(resp.data);
  const form = [];

  $('.gameResult, .Schedule__ResultParts').each((i, el) => {
    if (i >= 10) return false;
    const text = $(el).text().trim().toUpperCase();
    if (text.startsWith('W')) form.push({ result: 'W' });
    else if (text.startsWith('D')) form.push({ result: 'D' });
    else if (text.startsWith('L')) form.push({ result: 'L' });
  });

  return form.length > 0 ? form : generateDefaultForm(teamId);
}

function generateDefaultForm(teamId) {
  const db = getDb();
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
  if (!team) return Array(5).fill({ result: 'D' });

  // Use win rate from ELO to generate plausible form
  const eloAdv = team.elo - 1500; // vs average team
  const winRate = 1 / (1 + Math.exp(-eloAdv / 200));

  return Array(8).fill(null).map(() => {
    const r = Math.random();
    const result = r < winRate * 0.7 ? 'W' : r < winRate * 0.7 + 0.2 ? 'D' : 'L';
    return { result, date: new Date().toISOString(), synthetic: true };
  });
}

// ──────────────────────────────────────────────────────────────────
//  HEAD-TO-HEAD RECORDS
// ──────────────────────────────────────────────────────────────────
async function fetchHeadToHead(homeTeamId, awayTeamId) {
  const db = getDb();
  const cacheKey = [homeTeamId, awayTeamId].sort().join('_');

  const cached = db.prepare(`
    SELECT * FROM web_intel_cache
    WHERE team_id = ? AND intel_type = 'h2h'
    ORDER BY fetched_at DESC LIMIT 1
  `).get(cacheKey);

  if (cached && isCacheValid(cached.fetched_at, CACHE_HOURS.h2h)) {
    return JSON.parse(cached.content);
  }

  let h2hData = [];

  // Try API
  const homeApiId = TEAM_ID_MAP[homeTeamId];
  const awayApiId = TEAM_ID_MAP[awayTeamId];

  if (API_KEY && homeApiId && awayApiId) {
    try {
      const resp = await apiClient.get(`/teams/${homeApiId}/matches?status=FINISHED&limit=20`);
      const matches = (resp.data.matches || []).filter(m =>
        m.homeTeam.id === awayApiId || m.awayTeam.id === awayApiId
      );

      h2hData = matches.slice(0, 8).map(m => {
        const homeGoals = m.score.fullTime.home;
        const awayGoals = m.score.fullTime.away;
        let winner = null;
        if (m.homeTeam.id === homeApiId) {
          if (homeGoals > awayGoals) winner = homeTeamId;
          else if (awayGoals > homeGoals) winner = awayTeamId;
        } else {
          if (awayGoals > homeGoals) winner = homeTeamId;
          else if (homeGoals > awayGoals) winner = awayTeamId;
        }
        return { date: m.utcDate, winner, homeScore: homeGoals, awayScore: awayGoals };
      });
    } catch (e) {
      console.warn('H2H API failed:', e.message);
    }
  }

  // If no API data, use static historical estimates
  if (h2hData.length === 0) {
    h2hData = generateH2HDefault(homeTeamId, awayTeamId);
  }

  db.prepare(`
    INSERT INTO web_intel_cache (team_id, intel_type, content, fetched_at, expires_at)
    VALUES (?, 'h2h', ?, datetime('now'), datetime('now', '+${CACHE_HOURS.h2h} hours'))
  `).run([cacheKey, JSON.stringify(h2hData)]);

  return h2hData;
}

function generateH2HDefault(homeTeamId, awayTeamId) {
  const db = getDb();
  const home = db.prepare('SELECT elo FROM teams WHERE id = ?').get(homeTeamId);
  const away = db.prepare('SELECT elo FROM teams WHERE id = ?').get(awayTeamId);
  if (!home || !away) return [];

  const homeWinRate = 1 / (1 + Math.pow(10, (away.elo - home.elo) / 400));
  const numMatches = 5 + Math.floor(Math.random() * 4);

  return Array(numMatches).fill(null).map((_, i) => {
    const r = Math.random();
    let winner = null;
    if (r < homeWinRate * 0.7) winner = homeTeamId;
    else if (r < homeWinRate * 0.7 + 0.25) winner = null; // draw
    else winner = awayTeamId;
    return { date: `${2020 - i}-01-01`, winner, synthetic: true };
  });
}

// ──────────────────────────────────────────────────────────────────
//  WEB INTELLIGENCE (injuries, news, lineups)
// ──────────────────────────────────────────────────────────────────

// Scrape raw news text for a team (injuries, form, squad news)
// Uses DuckDuckGo Lite — scraping-friendly, no JS, no bot detection
async function scrapeTeamNews(teamName) {
  try {
    const query = encodeURIComponent(`${teamName} World Cup 2026 injury suspension squad news`);
    const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
    const resp = await axios.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WC2026Bot/1.0)' },
    });
    const $ = cheerio.load(resp.data, { xmlMode: true });
    const parts = [];
    $('item').slice(0, 8).each((_, el) => {
      const title = $(el).find('title').text().trim();
      const desc = $(el).find('description').text().replace(/<[^>]+>/g, '').trim();
      if (title) parts.push(`${title}. ${desc}`);
    });
    return parts.join(' ').slice(0, 3000);
  } catch {
    return '';
  }
}

// Send raw text to Qwen LLM; returns structured intel or null on failure
// Server-side anti-hallucination check: a claimed injury must show up in the
// raw source text within 120 chars of an injury keyword. Filters out LLM
// confabulations like "Ronaldo injured" when the only mention is a career quote.
const INJURY_KW_RE = /\b(injur|suspen|ruled out|sidelined|hamstring|knee|ankle|ACL|MCL|fractur|withdraw|out of the (squad|tournament|world cup)|miss(?:es|ing)? (?:out|the))\b/i;

function verifyInjuriesAgainstSource(claimed, rawText) {
  if (!Array.isArray(claimed) || !rawText) return [];
  return claimed.filter(name => {
    if (typeof name !== 'string' || !name.trim()) return false;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = rawText.match(new RegExp(escaped, 'i'));
    if (!m) return false;
    const start = Math.max(0, m.index - 120);
    const context = rawText.substring(start, m.index + name.length + 120);
    return INJURY_KW_RE.test(context);
  });
}

async function parseIntelWithLLM(homeTeamName, awayTeamName, homeRawText, awayRawText, matchContext = {}) {
  const { homeGamesPlayed = 0, awayGamesPlayed = 0, homePts = 0, awayPts = 0, stage = 'GROUP' } = matchContext;

  const contextLine = stage === 'GROUP'
    ? `Tournament context: Group stage. ${homeTeamName} have played ${homeGamesPlayed} group matches (${homePts} pts). ${awayTeamName} have played ${awayGamesPlayed} group matches (${awayPts} pts).`
    : `Tournament context: ${stage} knockout match — both teams are eliminated if they lose.`;

  const prompt = `You are a football analyst extracting pre-match intelligence from raw web search text.

Home team: ${homeTeamName}
Away team: ${awayTeamName}
${contextLine}

Search results for ${homeTeamName}:
${homeRawText || '(no data)'}

Search results for ${awayTeamName}:
${awayRawText || '(no data)'}

Return a JSON object with exactly these fields:
{
  "homeInjuries": [injured/suspended/doubtful player names, max 5, empty array if none confirmed],
  "awayInjuries": [same for away team],
  "homeForm": "excellent" | "good" | "normal" | "poor",
  "awayForm": "excellent" | "good" | "normal" | "poor",
  "homeRotating": true if squad rotation/resting is expected, false otherwise,
  "awayRotating": true if squad rotation/resting is expected, false otherwise,
  "homeMotivation": "high" | "normal" | "low",
  "awayMotivation": "high" | "normal" | "low",
  "keySummary": "one sentence (max 100 chars) about the single most impactful pre-match factor"
}

Rules:
- For homeInjuries / awayInjuries: only list a player if the text EXPLICITLY says they are injured, suspended, ruled out, or unavailable for this match. The player's name MUST appear in the search text AND the text must describe them as unavailable. Do NOT include a player just because their name is mentioned in passing, in a quote, or in career commentary. If in doubt, return an empty array.
- Form: 4+ wins from last 5 = excellent; 3 wins = good; 1-2 wins = poor; otherwise normal
- Motivation: "high" only for genuine elimination pressure (must win to stay alive) or a knockout match. A team in their first or second group match with wins still possible is NOT in a must-win situation — use "normal". Use "low" only if they are already qualified or playing a dead rubber.
- Respond with ONLY the JSON object, no explanation or markdown`;

  try {
    const result = await chatComplete({
      model: QWEN_MODELS.PLUS,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 512,
      temperature: 0.1,
    });
    const text = result.text;
    if (!text) return null;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    // Drop any injury whose name doesn't appear next to an injury keyword in
    // the source text — guards against LLM confabulation.
    const claimedHome = parsed.homeInjuries || [];
    const claimedAway = parsed.awayInjuries || [];
    parsed.homeInjuries = verifyInjuriesAgainstSource(claimedHome, homeRawText);
    parsed.awayInjuries = verifyInjuriesAgainstSource(claimedAway, awayRawText);
    // If a player name was dropped, nuke keySummary too — it likely references
    // the same hallucinated absence ("Team X missing Y, Z").
    const droppedAny =
      claimedHome.length !== parsed.homeInjuries.length ||
      claimedAway.length !== parsed.awayInjuries.length;
    if (droppedAny) parsed.keySummary = null;
    // Also validate keySummary: if it mentions a player being absent/injured but
    // that player isn't in the validated injuries list, null out the summary
    // (guards against LLM hallucinations like "no CR7" when Ronaldo is playing).
    if (parsed.keySummary) {
      const allValidatedInjuries = [...parsed.homeInjuries, ...parsed.awayInjuries];
      // Match player names after absence keywords: "no CR7", "missing Ronaldo", "without Mbappe", etc.
      const playerMentionRe = /(?:no |missing |without |absent: )([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)/i;
      const match = parsed.keySummary.match(playerMentionRe);
      if (match) {
        const mentionedPlayer = match[1];
        const isInInjuries = allValidatedInjuries.some(
          inj => inj.toLowerCase() === mentionedPlayer.toLowerCase()
        );
        if (!isInInjuries) {
          console.warn(`[parseIntelWithLLM] keySummary mentions "${mentionedPlayer}" as absent but not in validated injuries — nulling summary`);
          parsed.keySummary = null;
        }
      }
    }
    return parsed;
  } catch (e) {
    console.warn('Qwen intel parsing failed:', e.message);
    return null;
  }
}

// Regex fallback: extract injury names when LLM is unavailable
async function scrapeInjuriesFallback(teamName) {
  try {
    const query = encodeURIComponent(`${teamName} injury World Cup 2026`);
    const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
    const resp = await axios.get(url, {
      timeout: 6000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WC2026Bot/1.0)' },
    });
    const $ = cheerio.load(resp.data, { xmlMode: true });
    const parts = [];
    $('item').slice(0, 6).each((_, el) => {
      parts.push($(el).find('title').text().trim());
    });
    const text = parts.join(' ');
    const injuries = [];
    const keywords = ['injured', 'doubt', 'ruled out', 'fitness concern', 'suspended'];
    for (const kw of keywords) {
      const idx = text.toLowerCase().indexOf(kw);
      if (idx > -1) {
        const context = text.substring(Math.max(0, idx - 50), idx + 60);
        const nameMatch = context.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|has been|was)/);
        if (nameMatch && !injuries.includes(nameMatch[1])) injuries.push(nameMatch[1]);
      }
    }
    return injuries.slice(0, 3);
  } catch {
    return [];
  }
}

async function fetchWebIntel(homeTeamId, awayTeamId, matchDate, stage = 'GROUP') {
  const db = getDb();
  const cacheKey = `${homeTeamId}_vs_${awayTeamId}_${matchDate}`;

  const cached = db.prepare(`
    SELECT * FROM web_intel_cache
    WHERE team_id = ? AND intel_type = 'intel'
    ORDER BY fetched_at DESC LIMIT 1
  `).get(cacheKey);

  if (cached && isCacheValid(cached.fetched_at, CACHE_HOURS.intel)) {
    return JSON.parse(cached.content);
  }

  const home = db.prepare('SELECT * FROM teams WHERE id = ?').get(homeTeamId);
  const away = db.prepare('SELECT * FROM teams WHERE id = ?').get(awayTeamId);
  if (!home || !away) return null;

  const matchContext = {
    stage,
    homeGamesPlayed: home.gs_played || 0,
    awayGamesPlayed: away.gs_played || 0,
    homePts: home.gs_pts || 0,
    awayPts: away.gs_pts || 0,
  };

  let intel = {
    homeInjuries: [],
    awayInjuries: [],
    homeForm: 'normal',
    awayForm: 'normal',
    homeRotating: false,
    awayRotating: false,
    homeMotivation: 'normal',
    awayMotivation: 'normal',
    keySummary: null,
    fetchedAt: new Date().toISOString(),
    llmParsed: false,
  };

  // Scrape raw news text for both teams in parallel
  const [homeRawText, awayRawText] = await Promise.all([
    scrapeTeamNews(home.name),
    scrapeTeamNews(away.name),
  ]);

  // Try LLM parsing; fall back to regex-only on failure or missing key
  const llmIntel = await parseIntelWithLLM(home.name, away.name, homeRawText, awayRawText, matchContext);
  if (llmIntel) {
    Object.assign(intel, llmIntel, { llmParsed: true, fetchedAt: new Date().toISOString() });

    // Hard rule: group stage teams with games still to play cannot be in must-win/elimination
    // pressure unless they are mathematically unable to qualify (handled by LLM context above).
    // As a safety net, demote "high" motivation on match 1 (0 games played) for either side.
    if (stage === 'GROUP') {
      if (matchContext.homeGamesPlayed === 0) intel.homeMotivation = 'normal';
      if (matchContext.awayGamesPlayed === 0) intel.awayMotivation = 'normal';
    }
  } else {
    try {
      const [homeInjuries, awayInjuries] = await Promise.all([
        scrapeInjuriesFallback(home.name),
        scrapeInjuriesFallback(away.name),
      ]);
      intel.homeInjuries = homeInjuries;
      intel.awayInjuries = awayInjuries;
    } catch (e) {
      console.warn('Injury fallback scrape failed:', e.message);
    }
  }

  db.prepare(`
    INSERT INTO web_intel_cache (team_id, intel_type, content, fetched_at, expires_at)
    VALUES (?, 'intel', ?, datetime('now'), datetime('now', '+${CACHE_HOURS.intel} hours'))
  `).run([cacheKey, JSON.stringify(intel)]);

  return intel;
}

// ──────────────────────────────────────────────────────────────────
//  SYNC LIVE RESULTS FROM API
// ──────────────────────────────────────────────────────────────────
async function syncLiveResults() {
  if (!API_KEY) {
    console.warn('No FOOTBALL_DATA_API_KEY set — skipping live sync');
    return [];
  }

  const db = getDb();
  const updated = [];

  // Returns { row, reversed } where `reversed` is true if our DB stores the
  // pairing as (away,home) relative to the API. Callers must swap scores when
  // reversed=true so the score lands in the right column.
  const findExisting = (apiMatch) => {
    const homeTeamId = API_TO_TEAM_ID[apiMatch.homeTeam.id];
    const awayTeamId = API_TO_TEAM_ID[apiMatch.awayTeam.id];
    if (!homeTeamId || !awayTeamId) {
      console.warn(`syncLiveResults: unknown API team IDs ${apiMatch.homeTeam.id}/${apiMatch.awayTeam.id} — skipping`);
      return null;
    }
    const direct = db.prepare(`
      SELECT * FROM matches WHERE home_team = ? AND away_team = ?
    `).get([homeTeamId, awayTeamId]);
    if (direct) return { row: direct, reversed: false };
    const swapped = db.prepare(`
      SELECT * FROM matches WHERE home_team = ? AND away_team = ?
    `).get([awayTeamId, homeTeamId]);
    if (swapped) {
      console.warn(`syncLiveResults: API home/away for ${swapped.id} reversed vs DB (${homeTeamId} vs ${awayTeamId}) — swapping scores`);
      return { row: swapped, reversed: true };
    }
    return null;
  };

  // ── 1. Flip in-progress matches to LIVE so predictionEngine freezes them.
  //    Without this, the hourly prediction cron can re-run during the ~2-hour
  //    match window and overwrite the pre-match prediction.
  try {
    const resp = await apiClient.get('/competitions/WC/matches?status=IN_PLAY,PAUSED');
    for (const m of (resp.data.matches || [])) {
      const found = findExisting(m);
      if (found && found.row.status === 'SCHEDULED') {
        db.prepare(`UPDATE matches SET status = 'LIVE' WHERE id = ?`).run([found.row.id]);
        updated.push(found.row.id);
      }
    }
  } catch (e) {
    console.error('Live sync (in-play) failed:', e.message);
  }

  // ── 2. Record final scores for finished matches.
  try {
    const resp = await apiClient.get('/competitions/WC/matches?status=FINISHED');
    const toUpdate = [];
    for (const m of (resp.data.matches || [])) {
      const found = findExisting(m);
      if (found && found.row.status !== 'COMPLETED') {
        toUpdate.push({ m, found });
      }
    }

    for (const { m, found } of toUpdate) {
      let apiHome = m.score.fullTime.home;
      let apiAway = m.score.fullTime.away;
      if (apiHome == null || apiAway == null) {
        console.warn(`syncLiveResults: null scores for match ${found.row.id} — skipping`);
        continue;
      }
      let apiHomePens = m.score.penalties?.home ?? null;
      let apiAwayPens = m.score.penalties?.away ?? null;

      // Sanity check: detect if API returned penalty scores in fullTime field.
      // Typical FT scores are 0-5 per team. If both scores are >= 3 AND penalty
      // scores exist, it's likely the API mixed them up (e.g. 5-6 instead of 1-1).
      // In this case, swap: use penalties as penalties, and try to infer FT from
      // the match context or set to a draw.
      if (apiHome >= 3 && apiAway >= 3 && apiHomePens != null && apiAwayPens != null) {
        console.warn(`syncLiveResults: ${found.row.id} FT scores (${apiHome}-${apiAway}) look like penalties. ` +
          `Penalties exist (${apiHomePens}-${apiAwayPens}). Assuming FT was a draw or using context.`);
        // If penalties exist and FT looks like pens, the API likely duplicated.
        // We can't know the exact FT score, but we know it was a draw (since pens were needed).
        // Use 0-0 as a safe default for draws that went to penalties, or check if
        // the API has extraTime scores.
        const apiHomeET = m.score.extraTime?.home ?? null;
        const apiAwayET = m.score.extraTime?.away ?? null;
        if (apiHomeET != null && apiAwayET != null) {
          // Extra time exists - use it as FT (it includes ET goals)
          apiHome = apiHomeET;
          apiAway = apiAwayET;
          console.log(`syncLiveResults: ${found.row.id} using extraTime scores: ${apiHome}-${apiAway}`);
        } else {
          // No extra time - assume it was a 0-0 draw that went to penalties
          // (most common scenario for penalty shootouts)
          apiHome = 0;
          apiAway = 0;
          console.log(`syncLiveResults: ${found.row.id} assuming 0-0 FT (draw went to penalties)`);
        }
      }

      const homeScore = found.reversed ? apiAway : apiHome;
      const awayScore = found.reversed ? apiHome : apiAway;
      const homePens  = found.reversed ? apiAwayPens : apiHomePens;
      const awayPens  = found.reversed ? apiHomePens : apiAwayPens;
      try {
        await getRecordMatchResult()(found.row.id, homeScore, awayScore, homePens, awayPens);
        updated.push(found.row.id);
      } catch (e) {
        console.error(`syncLiveResults: failed to record result for match ${found.row.id}:`, e.message);
      }
    }
  } catch (e) {
    console.error('Live sync (finished) failed:', e.message);
  }

  return updated;
}

module.exports = { fetchTeamForm, fetchWebIntel, syncLiveResults };
