/**
 * Chinese Landscape Painting Ornaments (山水画纹饰)
 *
 * SVG decorations featuring mountain landscapes, traditional boats,
 * pine trees, lanterns, and water elements inspired by Chinese landscape painting.
 */

/* ── Shared gradient definitions ── */
const LandscapeDefs = ({ id }) => (
  <defs>
    <linearGradient id={`${id}-amber`} x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#E8C547" />
      <stop offset="50%" stopColor="#D4A03C" />
      <stop offset="100%" stopColor="#D4A03C" />
    </linearGradient>
    <linearGradient id={`${id}-terracotta`} x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#C0392B" />
      <stop offset="100%" stopColor="#A93226" />
    </linearGradient>
    <linearGradient id={`${id}-sunrise`} x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stopColor="#E8C547" stopOpacity="0.8" />
      <stop offset="50%" stopColor="#C0392B" stopOpacity="0.6" />
      <stop offset="100%" stopColor="#E8C547" stopOpacity="0.8" />
    </linearGradient>
    <linearGradient id={`${id}-pine`} x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stopColor="#7FB37A" />
      <stop offset="100%" stopColor="#4A7C59" />
    </linearGradient>
    <linearGradient id={`${id}-sky`} x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#6B9BC3" />
      <stop offset="100%" stopColor="#4A7C59" />
    </linearGradient>
  </defs>
);

/** Mountain landscape watermark — layered mountain silhouettes with mist */
export function DragonWatermark({ className = '', opacity = 0.28, size = 280 }) {
  return (
    <svg viewBox="0 0 300 300" className={`absolute pointer-events-none ${className}`}
      style={{ width: size, height: size, opacity, bottom: -20, right: -20 }}>
      <LandscapeDefs id="mountain" />
      {/* Far mountain range — misty background */}
      <g fill="none" stroke="url(#mountain-amber)" strokeWidth="1.2" strokeOpacity="0.45">
        <path d="M20 200 Q60 100 100 150 Q130 80 160 130 Q190 70 220 120 Q250 90 280 160" />
        <path d="M10 210 Q50 130 90 170 Q120 110 150 155 Q180 100 210 140 Q240 110 280 170" />
      </g>
      {/* Near mountain range — more defined */}
      <g fill="none" stroke="url(#mountain-terracotta)" strokeWidth="1.8" strokeOpacity="0.5">
        <path d="M0 240 Q40 160 80 200 Q110 140 150 190 Q180 130 220 180 Q260 150 300 220" />
      </g>
      {/* Mountain fills — subtle wash */}
      <g fill="url(#mountain-amber)" fillOpacity="0.08">
        <path d="M0 240 Q40 160 80 200 Q110 140 150 190 Q180 130 220 180 Q260 150 300 220 V300 H0 Z" />
      </g>
      {/* Waterfall lines */}
      <g stroke="url(#mountain-sky)" strokeWidth="0.8" strokeOpacity="0.35" strokeLinecap="round">
        <line x1="150" y1="135" x2="148" y2="190" />
        <line x1="152" y1="135" x2="154" y2="185" />
        <line x1="150" y1="195" x2="149" y2="210" />
      </g>
      {/* Mist layers */}
      <g fill="url(#mountain-amber)" fillOpacity="0.06">
        <ellipse cx="100" cy="200" rx="60" ry="8" />
        <ellipse cx="200" cy="180" rx="50" ry="6" />
        <ellipse cx="150" cy="220" rx="80" ry="10" />
      </g>
      {/* Sun/moon circle */}
      <circle cx="230" cy="60" r="25" fill="url(#mountain-amber)" fillOpacity="0.12" stroke="url(#mountain-amber)" strokeWidth="1.2" strokeOpacity="0.3" />
      <circle cx="230" cy="60" r="18" fill="url(#mountain-terracotta)" fillOpacity="0.08" />
      {/* Pine tree silhouettes on mountains */}
      <g fill="url(#mountain-pine)" fillOpacity="0.12">
        <path d="M60 195 L55 180 L50 195 Z" />
        <path d="M60 185 L55 170 L50 185 Z" />
        <path d="M250 170 L245 155 L240 170 Z" />
        <path d="M250 160 L245 145 L240 160 Z" />
      </g>
      {/* Birds in sky */}
      <g stroke="url(#mountain-amber)" strokeWidth="1" strokeOpacity="0.3" fill="none">
        <path d="M80 60 Q85 55 90 58 Q95 55 100 60" />
        <path d="M100 50 Q105 45 110 48 Q115 45 120 50" />
      </g>
    </svg>
  );
}

