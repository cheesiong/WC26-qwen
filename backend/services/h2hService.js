/**
 * ═══════════════════════════════════════════════════════════════════
 *  REAL HEAD-TO-HEAD SERVICE
 *  Source: github.com/martj42/international_results
 *  CSV covers every international match from 1872 → present
 * ═══════════════════════════════════════════════════════════════════
 *
 *  On first call, downloads the CSV and seeds a local h2h_results table.
 *  Subsequent calls are pure SQLite — fast, offline-capable.
 *
 *  Competition weighting (more important competitions count more):
 *   FIFA World Cup               × 4.0
 *   FIFA World Cup qualification × 2.5
 *   Continental championship     × 2.0  (Euros, Copa América, AFCON, …)
 *   Continental qualification    × 1.5
 *   Nations League / Gold Cup    × 1.2
 *   Friendly                     × 0.5
 */

const axios = require('axios');
const { getDb } = require('../database/db');

const H2H_CSV_URL =
  'https://raw.githubusercontent.com/martj42/international_results/master/results.csv';

// ── Map dataset team names → our 3-letter IDs ─────────────────────
// The CSV uses full English names; we need to normalise them.
const NAME_TO_ID = {
  'France': 'FRA', 'Spain': 'ESP', 'Argentina': 'ARG', 'England': 'ENG',
  'Portugal': 'POR', 'Brazil': 'BRA', 'Netherlands': 'NED', 'Morocco': 'MAR',
  'Belgium': 'BEL', 'Germany': 'GER', 'Croatia': 'CRO', 'Colombia': 'COL',
  'Senegal': 'SEN', 'Mexico': 'MEX', 'United States': 'USA', 'Uruguay': 'URU',
  'Japan': 'JPN', 'Switzerland': 'SUI', 'IR Iran': 'IRN', 'Iran': 'IRN',
  'Türkiye': 'TUR', 'Turkey': 'TUR', 'Ecuador': 'ECU', 'Austria': 'AUT',
  'South Korea': 'KOR', 'Korea Republic': 'KOR', 'Australia': 'AUS',
  'Algeria': 'ALG', 'Egypt': 'EGY', 'Canada': 'CAN', 'Norway': 'NOR',
  'Panama': 'PAN', "Côte d'Ivoire": 'CIV', "Ivory Coast": 'CIV',
  'Sweden': 'SWE', 'Paraguay': 'PAR', 'Czechia': 'CZE',
  'Czech Republic': 'CZE', 'Scotland': 'SCO', 'Tunisia': 'TUN',
  'New Zealand': 'NZL',
  'Cape Verde': 'CPV', 'Saudi Arabia': 'KSA', 'Iraq': 'IRQ',
  'Jordan': 'JOR', 'South Africa': 'ZAF', 'Bosnia-Herzegovina': 'BIH',
  'Bosnia and Herzegovina': 'BIH', 'Qatar': 'QAT', 'Haiti': 'HTI',
  'Curaçao': 'CUW', 'Curacao': 'CUW', 'DR Congo': 'COD',
  'Congo DR': 'COD', 'Uzbekistan': 'UZB', 'Ghana': 'GHA',
};

// Reverse map for lookup
const ID_TO_NAMES = {};
for (const [name, id] of Object.entries(NAME_TO_ID)) {
  if (!ID_TO_NAMES[id]) ID_TO_NAMES[id] = [];
  ID_TO_NAMES[id].push(name);
}

// Competition type → weight
function competitionWeight(tournament) {
  const t = (tournament || '').toLowerCase();
  if (t.includes('fifa world cup') && !t.includes('qualif')) return 4.0;
  if (t.includes('world cup qualif') || t.includes('wc qualif'))  return 2.5;
  if (t.includes('uefa euro') || t.includes('copa america') ||
      t.includes('africa cup') || t.includes('asian cup') ||
      t.includes('gold cup') || t.includes('concacaf championship')) return 2.0;
  if (t.includes('qualif') || t.includes('qualifier'))            return 1.5;
  if (t.includes('nations league') || t.includes('confederations')) return 1.2;
  if (t.includes('friendly'))                                      return 0.5;
  return 1.0; // default for other official matches
}

