# Frontend Styling Architecture

## Design Philosophy

The WC2026 AI Prediction Platform employs a **Chinese landscape painting (山水画)** aesthetic fused with modern Apple-style minimalism. This unique design language combines traditional Chinese artistic motifs—ink-wash gradients, terracotta reds, amber golds, and pine greens—with contemporary glassmorphism, smooth transitions, and responsive layouts.

## Core Technology Stack

- **CSS Framework**: Tailwind CSS v3+ with custom configuration
- **Build Pipeline**: PostCSS + Autoprefixer via `postcss.config.js`
- **Dark Mode Strategy**: Class-based (`darkMode: 'class'`) toggled via React context
- **Font System**: Custom font stacks for sans-serif (Plus Jakarta Sans), serif (Noto Serif SC, Ma Shan Zheng), and calligraphy display text

## Key Configuration Files

### `frontend/tailwind.config.js` — Design Token Registry

This is the central design system file defining:

**Color Palettes** (4 named namespaces):
- `cn.*` — Chinese landscape painting palette (terracotta crimson `#C0392B`, warm amber gold `#D4A03C`, ink-wash navy `#1C2833`, rice paper `#FAF3EB`, pine green `#4A7C59`)
- `apple.*` — Remapped Apple-style tokens using the landscape palette for semantic roles (bg, surface, raised, text, blue/green/orange accents)
- `fifa.*` / `wc.*` — World Cup-specific color mappings

**Gradient System** (20+ predefined gradients):
- Imperial gradients (`grad-imperial`, `grad-trophy`) — terracotta-to-gold transitions
- Ink-wash gradients (`grad-ink`, `grad-ink-wash`, `grad-ink-gold`) — dark navy/slate blends
- Landscape gradients (`grad-landscape`, `grad-mountain`, `grad-water`, `grad-foliage`, `grad-sunrise`) — multi-color scenic transitions
- Tang Dynasty gradients (`grad-tang`, `grad-tang-gold`, `grad-tang-lacquer`, `grad-tang-palace`) — deep historical color schemes

**Shadow System** (15+ shadow utilities):
- Apple-style shadows (`shadow-apple-sm/md/lg/xl`) — subtle depth with ink-wash navy tints
- Glow effects (`shadow-glow-red/blue/gold/pitch`) — colored ambient glows
- Thematic shadows (`shadow-tang`, `shadow-tang-lg`, `shadow-ink`, `shadow-gold-glow`) — theme-specific depth

**Typography Scale**:
- Fluid display sizes using `clamp()` for responsive scaling
- Dedicated eyebrow, caption, and heading scales with tight letter-spacing

**Border Radius Tokens**:
- Extended radii up to `5xl` (34px) and `pill` (999px) for rounded UI elements
- `seal` (6px) for stamp-like decorative elements

### `frontend/src/index.css` — Component Layer & Theme Overrides

This 785-line stylesheet defines:

**CSS Custom Properties** (light/dark mode tokens):
- `--dk-*` variables for dark mode surfaces, text, and accent colors
- `--wc-*` variables mirroring the Tailwind palette for runtime theme switching

**Base Layer**:
- Body background with SVG ink-wash mountain silhouette pattern (fixed, low opacity)
- Ambient radial gradient glows positioned at viewport corners
- Dark mode variants that intensify patterns and shift glow colors

**Component Classes** (reusable card/button primitives):
- `.card` — Base card with apple-surface background, subtle border, and hover lift
- `.tang-card` — Landscape-themed card with parchment gradient and amber border
- `.tang-palace` — Ink-wash dark card for elevated sections
- `.tang-lacquer` — Terracotta-orange gradient card for emphasis
- `.imperial-card` — Warm rice paper gradient with amber hairline border
- `.glass-card` / `.glass-card-solid` — Frosted glassmorphism with backdrop blur
- `.btn-primary` / `.btn-secondary` / `.btn-wc` — Button variants with active scale feedback
- `.chip-gold` — Gold-accented badge/chip component
- `.eyebrow` — Uppercase tracking label text
- `.seal-stamp` — Rotated seal-stamp decorative element

