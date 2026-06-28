import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronRight, Sparkles, Target, Trophy, TrendingUp, Check, X, Star } from 'lucide-react';
import SEO from '../components/SEO';
import FlagImage from '../components/FlagImage';
import { getMatches, getAccuracy } from '../api/client';
import { useT, useFormatDate, useTeamName, useLang } from '../contexts/LanguageContext';
import { DragonWatermark, PhoenixWatermark, QilinMark, BatCluster } from '../components/TangOrnaments';

const GROUPS = 'ABCDEFGHIJKL'.split('');

/* ─── Stat Card ────────────────────────────────────────────────── */
function StatCard({ icon: Icon, value, label, accent, delay, sub }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      className="tang-card p-4 flex flex-col items-center text-center relative overflow-hidden"
    >
      <QilinMark className="top-2 right-2" size={28} opacity={0.12} />
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center mb-2"
        style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}11)`, border: `1px solid ${accent}30` }}
      >
        <Icon size={18} style={{ color: accent }} />
      </div>
      <span className="text-2xl font-black font-serif tabular-nums" style={{ color: accent }}>
        {value}
      </span>
      <span className="text-[11px] text-apple-tertiary font-medium mt-1 uppercase tracking-wide">{label}</span>
      {sub && <span className="text-[10px] text-apple-tertiary/70 mt-0.5 tabular-nums">{sub}</span>}
    </motion.div>
  );
}

/* ─── Scoring Methodology ──────────────────────────────────────── */
function ScoringCard() {
  const t = useT();
  const [open, setOpen] = useState(false);

  const rules = [
    { pts: 3, label: t('predictions.scoringExact'), sub: t('predictions.scoringRank1'), color: '#4A7C59' },
    { pts: 2, label: t('predictions.scoringExact'), sub: t('predictions.scoringRank23'), color: '#D4A03C' },
    { pts: 1, label: t('predictions.scoringOutcome'), sub: t('predictions.scoringOutcomeSub'), color: '#3B82F6' },
    { pts: 0, label: t('predictions.scoringNoMatch'), sub: t('predictions.scoringNoMatchSub'), color: '#C0392B' },
  ];

  return (
    <div className="tang-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2.5">
          <Star size={15} className="text-cn-gold" />
          <span className="text-[13px] font-bold font-serif text-apple-text uppercase tracking-wider">
            {t('predictions.scoringTitle')}
          </span>
        </div>
        {open ? <ChevronDown size={16} className="text-apple-tertiary" /> : <ChevronRight size={16} className="text-apple-tertiary" />}
      </button>

      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="px-5 pb-5"
        >
          <div className="grid grid-cols-2 gap-2 mb-4">
            {rules.map(({ pts, label, sub, color }) => (
              <div key={pts} className="flex items-start gap-2.5 p-3 rounded-xl bg-apple-raised/50">
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black text-white shrink-0"
                  style={{ background: color }}
                >
                  {pts}
                </span>
                <div>
                  <div className="text-[12px] font-semibold text-apple-text">{label}</div>
                  <div className="text-[10px] text-apple-tertiary">{sub}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-apple-tertiary leading-relaxed border-t border-cn-gold/10 pt-3">
            {t('predictions.scoringExplanation')}
          </p>
        </motion.div>
      )}
    </div>
  );
}

/* ─── Prediction Match Card ────────────────────────────────────── */
function PredictionCard({ match }) {
  const t = useT();
  const teamName = useTeamName();
  const isCompleted = match.status === 'COMPLETED';
  const isLive = match.status === 'LIVE';
  const hasPrediction = match.most_likely_score != null;

  // Parse prediction outcome — derive from most_likely_score for consistency with detail page
  const predOutcome = hasPrediction
    ? (() => {
        const score = match.most_likely_score;
        if (!score) return match.prob_home > match.prob_away ? 'home' : match.prob_away > match.prob_home ? 'away' : 'draw';
        const [h, a] = score.split('-').map(Number);
        if (isNaN(h) || isNaN(a)) return match.prob_home > match.prob_away ? 'home' : match.prob_away > match.prob_home ? 'away' : 'draw';
        return h > a ? 'home' : h < a ? 'away' : 'draw';
      })()
    : null;

  // Parse actual outcome
  const actualOutcome = isCompleted
    ? match.home_score > match.away_score
      ? 'home'
      : match.away_score > match.home_score
        ? 'away'
        : 'draw'
    : null;

  const isCorrect = isCompleted && predOutcome === actualOutcome;

  // Parse top scores
  const topScores = useMemo(() => {
    if (!match.top_scores) return [];
    try {
      const parsed = typeof match.top_scores === 'string' ? JSON.parse(match.top_scores) : match.top_scores;
      return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
    } catch { return []; }
  }, [match.top_scores]);

  const formatProb = (p) => p != null ? `${Math.round(p * 100)}%` : '—';

  return (
    <Link
      to={`/matches/${match.id}`}
      className="block tang-card p-4 hover:shadow-lg transition-all duration-200 group relative overflow-hidden"
    >
      <QilinMark className="top-2 right-2" size={24} opacity={0.08} />

      {/* Group badge */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-cn-gold bg-cn-gold/8 px-2 py-0.5 rounded-seal">
          {match.group_code
            ? (t('common.worldCup2026').includes('2026') ? `Group ${match.group_code}` : `${match.group_code}组`)
            : match.stage || ''}
        </span>
        {isLive && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-cn-red">
            <span className="w-1.5 h-1.5 rounded-full bg-cn-red animate-pulse" />
            {t('status.LIVE')}
          </span>
        )}
        {isCompleted && (
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${isCorrect ? 'text-emerald-600' : 'text-cn-red'}`}>
            {isCorrect ? <Check size={12} /> : <X size={12} />}
            {isCorrect ? t('common.correct') : t('common.incorrect')}
          </span>
        )}
      </div>

      {/* Teams row */}
      <div className="flex items-center justify-between gap-3 mb-3">
        {/* Home */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FlagImage teamId={match.home_team} size="sm" className="!w-8 !h-6" />
          <span className="text-[13px] font-semibold text-apple-text truncate">
            {teamName(match.home_team, match.home_name)}
          </span>
        </div>

        {/* Score or vs */}
        <div className="flex-shrink-0 text-center">
          {isCompleted ? (
            <span className="text-[15px] font-black text-apple-text tabular-nums">
              {match.home_score} – {match.away_score}
            </span>
          ) : isLive ? (
            <span className="text-[13px] font-bold text-cn-red">vs</span>
          ) : (
            <span className="text-[12px] text-apple-tertiary font-medium">vs</span>
          )}
        </div>

        {/* Away */}
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <span className="text-[13px] font-semibold text-apple-text truncate text-right">
            {teamName(match.away_team, match.away_name)}
          </span>
          <FlagImage teamId={match.away_team} size="sm" className="!w-8 !h-6" />
        </div>
      </div>

      {/* Prediction section */}
      {hasPrediction && (
        <div className="border-t border-cn-gold/10 pt-3">
          <div className="flex items-center justify-between">
            {/* Predicted outcome */}
            <div className="flex items-center gap-2">
              <Sparkles size={12} className="text-cn-gold" />
              <span className="text-[11px] text-apple-tertiary uppercase tracking-wide font-medium">
                {t('predictions.predict')}
              </span>
              <span className="text-[12px] font-bold text-apple-text">
                {predOutcome === 'home'
                  ? `${teamName(match.home_team, match.home_name)} ${t('common.win')}`
                  : predOutcome === 'away'
                    ? `${teamName(match.away_team, match.away_name)} ${t('common.win')}`
                    : t('common.draw')}
              </span>
            </div>

            {/* Predicted score */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-apple-tertiary uppercase tracking-wide font-medium">
                {match.most_likely_score}
              </span>
            </div>
          </div>

          {/* Top 3 scorelines */}
          {topScores.length > 0 && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {topScores.map((s, i) => (
                <span
                  key={i}
                  className="text-[10px] font-medium px-2 py-0.5 rounded-seal"
                  style={{
                    background: i === 0 ? 'rgba(212,160,60,0.12)' : 'rgba(212,160,60,0.06)',
                    color: i === 0 ? '#D4A03C' : 'var(--apple-secondary)',
                    border: `1px solid ${i === 0 ? 'rgba(212,160,60,0.2)' : 'rgba(212,160,60,0.1)'}`,
                  }}
                >
                  {s.score} · {formatProb(s.prob)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actual result */}
      {isCompleted && (
        <div className="border-t border-cn-gold/10 pt-2.5 mt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target size={12} className={isCorrect ? 'text-emerald-600' : 'text-cn-red'} />
              <span className="text-[11px] text-apple-tertiary uppercase tracking-wide font-medium">
                {t('predictions.actual')}
              </span>
              <span className={`text-[12px] font-bold ${isCorrect ? 'text-emerald-600' : 'text-cn-red'}`}>
                {actualOutcome === 'home'
                  ? `${teamName(match.home_team, match.home_name)} ${t('common.win')}`
                  : actualOutcome === 'away'
                    ? `${teamName(match.away_team, match.away_name)} ${t('common.win')}`
                    : t('common.draw')}
              </span>
            </div>
            {match.graded_points != null && (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-seal"
                style={{
                  background: match.graded_points >= 2 ? 'rgba(45,143,111,0.12)' : match.graded_points >= 1 ? 'rgba(59,130,246,0.12)' : 'rgba(192,57,43,0.08)',
                  color: match.graded_points >= 2 ? '#4A7C59' : match.graded_points >= 1 ? '#3B82F6' : '#C0392B',
                }}
              >
                +{match.graded_points} {t('predictions.ptsHeader')}
              </span>
            )}
          </div>
        </div>
      )}
    </Link>
  );
}

/* ─── Main Page ────────────────────────────────────────────────── */
export default function Predictions() {
  const t = useT();
  const { lang } = useLang();
  const formatDate = useFormatDate();

  const [matches, setMatches] = useState([]);
  const [accuracy, setAccuracy] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');

  useEffect(() => {
    Promise.all([getMatches({}), getAccuracy()])
      .then(([m, a]) => {
        setMatches(m);
        setAccuracy(a);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Filter matches
  const filtered = useMemo(() => {
    let list = matches;
    if (statusFilter !== 'all') {
      list = list.filter(m => m.status === statusFilter.toUpperCase());
    }
    if (groupFilter !== 'all') {
      if (groupFilter === 'knockout') {
        list = list.filter(m => !m.group_code);
      } else {
        list = list.filter(m => m.group_code === groupFilter);
      }
    }
    return list;
  }, [matches, statusFilter, groupFilter]);

  // Group by date
  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach(m => {
      const date = m.scheduled_date || 'TBD';
      if (!groups[date]) groups[date] = [];
      groups[date].push(m);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // Stats
  const stats = accuracy?.stats;
  const evaluated = stats?.total || 0;
  const predictionsMade = matches.filter(m => m.most_likely_score != null).length;
  const correct = stats?.correct || 0;
  const points = stats?.total_points || 0;
  const maxPoints = stats?.max_points || 0;
  const pointsAccuracy = stats?.accuracy_pct || 0;
  const outcomeAccuracy = stats?.outcome_accuracy_pct || 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-cn-gold border-t-transparent rounded-full animate-spin" />
          <span className="text-apple-tertiary text-sm">{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <SEO title={t('predictions.title')} description={t('predictions.subtitle')} />

      {/* ── Hero Banner ────────────────────────────────────────── */}
      <div
        className="rounded-[26px] p-[2px] mb-6 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #C0392B 0%, #8B2500 40%, #1C2833 100%)',
        }}
      >
        {/* Inner gold frame */}
        <div className="absolute inset-[8px] rounded-[22px] pointer-events-none"
          style={{ border: '1px solid rgba(212,160,60,0.10)' }} />
        <DragonWatermark opacity={0.18} />
        <PhoenixWatermark opacity={0.14} />

        <div className="relative px-6 py-6 sm:px-8 sm:py-7">
          <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 rounded-seal"
            style={{ background: 'rgba(212,160,60,0.10)', border: '1px solid rgba(212,160,60,0.20)' }}>
            <Target size={11} className="text-yellow-300" />
            <span className="text-[10px] font-bold tracking-[0.14em] text-cn-gold uppercase font-serif">
              {t('common.worldCup2026')}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white font-serif tracking-tight mb-1">
            {t('predictions.title')}
          </h1>
          <p className="text-[13px] text-white/50 max-w-md">
            {t('predictions.subtitle')}
          </p>
        </div>
      </div>

      {/* ── Stats Grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard
          icon={Target}
          value={predictionsMade}
          label={t('predictions.made')}
          accent="#D4A03C"
          delay={0.05}
        />
        <StatCard
          icon={Trophy}
          value={`${points}/${maxPoints}`}
          label={t('dashboard.points')}
          accent="#4A7C59"
          delay={0.1}
        />
        <StatCard
          icon={TrendingUp}
          value={`${pointsAccuracy}%`}
          label={t('dashboard.accuracy')}
          accent="#D4A03C"
          delay={0.15}
        />
        <StatCard
          icon={Sparkles}
          value={`${outcomeAccuracy}%`}
          label={t('dashboard.outcome')}
          accent="#D4A03C"
          delay={0.2}
          sub={`${correct}/${evaluated}`}
        />
      </div>

      {/* ── Scoring Methodology ────────────────────────────────── */}
      <div className="mb-5">
        <ScoringCard />
      </div>

      {/* ── Filter Bar ─────────────────────────────────────────── */}
      <div className="tang-card p-4 mb-5 relative overflow-hidden">
        <BatCluster className="bottom-2 right-3" opacity={0.10} />

        {/* Status filter */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[10px] font-bold text-apple-tertiary uppercase tracking-wider mr-1">
            {t('predictions.predict')}
          </span>
          {['all', 'SCHEDULED', 'LIVE', 'COMPLETED'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s === 'all' ? 'all' : s)}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-seal transition-all duration-200
                ${statusFilter === (s === 'all' ? 'all' : s)
                  ? 'bg-cn-red text-white'
                  : 'bg-apple-raised/60 text-apple-secondary hover:bg-cn-gold/10'
                }`}
            >
              {s === 'all' ? t('predictions.all') : s === 'SCHEDULED' ? t('predictions.upcoming') : s === 'LIVE' ? t('predictions.live') : t('predictions.completed')}
            </button>
          ))}
        </div>

        {/* Group filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold text-apple-tertiary uppercase tracking-wider mr-1">
            {t('dashboard.group')}
          </span>
          <button
            onClick={() => setGroupFilter('all')}
            className={`px-2.5 py-1 text-[10px] font-semibold rounded-seal transition-all duration-200
              ${groupFilter === 'all'
                ? 'bg-cn-gold/20 text-cn-gold border border-cn-gold/30'
                : 'bg-apple-raised/40 text-apple-tertiary hover:bg-cn-gold/8'
              }`}
          >
            {t('common.allGroups')}
          </button>
          <button
            onClick={() => setGroupFilter('knockout')}
            className={`px-2.5 py-1 text-[10px] font-semibold rounded-seal transition-all duration-200
              ${groupFilter === 'knockout'
                ? 'bg-cn-gold/20 text-cn-gold border border-cn-gold/30'
                : 'bg-apple-raised/40 text-apple-tertiary hover:bg-cn-gold/8'
              }`}
          >
            KO
          </button>
          {GROUPS.map(g => (
            <button
              key={g}
              onClick={() => setGroupFilter(g)}
              className={`w-7 h-7 text-[10px] font-bold rounded-seal transition-all duration-200
                ${groupFilter === g
                  ? 'bg-cn-gold/20 text-cn-gold border border-cn-gold/30'
                  : 'bg-apple-raised/40 text-apple-tertiary hover:bg-cn-gold/8'
                }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* ── Predictions List ───────────────────────────────────── */}
      {grouped.length === 0 ? (
        <div className="text-center py-12 text-apple-tertiary">
          <Target size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t('predictions.noPredictions')}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([date, dateMatches], di) => (
            <motion.div
              key={date}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: di * 0.04 }}
            >
              {/* Date header */}
              <div className="flex items-center gap-3 mb-3 px-1">
                <span className="text-[12px] font-bold text-apple-text font-serif">
                  {formatDate(date)}
                </span>
                <span className="text-[10px] text-apple-tertiary font-medium">
                  {dateMatches.length} {dateMatches.length === 1 ? t('predictions.matchUnit') : t('predictions.matchesUnit')}
                </span>
                <div className="flex-1 h-px bg-cn-gold/10" />
              </div>

              {/* Match cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {dateMatches.map(match => (
                  <PredictionCard key={match.id} match={match} />
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
