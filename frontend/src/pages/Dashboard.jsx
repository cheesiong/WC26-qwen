import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, TrendingUp, Calendar, Target, ChevronDown, ChevronUp, ArrowRight, Sparkles } from 'lucide-react';
import SEO from '../components/SEO';
import { getUpcomingMatches, getWinnerProbabilities, getAccuracy } from '../api/client';
import MatchCard from '../components/MatchCard';
import FlagImage from '../components/FlagImage';
import { useT, useFormatDate, useFormatDateShort, useTeamName } from '../contexts/LanguageContext';
import { DragonPhoenixPair, BatCluster, QilinMark } from '../components/TangOrnaments';

const PHASES = [
  { start: '2026-06-11', end: '2026-06-28', venue: null },
  { start: '2026-06-28', end: '2026-07-03', venue: null },
  { start: '2026-07-05', end: '2026-07-09', venue: null },
  { start: '2026-07-11', end: '2026-07-12', venue: null },
  { start: '2026-07-15', end: '2026-07-16', venue: null },
  { start: '2026-07-19', end: '2026-07-19', venue: null },
];

const HOST_TEAMS = [
  { id: 'USA', name: 'USA' },
  { id: 'CAN', name: 'Canada' },
  { id: 'MEX', name: 'Mexico' },
];

function currentPhaseIndex() {
  const now = new Date();
  for (let i = 0; i < PHASES.length; i++) {
    const { start, end } = PHASES[i];
    if (now >= new Date(start + 'T00:00:00Z') && now <= new Date(end + 'T23:59:59Z')) return i;
  }
  return 0;
}