// ── Schema additions ──────────────────────────────────────────────
function ensureH2HTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS h2h_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_date TEXT,
      team_a TEXT,   -- always our 3-letter ID
      team_b TEXT,
      score_a INTEGER,
      score_b INTEGER,
      tournament TEXT,
      comp_weight REAL,
      neutral INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_h2h_teams ON h2h_results (team_a, team_b);
    CREATE TABLE IF NOT EXISTS h2h_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

// ── Download & seed ────────────────────────────────────────────────
let seedInProgress = false;

async function ensureH2HData() {
  ensureH2HTable();
  const db = getDb();

  const meta = db.prepare("SELECT value FROM h2h_meta WHERE key = 'seeded_at'").get();
  if (meta) return; // already seeded

  if (seedInProgress) {
    // Wait for the other call to finish
    await new Promise(resolve => setTimeout(resolve, 3000));
    return;
  }

  seedInProgress = true;
  console.log('📥 Downloading international results dataset (~47k matches)…');

  try {
    const resp = await axios.get(H2H_CSV_URL, { timeout: 30000, responseType: 'text' });
    const lines = resp.data.split('\n');

    const insert = db.prepare(`
      INSERT INTO h2h_results (match_date, team_a, team_b, score_a, score_b, tournament, comp_weight, neutral)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let inserted = 0;
    db.exec('BEGIN');
    try {
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // CSV: date,home_team,away_team,home_score,away_score,tournament,city,country,neutral
        const parts = parseCSVLine(line);
        if (parts.length < 8) continue;

        const [date, homeName, awayName, homeScore, awayScore, tournament, , , neutral] = parts;

        const homeId = NAME_TO_ID[homeName];
        const awayId = NAME_TO_ID[awayName];
        if (!homeId || !awayId) continue; // skip teams not in our tournament

        const hGoals = parseInt(homeScore);
        const aGoals = parseInt(awayScore);
        if (isNaN(hGoals) || isNaN(aGoals)) continue;

        // Store with teams always in alphabetical order to simplify queries
        const [tA, tB, sA, sB] = homeId < awayId
          ? [homeId, awayId, hGoals, aGoals]
          : [awayId, homeId, aGoals, hGoals];

        insert.run([
          date, tA, tB, sA, sB, tournament,
          competitionWeight(tournament),
          neutral === 'TRUE' ? 1 : 0,
        ]);
        inserted++;
      }
      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }
    db.prepare("INSERT OR REPLACE INTO h2h_meta (key, value) VALUES ('seeded_at', ?)").run(new Date().toISOString());
    console.log(`✅ H2H database seeded: ${inserted} matches across ${Object.keys(NAME_TO_ID).length} teams`);
  } catch (e) {
    console.error('H2H download failed:', e.message);
  } finally {
    seedInProgress = false;
  }
}

// Simple CSV line parser (handles quoted fields)
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; continue; }
    if (char === ',' && !inQuotes) { result.push(current); current = ''; continue; }
    current += char;
  }
  result.push(current);
  return result;
}

// ── Query real H2H ────────────────────────────────────────────────
/**
 * Returns the last N matches between teamAId and teamBId,
 * enriched with competition weight and recency weight.
 *
 * Returns:
 *   { matches, summary: { aWins, draws, bWins, totalMatches,
 *                         wcMeetings, lastMeeting, weightedAdvantage } }
 *
 * weightedAdvantage > 0 means teamA has historically dominated.
 */
async function getRealH2H(teamAId, teamBId, limit = 15) {
  await ensureH2HData();
  const db = getDb();

  // Normalise to alphabetical order (same as how we store)
  const [storedA, storedB] = teamAId < teamBId
    ? [teamAId, teamBId]
    : [teamBId, teamAId];

  const rows = db.prepare(`
    SELECT * FROM h2h_results
    WHERE team_a = ? AND team_b = ?
    ORDER BY match_date DESC
    LIMIT ?
  `).all([storedA, storedB, limit]);

  if (rows.length === 0) {
    return { matches: [], summary: null };
  }

  // Enrich with recency weighting
  const totalRows = rows.length;
  const enriched = rows.map((row, i) => {
    // Recency weight: most recent = 1.0, oldest in set ≈ 0.3
    const recencyWeight = 1 - (i / totalRows) * 0.7;
    const combinedWeight = row.comp_weight * recencyWeight;

    // Who won from teamAId's perspective?
    const aIsStoredA = teamAId === storedA;
    const aGoals = aIsStoredA ? row.score_a : row.score_b;
    const bGoals = aIsStoredA ? row.score_b : row.score_a;

    return {
      date: row.match_date,
      tournament: row.tournament,
      aGoals, bGoals,
      winner: aGoals > bGoals ? teamAId : aGoals < bGoals ? teamBId : null,
      compWeight: row.comp_weight,
      recencyWeight,
      combinedWeight,
      neutral: row.neutral === 1,
    };
  });

  // Compute weighted summary
  let aWeightedWins = 0, bWeightedWins = 0;
  let aWins = 0, bWins = 0, draws = 0;
  let wcMeetings = 0;
  let totalWeight = 0;

  for (const m of enriched) {
    totalWeight += m.combinedWeight;
    if (m.winner === teamAId)   { aWeightedWins += m.combinedWeight; aWins++; }
    else if (m.winner === teamBId) { bWeightedWins += m.combinedWeight; bWins++; }
    else                        { draws++; }

    if (m.tournament.toLowerCase().includes('fifa world cup') &&
        !m.tournament.toLowerCase().includes('qualif')) wcMeetings++;
  }

  const weightedAdvantage = totalWeight > 0
    ? (aWeightedWins - bWeightedWins) / totalWeight   // −1 to +1
    : 0;

  return {
    matches: enriched,
    summary: {
      aWins, bWins, draws,
      totalMatches: rows.length,
      wcMeetings,
      lastMeeting: enriched[0],
      weightedAdvantage,   // positive = teamA historically stronger
    },
  };
}

/**
 * Convert real H2H summary to win/draw/loss probability vector.
 * Falls back to ELO-neutral probs if no history exists.
 */
async function h2hToProbs(teamAId, teamBId) {
  const { summary } = await getRealH2H(teamAId, teamBId);

  if (!summary || summary.totalMatches < 2) {
    // Not enough history — return neutral probs
    return { winHome: 0.34, draw: 0.32, winAway: 0.34, dataQuality: 'NO_DATA', matchCount: 0 };
  }

  const total = summary.aWins + summary.bWins + summary.draws;

  // Raw H2H frequencies
  const rawWinA = summary.aWins / total;
  const rawDraw  = summary.draws / total;
  const rawWinB  = summary.bWins / total;

  // Shrink toward base rates (to avoid over-fitting sparse H2H)
  // Base rates: ~42% win, ~27% draw, ~31% loss for home side in international football
  const BASE = { w: 0.39, d: 0.27, l: 0.34 };
  const shrinkage = Math.max(0.1, 1 - (summary.totalMatches / 20));  // less shrinkage with more data

  const winA = rawWinA * (1 - shrinkage) + BASE.w * shrinkage;
  const draw  = rawDraw  * (1 - shrinkage) + BASE.d * shrinkage;
  const winB  = rawWinB  * (1 - shrinkage) + BASE.l * shrinkage;

  // Normalise
  const sum = winA + draw + winB;
  const dataQuality = summary.totalMatches >= 8 ? 'HIGH'
                    : summary.totalMatches >= 4 ? 'MEDIUM' : 'LOW';

  return {
    winHome: winA / sum,
    draw: draw / sum,
    winAway: winB / sum,
    dataQuality,
    matchCount: summary.totalMatches,
    wcMeetings: summary.wcMeetings,
    weightedAdvantage: summary.weightedAdvantage,
    lastMeeting: summary.lastMeeting,
    rawRecord: { aWins: summary.aWins, draws: summary.draws, bWins: summary.bWins },
  };
}

module.exports = { getRealH2H, h2hToProbs, ensureH2HData };
