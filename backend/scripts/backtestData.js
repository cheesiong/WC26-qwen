/**
 * Backtest data loader.
 *
 * Pulls the martj42/international_results CSV (same source as h2hService.js),
 * caches it on disk, and yields chronologically-sorted matches between
 * WC2026 teams with home/away orientation + neutral flag preserved.
 *
 * The live h2h_results SQLite table stores rows alphabetically and loses
 * home/away info, so we re-parse the CSV directly for backtest.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { TEAMS } = require('../data/teams');

const CSV_URL =
  'https://raw.githubusercontent.com/martj42/international_results/master/results.csv';
const CACHE_PATH = path.join(__dirname, 'cache', 'international_results.csv');

const NAME_TO_ID = {
  'France': 'FRA', 'Spain': 'ESP', 'Argentina': 'ARG', 'England': 'ENG',
  'Portugal': 'POR', 'Brazil': 'BRA', 'Netherlands': 'NED', 'Morocco': 'MAR',
  'Belgium': 'BEL', 'Germany': 'GER', 'Croatia': 'CRO', 'Colombia': 'COL',
  'Senegal': 'SEN', 'Mexico': 'MEX', 'United States': 'USA', 'Uruguay': 'URU',
  'Japan': 'JPN', 'Switzerland': 'SUI', 'IR Iran': 'IRN', 'Iran': 'IRN',
  'Türkiye': 'TUR', 'Turkey': 'TUR', 'Ecuador': 'ECU', 'Austria': 'AUT',
  'South Korea': 'KOR', 'Korea Republic': 'KOR', 'Australia': 'AUS',
  'Algeria': 'ALG', 'Egypt': 'EGY', 'Canada': 'CAN', 'Norway': 'NOR',
  'Panama': 'PAN', "Côte d'Ivoire": 'CIV', 'Ivory Coast': 'CIV',
  'Sweden': 'SWE', 'Paraguay': 'PAR', 'Czechia': 'CZE',
  'Czech Republic': 'CZE', 'Scotland': 'SCO', 'Tunisia': 'TUN',
  'New Zealand': 'NZL', 'Cape Verde': 'CPV', 'Saudi Arabia': 'KSA',
  'Iraq': 'IRQ', 'Jordan': 'JOR', 'South Africa': 'ZAF',
  'Bosnia-Herzegovina': 'BIH', 'Bosnia and Herzegovina': 'BIH',
  'Qatar': 'QAT', 'Haiti': 'HTI', 'Curaçao': 'CUW', 'Curacao': 'CUW',
  'DR Congo': 'COD', 'Congo DR': 'COD', 'Uzbekistan': 'UZB', 'Ghana': 'GHA',
};

function downloadCsv() {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(CACHE_PATH)) {
      const stats = fs.statSync(CACHE_PATH);
      const ageHours = (Date.now() - stats.mtimeMs) / 3600000;
      if (ageHours < 24 * 7) {
        return resolve(fs.readFileSync(CACHE_PATH, 'utf8'));
      }
    }
    console.log('Downloading H2H CSV from GitHub…');
    https.get(CSV_URL, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        fs.writeFileSync(CACHE_PATH, body);
        resolve(body);
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Returns matches between WC2026 teams, chronologically ordered.
 * Each match: { date, home, away, homeScore, awayScore, tournament, neutral }
 */
async function loadMatches({ sinceYear = 1990 } = {}) {
  const wc26TeamIds = new Set(TEAMS.map(t => t.id));
  const csv = await downloadCsv();
  const lines = csv.split('\n');

  const matches = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = parseCsvLine(line);
    if (parts.length < 9) continue;
    const [date, homeName, awayName, hs, as, tournament, , , neutral] = parts;
    const home = NAME_TO_ID[homeName];
    const away = NAME_TO_ID[awayName];
    if (!home || !away) continue;
    if (!wc26TeamIds.has(home) || !wc26TeamIds.has(away)) continue;
    const year = parseInt(date.slice(0, 4), 10);
    if (year < sinceYear) continue;
    const homeScore = parseInt(hs, 10);
    const awayScore = parseInt(as, 10);
    if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) continue;
    matches.push({
      date,
      home,
      away,
      homeScore,
      awayScore,
      tournament,
      neutral: neutral === 'TRUE',
    });
  }

  matches.sort((a, b) => a.date.localeCompare(b.date));
  return matches;
}

module.exports = { loadMatches, NAME_TO_ID };