function Countdown({ targetDate }) {
  const t = useT();
  const [diff, setDiff] = useState(null);

  useEffect(() => {
    function compute() {
      const now = Date.now();
      const target = new Date(targetDate).getTime();
      const ms = target - now;
      if (ms <= 0) { setDiff(null); return; }
      const d = Math.floor(ms / 86400000);
      const h = Math.floor((ms % 86400000) / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setDiff({ d, h, m, s });
    }
    compute();
    const id = setInterval(compute, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  if (!diff) return null;
  const units = [
    ['countdownDays', diff.d],
    ['countdownHrs', diff.h],
    ['countdownMin', diff.m],
    ['countdownSec', diff.s],
  ];
  const configs = [
    { bg: 'linear-gradient(135deg, #E74C3C, #C0392B)', glow: '0 0 20px rgba(231,76,60,0.5), 0 0 40px rgba(231,76,60,0.2)', border: 'rgba(241,196,15,0.5)', text: '#F1C40F' },
    { bg: 'linear-gradient(135deg, #E67E22, #D4A03C)', glow: '0 0 20px rgba(230,126,34,0.5), 0 0 40px rgba(230,126,34,0.2)', border: 'rgba(241,196,15,0.55)', text: '#FFF' },
    { bg: 'linear-gradient(135deg, #2ECC71, #27AE60)', glow: '0 0 20px rgba(46,204,113,0.5), 0 0 40px rgba(46,204,113,0.2)', border: 'rgba(46,204,113,0.5)', text: '#FFF' },
    { bg: 'linear-gradient(135deg, #3498DB, #9B59B6)', glow: '0 0 20px rgba(155,89,182,0.5), 0 0 40px rgba(52,152,219,0.2)', border: 'rgba(155,89,182,0.5)', text: '#FFF' },
  ];
  return (
    <div className="flex items-center gap-2 sm:gap-3 mt-5">
      {units.map(([unitKey, val], i) => (
        <div
          key={unitKey}
          className="text-center px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl border-2"
          style={{ background: configs[i].bg, borderColor: configs[i].border, boxShadow: configs[i].glow, backdropFilter: 'blur(8px)' }}
        >
          <div className="text-[24px] sm:text-[30px] font-black tracking-[-0.04em] leading-none tabular-nums font-serif drop-shadow-lg"
            style={{ color: configs[i].text, textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
            {String(val).padStart(2, '0')}
          </div>
          <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.12em] text-white/70 mt-1 font-serif">
            {t(`dashboard.${unitKey}`)}
          </div>
        </div>
      ))}
    </div>
  );
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
};

/* ── Carnival ornamental decorations ── */
function ImperialOrnaments() {
  return (
    <>
      {/* Top-right vivid gold-persimmon radial */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] opacity-[0.28]"
        style={{ background: 'radial-gradient(circle at 80% 20%, #F1C40F 0%, #E67E22 25%, #E74C3C 50%, transparent 65%)' }} />
      {/* Bottom-left persimmon-terracotta glow */}
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] opacity-[0.22]"
        style={{ background: 'radial-gradient(circle at 20% 80%, #E67E22 0%, #C0392B 30%, #9B59B6 55%, transparent 70%)' }} />
      {/* Top-left cherry-wisteria accent */}
      <div className="absolute top-0 left-0 w-[350px] h-[350px] opacity-[0.18]"
        style={{ background: 'radial-gradient(circle at 10% 10%, #E8828A 0%, #9B59B6 35%, #3498DB 60%, transparent 75%)' }} />
      {/* Bottom-right emerald-teal accent */}
      <div className="absolute bottom-0 right-0 w-[380px] h-[380px] opacity-[0.16]"
        style={{ background: 'radial-gradient(circle at 90% 90%, #2ECC71 0%, #3498DB 35%, transparent 60%)' }} />
      {/* Center-top amber sunburst */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[250px] opacity-[0.12]"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, #F1C40F 0%, #E67E22 35%, transparent 65%)' }} />
      {/* Center-bottom pink-cherry glow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] opacity-[0.10]"
        style={{ background: 'radial-gradient(ellipse at 50% 100%, #E8828A 0%, #9B59B6 40%, transparent 70%)' }} />
      {/* 宝相花 medallion motif — top left */}
      <svg className="absolute top-6 left-6 opacity-[0.18]" width="80" height="80" viewBox="0 0 80 80" fill="none">
        <circle cx="40" cy="40" r="20" stroke="#E8C547" strokeWidth="1"/>
        <circle cx="40" cy="40" r="12" stroke="#E67E22" strokeWidth="0.8"/>
        <path d="M40 20c4 8 4 12 0 20s-4 12 0 20M20 40c8-4 12-4 20 0s12 4 20 0M25 25l30 30M55 25l-30 30" stroke="#F1C40F" strokeWidth="0.6" strokeOpacity="0.7"/>
      </svg>
      {/* 唐草纹 scrolling vine — bottom right */}
      <svg className="absolute bottom-6 right-8 opacity-[0.14]" width="100" height="40" viewBox="0 0 100 40" fill="none">
        <path d="M0 20c8-12 16-12 25 0s17 12 25 0 17-12 25 0 17 12 25 0" stroke="#E8C547" strokeWidth="1"/>
        <circle cx="25" cy="20" r="3" fill="#E67E22" fillOpacity="0.3"/>
        <circle cx="75" cy="20" r="3" fill="#E74C3C" fillOpacity="0.3"/>
      </svg>
      {/* Inner rainbow frame */}
      <div className="absolute inset-[8px] rounded-xl pointer-events-none"
        style={{ border: '1px solid rgba(232,197,71,0.18)', boxShadow: 'inset 0 0 0 1px rgba(231,76,60,0.06), inset 0 0 20px rgba(155,89,182,0.03)' }} />
    </>
  );
}

export default function Dashboard() {
  const t = useT();
  const formatDate = useFormatDate();
  const formatDateShort = useFormatDateShort();
  const teamName = useTeamName();
  const [upcomingDays, setUpcomingDays] = useState([]);
  const [winnerProbs, setWinnerProbs]   = useState([]);
  const [accuracy, setAccuracy]         = useState(null);
  const [loading, setLoading]           = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [upcoming, probs] = await Promise.all([getUpcomingMatches(), getWinnerProbabilities()]);
      setUpcomingDays(upcoming.dates || []);
      setWinnerProbs((probs.probabilities || probs).slice(0, 8));
      getAccuracy().then(setAccuracy).catch(() => {});
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalUpcoming = upcomingDays.reduce((sum, d) => sum + d.matches.length, 0);
  const leader        = winnerProbs[0];
  const phaseIdx      = currentPhaseIndex();
  const nextMatch     = upcomingDays[0]?.matches[0];

  return (
    <div className="space-y-5">
      <SEO
        title="World Cup 2026 Predictions & Standings | WC2026 by Qwen"
        description="AI-powered FIFA World Cup 2026 match predictions. ELO ratings, Poisson model, head-to-head history and live web intelligence — updated daily for all 104 matches."
        path="/"
        jsonLd={{
          '@type': 'SportsEvent',
          name: 'FIFA World Cup 2026',
          sport: 'Association Football',
          startDate: '2026-06-11',
          endDate: '2026-07-19',
          location: { '@type': 'Place', name: 'United States, Canada and Mexico' },
          organizer: { '@type': 'Organization', name: 'FIFA', url: 'https://www.fifa.com' },
          description: 'The 2026 FIFA World Cup features 48 teams across 12 groups and 104 matches, hosted in the United States, Canada, and Mexico from 11 June to 19 July 2026.',
          eventStatus: 'https://schema.org/EventScheduled',
          audience: { '@type': 'Audience', name: 'Football fans worldwide' },
        }}
      />

      {/* ══════════════════════════════════════════════════════════
          HERO — Carnival Lacquer Banner with vivid ornaments
          ══════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl overflow-hidden relative tang-border" style={{
        background: 'linear-gradient(160deg, #1C2833 0%, #2C3E50 15%, #34495E 30%, #3B2E42 45%, #2E4053 60%, #1E3A4F 75%, #2C3E50 90%, #1C2833 100%)',
        minHeight: 260,
      }}>
        <ImperialOrnaments />
        <DragonPhoenixPair opacity={0.14} />

        {/* Deco ornamental double-frame */}
        <div className="absolute inset-[6px] rounded-xl pointer-events-none"
          style={{ border: '1px solid rgba(212,160,60,0.10)' }} />

        <div className="relative px-6 py-7 sm:px-9 sm:py-9">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="flex-1 min-w-0">
              {/* Eyebrow — seal stamp style */}
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="inline-flex items-center gap-2 mb-5"
              >
                <span className="seal-stamp text-[9px] px-2 py-[3px]">
                  {t('common.worldCup2026')}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.10em] text-white/35 font-serif">
                  {t(`dashboard.${['groupStage','roundOf32','roundOf16','quarterFinals','semiFinals','final'][phaseIdx]}`)}
                </span>
              </motion.div>

              {/* Headline — serif font with gold gradient */}
              <h1 className="text-[38px] sm:text-[48px] lg:text-[54px] font-black tracking-[-0.035em] leading-[0.92] mb-3 font-serif">
                <span className="text-white/90">{t('dashboard.heroTitle').split(' ').slice(0, -1).join(' ')} </span>
                <span className="bg-clip-text text-transparent" style={{
                  backgroundImage: 'linear-gradient(135deg, #F1C40F 0%, #E8C547 30%, #E67E22 60%, #F1C40F 100%)',
                }}>
                  {t('dashboard.heroTitle').split(' ').slice(-1)}
                </span>
              </h1>

              <p className="text-[14px] sm:text-[15px] text-white/40 max-w-md font-serif">
                {totalUpcoming > 0 ? `${totalUpcoming} ${t('common.ahead')}` : t('common.loading')} · {t('dashboard.heroSubtitle')}
              </p>

              {/* Countdown */}
              {nextMatch?.scheduled_time && (
                <div>
                  <Countdown targetDate={`${nextMatch.scheduled_date}T${nextMatch.scheduled_time}:00Z`} />
                  <p className="text-[10px] text-white/25 mt-2.5 uppercase tracking-[0.12em] font-medium font-serif">
                    {t('schedule.kickoff')} (SGT)
                  </p>
                </div>
              )}

              {/* Host badges */}
              <div className="flex items-center gap-3 mt-5">
                <span className="text-[10px] font-semibold text-white/25 uppercase tracking-[0.10em] font-serif">{t('common.hostedBy')}</span>
                <div className="flex items-center gap-1.5">
                  {HOST_TEAMS.map(h => (
                    <div key={h.id} className="rounded-lg overflow-hidden ring-1 ring-cn-gold/20">
                      <FlagImage teamId={h.id} size="sm" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Leader card — ink card with gold frame ── */}
            {leader && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="shrink-0"
              >
                <Link to={`/teams/${leader.teamId}`} className="block group">
                  <div className="rounded-xl px-5 py-4 sm:px-6 sm:py-5 min-w-[200px] sm:min-w-[240px] transition-transform duration-300 group-hover:-translate-y-1 border tang-border"
                    style={{ background: 'rgba(28,40,51,0.75)', backdropFilter: 'blur(16px)' }}>
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-cn-gold/50 mb-3 flex items-center gap-1.5 font-serif">
                      <Sparkles size={10} className="text-cn-gold" />
                      {t('common.favouriteToWin')}
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="ring-2 ring-cn-gold/25 rounded-full">
                        <FlagImage teamId={leader.teamId} size="md" />
                      </div>
                      <div>
                        <p className="text-[20px] sm:text-[22px] font-black tracking-[-0.03em] text-white/90 leading-none group-hover:text-cn-gold transition-colors font-serif">
                          {teamName(leader.teamId, leader.name)}
                        </p>
                        <p className="text-[18px] font-black mt-1 tabular-nums bg-clip-text text-transparent font-serif" style={{
                          backgroundImage: 'linear-gradient(90deg, #F1C40F, #E67E22, #E74C3C)',
                        }}>
                          {(leader.probability * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          STATS CARDS — Ink cards with gold accents
          ══════════════════════════════════════════════════════════ */}
      <motion.div
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
        initial="hidden" animate="show"
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
      >
        {/* ── Favourites card — rainbow top accent ── */}
        <motion.div variants={fadeUp} className="tang-palace p-5 col-span-2 sm:col-span-1 lg:col-span-2 relative tang-bat-bg">
          <QilinMark className="top-3 right-3" />
          <div className="absolute top-0 left-0 right-0 h-[4px] rounded-t-2xl"
            style={{ background: 'linear-gradient(90deg, #E74C3C, #E67E22, #F1C40F, #2ECC71, #3498DB, #9B59B6)' }} />
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cn-gold/50 mb-3 flex items-center gap-1.5 font-serif">
            <Trophy size={12} className="text-cn-gold" /> {t('dashboard.favourites')}
          </p>
          <div className="flex gap-0 items-start">
            <div className="flex-1 pr-4">
              {leader ? (
                <Link to={`/teams/${leader.teamId}`} className="block group">
                  <div className="flex items-center gap-2.5">
                    <FlagImage teamId={leader.teamId} className="w-8 h-8 rounded-full ring-1 ring-cn-gold/20 shrink-0" />
                    <p className="text-[24px] sm:text-[28px] font-black tracking-[-0.04em] leading-none group-hover:text-cn-gold transition-colors font-serif">
                      {teamName(leader.teamId, leader.name)}
                    </p>
                  </div>
                  <p className="text-[12px] text-white/40 mt-1.5 ml-[42px] font-serif">
                    {(leader.probability * 100).toFixed(1)}% {t('dashboard.chanceToWin')}
                  </p>
                </Link>
              ) : (
                <p className="text-[28px] font-black text-white/20 font-serif">–</p>
              )}
            </div>
            {winnerProbs[1] && (
              <>
                <div className="w-px self-stretch mx-3" style={{ background: 'rgba(212,160,60,0.15)' }} />
                <div className="flex-1 px-1">
                  <Link to={`/teams/${winnerProbs[1].teamId}`} className="block group">
                    <div className="flex items-center gap-2">
                      <FlagImage teamId={winnerProbs[1].teamId} className="w-5 h-5 rounded-full ring-1 ring-cn-gold/15 shrink-0" />
                      <p className="text-[15px] font-bold tracking-[-0.02em] text-white/70 leading-none group-hover:text-cn-gold transition-colors truncate font-serif">
                        {teamName(winnerProbs[1].teamId, winnerProbs[1].name)}
                      </p>
                    </div>
                    <p className="text-[11px] text-white/35 mt-0.5 ml-[28px]">{(winnerProbs[1].probability * 100).toFixed(1)}%</p>
                  </Link>
                </div>
              </>
            )}
            {winnerProbs[2] && (
              <>
                <div className="w-px self-stretch mx-3" style={{ background: 'rgba(212,160,60,0.15)' }} />
                <div className="flex-1 pl-1">
                  <Link to={`/teams/${winnerProbs[2].teamId}`} className="block group">
                    <div className="flex items-center gap-2">
                      <FlagImage teamId={winnerProbs[2].teamId} className="w-5 h-5 rounded-full ring-1 ring-cn-gold/15 shrink-0" />
                      <p className="text-[15px] font-bold tracking-[-0.02em] text-white/70 leading-none group-hover:text-cn-gold transition-colors truncate font-serif">
                        {teamName(winnerProbs[2].teamId, winnerProbs[2].name)}
                      </p>
                    </div>
                    <p className="text-[11px] text-white/35 mt-0.5 ml-[28px]">{(winnerProbs[2].probability * 100).toFixed(1)}%</p>
                  </Link>
                </div>
              </>
            )}
          </div>
        </motion.div>

        {/* ── Accuracy card — emerald-pine accent ── */}
        <motion.div variants={fadeUp} className="tang-palace p-5 relative tang-bat-bg">
          <div className="absolute top-0 left-0 right-0 h-[4px] rounded-t-2xl"
            style={{ background: 'linear-gradient(90deg, #2ECC71, #27AE60, #3498DB)' }} />
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-cn-jade/60 mb-2 font-serif">{t('dashboard.accuracy')}</p>
          {accuracy?.stats?.total > 0 ? (
            <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
              <div>
                <p className="text-[26px] font-black tracking-[-0.04em] leading-none text-white/90 font-serif">{accuracy.stats.accuracy_pct}%</p>
                <p className="text-[9px] font-medium text-white/35 uppercase tracking-wider mt-0.5 font-serif">{t('dashboard.points')}</p>
              </div>
              <div className="w-px self-stretch hidden sm:block" style={{ background: 'rgba(212,160,60,0.12)' }} />
              <div>
                <p className="text-[26px] font-black tracking-[-0.04em] leading-none text-white/90 font-serif">{accuracy.stats.outcome_accuracy_pct ?? '–'}%</p>
                <p className="text-[9px] font-medium text-white/35 uppercase tracking-wider mt-0.5 font-serif">{t('dashboard.outcome')}</p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-[32px] font-black text-white/15 leading-none font-serif">–</p>
              <p className="text-[11px] text-white/35 mt-1 font-serif">{t('dashboard.noResults')}</p>
            </>
          )}
        </motion.div>

        {/* ── Stage card — amber-sunset accent ── */}
        <motion.div variants={fadeUp} className="tang-palace p-5 relative tang-bat-bg">
          <div className="absolute top-0 left-0 right-0 h-[4px] rounded-t-2xl"
            style={{ background: 'linear-gradient(90deg, #F1C40F, #E67E22, #E74C3C)' }} />
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-cn-gold/50 mb-2 font-serif">{t('dashboard.phase')}</p>
          <p className="text-[24px] font-black tracking-[-0.03em] leading-none text-white/90 font-serif">
            {t(`dashboard.${['groupStage','roundOf32','roundOf16','quarterFinals','semiFinals','final'][phaseIdx]}`).split(' ')[0]}
          </p>
          <p className="text-[11px] text-white/40 mt-1 font-serif">
            {(() => { const p = PHASES[phaseIdx]; return p.start === p.end ? formatDateShort(p.start) : `${formatDateShort(p.start)} – ${formatDateShort(p.end)}`; })()}
          </p>
        </motion.div>
      </motion.div>

      {/* ══════════════════════════════════════════════════════════
          PHASE TIMELINE — Ink and gold stepper
          ══════════════════════════════════════════════════════════ */}
      <motion.div variants={fadeUp} initial="hidden" animate="show"
        className="tang-card p-4 sm:p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-apple-secondary mb-4 flex items-center gap-2 font-serif">
          <span className="w-2 h-2 rounded-full bg-cn-gold" />
          {t('tournament.progress')}
        </p>
        <div className="flex items-start gap-0">
          {PHASES.map((p, i) => {
            const isCurrent = i === phaseIdx;
            const isPast = i < phaseIdx;
            return (
              <div key={i} className="flex-1 flex flex-col items-center min-w-0">
                <div className="flex items-center w-full">
                  {i > 0 && (
                    <div className="flex-1 h-[2px] rounded-full transition-all duration-500"
                      style={{ background: isPast || isCurrent ? 'linear-gradient(90deg, rgba(212,160,60,0.5), rgba(212,160,60,0.7))' : 'rgba(0,0,0,0.06)' }} />
                  )}
                  <div
                    className="shrink-0 rounded-full flex items-center justify-center transition-all duration-500 border-2"
                    style={{
                      width: isCurrent ? 30 : 18,
                      height: isCurrent ? 30 : 18,
                      background: isCurrent ? 'linear-gradient(135deg, #D4A03C, #E8C547)' : isPast ? 'rgba(212,160,60,0.25)' : 'transparent',
                      borderColor: isCurrent ? '#D4A03C' : isPast ? 'rgba(212,160,60,0.4)' : 'rgba(0,0,0,0.08)',
                      boxShadow: isCurrent ? '0 0 0 3px rgba(212,160,60,0.15)' : 'none',
                    }}
                  >
                    {isCurrent && <span className="text-white text-[9px] font-black font-serif">{i + 1}</span>}
                    {isPast && <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M2.5 5L4.5 7L7.5 3" stroke="#D4A03C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  {i < PHASES.length - 1 && (
                    <div className="flex-1 h-[2px] rounded-full transition-all duration-500"
                      style={{ background: isPast ? 'linear-gradient(90deg, rgba(212,160,60,0.5), rgba(212,160,60,0.3))' : 'rgba(0,0,0,0.06)' }} />
                  )}
                </div>
                <p className={`text-[9px] sm:text-[10px] font-bold mt-2 text-center truncate w-full transition-colors font-serif
                  ${isCurrent ? 'text-cn-gold' : isPast ? 'text-apple-secondary' : 'text-apple-tertiary'}`}>
                  {t(`dashboard.${['groupStage','roundOf32','roundOf16','quarterFinals','semiFinals','final'][i]}`)}
                </p>
                <p className={`text-[8px] sm:text-[9px] mt-0.5 text-center font-serif ${isCurrent ? 'text-apple-secondary' : 'text-apple-tertiary'}`}>
                  {formatDateShort(p.start).split(' ').slice(0, 2).join(' ')}
                </p>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* ══════════════════════════════════════════════════════════
          MAIN GRID — Matches + Sidebar
          ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">

        {/* ── MATCHES COLUMN ── */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-seal border border-cn-gold/15"
              style={{ background: 'linear-gradient(135deg, rgba(212,160,60,0.06), rgba(231,76,60,0.04))' }}>
              <Calendar size={13} className="text-cn-gold" />
              <h2 className="text-[16px] sm:text-[18px] font-bold tracking-[-0.02em] text-apple-text font-serif">
                {t('dashboard.upcomingMatches')}
              </h2>
            </div>
            <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(231,76,60,0.25), rgba(232,197,71,0.15), transparent)' }} />
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="tang-card p-6 animate-pulse">
                  <div className="h-3 bg-apple-raised rounded-full w-1/4 mb-5" />
                  <div className="h-10 bg-apple-raised rounded-xl mb-4" />
                  <div className="h-2.5 bg-apple-raised rounded-full" />
                </div>
              ))}
            </div>
          ) : upcomingDays.length === 0 ? (
            <div className="tang-card p-10 text-center">
              <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center border border-cn-gold/15"
                style={{ background: 'rgba(212,160,60,0.06)' }}>
                <Trophy size={24} className="text-cn-gold" />
              </div>
              <p className="text-apple-secondary font-medium font-serif">{t('dashboard.noMatches')}</p>
            </div>
          ) : (
            upcomingDays.map(({ date, matches }) => (
              <div key={date}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-[15px] font-bold tracking-[-0.02em] text-apple-text whitespace-nowrap font-serif">
                    {formatDate(date)}
                  </span>
                  <div className="tang-divider flex-1" />
                </div>
                <div className="space-y-3">
                  {matches.map(m => <MatchCard key={m.id} match={m} />)}
                </div>
              </div>
            ))
          )}
        </motion.div>

        {/* ── SIDEBAR — Top Picks ── */}
        <motion.aside variants={fadeUp} initial="hidden" animate="show"
          className="lg:sticky lg:top-[84px] lg:self-start">
          <div className="tang-card overflow-hidden">
            {/* Header */}
            <div className="px-5 pt-4 pb-3 flex items-center justify-between relative overflow-hidden border-b border-cn-gold/10"
              style={{ background: 'linear-gradient(135deg, rgba(231,76,60,0.06) 0%, rgba(230,126,34,0.04) 40%, rgba(155,89,182,0.04) 100%)' }}>
                <BatCluster className="bottom-2 right-4" />
              <h3 className="text-[15px] font-bold tracking-[-0.02em] text-apple-text flex items-center gap-2 font-serif">
                <span className="w-6 h-6 rounded-seal flex items-center justify-center border border-cn-red/30"
                  style={{ background: 'linear-gradient(135deg, rgba(231,76,60,0.12), rgba(192,57,43,0.08))' }}>
                  <TrendingUp size={12} className="text-cn-red" />
                </span>
                {t('dashboard.topPicks')}
              </h3>
              <span className="flex items-center gap-1.5 text-[9px] font-bold text-white bg-gradient-to-r from-[#E74C3C] to-[#C0392B] px-2.5 py-0.5 rounded-seal font-serif uppercase tracking-[0.06em]"
                style={{ boxShadow: '0 0 12px rgba(231,76,60,0.3)' }}>
                <span className="w-[4px] h-[4px] rounded-full bg-white animate-pulse" />
                {t('status.LIVE')}
              </span>
            </div>

            <div>
              {winnerProbs.length === 0 ? (
                <div className="px-5 py-4 text-sm text-apple-tertiary">{t('common.loading')}</div>
              ) : winnerProbs.map((team, i) => (
                <Link key={team.teamId} to={`/teams/${team.teamId}`}
                  className="flex items-center gap-3 px-5 py-3 border-b border-cn-gold/[0.06] last:border-0
                    hover:bg-cn-gold/[0.03] transition-all duration-200 group">
                  {/* Rank — carnival-style coloured badges with glow */}
                  <span className={`text-[10px] font-black w-5 h-5 rounded-seal flex items-center justify-center shrink-0 font-serif ${
                    i === 0 ? 'text-white border border-[#F1C40F]/50' :
                    i === 1 ? 'text-white border border-[#BDC3C7]/40' :
                    i === 2 ? 'text-white border border-[#E67E22]/40' :
                    i === 3 ? 'text-[#3498DB] border border-[#3498DB]/30' :
                    i === 4 ? 'text-[#2ECC71] border border-[#2ECC71]/30' :
                    i === 5 ? 'text-[#9B59B6] border border-[#9B59B6]/30' :
                    'text-apple-tertiary'
                  }`}
                    style={{
                      background: i === 0 ? 'linear-gradient(135deg, #F1C40F, #D4A03C)' :
                        i === 1 ? 'linear-gradient(135deg, #BDC3C7, #95A5A6)' :
                        i === 2 ? 'linear-gradient(135deg, #E67E22, #D35400)' :
                        'transparent',
                      boxShadow: i === 0 ? '0 0 8px rgba(241,196,15,0.4)' :
                        i === 1 ? '0 0 6px rgba(189,195,199,0.3)' :
                        i === 2 ? '0 0 6px rgba(230,126,34,0.3)' : 'none',
                    }}>
                    {i + 1}
                  </span>
                  <FlagImage teamId={team.teamId} className="w-6 h-6 rounded-full ring-1 ring-cn-gold/10 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-apple-text truncate tracking-[-0.01em] group-hover:text-cn-red transition-colors font-serif">
                      {teamName(team.teamId, team.name)}
                    </p>
                    <div className="h-[4px] rounded-full bg-apple-raised mt-1.5 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${(team.probability / winnerProbs[0].probability * 100).toFixed(0)}%`,
                          background: i === 0 ? 'linear-gradient(90deg, #E74C3C, #E67E22, #F1C40F)' :
                            i === 1 ? 'linear-gradient(90deg, #E74C3C, #C0392B, #E67E22)' :
                            i === 2 ? 'linear-gradient(90deg, #3498DB, #9B59B6, #E8828A)' :
                            i === 3 ? 'linear-gradient(90deg, #2ECC71, #27AE60, #3498DB)' :
                            i === 4 ? 'linear-gradient(90deg, #F1C40F, #E67E22)' :
                            i === 5 ? 'linear-gradient(90deg, #9B59B6, #E8828A)' :
                            i === 6 ? 'linear-gradient(90deg, #E67E22, #D35400)' :
                            'linear-gradient(90deg, #34495E, #2C3E50)',
                        }} />
                    </div>
                  </div>
                  <span className={`text-[13px] font-bold tracking-[-0.02em] shrink-0 tabular-nums font-serif ${
                    i === 0 ? 'bg-clip-text text-transparent' : 'text-apple-text'
                  }`}
                    style={i === 0 ? { backgroundImage: 'linear-gradient(90deg, #F1C40F, #E67E22)' } : {}}>
                    {(team.probability * 100).toFixed(1)}%
                  </span>
                </Link>
              ))}
            </div>

            {/* Footer CTA */}
            <Link to="/championship"
              className="flex items-center justify-between px-5 py-3.5 border-t border-cn-gold/[0.08]
                hover:bg-cn-gold/[0.03] transition-colors group">
              <span className="text-[12px] font-semibold text-apple-secondary group-hover:text-cn-red transition-colors font-serif">
                {t('nav.championship')}
              </span>
              <ArrowRight size={14} className="text-apple-tertiary group-hover:text-cn-red transition-all group-hover:translate-x-0.5" />
            </Link>
          </div>
        </motion.aside>
      </div>

      {/* ── ABOUT FOOTER ── */}
      <AboutFooter />
    </div>
  );
}

function AboutFooter() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const reasons = t('about.reasons');

  return (
    <div className="tang-card overflow-hidden mt-6">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-cn-gold/[0.03] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-seal flex items-center justify-center text-[9px] font-black text-cn-red border-2 border-cn-red font-serif">WC</span>
          <span className="text-[14px] font-bold text-apple-text font-serif">{t('about.title')}</span>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
          <ChevronDown size={16} className="text-apple-tertiary" />
        </motion.div>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 border-t border-cn-gold/[0.08]">
          {/* Powered by */}
          <div className="rounded-xl overflow-hidden mt-4 p-4 text-white border border-cn-gold/10"
            style={{ background: 'linear-gradient(160deg, #1C2833 0%, #2C3E50 100%)' }}>
            <div className="flex items-center gap-3">
              <div className="shrink-0 w-10 h-10 rounded-seal bg-cn-gold/10 border border-cn-gold/15 flex items-center justify-center text-xl">🤖</div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cn-gold/40 mb-0.5 font-serif">{t('about.poweredBy')}</p>
                <a href="https://github.com/QwenLM/Qwen" target="_blank" rel="noopener noreferrer"
                  className="text-[16px] font-extrabold text-white tracking-[-0.02em] hover:text-cn-gold transition-colors block font-serif">
                  {t('about.poweredByName')}
                </a>
                <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">{t('about.poweredByDesc')}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[13px] text-apple-secondary leading-relaxed">{t('about.introPara1')}</p>
            <p className="text-[13px] text-apple-secondary leading-relaxed">{t('about.introPara2')}</p>
          </div>

          <div className="rounded-xl border border-amber-400/20 bg-amber-50 dark:bg-amber-900/10 p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">⚠️</span>
              <h3 className="text-[13px] font-semibold text-amber-800 dark:text-amber-400 font-serif">{t('about.aiWarning')}</h3>
            </div>
            <p className="text-[12px] text-amber-700 dark:text-amber-300/70 leading-relaxed">{t('about.aiWarningBody')}</p>
          </div>

          <div className="rounded-xl border border-red-400/20 bg-red-50 dark:bg-red-900/10 p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">🚫</span>
              <h3 className="text-[13px] font-semibold text-red-800 dark:text-red-400 font-serif">{t('about.noBetting')}</h3>
            </div>
            <p className="text-[12px] text-red-700 dark:text-red-300/70 leading-relaxed">{t('about.noBettingBody')}</p>
          </div>

          <div className="space-y-2">
            <h3 className="text-[16px] font-bold text-apple-text font-serif">{t('about.whyBuilt')}</h3>
            <p className="text-[13px] text-apple-secondary leading-relaxed">{t('about.whyIntro')}</p>
            <ul className="space-y-1.5 pl-1">
              {(Array.isArray(reasons) ? reasons : []).map(item => (
                <li key={item} className="flex items-start gap-2 text-[13px] text-apple-secondary leading-relaxed">
                  <span className="mt-[3px] shrink-0 w-4 h-4 rounded-sm flex items-center justify-center border border-cn-gold/15"
                    style={{ background: 'rgba(212,160,60,0.06)' }}>
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1.5 4L3.5 6L6.5 2" stroke="#D4A03C" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-[13px] text-apple-secondary leading-relaxed">{t('about.whyOutro')}</p>
          </div>

          <div className="flex items-center gap-4 p-4 rounded-xl bg-apple-raised/40 dark:bg-white/[0.03] border border-cn-gold/[0.06]">
            <div className="w-11 h-11 rounded-full flex items-center justify-center border border-cn-gold/15"
              style={{ background: 'linear-gradient(135deg, #2C3E50, #1C2833)' }}>
              <span className="text-base font-black text-cn-gold font-serif">CS</span>
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-bold text-apple-text font-serif">Chan Chee Siong</p>
              <p className="text-[11px] text-apple-secondary">{t('about.linkedinTitle')}</p>
            </div>
            <a href="https://www.linkedin.com/in/chancheesiong/" target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-seal bg-[#0A66C2] hover:bg-[#0047A0] text-white text-[11px] font-semibold transition-colors">
              {t('about.linkedinCta')}
            </a>
          </div>

          <div className="tang-divider" />

          <p className="text-[11px] text-apple-tertiary leading-relaxed">
            {t('about.footer')}
          </p>
        </div>
      )}
    </div>
  );
}
