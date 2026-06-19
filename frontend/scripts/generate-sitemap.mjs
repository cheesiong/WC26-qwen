/**
 * Generates public/sitemap.xml at build time.
 * Reads VITE_SITE_URL from env; if unset, writes a relative-URL placeholder
 * that still works once the Render static site has the variable configured.
 *
 * Run: node scripts/generate-sitemap.mjs
 * Or via npm build: see render.yaml / package.json prebuild
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────
const SITE_URL = (process.env.VITE_SITE_URL || '').replace(/\/$/, '');
if (!SITE_URL) {
  console.warn('[sitemap] VITE_SITE_URL not set — sitemap will have placeholder URLs.');
}
const base = SITE_URL || 'https://REPLACE_WITH_YOUR_DOMAIN';
const today = new Date().toISOString().split('T')[0];

// ── Known IDs (seeded, never change) ─────────────────────────────────────────
const TEAM_IDS = [
  'MEX','KOR','CZE','ZAF','SUI','CAN','BIH','QAT','BRA','MAR','SCO','HTI',
  'USA','TUR','AUS','PAR','GER','ECU','CIV','CUW','NED','JPN','SWE','TUN',
  'BEL','IRN','EGY','NZL','ESP','URU','KSA','CPV','FRA','SEN','NOR','IRQ',
  'ARG','AUT','ALG','JOR','POR','COL','COD','UZB','ENG','CRO','PAN','GHA',
];

const MATCH_IDS = [
  // Group stage (A-L, 6 matches each = 72)
  'A1','A2','A3','A4','A5','A6',
  'B1','B2','B3','B4','B5','B6',
  'C1','C2','C3','C4','C5','C6',
  'D1','D2','D3','D4','D5','D6',
  'E1','E2','E3','E4','E5','E6',
  'F1','F2','F3','F4','F5','F6',
  'G1','G2','G3','G4','G5','G6',
  'H1','H2','H3','H4','H5','H6',
  'I1','I2','I3','I4','I5','I6',
  'J1','J2','J3','J4','J5','J6',
  'K1','K2','K3','K4','K5','K6',
  'L1','L2','L3','L4','L5','L6',
  // Knockout (16 + 8 + 4 + 2 + 1 + 1 = 32)
  'R32-01','R32-02','R32-03','R32-04','R32-05','R32-06','R32-07','R32-08',
  'R32-09','R32-10','R32-11','R32-12','R32-13','R32-14','R32-15','R32-16',
  'R16-01','R16-02','R16-03','R16-04','R16-05','R16-06','R16-07','R16-08',
  'QF-01','QF-02','QF-03','QF-04',
  'SF-01','SF-02',
  'THIRD','FINAL',
];

// ── URL entry builder ─────────────────────────────────────────────────────────
function url(path, { priority = '0.5', changefreq = 'weekly', lastmod = today } = {}) {
  return `
  <url>
    <loc>${base}${path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

// ── Build sitemap ─────────────────────────────────────────────────────────────
const entries = [
  // Static pages
  url('/',            { priority: '1.0', changefreq: 'daily'   }),
  url('/schedule',    { priority: '0.9', changefreq: 'daily'   }),
  url('/predictions', { priority: '0.9', changefreq: 'daily'   }),
  url('/groups',      { priority: '0.8', changefreq: 'daily'   }),
  url('/tournament',  { priority: '0.8', changefreq: 'daily'   }),
  url('/matches',     { priority: '0.7', changefreq: 'daily'   }),
  url('/about',       { priority: '0.4', changefreq: 'monthly' }),

  // Team pages (48)
  ...TEAM_IDS.map(id => url(`/teams/${id}`, { priority: '0.7', changefreq: 'daily' })),

  // Match pages (104)
  ...MATCH_IDS.map(id => url(`/matches/${id}`, { priority: '0.8', changefreq: 'daily' })),
].join('');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;

const outPath = join(__dirname, '../public/sitemap.xml');
writeFileSync(outPath, xml.trim());
console.log(`[sitemap] Written ${TEAM_IDS.length + MATCH_IDS.length + 7} URLs to ${outPath}`);

// Patch robots.txt with the real sitemap URL
import { readFileSync } from 'fs';
const robotsPath = join(__dirname, '../public/robots.txt');
const robots = readFileSync(robotsPath, 'utf8')
  .replace(/Sitemap: .*/, `Sitemap: ${base}/sitemap.xml`);
writeFileSync(robotsPath, robots);
console.log(`[sitemap] Updated robots.txt sitemap URL → ${base}/sitemap.xml`);