/** Traditional boat on water — junk boat silhouette with water ripples */
export function PhoenixWatermark({ className = '', opacity = 0.24, size = 260 }) {
  return (
    <svg viewBox="0 0 280 280" className={`absolute pointer-events-none ${className}`}
      style={{ width: size, height: size, opacity, bottom: -10, left: -10 }}>
      <LandscapeDefs id="boat" />
      {/* Boat hull */}
      <g fill="none" stroke="url(#boat-amber)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M70 140 Q90 120 140 115 Q190 110 210 130" fill="url(#boat-amber)" fillOpacity="0.10" />
        <path d="M60 145 L85 138 L195 132 L220 142" />
      </g>
      {/* Sail — traditional junk sail */}
      <g fill="none" stroke="url(#boat-amber)" strokeWidth="1.4" strokeOpacity="0.6">
        <path d="M140 115 L135 55 L138 50" />
        <path d="M138 50 Q155 55 160 75 Q165 95 158 115" fill="url(#boat-terracotta)" fillOpacity="0.08" />
        {/* Sail battens */}
        <path d="M137 65 L155 68" strokeOpacity="0.4" />
        <path d="M136 80 L158 82" strokeOpacity="0.4" />
        <path d="M136 95 L159 96" strokeOpacity="0.4" />
      </g>
      {/* Second smaller sail */}
      <g fill="none" stroke="url(#boat-amber)" strokeWidth="1" strokeOpacity="0.45">
        <path d="M110 120 L108 80" />
        <path d="M108 80 Q118 83 122 95 Q125 107 120 118" fill="url(#boat-amber)" fillOpacity="0.06" />
      </g>
      {/* Water ripples — concentric wave lines */}
      <g fill="none" stroke="url(#boat-sky)" strokeWidth="1" strokeOpacity="0.35">
        <path d="M20 165 Q50 155 80 165 Q110 175 140 165 Q170 155 200 165 Q230 175 260 165" />
        <path d="M15 180 Q45 170 75 180 Q105 190 135 180 Q165 170 195 180 Q225 190 255 180" />
        <path d="M10 195 Q40 185 70 195 Q100 205 130 195 Q160 185 190 195 Q220 205 250 195" />
        <path d="M5 210 Q35 200 65 210 Q95 220 125 210 Q155 200 185 210 Q215 220 245 210" />
      </g>
      {/* Water reflections */}
      <g fill="url(#boat-sky)" fillOpacity="0.06">
        <ellipse cx="140" cy="175" rx="70" ry="6" />
        <ellipse cx="120" cy="195" rx="50" ry="4" />
      </g>
      {/* Distant mountains in background */}
      <g fill="none" stroke="url(#boat-amber)" strokeWidth="0.8" strokeOpacity="0.25">
        <path d="M20 100 Q40 70 60 85 Q80 60 100 80 Q120 55 140 75" />
        <path d="M160 80 Q180 55 200 70 Q220 50 240 75 Q250 65 265 80" />
      </g>
      {/* Flying birds */}
      <g stroke="url(#boat-amber)" strokeWidth="0.8" strokeOpacity="0.3" fill="none">
        <path d="M40 50 Q45 45 50 48 Q55 45 60 50" />
        <path d="M55 40 Q60 35 65 38 Q70 35 75 40" />
        <path d="M220 45 Q225 40 230 43 Q235 40 240 45" />
      </g>
      {/* Lantern on boat */}
      <g fill="url(#boat-terracotta)" fillOpacity="0.18" stroke="url(#boat-terracotta)" strokeWidth="0.8" strokeOpacity="0.4">
        <ellipse cx="90" cy="125" rx="5" ry="7" />
        <line x1="90" y1="118" x2="90" y2="115" stroke="url(#boat-amber)" />
      </g>
    </svg>
  );
}

/** Pine tree accent — stylized pine branch for card corners */
export function QilinMark({ className = '', size = 48, opacity = 0.22 }) {
  return (
    <svg viewBox="0 0 60 60" className={`absolute pointer-events-none ${className}`}
      style={{ width: size, height: size, opacity, top: 8, right: 8 }}>
      <LandscapeDefs id="pine" />
      {/* Main branch */}
      <g fill="none" stroke="url(#pine-amber)" strokeWidth="1.2" strokeOpacity="0.5" strokeLinecap="round">
        <path d="M30 8 L30 45" />
        <path d="M30 15 L20 22" />
        <path d="M30 15 L40 22" />
        <path d="M30 25 L18 33" />
        <path d="M30 25 L42 33" />
      </g>
      {/* Pine needle clusters */}
      <g fill="url(#pine-pine)" fillOpacity="0.12">
        <ellipse cx="30" cy="10" rx="8" ry="5" />
        <ellipse cx="20" cy="20" rx="7" ry="4" />
        <ellipse cx="40" cy="20" rx="7" ry="4" />
        <ellipse cx="17" cy="31" rx="8" ry="4" />
        <ellipse cx="43" cy="31" rx="8" ry="4" />
      </g>
      {/* Needle detail lines */}
      <g stroke="url(#pine-pine)" strokeWidth="0.5" strokeOpacity="0.35">
        <line x1="25" y1="7" x2="22" y2="4" />
        <line x1="35" y1="7" x2="38" y2="4" />
        <line x1="30" y1="6" x2="30" y2="3" />
        <line x1="15" y1="18" x2="12" y2="16" />
        <line x1="45" y1="18" x2="48" y2="16" />
      </g>
      {/* Pine cone */}
      <ellipse cx="30" cy="48" rx="3" ry="4" fill="url(#pine-terracotta)" fillOpacity="0.15" stroke="url(#pine-amber)" strokeWidth="0.6" strokeOpacity="0.3" />
    </svg>
  );
}

