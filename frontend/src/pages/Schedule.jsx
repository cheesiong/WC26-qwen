import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, X, Filter, CalendarDays, Layers, Trophy, Clock } from 'lucide-react';
import SEO from '../components/SEO';
import { getMatches, getTeams } from '../api/client';
import { formatTime, toSGTDateKey } from '../utils/time';
import FlagImage from '../components/FlagImage';
import { useT, useFormatDate, useTeamName } from '../contexts/LanguageContext';
import { DragonWatermark, PhoenixWatermark, BatCluster } from '../components/TangOrnaments';

const STAGE_ORDER = { GROUP: 0, R32: 1, R16: 2, QF: 3, SF: 4, THIRD_PLACE: 5, F: 6 };

function MatchRow({ match }) {
  const navigate = useNavigate();
  const t = useT();
  const formatDate = useFormatDate();
  const teamName = useTeamName();
  const isCompleted = match.status === 'COMPLETED';
  const isLive = match.status === 'LIVE';
  const isTBD = !match.home_name && !match.away_name;

  if (isTBD) {
    return (
      <div className="flex items-center justify-between py-3 px-3 rounded-2xl text-apple-tertiary">
        <div className="w-14 sm:w-20 flex-shrink-0 text-[11px] text-apple-tertiary text-right pr-2 sm:pr-3 whitespace-nowrap tabular-nums">
          {formatTime(match.scheduled_date, match.scheduled_time) || '—'}
        </div>
        <div className="flex-1 flex items-center justify-center gap-2">
          <span className="text-[11px] bg-apple-raised/70 text-apple-secondary px-2.5 py-1 rounded-full font-medium">
            {match.stage ? '' : ''}
            {match.stage === 'F' ? t('stage.F') : match.stage === 'THIRD_PLACE' ? t('stage.THIRD_PLACE') : match.stage ? `${t(`stageShort.${match.stage}`) || match.stage}` : ''}
            {match.match_number ? ` · ${match.match_number}` : ''}
          </span>
          <span className="text-[11px] text-apple-tertiary">{t('schedule.tbdTeams')}</span>
        </div>
        <div className="w-14 sm:w-20" />
      </div>
    );
  }

  return (
    <Link to={`/matches/${match.id}`}
      className="flex items-center justify-between py-2.5 px-3 rounded-2xl hover:bg-apple-raised/40 transition-all duration-200 group">
      {/* Kick-off time */}
      <div className="w-14 sm:w-20 flex-shrink-0 text-[11px] text-apple-tertiary text-right pr-2 sm:pr-3 whitespace-nowrap tabular-nums font-medium">
        <span className="sm:hidden">{formatTime(match.scheduled_date, match.scheduled_time, { short: true }) || '—'}</span>
        <span className="hidden sm:inline">{formatTime(match.scheduled_date, match.scheduled_time) || '—'}</span>
      </div>

      {/* Home team */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0 justify-end">
        <span
          className="text-[13px] text-apple-secondary group-hover:text-cn-red transition-colors text-right leading-tight font-semibold hover:underline cursor-pointer truncate min-w-0"
          onClick={e => { e.preventDefault(); e.stopPropagation(); navigate(`/teams/${match.home_team}`); }}
        >
          {teamName(match.home_team, match.home_name)}
        </span>
        <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full overflow-hidden ring-1 ring-cn-gold/20 flex-shrink-0">
          <FlagImage teamId={match.home_team} className="w-full h-full" />
        </div>
      </div>

      {/* Score / prob bar */}
      <div className="w-16 sm:w-20 text-center flex-shrink-0 px-1">
        {isCompleted ? (
          <div className="flex items-center justify-center gap-1">
            <span className="font-extrabold text-apple-text tabular-nums text-[13px]">
              {match.home_score} – {match.away_score}
            </span>
          </div>
        ) : isLive ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-cn-red">
            <span className="w-1.5 h-1.5 rounded-full bg-cn-red animate-pulse" />
            {t('status.LIVE')}
          </span>
        ) : (
          <div className="flex h-2 rounded-full overflow-hidden w-12 sm:w-16 mx-auto gap-[2px]">
            {match.prob_home != null ? (
              <>
                <div className="rounded-l-full transition-all" style={{ width: `${Math.round(match.prob_home * 100)}%`, background: '#C0392B' }} />
                <div className="bg-apple-raised/60" style={{ width: `${Math.round(match.prob_draw * 100)}%` }} />
                <div className="rounded-r-full transition-all" style={{ width: `${Math.round(match.prob_away * 100)}%`, background: '#E8C547' }} />
              </>
            ) : (
              <div className="w-full bg-apple-raised/60 rounded-full flex items-center justify-center">
                <span className="text-[10px] text-apple-tertiary font-medium">vs</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Away team */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
        <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full overflow-hidden ring-1 ring-cn-gold/20 flex-shrink-0">
          <FlagImage teamId={match.away_team} className="w-full h-full" />
        </div>
        <span
          className="text-[13px] text-apple-secondary group-hover:text-cn-red transition-colors leading-tight font-semibold hover:underline cursor-pointer truncate min-w-0"
          onClick={e => { e.preventDefault(); e.stopPropagation(); navigate(`/teams/${match.away_team}`); }}
        >
          {teamName(match.away_team, match.away_name)}
        </span>
      </div>

      {/* Confidence badge — desktop only */}
      <div className="hidden sm:flex w-20 flex-shrink-0 justify-end">
        {match.confidence && !isCompleted && (
          <span className={`text-[9px] font-bold uppercase tracking-[0.04em] px-2 py-0.5 rounded-seal border ${
            match.confidence === 'VERY_HIGH' ? 'border-cn-gold/30 bg-cn-gold/10 text-cn-gold' :
            match.confidence === 'HIGH' ? 'border-cn-gold/25 bg-cn-gold/8 text-cn-gold' :
            match.confidence === 'MEDIUM' ? 'border-cn-gold/15 bg-cn-gold/5 text-apple-secondary' :
            'border-black/[0.06] bg-apple-raised/50 text-apple-tertiary'
          }`}
          >{t(`confidence.${match.confidence}`)}</span>
        )}
        {isCompleted && (
          <span className="text-[10px] text-cn-jade font-bold">✓</span>
        )}
      </div>
    </Link>
  );
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } },
};

export default function Schedule() {
  const t = useT();
  const formatDate = useFormatDate();
  const teamName = useTeamName();
  const [matches, setMatches] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStage, setFilterStage] = useState('ALL');
  const [filterGroup, setFilterGroup] = useState('ALL');
  const [filterTeam, setFilterTeam] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('date');

  useEffect(() => {
    Promise.all([getMatches(), getTeams()])
      .then(([m, t]) => { setMatches(m); setTeams(t); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return matches.filter(m => {
      if (filterStage !== 'ALL' && m.stage !== filterStage) return false;
      if (filterGroup !== 'ALL' && m.group_code !== filterGroup) return false;
      if (filterStatus !== 'ALL' && m.status !== filterStatus) return false;
      if (filterTeam !== 'ALL' && m.home_team !== filterTeam && m.away_team !== filterTeam) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(m.home_name?.toLowerCase().includes(q) || m.away_name?.toLowerCase().includes(q) || m.venue?.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [matches, filterStage, filterGroup, filterStatus, filterTeam, search]);

  const byDate = useMemo(() => {
    const map = new Map();
    for (const m of filtered) {
      const key = toSGTDateKey(m.scheduled_date, m.scheduled_time);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, ms]) => [
        date,
        [...ms].sort((a, b) => {
          const ta = a.scheduled_date && a.scheduled_time ? a.scheduled_date + 'T' + a.scheduled_time : '';
          const tb = b.scheduled_date && b.scheduled_time ? b.scheduled_date + 'T' + b.scheduled_time : '';
          return ta.localeCompare(tb);
        }),
      ]);
  }, [filtered]);

  const byStage = useMemo(() => {
    const map = new Map();
    for (const m of filtered) {
      const key = m.stage || 'OTHER';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    return [...map.entries()].sort(([a], [b]) => (STAGE_ORDER[a] ?? 99) - (STAGE_ORDER[b] ?? 99));
  }, [filtered]);

  const uniqueGroups = ['ALL', ...'ABCDEFGHIJKL'.split('')];
  const uniqueStages = ['ALL', 'GROUP', 'R32', 'R16', 'QF', 'SF', 'THIRD_PLACE', 'F'];
  const statuses = ['ALL', 'SCHEDULED', 'LIVE', 'COMPLETED'];

  const completed = matches.filter(m => m.status === 'COMPLETED').length;
  const total = matches.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const hasFilters = search || filterStage !== 'ALL' || filterGroup !== 'ALL' || filterStatus !== 'ALL' || filterTeam !== 'ALL';

  const selectClass = `bg-cn-tang-cream/80 dark:bg-apple-raised/30 border border-cn-gold/20 rounded-xl px-3 py-2 text-[13px] text-apple-text
    focus:outline-none focus:ring-2 focus:ring-cn-gold/20 appearance-none cursor-pointer font-medium
    hover:bg-cn-tang-silk/50 dark:hover:bg-apple-raised/50 transition-colors`;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="rounded-[28px] h-40 animate-pulse" style={{ background: 'linear-gradient(135deg, rgba(192,57,43,0.08), rgba(212,160,60,0.06))' }} />
        {Array(4).fill(null).map((_, i) => <div key={i} className="tang-card h-28 animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SEO
        title="Full Match Schedule — World Cup 2026 | WC2026 Predictor"
        description="Complete FIFA World Cup 2026 schedule — all 104 matches from the Group Stage to the Final, with kickoff times in Singapore Time (SGT) and AI predictions for every game."
        path="/schedule"
      />

      {/* ══════════════════════════════════════════════════════════
          HEADER — 上海装饰风 · Deco lacquer banner
          ══════════════════════════════════════════════════════════ */}
      <div className="rounded-[28px] overflow-hidden relative tang-border" style={{
        background: 'linear-gradient(160deg, #1C2833 0%, #2C3E50 30%, #34495E 50%, #243342 75%, #1C2833 100%)',
      }}>
        {/* Deco ornamental radials */}
        <div className="absolute top-0 right-0 w-[280px] h-[280px] rounded-full opacity-[0.10]"
          style={{ background: 'radial-gradient(circle, #E8C547 0%, #D4A03C 30%, transparent 60%)' }} />
        <div className="absolute bottom-0 left-[10%] w-[200px] h-[200px] rounded-full opacity-[0.05]"
          style={{ background: 'radial-gradient(circle, #D4A03C 0%, transparent 60%)' }} />
        {/* Inner gold frame */}
        <div className="absolute inset-[8px] rounded-[22px] pointer-events-none"
          style={{ border: '1px solid rgba(212,160,60,0.10)' }} />
        <DragonWatermark opacity={0.18} />
        <PhoenixWatermark opacity={0.16} />

        <div className="relative px-6 py-6 sm:px-8 sm:py-7">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 rounded-seal"
                style={{ background: 'rgba(212,160,60,0.10)', border: '1px solid rgba(212,160,60,0.20)' }}>
                <CalendarDays size={11} className="text-yellow-300" />
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">
                  {t('common.worldCup2026')}
                </span>
              </div>
              <h1 className="text-[36px] sm:text-[44px] font-extrabold tracking-[-0.04em] text-white leading-[0.92] mb-2">
                {t('nav.fixtures')}
              </h1>
              <div className="flex items-center gap-3 flex-wrap">
                <Stat label={t('schedule.matchesUnit')} value={total} color="#E8C547" />
                <Stat label={t('common.completed').toLowerCase()} value={completed} color="#7FB37A" />
                <Stat label={t('common.upcoming').toLowerCase()} value={total - completed} color="#C44858" />
              </div>
            </div>

            {/* View mode toggle */}
            <div className="flex rounded-xl p-1 shrink-0 self-start"
              style={{ background: 'rgba(212,160,60,0.08)', border: '1px solid rgba(212,160,60,0.15)' }}>
              {[
                { id: 'date', icon: CalendarDays, label: t('schedule.match') },
                { id: 'stage', icon: Layers, label: t('nav.bracket') },
              ].map(({ id, icon: Icon, label }) => (
                <button key={id} onClick={() => setViewMode(id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-semibold transition-all duration-250 ${
                    viewMode === id
                      ? 'text-white shadow-md'
                      : 'text-white/45 hover:text-white/70'
                  }`}
                  style={viewMode === id ? { background: 'linear-gradient(135deg, #C0392B, #8B2500)' } : {}}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          PROGRESS — Tang card with gold animated bar
          ══════════════════════════════════════════════════════════ */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="tang-card p-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-apple-secondary flex items-center gap-1.5">
              <Trophy size={11} className="text-cn-gold" />
              {t('tournament.bracket')}
            </span>
            <span className="text-[13px] font-extrabold tabular-nums bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(90deg, #C0392B, #D4A03C)' }}>
              {pct}%
            </span>
          </div>
          <div className="h-2.5 bg-apple-raised/60 rounded-full overflow-hidden">
            <motion.div className="h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              style={{ background: 'linear-gradient(90deg, #C0392B 0%, #D4A03C 50%, #E8C547 100%)' }} />
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[20px] font-extrabold tracking-[-0.03em] text-apple-text tabular-nums">{completed}</p>
          <p className="text-[9px] font-medium text-apple-tertiary uppercase tracking-wider">/ {total}</p>
        </div>
      </motion.div>

      {/* ══════════════════════════════════════════════════════════
          FILTERS — Tang card with search and selects
          ══════════════════════════════════════════════════════════ */}
      <div className="tang-card p-4 space-y-3 tang-bat-bg">
        <BatCluster className="bottom-3 right-6" />
        {/* Search bar */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-apple-tertiary" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('schedule.searchPlaceholder')}
            className="w-full bg-apple-raised/40 border border-black/[0.06] rounded-xl pl-9 pr-8 py-2.5 text-[13px] text-apple-text
              placeholder:text-apple-tertiary focus:outline-none focus:ring-2 focus:ring-cn-red/20 font-medium"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-apple-tertiary hover:text-apple-text transition-colors">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.10em] text-apple-tertiary mr-1">
            <Filter size={10} /> {t('predictions.all')}
          </span>

          {/* Stage pills — Tang refined style */}
          <div className="flex gap-1 flex-wrap">
            {uniqueStages.map(s => {
              const isActive = filterStage === s;
              return (
                <button key={s}
                  onClick={() => { setFilterStage(s); setFilterGroup('ALL'); }}
                  className={`px-2.5 py-1 rounded-seal text-[11px] font-semibold transition-all duration-200 border ${
                    isActive
                      ? 'text-white shadow-sm border-transparent'
                      : 'text-apple-secondary hover:text-apple-text bg-apple-raised/30 hover:bg-apple-raised/50 border-cn-gold/10 hover:border-cn-gold/20'
                  }`}
                  style={isActive ? { background: 'linear-gradient(135deg, #C0392B, #8B2500)', borderColor: 'rgba(192,57,43,0.3)' } : {}}>
                  {s === 'ALL' ? t('schedule.allStages') : t(`stage.${s}`) || s}
                </button>
              );
            })}
          </div>
        </div>

        {/* Additional selects row */}
        <div className="flex flex-wrap gap-2 items-center">
          {(filterStage === 'GROUP' || filterStage === 'ALL') && (
            <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)} className={selectClass}>
              {uniqueGroups.map(g => <option key={g} value={g}>{g === 'ALL' ? t('common.allGroups') : `${t('dashboard.group')} ${g}`}</option>)}
            </select>
          )}
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={selectClass}>
            {statuses.map(s => <option key={s} value={s}>{s === 'ALL' ? t('common.all') : s === 'SCHEDULED' ? t('common.upcoming') : s === 'LIVE' ? t('status.LIVE') : t('common.completed')}</option>)}
          </select>
          <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)} className={selectClass}>
            <option value="ALL">{t('common.all')} {t('nav.matches')}</option>
            {teams.sort((a,b) => a.name.localeCompare(b.name)).map(tm => (
              <option key={tm.id} value={tm.id}>{tm.flag} {teamName(tm.id, tm.name)}</option>
            ))}
          </select>
          {hasFilters && (
            <button
              onClick={() => { setSearch(''); setFilterStage('ALL'); setFilterGroup('ALL'); setFilterStatus('ALL'); setFilterTeam('ALL'); }}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-cn-red/[0.06] hover:bg-cn-red/[0.12] text-cn-red rounded-seal border border-cn-red/15 text-[11px] font-semibold transition-colors"
            >
              <X size={11} /> {t('schedule.clear')}
            </button>
          )}
        </div>

        {/* Result count */}
        <div className="flex items-center justify-between pt-1">
          <p className="text-[11px] text-apple-tertiary font-medium flex items-center gap-1.5">
            <Clock size={10} />
            {t('schedule.showing')} <span className="font-bold text-apple-text">{filtered.length}</span> {t('schedule.of')} {total} {t('schedule.matchesUnit')}
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          MATCH LIST
          ══════════════════════════════════════════════════════════ */}
      {filtered.length === 0 ? (
        <div className="tang-card p-10 text-center">
          <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(192,57,43,0.08), rgba(212,160,60,0.06))' }}>
            <Search size={24} className="text-apple-tertiary" />
          </div>
          <p className="text-apple-secondary font-medium text-[14px]">{t('predictions.noPredictions')}</p>
        </div>
      ) : viewMode === 'date' ? (
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-4">
          {byDate.map(([date, dayMatches]) => (
            <motion.div key={date} variants={fadeUp} className="tang-card overflow-hidden">
              {/* Date header with Deco warm accent */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-cn-gold/10"
                style={{ background: 'linear-gradient(90deg, rgba(192,57,43,0.04), rgba(212,160,60,0.03), transparent)' }}>
                <h3 className="font-bold text-[14px] tracking-[-0.01em] text-apple-text flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'linear-gradient(135deg, #C0392B, #D4A03C)' }} />
                  {date !== 'TBD' ? formatDate(date) : 'TBD'}
                </h3>
                <span className="text-[10px] font-semibold text-apple-tertiary px-2 py-0.5 rounded-full bg-apple-raised/50">
                  {dayMatches.length} {t('schedule.matchesUnit')}
                </span>
              </div>
              <div className="px-2 py-1 divide-y divide-black/[0.03]">
                {dayMatches.map(m => <MatchRow key={m.id} match={m} />)}
              </div>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-4">
          {byStage.map(([stageKey, stageMatches]) => (
              <motion.div key={stageKey} variants={fadeUp} className="tang-card overflow-hidden">
                {/* Stage header with Deco warm accent */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-cn-gold/10"
                  style={{ background: 'linear-gradient(90deg, rgba(192,57,43,0.04), rgba(212,160,60,0.03), transparent)' }}>
                  <h3 className="font-bold text-[14px] tracking-[-0.01em] text-apple-text flex items-center gap-2">
                    <span className="w-3 h-3 rounded-md" style={{ background: 'linear-gradient(135deg, #C0392B, #8B2500)' }} />
                    {t(`stage.${stageKey}`) || stageKey}
                  </h3>
                  <span className="text-[10px] font-semibold text-apple-tertiary px-2 py-0.5 rounded-full bg-apple-raised/50">
                    {stageMatches.filter(m => m.status === 'COMPLETED').length}/{stageMatches.length} {t('schedule.playedUnit')}
                  </span>
                </div>
                <div className="px-2 py-1">
                  {stageKey === 'GROUP' ? (
                    (() => {
                      const byGroup = {};
                      stageMatches.forEach(m => {
                        const g = m.group_code || '?';
                        if (!byGroup[g]) byGroup[g] = [];
                        byGroup[g].push(m);
                      });
                      return Object.entries(byGroup).sort(([a], [b]) => a.localeCompare(b)).map(([g, gms], gi) => (
                        <div key={g} className={gi > 0 ? 'border-t border-black/[0.03] mt-1 pt-1' : ''}>
                          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-cn-red mb-0.5 pl-3 flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-cn-red" />
                            {t('dashboard.group')} {g}
                          </p>
                          <div className="divide-y divide-black/[0.03]">
                            {gms.map(m => <MatchRow key={m.id} match={m} />)}
                          </div>
                        </div>
                      ));
                    })()
                  ) : (
                    <div className="divide-y divide-black/[0.03]">
                      {stageMatches.map(m => <MatchRow key={m.id} match={m} />)}
                    </div>
                  )}
                </div>
              </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[18px] sm:text-[22px] font-extrabold tabular-nums" style={{ color }}>{value}</span>
      <span className="text-[10px] font-medium text-white/40 uppercase tracking-wider">{label}</span>
    </div>
  );
}
