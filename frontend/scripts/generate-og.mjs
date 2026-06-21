import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '../public/og-image.png');

const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#001f6b"/>
      <stop offset="100%" stop-color="#003DA5"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#009A44" stop-opacity="0"/>
      <stop offset="50%" stop-color="#009A44" stop-opacity="1"/>
      <stop offset="100%" stop-color="#FFD700" stop-opacity="1"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Subtle grid lines -->
  <line x1="0" y1="210" x2="1200" y2="210" stroke="white" stroke-opacity="0.04" stroke-width="1"/>
  <line x1="0" y1="420" x2="1200" y2="420" stroke="white" stroke-opacity="0.04" stroke-width="1"/>
  <line x1="400" y1="0" x2="400" y2="630" stroke="white" stroke-opacity="0.04" stroke-width="1"/>
  <line x1="800" y1="0" x2="800" y2="630" stroke="white" stroke-opacity="0.04" stroke-width="1"/>

  <!-- Top accent bar -->
  <rect x="0" y="0" width="1200" height="6" fill="url(#accent)"/>

  <!-- Football icon (simplified) -->
  <circle cx="980" cy="315" r="170" fill="white" fill-opacity="0.04" stroke="white" stroke-opacity="0.08" stroke-width="2"/>
  <circle cx="980" cy="315" r="120" fill="white" fill-opacity="0.04" stroke="white" stroke-opacity="0.06" stroke-width="1"/>

  <!-- WC badge top-left -->
  <rect x="72" y="72" width="6" height="60" rx="3" fill="#FFD700"/>

  <!-- Main heading -->
  <text x="100" y="240" font-family="system-ui, -apple-system, Arial, sans-serif"
        font-size="96" font-weight="800" fill="white" letter-spacing="-4">
    WC<tspan fill="#FFD700">2026</tspan>
  </text>

  <!-- Subtitle -->
  <text x="100" y="320" font-family="system-ui, -apple-system, Arial, sans-serif"
        font-size="40" font-weight="400" fill="white" fill-opacity="0.75" letter-spacing="-0.5">
    AI Match Predictor by Qwen
  </text>

  <!-- Description line -->
  <text x="100" y="390" font-family="system-ui, -apple-system, Arial, sans-serif"
        font-size="26" font-weight="400" fill="white" fill-opacity="0.5">
    ELO · Poisson · Head-to-Head · Web Intelligence
  </text>

  <!-- Bottom accent bar -->
  <rect x="100" y="460" width="320" height="4" rx="2" fill="url(#accent)"/>

  <!-- Stats row -->
  <text x="100" y="530" font-family="system-ui, -apple-system, Arial, sans-serif"
        font-size="22" font-weight="600" fill="white" fill-opacity="0.6">
    48 teams · 12 groups · 104 matches
  </text>

  <!-- Bottom right: FIFA World Cup 2026 -->
  <text x="1128" y="572" font-family="system-ui, -apple-system, Arial, sans-serif"
        font-size="18" font-weight="500" fill="white" fill-opacity="0.35"
        text-anchor="end">
    FIFA World Cup 2026™
  </text>
</svg>
`;

await sharp(Buffer.from(svg))
  .resize(1200, 630)
  .png()
  .toFile(outPath);

console.log(`OG image written to ${outPath}`);