/** Lantern cluster — three traditional Chinese lanterns */
export function BatCluster({ className = '', opacity = 0.22, size = 64 }) {
  return (
    <svg viewBox="0 0 80 80" className={`absolute pointer-events-none ${className}`}
      style={{ width: size, height: size, opacity, bottom: 8, right: 12 }}>
      <LandscapeDefs id="lantern" />
      {/* Central large lantern */}
      <g transform="translate(40, 28)">
        <line x1="0" y1="-16" x2="0" y2="-12" stroke="url(#lantern-amber)" strokeWidth="0.8" strokeOpacity="0.4" />
        <ellipse cx="0" cy="0" rx="10" ry="14" fill="url(#lantern-terracotta)" fillOpacity="0.1" stroke="url(#lantern-terracotta)" strokeWidth="1" strokeOpacity="0.4" />
        <ellipse cx="0" cy="0" rx="7" ry="10" fill="url(#lantern-terracotta)" fillOpacity="0.05" />
        {/* Lantern ribs */}
        <line x1="0" y1="-14" x2="0" y2="14" stroke="url(#lantern-amber)" strokeWidth="0.5" strokeOpacity="0.25" />
        <path d="M-10 0 Q0 -3 10 0" fill="none" stroke="url(#lantern-amber)" strokeWidth="0.4" strokeOpacity="0.2" />
        <path d="M-10 0 Q0 3 10 0" fill="none" stroke="url(#lantern-amber)" strokeWidth="0.4" strokeOpacity="0.2" />
        {/* Tassel */}
        <line x1="0" y1="14" x2="0" y2="20" stroke="url(#lantern-amber)" strokeWidth="0.6" strokeOpacity="0.3" />
        <line x1="-2" y1="20" x2="2" y2="20" stroke="url(#lantern-amber)" strokeWidth="0.5" strokeOpacity="0.25" />
      </g>
      {/* Left small lantern */}
      <g transform="translate(18, 55)">
        <line x1="0" y1="-10" x2="0" y2="-7" stroke="url(#lantern-amber)" strokeWidth="0.6" strokeOpacity="0.3" />
        <ellipse cx="0" cy="0" rx="7" ry="9" fill="url(#lantern-terracotta)" fillOpacity="0.08" stroke="url(#lantern-terracotta)" strokeWidth="0.8" strokeOpacity="0.3" />
        <line x1="0" y1="-9" x2="0" y2="9" stroke="url(#lantern-amber)" strokeWidth="0.4" strokeOpacity="0.2" />
        <line x1="0" y1="9" x2="0" y2="13" stroke="url(#lantern-amber)" strokeWidth="0.5" strokeOpacity="0.25" />
      </g>
      {/* Right small lantern */}
      <g transform="translate(62, 55)">
        <line x1="0" y1="-10" x2="0" y2="-7" stroke="url(#lantern-amber)" strokeWidth="0.6" strokeOpacity="0.3" />
        <ellipse cx="0" cy="0" rx="7" ry="9" fill="url(#lantern-terracotta)" fillOpacity="0.08" stroke="url(#lantern-terracotta)" strokeWidth="0.8" strokeOpacity="0.3" />
        <line x1="0" y1="-9" x2="0" y2="9" stroke="url(#lantern-amber)" strokeWidth="0.4" strokeOpacity="0.2" />
        <line x1="0" y1="9" x2="0" y2="13" stroke="url(#lantern-amber)" strokeWidth="0.5" strokeOpacity="0.25" />
      </g>
      {/* Connecting strings */}
      <g stroke="url(#lantern-amber)" strokeWidth="0.5" strokeOpacity="0.2">
        <path d="M22 45 Q30 40 40 42" fill="none" />
        <path d="M58 45 Q50 40 40 42" fill="none" />
      </g>
    </svg>
  );
}

/** Mountain-Boat pair — balanced landscape ornament for wide banners */
export function DragonPhoenixPair({ className = '', opacity = 0.22, size = 240 }) {
  return (
    <>
      <DragonWatermark opacity={opacity} size={size} />
      <PhoenixWatermark opacity={opacity * 0.9} size={size * 0.9} />
    </>
  );
}
