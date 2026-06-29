## Overview

The WC2026 Qwen Prediction Platform employs a **Chinese landscape painting (山水画) aesthetic** built on **Tailwind CSS** with extensive custom design tokens, component classes, and dark/light theme support. The system merges traditional Chinese artistic motifs (ink-wash gradients, terracotta reds, amber golds, pine greens) with modern Apple-style glassmorphism and responsive layouts.

---

## Technology Stack

- **CSS Framework**: Tailwind CSS v3.x with PostCSS pipeline (`tailwindcss` + `autoprefixer`)
- **Build Tool**: Vite for bundling and development server
- **Theme Management**: React Context (`ThemeContext.jsx`) with `localStorage` persistence and `prefers-color-scheme` detection
- **Font Families**:
  - Sans: `Plus Jakarta Sans`, `-apple-system`, `BlinkMacSystemFont`, `SF Pro Display`
  - Serif/Display: `Noto Serif SC`, `Ma Shan Zheng` (calligraphy font)
  - Calligraphy: `Ma Shan Zheng` for decorative elements

---

## Color System & Design Tokens

### Four Named Palettes in `tailwind.config.js`

1. **`cn` (Chinese landscape)** — Primary palette with semantic names:
   - `cn-red` / `cn-red-hover`: Terracotta crimson (#C0392B → #A93226)
   - `cn-gold` / `cn-gold-hi`: Warm amber gold (#D4A03C → #E8C547)
   - `cn-ink` / `cn-ink-light`: Ink-wash navy (#1C2833 → #2C3E50)
   - `cn-paper` / `cn-paper-warm`: Rice paper warm white (#FAF3EB → #F5E6D3)
   - `cn-jade`: Pine green (#4A7C59), `cn-vermilion`: Persimmon orange (#E67E22)
   - Accent colors: `cn-peach`, `cn-sky`, `cn-cherry`, `cn-wisteria`, `cn-persimmon`

2. **`apple`** — Remapped to landscape palette for UI consistency:
   - `apple-bg` = rice paper, `apple-surface` = light paper, `apple-text` = ink-wash navy
   - `apple-blue` = terracotta (primary action color, not blue)
   - `apple-green` = pine green, `apple-orange` = amber gold

3. **`fifa`** / **`wc`** — World Cup branding aliases mapped to the same terracotta/gold/jade tokens

### Gradient System

~30 named gradients in `backgroundImage` config:
- `grad-imperial`: Terracotta → amber
- `grad-ink-wash`: Multi-stop ink-wash navy gradient
- `grad-landscape`: Red → orange → gold sunrise gradient
- `grad-tang`, `grad-tang-gold`, `grad-tang-lacquer`: Tang dynasty-inspired deep terracotta palettes
- `grad-mountain`, `grad-water`, `grad-foliage`: Nature-themed gradients
- Hero gradients: `grad-hero-light` / `grad-hero-dark` with radial accent glows

### Shadow System

Named shadows follow two families:
- **Apple-style**: `shadow-apple-sm/md/lg/xl` — subtle layered shadows with ink-wash navy tint
- **Glow effects**: `shadow-glow-red/gold/pitch` — colored glow shadows for interactive states
- **Landscape-specific**: `shadow-tang/tang-lg/tang-gold/tang-lacquer` — warm terracotta/amber-tinted shadows
- **Ink shadows**: `shadow-ink/ink-lg` — deep navy shadows for dark-mode cards

---

## Component Classes (in `index.css`)

### Card Variants

| Class | Description |
|-------|-------------|
| `.card` | Base card: rice paper surface, thin border, apple-sm shadow |
| `.card-hero` | Warm rice paper gradient with amber hairline border |
| `.card-imperial` | Terracotta gradient card (red → deep red → lacquer) |
| `.card-pitch` | Pine green gradient card |
| `.card-trophy` | Gold → red sunset gradient |
| `.card-night` | Ink-wash navy gradient for dark contexts |
| `.tang-card` | Landscape parchment card with multi-stop warm gradient |
| `.tang-lacquer` | Deep terracotta-orange gradient card |
| `.tang-palace` | Ink-wash palace card (dark navy gradient) |
| `.ink-card` | Ink-wash navy with amber accent border |
| `.glass-card` / `.glass-card-solid` | Frosted glassmorphism with backdrop blur |

### Button Classes

- `.btn-primary`: Terracotta red pill button with hover glow ring
- `.btn-secondary`: Translucent white pill with backdrop blur
- `.btn-wc`: World Cup branded terracotta button

### Decorative Utilities

- `.chip-gold`: Amber badge for confidence/status labels
- `.eyebrow`: Uppercase tracked label text in terracotta
- `.seal-stamp`: Rotated seal-stamp style badge
- `.tang-divider` / `.meander-divider`: SVG wave/brushstroke dividers
- `.tang-bat-bg`: Pine branch pattern background (SVG tile)
- `.tang-dragon` / `.tang-phoenix`: Mountain/boat watermarks via `::before` pseudo-elements
- `.tang-qilin-mark`: Pine tree corner accent

---

## Theme System

### Architecture

- **`ThemeContext.jsx`**: Manages `theme` state (`'light'` | `'dark'`), persists to `localStorage` under key `wc26-theme`, initializes from OS preference via `matchMedia('(prefers-color-scheme: dark)')`
- **Toggle mechanism**: Toggles `dark` class on `<html>` element; all dark-mode styles use `.dark` selector prefixes
- **CSS Variables**: `:root` defines light-mode values; `.dark` overrides redefine variables for dark mode (e.g., `--dk-bg: #1C2833`, `--dk-surface: #2C3E50`)

### Dark Mode Strategy

Dark mode is implemented via **comprehensive `.dark` selector overrides** in `index.css` (~370 lines of dark-mode rules):

- Body background switches to ink-wash navy (`#1C2833`)
- All card variants have dark-mode equivalents with adjusted gradients and borders
- Text color utilities (`.text-apple-text`, `.text-apple-secondary`, etc.) remap to light-on-dark values
- Border colors flip from `border-black/*` to `border-white/*` opacity variants
- Glassmorphism cards adjust blur saturation and border transparency
- Ambient body `::before`/`::after` patterns increase opacity and switch stroke colors for visibility

### Ambient Background Effects

Light mode:
- `body::before`: Ink-wash mountain silhouette SVG pattern at 4% opacity
- `body::after`: Warm amber/peach radial glow at top-right

Dark mode:
- Pattern opacity increases to 8%, strokes switch to gold/red/green
- Additional ambient glows on `#root::before`/`::after` (cherry blossom pink, emerald green)

---

## Responsive Strategy

- **Mobile-first**: Tailwind's default breakpoint system (`sm:`, `md:`, `lg:`, `xl:`)
- **Safe area insets**: Navigation bars use `env(safe-area-inset-*)` for notch/home-indicator compatibility
- **Fluid typography**: `clamp()`-based display sizes (`text-display`, `text-h1`, `text-h2`) scale across viewports
- **Layout breakpoints**: Desktop nav (`md:block`) vs mobile top bar + bottom tab bar (`md:hidden`)

---

## SVG Ornament System (`TangOrnaments.jsx`)

Reusable React components render landscape painting motifs as absolute-positioned SVG overlays:

- **`DragonWatermark`**: Layered mountain silhouettes with mist, waterfall lines, pine trees, sun/moon circle, birds
- **`PhoenixWatermark`**: Traditional junk boat with sails, water ripples, distant mountains, lantern
- **`QilinMark`**: Stylized pine branch for card corners
- **`BatCluster`**: Three hanging Chinese lanterns with connecting strings
- **`DragonPhoenixPair`**: Combined mountain + boat ornament for wide banners

These are used as decorative accents on cards and hero sections with configurable `opacity` and `size` props.

---

## Developer Conventions

### Adding New Styles

1. **Define tokens first**: Add new colors/gradients/shadows to `tailwind.config.js` before using them
2. **Create component classes**: Define reusable classes in `@layer components` of `index.css`
3. **Add dark-mode overrides**: Every new component class needs a `.dark .class-name` rule
4. **Use CSS variables**: Centralize theme-dependent values in `:root` / `.dark :root`
5. **Test both modes**: Verify contrast ratios and visual coherence in light and dark themes

### Naming Conventions

- Prefix landscape-specific tokens with `cn-` or `tang-`
- Use semantic names (`red`, `gold`, `jade`, `ink`) rather than literal color names
- Apple-style remapping uses `apple-*` prefix but maps to landscape palette values

### Usage Patterns

- Cards typically combine a base class (`.tang-card`) with hover modifiers (`.hover:-translate-y-[2px]`)
- Buttons use pill-shaped `rounded-full` with active scale feedback (`active:scale-[0.97]`)
- Gradients applied via inline `style={{ backgroundImage: '...' }}` for dynamic compositions
- Ornaments placed as absolute children with low opacity (0.12–0.28) for subtle decoration

### Key Files

- `frontend/tailwind.config.js` — Design token definitions (colors, fonts, gradients, shadows)
- `frontend/src/index.css` — Custom component classes, dark-mode overrides, ambient effects
- `frontend/src/contexts/ThemeContext.jsx` — Theme state management
- `frontend/src/components/TangOrnaments.jsx` — SVG landscape ornament components
- `frontend/postcss.config.js` — PostCSS plugin configuration