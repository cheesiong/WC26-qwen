import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Home, CalendarDays, LayoutGrid, Trophy, Sun, Moon, Sparkles } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Groups from './pages/Groups';
import MatchDetail from './pages/MatchDetail';
import TeamDetail from './pages/TeamDetail';
import Schedule from './pages/Schedule';
import Tournament from './pages/Tournament';
import Predictions from './pages/Predictions';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { LanguageProvider, useLang, useT } from './contexts/LanguageContext';

const NAV_KEYS = [
  { to: '/',              key: 'nav.home',         Icon: Home },
  { to: '/fixtures',      key: 'nav.fixtures',     Icon: CalendarDays },
  { to: '/groups',        key: 'nav.groups',       Icon: LayoutGrid },
  { to: '/championship',  key: 'nav.championship', Icon: Trophy },
  { to: '/predictions',   key: 'nav.predictions',  Icon: Sparkles },
];

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex items-center justify-center w-8 h-8 rounded-seal transition-all duration-200
        text-apple-tertiary hover:text-cn-gold hover:bg-cn-gold/10"
    >
      {theme === 'dark' ? <Sun size={15} /> : <Moon size={14} />}
    </button>
  );
}

function LangToggle() {
  const { lang, toggleLang } = useLang();
  return (
    <button
      onClick={toggleLang}
      title={lang === 'en' ? '切换到中文' : 'Switch to English'}
      className="flex items-center justify-center h-8 px-2.5 rounded-seal text-[11px] font-bold font-serif
        transition-all duration-200 text-apple-tertiary hover:text-cn-gold hover:bg-cn-gold/10"
    >
      {lang === 'en' ? '中' : 'EN'}
    </button>
  );
}