**Decorative Utilities**:
- `.tang-divider` / `.meander-divider` — SVG wave/brushstroke horizontal dividers
- `.tang-bat-bg` — Pine branch pattern background tile
- `.tang-border` / `.imperial-border` — Amber double-line border effects
- Watermark classes (`.tang-dragon`, `.tang-phoenix`, `.tang-qilin-mark`, `.tang-bat-cluster`) — SVG ornament overlays

**Dark Mode Overrides** (outside `@layer` for cascade priority):
- Comprehensive `.dark` prefixed rules overriding all component backgrounds, borders, text colors, and shadows
- Opacity-modified utility overrides for `bg-black/*`, `bg-white/*`, `border-black/*` to ensure correct contrast in dark mode
- Chart bracket stroke variable override (`--bracket-stroke`)

## Theme Management

### `frontend/src/contexts/ThemeContext.jsx`

React context provider managing:
- Theme state persisted to `localStorage` (`wc26-theme`)
- System preference detection via `prefers-color-scheme` media query
- DOM class toggle on `<html>` element for Tailwind's `dark:` variant
- Toggle function exposed via `useTheme()` hook

## Chart Color Constants

### `frontend/src/utils/chartColors.js`

Hex constants for Recharts/SVG fill/stroke (Tailwind classes don't apply to SVG attributes):
- `WC_BLUE`, `WC_RED`, `WC_GOLD`, `WC_PITCH`, `WC_SUNSET`, `WC_SKY`
- `CHART_PALETTE` array for sequential color assignment

Note: These hex values differ from the Tailwind palette, suggesting charts use a separate color scheme not fully aligned with the landscape painting theme.

## Decorative Ornament Components

### `frontend/src/components/TangOrnaments.jsx`

Reusable SVG watermark components implementing landscape painting motifs:
- `DragonWatermark` — Layered mountain silhouettes with mist, waterfall lines, pine trees, birds, and sun/moon circle
- `PhoenixWatermark` — Traditional junk boat with sails, water ripples, distant mountains, flying birds, and lantern
- `QilinMark` — Stylized pine branch for card corner accents
- `BatCluster` — Three traditional Chinese lanterns with connecting strings
- `DragonPhoenixPair` — Combined mountain-and-boat composition for wide banners

All ornaments use inline SVG gradients defined in shared `LandscapeDefs` component, with configurable opacity and size props.

## Responsive Strategy

- **Mobile-first** Tailwind approach with `md:` breakpoint for desktop enhancements
- **Safe area support** via `env(safe-area-inset-*)` for notch/home indicator devices
- **Fluid typography** using `clamp()` for display headings
- **Fixed navigation** with backdrop blur on both desktop (top bar) and mobile (bottom tab bar)
- **Main content padding** accounts for fixed nav heights and safe areas

## Developer Conventions

1. **Card Usage**: Prefer `.tang-card` as the default container; use `.tang-palace` for dark/elevated sections; use `.imperial-card` for warm highlighted content
2. **Color Semantics**: Use `cn-*` tokens for direct color references; use `apple-*` tokens for semantic roles (bg, surface, text)
3. **Hover Effects**: Cards use `.hover:-translate-y-[2px]` or `[3px]` with shadow transitions; buttons use `active:scale-[0.97]` for tactile feedback
4. **Dark Mode Testing**: All new components must verify appearance in both light and dark modes; check that `text-white/*` opacity classes are overridden in `.dark .tang-palace` selectors
5. **SVG Ornaments**: Import from `TangOrnaments.jsx` and position absolutely within relative containers; adjust opacity (typically 0.14–0.28) for subtlety
6. **Gradient Text**: Use inline styles with `WebkitBackgroundClip: 'text'` and `WebkitTextFillColor: 'transparent'` for gradient text effects (Tailwind doesn't support this natively)
7. **Backdrop Blur**: Apply `backdrop-filter: saturate(200%) blur(24–28px)` to floating navigation bars for iOS-style frosted glass
8. **Border Colors**: Use `border-cn-gold/20` or `border-cn-gold/10` for subtle amber hairlines; avoid pure black/white borders
