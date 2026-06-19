/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'sans-serif'],
        serif: ['"Noto Serif SC"', '"Ma Shan Zheng"', 'Georgia', 'serif'],
        display: ['"Ma Shan Zheng"', '"Noto Serif SC"', 'Georgia', 'serif'],
        calligraphy: ['"Ma Shan Zheng"', '"Noto Serif SC"', 'cursive'],
      },
      colors: {
        // Chinese landscape painting palette (山水画色彩)
        cn: {
          red:          '#C0392B',        // terracotta crimson
          'red-hover':  '#A93226',        // deeper terracotta
          'red-light':  '#FADBD8',        // soft peach-pink
          gold:         '#D4A03C',        // warm amber gold
          'gold-hi':    '#E8C547',        // bright amber
          'gold-light': '#FDF2D0',        // pale gold wash
          ink:          '#1C2833',        // ink-wash navy
          'ink-light':  '#2C3E50',        // charcoal slate
          paper:        '#FAF3EB',        // rice paper warm white
          'paper-warm': '#F5E6D3',        // parchment beige
          surface:      '#FBF7F2',        // lighter paper
          jade:         '#4A7C59',        // pine green
          'jade-hi':    '#7FB37A',        // sage green
          'jade-light': '#D5E8D4',        // pale sage wash
          vermilion:    '#E67E22',        // persimmon orange
          plum:         '#9B7EC8',        // wisteria purple
          'tang-red':   '#C0392B',        // terracotta
          'tang-amber': '#D4A03C',        // amber
          'tang-cream': '#FAF3EB',        // rice paper
          'tang-silk':  '#F5E6D3',        // parchment
          'tang-lacquer':'#8B2500',       // deep terracotta
          // New landscape accents
          peach:        '#FADBD8',        // soft peach
          sky:          '#6B9BC3',        // misty sky blue
          'sky-light':  '#D6EAF8',        // pale sky wash
          cherry:       '#E8828A',        // cherry blossom pink
          wisteria:     '#9B7EC8',        // wisteria purple
          persimmon:    '#E67E22',        // persimmon orange
        },
        // Apple-style tokens (remapped to landscape palette)
        apple: {
          bg:           '#FAF3EB',        // rice paper
          surface:      '#FBF7F2',        // light paper
          raised:       '#F5E6D3',        // parchment
          text:         '#1C2833',        // ink-wash navy
          secondary:    '#4A4A4A',        // warm dark grey
          tertiary:     '#8A8A8A',        // warm mid grey
          blue:         '#C0392B',        // terracotta (primary action)
          'blue-hover': '#A93226',        // deep terracotta
          'blue-dim':   '#FADBD8',        // peach-pink
          green:        '#4A7C59',        // pine green
          orange:       '#D4A03C',        // amber gold
        },
        fifa: {
          blue:  '#C0392B',
          green: '#4A7C59',
          gold:  '#D4A03C',
        },
        wc: {
          red:         '#C0392B',
          'red-hover': '#A93226',
          blue:        '#C0392B',
          'blue-hi':   '#A93226',
          gold:        '#D4A03C',
          'gold-hi':   '#E8C547',
          pitch:       '#4A7C59',
          'pitch-hi':  '#7FB37A',
          sunset:      '#E67E22',
          'sunset-hi': '#F39C12',
          sky:         '#6B9BC3',
          cream:       '#F5E6D3',
          ink:         '#1C2833',
          bg:          '#FAF3EB',
          surface:     '#FBF7F2',
        },
      },
      backgroundImage: {
        'grad-imperial':     'linear-gradient(135deg, #C0392B 0%, #D4A03C 100%)',
        'grad-ink':          'linear-gradient(135deg, #1C2833 0%, #2C3E50 100%)',
        'grad-ink-wash':     'linear-gradient(160deg, #1C2833 0%, #2C3E50 40%, #243342 70%, #1C2833 100%)',
        'grad-ink-gold':     'linear-gradient(135deg, #2C3E50 0%, #2E3A2E 50%, #2C3E50 100%)',
        'grad-jade':         'linear-gradient(135deg, #4A7C59 0%, #7FB37A 100%)',
        'grad-vermillion':   'linear-gradient(135deg, #C0392B 0%, #E67E22 100%)',
        'grad-parchment':    'linear-gradient(135deg, #FBF7F2 0%, #F5E6D3 100%)',
        'grad-gold-leaf':    'linear-gradient(135deg, #D4A03C 0%, #E8C547 50%, #C49032 100%)',
        'grad-sunset':       'linear-gradient(135deg, #C0392B 0%, #E67E22 50%, #D4A03C 100%)',
        'grad-pitch':        'linear-gradient(135deg, #2E5A3E 0%, #3A6B4A 60%, #4A7C59 100%)',
        'grad-stadium-night':'linear-gradient(135deg, #1C2833 0%, #2C3E50 100%)',
        'grad-host':         'linear-gradient(90deg, #C0392B 0%, #D4A03C 50%, #4A7C59 100%)',
        'grad-trophy':       'linear-gradient(135deg, #D4A03C 0%, #C0392B 100%)',
        'grad-hero-light':   'radial-gradient(ellipse at 15% 0%, rgba(192,57,43,0.08) 0%, transparent 55%), radial-gradient(ellipse at 85% 10%, rgba(212,160,60,0.06) 0%, transparent 55%)',
        'grad-hero-dark':    'radial-gradient(ellipse at 15% 0%, rgba(192,57,43,0.20) 0%, transparent 55%), radial-gradient(ellipse at 85% 10%, rgba(212,160,60,0.12) 0%, transparent 55%)',
        'grad-navy':         'linear-gradient(135deg, #1C2833 0%, #2C3E50 100%)',
        /* Chinese landscape painting gradients (山水画渐变) */
        'grad-landscape':    'linear-gradient(135deg, #C0392B 0%, #E67E22 40%, #D4A03C 100%)',
        'grad-mountain':     'linear-gradient(160deg, #1C2833 0%, #2C3E50 30%, #34495E 60%, #2C3E50 100%)',
        'grad-water':        'linear-gradient(135deg, #6B9BC3 0%, #85C1E9 50%, #6B9BC3 100%)',
        'grad-foliage':      'linear-gradient(135deg, #4A7C59 0%, #7FB37A 50%, #E8C547 100%)',
        'grad-sunrise':      'linear-gradient(90deg, #C0392B 0%, #E67E22 25%, #D4A03C 50%, #FADBD8 75%, #6B9BC3 100%)',
        'grad-peach':        'linear-gradient(135deg, #FADBD8 0%, #F5E6D3 100%)',
        'grad-cherry':       'linear-gradient(135deg, #E8828A 0%, #C0392B 100%)',
        'grad-tang':         'linear-gradient(135deg, #C0392B 0%, #8B2500 60%, #6B1A00 100%)',
        'grad-tang-gold':    'linear-gradient(135deg, #C49032 0%, #E8C547 50%, #D4A03C 100%)',
        'grad-tang-silk':    'linear-gradient(160deg, #FAF3EB 0%, #F5E6D3 40%, #EDE0C8 100%)',
        'grad-tang-lacquer': 'linear-gradient(135deg, #8B2500 0%, #C0392B 40%, #A93226 100%)',
        'grad-tang-palace':  'linear-gradient(160deg, #1C2833 0%, #2C3E50 35%, #243342 65%, #1C2833 100%)',
      },
      borderRadius: {
        '2xl': '18px',
        '3xl': '22px',
        '4xl': '28px',
        '5xl': '34px',
        'pill': '999px',
        'seal': '6px',
      },
      boxShadow: {
        'apple-sm':  '0 2px 8px rgba(28,40,51,0.08), 0 1px 3px rgba(28,40,51,0.05)',
        'apple-md':  '0 4px 20px rgba(28,40,51,0.10), 0 1px 4px rgba(28,40,51,0.06)',
        'apple-lg':  '0 8px 32px rgba(28,40,51,0.12), 0 2px 8px rgba(28,40,51,0.07)',
        'apple-xl':  '0 16px 56px rgba(28,40,51,0.15), 0 4px 16px rgba(28,40,51,0.08)',
        'glow-red':  '0 8px 28px -6px rgba(192,57,43,0.40), 0 2px 8px rgba(192,57,43,0.15)',
        'glow-blue': '0 8px 28px -6px rgba(192,57,43,0.40), 0 2px 8px rgba(192,57,43,0.15)',
        'glow-gold': '0 8px 28px -6px rgba(212,160,60,0.40), 0 2px 8px rgba(212,160,60,0.18)',
        'glow-pitch':'0 8px 28px -6px rgba(74,124,89,0.40), 0 2px 8px rgba(74,124,89,0.18)',
        'card-soft': '0 4px 16px rgba(28,40,51,0.06), 0 1px 4px rgba(28,40,51,0.04)',
        'seal':      'inset 0 0 0 2px rgba(192,57,43,0.35), 0 2px 8px rgba(192,57,43,0.15)',
        'imperial':  '0 4px 20px rgba(28,40,51,0.08), 0 1px 4px rgba(28,40,51,0.04), inset 0 1px 0 rgba(255,255,255,0.5)',
        'imperial-lg': '0 8px 32px rgba(28,40,51,0.10), 0 2px 8px rgba(28,40,51,0.06), inset 0 1px 0 rgba(255,255,255,0.4)',
        'ink':       '0 4px 24px rgba(28,40,51,0.4), 0 1px 4px rgba(28,40,51,0.3), inset 0 1px 0 rgba(255,255,255,0.03)',
        'ink-lg':    '0 8px 40px rgba(28,40,51,0.5), 0 2px 8px rgba(28,40,51,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
        'gold-glow': '0 0 0 1px rgba(212,160,60,0.15), 0 4px 16px rgba(212,160,60,0.08)',
        /* Landscape painting shadows (山水画阴影) */
        'tang':        '0 4px 20px rgba(139,37,0,0.08), 0 1px 4px rgba(139,37,0,0.04), inset 0 1px 0 rgba(255,255,255,0.5)',
        'tang-lg':     '0 8px 32px rgba(139,37,0,0.12), 0 2px 8px rgba(139,37,0,0.06), inset 0 1px 0 rgba(255,255,255,0.4)',
        'tang-gold':   '0 4px 24px rgba(212,160,60,0.15), 0 1px 4px rgba(212,160,60,0.08)',
        'tang-lacquer':'0 8px 32px rgba(139,37,0,0.20), 0 2px 8px rgba(139,37,0,0.10)',
      },
      fontSize: {
        'display': ['clamp(40px,6vw,72px)', { lineHeight: '0.95', letterSpacing: '-0.04em', fontWeight: '800' }],
        'h1':      ['clamp(32px,4.5vw,48px)', { lineHeight: '1.05', letterSpacing: '-0.035em', fontWeight: '800' }],
        'h2':      ['clamp(24px,3vw,32px)', { lineHeight: '1.1', letterSpacing: '-0.03em', fontWeight: '800' }],
        'h3':      ['20px', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        'eyebrow': ['11px', { lineHeight: '1', letterSpacing: '0.12em', fontWeight: '700' }],
        'caption': ['12px', { lineHeight: '1.3', letterSpacing: '0', fontWeight: '500' }],
      },
      transitionTimingFunction: {
        'apple': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      },
      backdropSaturate: {
        200: '2',
      },
    },
  },
  plugins: [],
};