/* Seal-stamp logo — landscape painting seal with terracotta + amber */
function SealLogo({ size = 'md' }) {
  const isLg = size === 'lg';
  return (
    <div className="flex items-center gap-3 shrink-0">
      {/* Seal stamp mark */}
      <div
        className={`flex items-center justify-center border-[2.5px] border-cn-gold rounded-sm font-serif font-black
          ${isLg ? 'w-11 h-11 text-[14px]' : 'w-9 h-9 text-[11px]'}`}
        style={{
          color: '#C0392B',
          lineHeight: 1,
          letterSpacing: '-0.02em',
          boxShadow: 'inset 0 0 0 1px rgba(212,160,60,0.15)',
        }}
      >
        <span>WC</span>
      </div>
      <div className="flex flex-col" style={{ lineHeight: 1 }}>
        <span
          className={`font-serif font-black tracking-[-0.03em] ${isLg ? 'text-[22px]' : 'text-[18px]'}`}
          style={{
            background: 'linear-gradient(135deg, #E74C3C 0%, #E67E22 40%, #F1C40F 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          2026
        </span>
        <span className="text-[8px] font-bold tracking-[0.14em] text-cn-gold/60 mt-[3px] font-serif uppercase">
          Predictor
        </span>
      </div>
    </div>
  );
}

/* Carnival accent line — full vivid rainbow spectrum at viewport top */
function ImperialAccentLine() {
  return (
    <div
      className="fixed top-0 left-0 right-0 z-[60] h-[5px]"
      style={{
        background: 'linear-gradient(90deg, #E74C3C 0%, #E67E22 14%, #F1C40F 28%, #2ECC71 42%, #3498DB 57%, #9B59B6 71%, #E8828A 85%, #E74C3C 100%)',
      }}
    />
  );
}

function DesktopNav() {
  const t = useT();
  return (
    <>
      <ImperialAccentLine />
      <header
        className="fixed top-[4px] left-0 right-0 z-50 flex justify-center px-6 py-3
          border-b border-cn-gold/20
          dark:border-cn-gold/10"
        style={{
          backdropFilter: 'saturate(200%) blur(28px)',
          WebkitBackdropFilter: 'saturate(200%) blur(28px)',
          background: 'linear-gradient(180deg, rgba(250,243,235,0.94) 0%, rgba(245,230,211,0.92) 100%)',
          boxShadow: '0 1px 0 rgba(212,160,60,0.12), 0 4px 20px rgba(192,57,43,0.04)',
        }}
      >
        <div className="flex items-center w-full max-w-[1200px] relative">
          <NavLink to="/" style={{ textDecoration: 'none' }}>
            <SealLogo size="lg" />
          </NavLink>

          <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
            {NAV_KEYS.map(({ to, key, Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `relative flex items-center gap-2 px-[18px] py-[7px] text-[13px] font-semibold rounded-seal transition-all duration-200 whitespace-nowrap font-serif tracking-[0.02em]
                  ${isActive
                    ? 'text-cn-red bg-cn-red/[0.06]'
                    : 'text-apple-secondary hover:text-cn-ink hover:bg-cn-gold/[0.06]'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={14} strokeWidth={isActive ? 2.5 : 1.8} />
                    <span>{t(key)}</span>
                    {isActive && (
                      <span
                        className="absolute -bottom-[8px] left-1/2 -translate-x-1/2 w-8 h-[2.5px] rounded-full"
                        style={{
                          background: 'linear-gradient(90deg, transparent, #E74C3C 20%, #F1C40F 50%, #3498DB 80%, transparent)',
                        }}
                      />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex gap-1.5 items-center">
            <LangToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>
    </>
  );
}

function MobileTopBar() {
  return (
    <>
      <ImperialAccentLine />
      <header
        className="sticky top-0 z-50 flex items-center justify-between
          px-5 py-[14px] border-b border-cn-gold/20
          md:hidden dark:border-cn-gold/10"
        style={{
          backdropFilter: 'saturate(200%) blur(24px)',
          WebkitBackdropFilter: 'saturate(200%) blur(24px)',
          paddingLeft: 'max(20px, env(safe-area-inset-left))',
          paddingRight: 'max(20px, env(safe-area-inset-right))',
          background: 'linear-gradient(180deg, rgba(250,243,235,0.95) 0%, rgba(245,230,211,0.93) 100%)',
          boxShadow: '0 1px 0 rgba(212,160,60,0.10)',
        }}
      >
        <NavLink to="/" style={{ textDecoration: 'none' }}>
          <SealLogo />
        </NavLink>
        <div className="flex gap-1.5 items-center">
          <LangToggle />
          <ThemeToggle />
        </div>
      </header>
    </>
  );
}

function BottomTabBar() {
  const { theme } = useTheme();
  const t = useT();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex justify-around items-start
        pt-2 border-t md:hidden tab-bar-safe"
      style={{
        background: theme === 'dark' ? 'rgba(28,40,51,0.97)' : 'rgba(250,243,235,0.97)',
        borderTopColor: theme === 'dark' ? 'rgba(212,160,60,0.12)' : 'rgba(212,160,60,0.30)',
        backdropFilter: 'saturate(200%) blur(28px)',
        WebkitBackdropFilter: 'saturate(200%) blur(28px)',
      }}
    >
      {NAV_KEYS.map(({ to, key, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className="flex flex-col items-center gap-[3px] px-3 py-1 rounded-xl min-w-[56px]"
        >
          {({ isActive }) => (
            <>
              <span className={`transition-all duration-200 ${isActive ? 'text-cn-red scale-110' : 'text-apple-tertiary'}`}>
                <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
              </span>
              <span className={`text-[10px] font-serif font-semibold tracking-[0.04em] transition-colors duration-200
                ${isActive ? 'text-cn-red' : 'text-apple-tertiary'}`}>
                {t(key)}
              </span>
              {isActive && (
                <span
                  className="absolute -top-[1px] w-10 h-[2.5px] rounded-full"
                  style={{ background: 'linear-gradient(90deg, transparent, #E74C3C 25%, #F1C40F 50%, #3498DB 75%, transparent)' }}
                />
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <BrowserRouter>
          <div className="hidden md:block">
            <DesktopNav />
          </div>

          <MobileTopBar />

          <main className="relative z-10 max-w-[1200px] mx-auto w-full
            px-5 pt-8 pb-6
            md:px-10 md:pt-[80px]
            pb-[calc(80px+env(safe-area-inset-bottom,0px))] md:pb-16">
            <Routes>
              <Route path="/"               element={<Dashboard />} />
              <Route path="/fixtures"       element={<Schedule />} />
              <Route path="/groups"         element={<Groups />} />
              <Route path="/championship"   element={<Tournament />} />
              <Route path="/matches/:id"    element={<MatchDetail />} />
              <Route path="/teams/:id"      element={<TeamDetail />} />
              {/* Legacy redirects */}
              <Route path="/schedule"       element={<Navigate to="/fixtures" replace />} />
              <Route path="/matches"        element={<Navigate to="/fixtures" replace />} />
              <Route path="/tournament"     element={<Navigate to="/championship" replace />} />
              <Route path="/predictions"    element={<Predictions />} />
              <Route path="/about"          element={<Navigate to="/" replace />} />
            </Routes>
          </main>

          <BottomTabBar />
        </BrowserRouter>
      </LanguageProvider>
    </ThemeProvider>
  );
}
