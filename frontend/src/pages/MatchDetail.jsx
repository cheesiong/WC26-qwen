import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import SEO from '../components/SEO';
import { getMatch, getPrediction, getLineup, getH2H, getPredictionHistory, getMatchSuspensions, getAgentSession } from '../api/client';
import FlagImage from '../components/FlagImage';
import PredictionBar from '../components/PredictionBar';
import { RefreshCw, CheckCircle, AlertCircle, Users, ChevronDown, ChevronUp, History, Activity, Target, TrendingUp, Swords, BriefcaseMedical, Trophy, MapPin, Sparkles } from 'lucide-react';
import { celebrate } from '../utils/celebrate';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { toSGTDateKey } from '../utils/time';
import { useT, useFormatDate, useToSGT, useTeamName } from '../contexts/LanguageContext';
import { DragonWatermark, PhoenixWatermark, QilinMark, BatCluster } from '../components/TangOrnaments';

const FACTOR_ICONS = {
  'ELO Rating':           Activity,
  'Poisson Goal Model':   Target,
  'Recent Form':          TrendingUp,
  'Head-to-Head':         Swords,
  'Injury & Availability': BriefcaseMedical,
  'World Cup Experience': Trophy,
  'Confirmed Lineup':     Users,
};

const CONFIDENCE_COLORS = {
  VERY_HIGH: 'text-cn-jade',
  HIGH: 'text-cn-red',
  MEDIUM: 'text-cn-gold',
  LOW: 'text-apple-tertiary',
};


function MiniProbBar({ probHome, probDraw, probAway }) {
  const h = Math.round((probHome || 0) * 100);
  const d = Math.round((probDraw  || 0) * 100);
  const a = Math.round((probAway  || 0) * 100);
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden w-full">
      <div className="bg-cn-red"   style={{ width: `${h}%` }} />
      <div style={{ width: `${d}%`, background: 'rgba(192,57,43,0.45)' }} />
      <div className="bg-cn-gold" style={{ width: `${a}%` }} />
    </div>
  );
}

function fmtTime(iso) {
  if (!iso) return '—';
  // SQLite stores datetime('now') as "YYYY-MM-DD HH:MM:SS" (UTC, no Z).
  // Appending Z forces JS to parse it as UTC instead of local time.
  const utcStr = iso.includes('Z') || iso.includes('+') ? iso : iso.replace(' ', 'T') + 'Z';
  const d = new Date(utcStr);
  return d.toLocaleString('en-US', {
    timeZone: 'Asia/Singapore',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function fmtPct(v) { return `${Math.round((v || 0) * 100)}%`; }

const CONF_COLOR = {
  VERY_HIGH: 'text-green-700 bg-[rgba(40,205,65,0.12)]',
  HIGH:      'text-blue-700 bg-apple-blue/[0.10]',
  MEDIUM:    'text-orange-700 bg-apple-orange/[0.10]',
  LOW:       'text-apple-secondary bg-apple-raised',
};

function PredictionHistoryPanel({ history, homeName, awayName, homeFlag, awayFlag, isCompleted }) {
  const t = useT();
  const [expanded, setExpanded] = useState(true);
  const latest = history[history.length - 1];
  const hasMultiple = history.length > 1;

  // Build chart data — each snapshot becomes a data point
  const chartData = history.map((h, i) => ({
    label: i === history.length - 1 ? t('matchDetail.latest') : fmtTime(h.generated_at),
    home:  Math.round((h.prob_home || 0) * 100),
    draw:  Math.round((h.prob_draw || 0) * 100),
    away:  Math.round((h.prob_away || 0) * 100),
    idx: i + 1,
  }));

  // Compute max swing across snapshots for any outcome
  let maxSwing = 0;
  if (hasMultiple) {
    const first = history[0];
    ['prob_home', 'prob_draw', 'prob_away'].forEach(k => {
      maxSwing = Math.max(maxSwing, Math.abs((latest[k] || 0) - (first[k] || 0)));
    });
  }

  return (
    <div className="tang-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <button className="flex items-center gap-2 flex-1" onClick={() => setExpanded(v => !v)}>
          <History size={16} className="text-cn-red" />
          <h3 className="font-semibold text-apple-text">{t('matchDetail.predHistory')}</h3>
          <span className="text-xs text-apple-secondary ml-1">
            {history.length} {t('matchDetail.snapshots')}
            {hasMultiple && maxSwing > 0.04 && (
              <span className="ml-2 text-apple-orange font-medium">
                ↕ {Math.round(maxSwing * 100)}pp {t('matchDetail.ppSwing')}
              </span>
            )}
          </span>
          {expanded ? <ChevronUp size={14} className="text-apple-secondary ml-auto" /> : <ChevronDown size={14} className="text-apple-secondary ml-auto" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          {/* LATEST PREDICTION — prominent callout */}
          {latest && (
            <div className="rounded-xl border-2 border-cn-red/30 bg-cn-red/[0.04] p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold bg-cn-red text-white px-2 py-0.5 rounded">
                  {isCompleted ? t('matchDetail.finalPred') : t('matchDetail.latestPred')}
                </span>
                <span className="text-xs text-apple-secondary">{fmtTime(latest.generated_at)}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded ml-auto ${CONF_COLOR[latest.confidence] || 'text-apple-secondary bg-apple-raised'}`}>
                  {t('confidence.' + latest.confidence) || latest.confidence}
                </span>
              </div>

              {/* Big three-number display */}
              <div className="flex items-end gap-4 mb-3">
                <div className="flex-1 text-center">
                  <div className="text-xs text-apple-secondary mb-1">{homeFlag} {homeName}</div>
                  <div className="text-3xl font-bold text-cn-red">{fmtPct(latest.prob_home)}</div>
                </div>
                <div className="flex-1 text-center">
                  <div className="text-xs text-apple-secondary mb-1">{t('matchDetail.draw')}</div>
                  <div className="text-3xl font-bold text-apple-text">{fmtPct(latest.prob_draw)}</div>
                </div>
                <div className="flex-1 text-center">
                  <div className="text-xs text-apple-secondary mb-1">{awayFlag} {awayName}</div>
                  <div className="text-3xl font-bold text-cn-gold">{fmtPct(latest.prob_away)}</div>
                </div>
              </div>

              {/* Full-width colour bar */}
              <div className="flex h-3 rounded-full overflow-hidden gap-px mb-2">
                <div className="bg-cn-red transition-all"   style={{ width: `${Math.round(latest.prob_home * 100)}%` }} />
                <div className="transition-all" style={{ width: `${Math.round(latest.prob_draw * 100)}%`, background: 'rgba(192,57,43,0.45)' }} />
                <div className="bg-cn-gold transition-all" style={{ width: `${Math.round(latest.prob_away * 100)}%` }} />
              </div>

              <div className="flex items-center justify-between text-xs text-apple-tertiary mt-1">
                <span>{t('matchDetail.scoreForecast')}: <span className="text-apple-secondary font-medium">{latest.most_likely_score || '—'}</span></span>
                {hasMultiple && (
                  <span className="text-apple-tertiary">
                    {t('matchDetail.deltaFromFirst')}: {
                      (() => {
                        const first = history[0];
                        const dh = Math.round((latest.prob_home - first.prob_home) * 100);
                        const da = Math.round((latest.prob_away - first.prob_away) * 100);
                        if (Math.abs(dh) < 2 && Math.abs(da) < 2) return t('matchDetail.stable');
                        const larger = Math.abs(dh) >= Math.abs(da) ? dh : -da;
                        return `${larger > 0 ? '+' : ''}${larger}pp ${larger > 0 ? homeName : awayName}`;
                      })()
                    }
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Probability drift chart — only when >1 snapshot */}
          {hasMultiple && (
            <div>
              <div className="text-xs text-apple-secondary mb-2">{t('matchDetail.probDriftLabel')} {history.length} {t('matchDetail.snapshotsPlural')}</div>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradHome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#C0392B" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#C0392B" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradAway" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#D4A03C" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#D4A03C" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E8ED" />
                  <XAxis dataKey="idx" tick={{ fontSize: 10, fill: '#515154' }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#515154' }} tickLine={false} unit="%" />
                  <Tooltip
                    contentStyle={{ background: '#1D1D1F', border: '1px solid #3A3A3C', borderRadius: 8, fontSize: 12, color: '#F5F5F7' }}
                    formatter={(v, name) => [`${v}%`, name === 'home' ? homeName : name === 'away' ? awayName : t('matchDetail.draw')]}
                    labelFormatter={idx => {
                      const snap = history[idx - 1];
                      return snap ? fmtTime(snap.generated_at) : `${t('matchDetail.snapshotPrefix')} ${idx}`;
                    }}
                  />
                  <ReferenceLine y={50} stroke="#C7C7CC" strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="home" stroke="#C0392B" strokeWidth={2} fill="url(#gradHome)" dot={{ r: 3, fill: '#C0392B' }} />
                  <Area type="monotone" dataKey="draw" stroke="#6b7280" strokeWidth={1.5} fill="none" dot={{ r: 2, fill: '#6b7280' }} strokeDasharray="4 3" />
                  <Area type="monotone" dataKey="away" stroke="#D4A03C" strokeWidth={2} fill="url(#gradAway)" dot={{ r: 3, fill: '#D4A03C' }} />
                </AreaChart>
              </ResponsiveContainer>

              {/* Legend */}
              <div className="flex justify-center gap-4 text-xs text-apple-secondary mt-1">
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-cn-red inline-block" />{homeName}</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-gray-500 inline-block border-dashed" />{t('matchDetail.draw')}</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-cn-gold inline-block" />{awayName}</span>
              </div>
            </div>
          )}

          {/* Snapshot log table */}
          {hasMultiple && (
            <div>
              <div className="text-xs text-apple-secondary mb-2">{t('matchDetail.allSnapshots')}</div>
              <div className="space-y-1.5">
                {[...history].reverse().map((snap, i) => {
                  const isLatestSnap = i === 0;
                  return (
                    <div key={snap.id} className={`rounded-lg px-3 py-2 ${isLatestSnap ? 'bg-cn-red/[0.06] border border-cn-red/[0.20]' : 'bg-apple-raised/30'}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        {isLatestSnap && (
                          <span className="text-xs bg-cn-red/[0.10] text-cn-red px-1.5 py-0.5 rounded font-medium">{t('matchDetail.latest')}</span>
                        )}
                        <span className="text-xs text-apple-secondary">{fmtTime(snap.generated_at)}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ml-auto ${CONF_COLOR[snap.confidence] || 'text-apple-secondary bg-apple-raised'}`}>
                          {t('confidence.' + snap.confidence) || snap.confidence}
                        </span>
                        <span className="text-xs text-apple-tertiary">{snap.most_likely_score}</span>
                      </div>
                      <MiniProbBar probHome={snap.prob_home} probDraw={snap.prob_draw} probAway={snap.prob_away} />
                      <div className="flex justify-between text-apple-secondary mt-1" style={{ fontSize: '10px' }}>
                        <span className="text-cn-red">{fmtPct(snap.prob_home)}</span>
                        <span className="text-apple-secondary">{fmtPct(snap.prob_draw)}</span>
                        <span className="text-cn-gold">{fmtPct(snap.prob_away)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Formation grid positions (row from back → front)
const FORMATION_ROWS = {
  '4-3-3':  [['GK'], ['LB','CB','CB','RB'], ['CM','CM','CM'], ['LW','ST','RW']],
  '4-4-2':  [['GK'], ['LB','CB','CB','RB'], ['LM','CM','CM','RM'], ['ST','ST']],
  '4-2-3-1':[['GK'], ['LB','CB','CB','RB'], ['DM','DM'], ['LW','AM','RW'], ['ST']],
  '3-5-2':  [['GK'], ['CB','CB','CB'], ['LWB','CM','CM','CM','RWB'], ['ST','ST']],
  '3-4-3':  [['GK'], ['CB','CB','CB'], ['LM','CM','CM','RM'], ['LW','ST','RW']],
  '5-3-2':  [['GK'], ['LB','CB','CB','CB','RB'], ['CM','CM','CM'], ['ST','ST']],
  '4-5-1':  [['GK'], ['LB','CB','CB','RB'], ['LM','CM','CM','CM','RM'], ['ST']],
};

function FormationDisplay({ starters, formation, teamName, flag, keyAbsenceNames = [] }) {
  const rows = FORMATION_ROWS[formation] || null;
  const absenceSet = new Set(keyAbsenceNames);

  return (
    <div className="relative rounded-xl p-4 border border-cn-jade/30" style={{ background: 'linear-gradient(180deg, rgba(45,143,111,0.30) 0%, rgba(45,143,111,0.50) 100%)' }}>
      <div className="text-center mb-3">
        <span className="text-lg">{flag}</span>
        <span className="text-sm font-semibold text-apple-text ml-2">{teamName}</span>
        {formation && <span className="text-xs text-cn-jade ml-2">{formation}</span>}
      </div>

      {rows && starters?.length === 11 ? (
        <div className="space-y-3">
          {rows.map((row, rowIdx) => (
            <div key={rowIdx} className="flex justify-center gap-2">
              {row.map((pos, posIdx) => {
                const playerIdx = rows.slice(0, rowIdx).reduce((sum, r) => sum + r.length, 0) + posIdx;
                const player = starters[playerIdx];
                const isAbsent = player && absenceSet.has(player.name);
                return (
                  <div key={posIdx} className="flex flex-col items-center gap-1 w-14">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                      ${isAbsent ? 'bg-red-100 border-2 border-red-400' : 'bg-white/10 border border-white/20'}`}>
                      {player?.shirtNumber || pos.charAt(0)}
                    </div>
                    <div className="text-center leading-tight">
                      <div className={`text-xs font-medium truncate w-14 text-center
                        ${isAbsent ? 'text-red-400' : 'text-apple-text'}`}>
                        {player?.name?.split(' ').pop() || pos}
                      </div>
                      <div className="text-apple-tertiary" style={{ fontSize: '10px' }}>{pos}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {(starters || []).map((p, i) => {
            const isAbsent = absenceSet.has(p.name);
            return (
              <div key={i} className={`flex items-center gap-2 text-xs rounded px-2 py-1
                ${isAbsent ? 'bg-red-50 text-red-700 border border-red-200' : 'text-apple-text'}`}>
                <span className="w-5 text-center text-apple-tertiary font-mono">{p.shirtNumber || i + 1}</span>
                <span className="font-medium truncate">{p.name}</span>
                <span className="text-apple-tertiary ml-auto">{p.position}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// H2H matches use 'a' = home team (first arg), 'b' = away team (second arg)
function H2HTimeline({ meetings, homeId, awayId, homeName, awayName }) {
  const t = useT();
  if (!meetings?.length) return (
    <div className="text-sm text-apple-secondary text-center py-4">{t('matchDetail.noH2hMeetings')}</div>
  );

  return (
    <div className="space-y-2">
      {meetings.map((m, i) => {
        // Backend: winner = team ID that won, aGoals/bGoals from home(a)/away(b) perspective
        const homeWon = m.winner === homeId;
        const awayWon = m.winner === awayId;
        return (
          <div key={i} className="flex items-center gap-2 text-sm">
            <div className="text-xs text-apple-tertiary w-16 flex-shrink-0">{m.date?.slice(0, 7)}</div>
            <div className={`flex-1 min-w-0 flex items-center gap-1 rounded-lg px-2 py-1.5
              ${homeWon ? 'bg-cn-red/[0.07]' : awayWon ? 'bg-cn-gold/[0.07]' : 'bg-apple-raised/40'}`}>
              <span className={`flex-1 min-w-0 text-right text-xs truncate ${homeWon ? 'text-cn-red font-semibold' : 'text-apple-secondary'}`}>
                {homeName}
              </span>
              <span className="font-bold text-apple-text text-sm mx-1 flex-shrink-0 whitespace-nowrap tabular-nums">
                {m.aGoals} – {m.bGoals}
              </span>
              <span className={`flex-1 min-w-0 text-left text-xs truncate ${awayWon ? 'text-cn-gold font-semibold' : 'text-apple-secondary'}`}>
                {awayName}
              </span>
            </div>
            <div className="text-right w-20 sm:w-28 flex-shrink-0">
              <span className="text-xs text-apple-tertiary truncate block">{m.tournament}</span>
              <span className={`text-xs font-semibold ${
                homeWon ? 'text-cn-red' : awayWon ? 'text-cn-gold' : 'text-apple-secondary'
              }`}>
                {homeWon ? t('matchDetail.homeWinsLabel') : awayWon ? t('matchDetail.awayWinsLabel') : t('matchDetail.drawLabel')}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Suspensions panel ────────────────────────────────────────────
function SuspensionsPanel({ suspensions, homeName, awayName, homeFlag, awayFlag }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  if (!suspensions) return null;

  const total = suspensions?.totalSuspended || 0;
  const hasData = total > 0 || suspensions?.home?.yellowWatch?.length > 0 || suspensions?.away?.yellowWatch?.length > 0;
  if (!hasData) return null;

  function SidePanel({ sideName, sideFlag, data }) {
    if (!data) return null;
    const hasSuspended = data.suspended?.length > 0;
    const hasWatch = data.yellowWatch?.length > 0;
    if (!hasSuspended && !hasWatch) return null;
    return (
      <div>
        <div className="text-xs font-semibold text-apple-secondary mb-2">{sideFlag} {sideName}</div>
        {hasSuspended && (
          <div className="space-y-1 mb-2">
            {data.suspended.map(s => (
              <div key={s.id} className="bg-red-50 border border-red-200 rounded px-2 py-1.5">
                <span className="text-sm text-red-700 font-medium">{s.player_name}</span>
                <span className="ml-2 text-xs text-apple-secondary">
                  {s.reason === 'red_card' ? `🟥 ${t('matchDetail.redCard')}` : s.reason === 'yellow_accumulation' ? `🟨×${s.yellow_cards} ${t('matchDetail.yellowCards')}` : s.reason}
                </span>
                {s.notes && <span className="ml-1 text-xs text-apple-tertiary">· {s.notes}</span>}
              </div>
            ))}
          </div>
        )}
        {hasWatch && (
          <div className="space-y-1">
            {data.yellowWatch.map((p, i) => (
              <div key={i} className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                <span className="text-sm text-amber-700">⚠️ {p.player_name}</span>
                <span className="text-xs text-apple-secondary">{t('matchDetail.yellowWatch')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="tang-card p-4">
      <button onClick={() => setOpen(o => !o)} className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-apple-text">🟥 {t('matchDetail.suspensions')}</span>
          {total > 0 && <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">{total} {t('matchDetail.suspendedCount')}</span>}
        </div>
        {open ? <ChevronUp size={16} className="text-apple-secondary" /> : <ChevronDown size={16} className="text-apple-secondary" />}
      </button>
      {open && (
        <div className="mt-4 grid md:grid-cols-2 gap-4">
          <SidePanel sideName={homeName} sideFlag={homeFlag} data={suspensions?.home} />
          <SidePanel sideName={awayName} sideFlag={awayFlag} data={suspensions?.away} />
        </div>
      )}
    </div>
  );
}

// ── Agent Session Viewer ─────────────────────────────────────────
const MODEL_BADGE = {
  'qwen-max':   'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  'qwen-plus':  'bg-blue-100   text-blue-700   dark:bg-blue-900/40   dark:text-blue-300',
  'qwen-turbo': 'bg-green-100  text-green-700  dark:bg-green-900/40  dark:text-green-300',
};

function AgentProbBar({ p, homeName, awayName }) {
  const h = Math.round((p?.winHome ?? 0) * 100);
  const d = Math.round((p?.draw    ?? 0) * 100);
  const a = Math.round((p?.winAway ?? 0) * 100);
  return (
    <div className="space-y-1">
      <div className="flex h-2 rounded overflow-hidden gap-px">
        <div className="bg-cn-red/40"   style={{ width: `${h}%` }} />
        <div className="bg-cn-gold/20"   style={{ width: `${d}%` }} />
        <div className="bg-cn-gold/40" style={{ width: `${a}%` }} />
      </div>
      <div className="flex justify-between text-apple-tertiary" style={{ fontSize: '10px' }}>
        <span className="text-cn-red font-medium">{h}%</span>
        <span>{d}%</span>
        <span className="text-cn-gold font-medium">{a}%</span>
      </div>
    </div>
  );
}

function AgentSessionViewer({ matchId, homeName, awayName }) {
  const t = useT();
  const [session, setSession] = useState(null);
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getAgentSession(matchId)
      .then(setSession)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [matchId]);

  if (loading || !session?.available) return null;

  const { session: meta, messages, conflicts } = session;
  const round1 = messages.filter(m => m.round === 1);
  const round2 = messages.filter(m => m.round === 2);

  // Build a conflict set for fast lookup: "agentA|agentB"
  const conflictPairs = new Set(
    conflicts.map(c => [c.agent_a, c.agent_b].sort().join('|'))
  );
  const isConflicted = (agent) =>
    conflicts.some(c => c.agent_a === agent || c.agent_b === agent);

  return (
    <div className="tang-card p-4">
      <button onClick={() => setOpen(v => !v)} className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-apple-text flex items-center gap-1.5">
            🤖 {t('matchDetail.multiAgent')}
          </span>
          <span className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 px-2 py-0.5 rounded font-medium">
            {meta.agents_used?.length ?? 0} {t('matchDetail.agentSuffix')}
          </span>
          {meta.conflicts_detected > 0 && (
            <span className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400 px-2 py-0.5 rounded font-medium">
              ⚡ {meta.conflicts_detected} {meta.conflicts_detected > 1 ? t('matchDetail.conflictsSuffix') : t('matchDetail.conflictSuffix')}
            </span>
          )}
          <span className="text-xs text-apple-tertiary">
            {meta.rounds} {meta.rounds > 1 ? t('matchDetail.roundsSuffix') : t('matchDetail.roundSuffix')} · {meta.wall_time_ms != null ? `${(meta.wall_time_ms / 1000).toFixed(1)}s` : '—'}
          </span>
        </div>
        {open ? <ChevronUp size={16} className="text-apple-secondary shrink-0" /> : <ChevronDown size={16} className="text-apple-secondary shrink-0" />}
      </button>

      {open && (
        <div className="mt-4 space-y-4">

          {/* Round 1 — parallel agent outputs */}
          <div>
            <div className="text-xs font-semibold text-apple-secondary uppercase tracking-wider mb-3">
              {t('matchDetail.round1')}
            </div>
            <div className="space-y-3">
              {round1.map(msg => {
                const conflicted = isConflicted(msg.agent);
                return (
                  <div key={msg.id}
                    className={`rounded-xl border p-3 ${conflicted
                      ? 'border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-900/10'
                      : 'border-black/[0.07] bg-apple-raised/30'}`}
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-xs font-bold text-apple-text">{msg.agent}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${MODEL_BADGE[msg.model] ?? 'bg-apple-raised text-apple-secondary'}`}>
                        {msg.model}
                      </span>
                      <span className="text-[10px] text-apple-tertiary ml-auto">
                        conf {Math.round((msg.confidence ?? 0) * 100)}% · {msg.latency_ms}ms
                      </span>
                      {conflicted && (
                        <span className="text-[10px] font-bold text-orange-600 bg-orange-100 dark:bg-orange-900/40 px-1.5 py-0.5 rounded">
                          ⚡ {t('matchDetail.conflict')}
                        </span>
                      )}
                    </div>

                    <AgentProbBar p={msg.probability} homeName={homeName} awayName={awayName} />

                    {msg.evidence?.length > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {msg.evidence.slice(0, 3).map((e, i) => (
                          <li key={i} className="text-[11px] text-apple-secondary flex gap-1.5">
                            <span className="text-apple-tertiary shrink-0">·</span> {e}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Conflicts + Round 2 */}
          {conflicts.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-apple-secondary uppercase tracking-wider mb-3">
                {t('matchDetail.round2')}
              </div>
              <div className="space-y-3">
                {conflicts.map((c, i) => {
                  const rebA = round2.find(m => m.agent === c.agent_a);
                  const rebB = round2.find(m => m.agent === c.agent_b);
                  return (
                    <div key={i} className="rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/10 p-3 space-y-3">
                      <div className="text-xs font-semibold text-orange-700 dark:text-orange-400">
                        ⚡ {c.agent_a} vs {c.agent_b} — gap {Math.round(c.delta * 100)}%
                      </div>

                      {[rebA, rebB].filter(Boolean).map(msg => (
                        <div key={msg.id} className="pl-3 border-l-2 border-orange-300 dark:border-orange-700">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[11px] font-bold text-apple-text">{msg.agent}</span>
                            <span className="text-[10px] text-apple-tertiary">{t('matchDetail.revised')}</span>
                            {c.winner === msg.agent
                              ? <span className="text-[10px] font-bold text-green-600 bg-green-100 dark:bg-green-900/40 px-1.5 py-0.5 rounded ml-auto">✓ {t('matchDetail.heldPosition')}</span>
                              : <span className="text-[10px] font-bold text-orange-600 bg-orange-100 dark:bg-orange-900/40 px-1.5 py-0.5 rounded ml-auto">↓ {t('matchDetail.conceded')}</span>
                            }
                          </div>
                          <AgentProbBar p={msg.probability} homeName={homeName} awayName={awayName} />
                        </div>
                      ))}

                      {c.resolution_reasoning && (
                        <div className="text-[11px] text-apple-secondary italic border-t border-orange-200 dark:border-orange-800 pt-2">
                          {c.resolution_reasoning}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between text-[10px] text-apple-tertiary border-t border-black/[0.07] pt-3">
            <span>{t('matchDetail.synthesis')}: {meta.synthesis_method}</span>
            <span>{meta.agents_used?.join(' + ')}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function MatchHero({ match, isCompleted, prediction }) {
  const t = useT();
  const formatDate = useFormatDate();
  const toSGT = useToSGT();
  const teamName = useTeamName();
  // Fire confetti once if completed and prediction was correct
  useEffect(() => {
    if (!isCompleted || !prediction?.most_likely_score) return;
    const [ph, pa] = prediction.most_likely_score.split('-').map(Number);
    if (isNaN(ph) || isNaN(pa)) return;
    const predOutcome = ph > pa ? 'HOME' : ph < pa ? 'AWAY' : 'DRAW';
    const hs = match.home_score, as_ = match.away_score;
    if (hs == null || as_ == null) return;
    const actualOutcome = hs > as_ ? 'HOME' : hs < as_ ? 'AWAY' : 'DRAW';
    if (predOutcome === actualOutcome) celebrate();
  }, [isCompleted, prediction, match]);

  return (
    <div className="card-hero p-0 overflow-hidden relative">
      {/* Deco brass top stripe */}
      <div className="h-1" style={{ background: 'linear-gradient(90deg, #C0392B 0%, #D4A03C 50%, #E8C547 100%)' }} />
      <QilinMark className="top-4 right-4 z-10" size={48} opacity={0.18} />
      <BatCluster className="bottom-3 left-4 z-10" opacity={0.16} />
      <div className="p-5 sm:p-7">
        {/* Stage + meta */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="eyebrow mb-1">
              {match.group_code ? `${t('dashboard.group')} ${match.group_code}` : t(`stage.${match.stage}`) || match.stage}
            </p>
            <p className="text-[13px] text-apple-secondary">
              {formatDate(toSGTDateKey(match.scheduled_date, match.scheduled_time))}
              {toSGT(match.scheduled_date, match.scheduled_time) && (
                <span className="ml-1 text-apple-tertiary">· {toSGT(match.scheduled_date, match.scheduled_time)}</span>
              )}
            </p>
            {match.venue && (
              <div className="flex items-center gap-1 text-[12px] text-apple-tertiary mt-1">
                <MapPin size={11} />
                {match.venue}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isCompleted && prediction?.most_likely_score && (() => {
              const [ph, pa] = prediction.most_likely_score.split('-').map(Number);
              if (isNaN(ph) || isNaN(pa)) return null;
              const predOutcome = ph > pa ? 'HOME' : ph < pa ? 'AWAY' : 'DRAW';
              const hs = match.home_score, as_ = match.away_score;
              if (hs == null || as_ == null) return null;
              const actualOutcome = hs > as_ ? 'HOME' : hs < as_ ? 'AWAY' : 'DRAW';
              if (predOutcome !== actualOutcome) return null;
              return (
                <span className="chip-gold flex items-center gap-1">
                  <Sparkles size={10} /> {t('matchDetail.predicted')}!
                </span>
              );
            })()}
          </div>
        </div>

        {/* Teams VS layout */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 text-center">
            <FlagImage teamId={match.home_team} size="lg" className="mx-auto mb-3" />
            <Link to={`/teams/${match.home_team}`} className="text-[17px] sm:text-[20px] font-extrabold text-apple-text hover:text-cn-red hover:underline tracking-[-0.02em] block">
              {teamName(match.home_team, match.home_name)}
            </Link>
            <div className="text-[12px] text-apple-tertiary mt-1">
              {t('matchDetail.eloRating')} {Math.round(match.home_elo || 1500)} · {match.home_wc_apps || 0} {t('matchDetail.wcApps')}
            </div>
          </div>

          <div className="text-center shrink-0 px-2">
            {isCompleted ? (
              <div>
                <div className="text-[36px] sm:text-[44px] font-extrabold tracking-[-0.04em] text-apple-text leading-none">
                  {match.home_score}<span className="text-cn-gold mx-1">–</span>{match.away_score}
                </div>
                {match.home_score_pens != null && (
                  <div className="text-[12px] text-apple-secondary mt-1">
                    ({match.home_score_pens} – {match.away_score_pens} {t('matchDetail.pens')})
                  </div>
                )}
                <div className="text-[10px] font-bold uppercase tracking-widest text-cn-jade mt-2">{t('matchDetail.fullTime')}</div>
              </div>
            ) : (
              <div>
                <div className="text-[20px] font-extrabold text-apple-tertiary tracking-widest">VS</div>
                <div className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${
                  match.status === 'LIVE' ? 'text-cn-red animate-pulse' : 'text-cn-red'
                }`}>
                  {match.status}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 text-center">
            <FlagImage teamId={match.away_team} size="lg" className="mx-auto mb-3" />
            <Link to={`/teams/${match.away_team}`} className="text-[17px] sm:text-[20px] font-extrabold text-apple-text hover:text-cn-red hover:underline tracking-[-0.02em] block">
              {teamName(match.away_team, match.away_name)}
            </Link>
            <div className="text-[12px] text-apple-tertiary mt-1">
              {t('matchDetail.eloRating')} {Math.round(match.away_elo || 1500)} · {match.away_wc_apps || 0} {t('matchDetail.wcApps')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MatchDetail() {
  const t = useT();
  const formatDate = useFormatDate();
  const teamName = useTeamName();
  const { id } = useParams();
  const [match, setMatch] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [lineup, setLineup] = useState(null);
  const [h2h, setH2H] = useState(null);
  const [history, setHistory] = useState([]);
  const [suspensions, setSuspensions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showH2H, setShowH2H] = useState(true);
  const [showLineup, setShowLineup] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [m, p] = await Promise.all([getMatch(id), getPrediction(id)]);
      setMatch(m);
      setPrediction(p);
      if (m) {
        getLineup(id).then(setLineup).catch(() => {});
        getH2H(m.home_team, m.away_team).then(setH2H).catch(() => {});
        getPredictionHistory(id).then(setHistory).catch(() => {});
        getMatchSuspensions(id).then(setSuspensions).catch(() => {});
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => { load(); }, [id]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="tang-card h-48" />
        <div className="tang-card h-32" />
      </div>
    );
  }

  if (!match) return <div className="tang-card p-8 text-center text-apple-secondary">{t('matchDetail.matchNotFound')}</div>;

  const isCompleted = match.status === 'COMPLETED';
  const factors = prediction?.factors || [];

  const stageLabel = match.group_code ? `${t('dashboard.group')} ${match.group_code}` : (t(`stage.${match.stage}`) || match.stage);
  const metaTitle = match.home_name && match.away_name
    ? `${match.home_name} vs ${match.away_name} Prediction — World Cup 2026 ${stageLabel} | WC2026`
    : 'Match Prediction — World Cup 2026 | WC2026 by Qwen';
  const metaDesc = (() => {
    if (!match.home_name || !match.away_name) return 'World Cup 2026 match prediction.';
    if (isCompleted) {
      return `${match.home_name} ${match.home_score ?? '?'}–${match.away_score ?? '?'} ${match.away_name} — World Cup 2026 ${stageLabel} result and AI prediction analysis.`;
    }
    const homeP = prediction ? `${Math.round((prediction.prob_home || 0) * 100)}%` : null;
    const drawP = prediction ? `${Math.round((prediction.prob_draw || 0) * 100)}%` : null;
    const awayP = prediction ? `${Math.round((prediction.prob_away || 0) * 100)}%` : null;
    const probPart = homeP ? ` AI prediction: ${match.home_name} win ${homeP} / Draw ${drawP} / ${match.away_name} win ${awayP}.` : '';
    return `World Cup 2026 ${stageLabel} — ${match.home_name} vs ${match.away_name}.${probPart}`;
  })();

  const sportsEventSchema = {
    '@type': 'SportsEvent',
    name: `${match.home_name} vs ${match.away_name} — FIFA World Cup 2026`,
    sport: 'Association Football',
    startDate: match.scheduled_time
      ? `${match.scheduled_date}T${match.scheduled_time}Z`
      : match.scheduled_date,
    eventStatus: isCompleted
      ? 'https://schema.org/EventCompleted'
      : 'https://schema.org/EventScheduled',
    location: match.venue ? { '@type': 'Place', name: match.venue } : undefined,
    homeTeam: { '@type': 'SportsTeam', name: match.home_name },
    awayTeam: { '@type': 'SportsTeam', name: match.away_name },
    organizer: { '@type': 'Organization', name: 'FIFA', url: 'https://www.fifa.com' },
    description: (() => {
      const parts = [];
      if (prediction?.prob_home != null) {
        parts.push(
          `AI prediction — ${match.home_name} win: ${Math.round(prediction.prob_home * 100)}%, ` +
          `Draw: ${Math.round(prediction.prob_draw * 100)}%, ` +
          `${match.away_name} win: ${Math.round(prediction.prob_away * 100)}%.`
        );
      }
      if (prediction?.most_likely_score) parts.push(`Most likely score: ${prediction.most_likely_score}.`);
      if (prediction?.insight) parts.push(prediction.insight);
      if (isCompleted && match.home_score != null) {
        parts.push(`Final result: ${match.home_name} ${match.home_score}–${match.away_score} ${match.away_name}.`);
      }
      return parts.join(' ') || metaDesc;
    })(),
    ...(isCompleted && match.home_score != null ? {
      result: `${match.home_name} ${match.home_score}–${match.away_score} ${match.away_name}`,
    } : {}),
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <SEO title={metaTitle} description={metaDesc} path={`/matches/${id}`} jsonLd={sportsEventSchema} />
      {/* Match Header */}
      <MatchHero match={match} isCompleted={isCompleted} prediction={prediction} />
      {/* Prediction bar */}
      {prediction && (
        <div className="tang-card p-5">
          <PredictionBar
            probHome={prediction.prob_home}
            probDraw={prediction.prob_draw}
            probAway={prediction.prob_away}
            homeName={teamName(match.home_team, match.home_name)}
            awayName={teamName(match.away_team, match.away_name)}
            size="lg"
            isKnockout={match.stage !== 'GROUP'}
          />
        </div>
      )}


      {/* Prediction Details */}
      {prediction && (
        <>
          {/* Predicted Result banner — derived from most_likely_score for consistency */}
          {(() => {
            const isKnockout = match.stage !== 'GROUP';
            const score = prediction.most_likely_score;
            let isHome = false, isDraw = false;
            if (score) {
              const [h, a] = score.split('-').map(Number);
              if (!isNaN(h) && !isNaN(a)) {
                isHome = h > a;
                isDraw = h === a;
              }
            }
            // Fall back to probability-based result if no score available
            if (!score) {
              const pH = prediction.prob_home, pD = prediction.prob_draw, pA = prediction.prob_away;
              const max = Math.max(pH, pD, pA);
              isHome = max === pH;
              isDraw = max === pD && !isHome;
            }
            const label = isHome ? `${teamName(match.home_team, match.home_name)} ${t('matchDetail.homeWin')}`
                        : isDraw ? (isKnockout ? t('matchDetail.extraTime') : t('matchDetail.draw'))
                        : `${teamName(match.away_team, match.away_name)} ${t('matchDetail.awayWin')}`;
            const color = isHome ? 'bg-cn-red/[0.08] border-cn-red/20 text-cn-red'
                        : isDraw ? 'bg-apple-raised border-black/[0.10] text-apple-secondary'
                        : 'bg-cn-gold/[0.08] border-cn-gold/20 text-cn-gold';
            return (
              <div className={`px-4 py-3 rounded-2xl border ${color}`}>
                <div className="text-[10px] font-bold uppercase tracking-[0.06em] opacity-60 mb-0.5">{t('matchDetail.predictedResult')}</div>
                <div className="text-[17px] font-extrabold tracking-[-0.02em]">{label}</div>
              </div>
            );
          })()}

          {/* Score Forecast & Confidence */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-apple-raised rounded-2xl p-4 col-span-2 md:col-span-2">
              <div className="text-[11px] font-medium text-apple-secondary mb-2">{t('matchDetail.likelyScorelines')}</div>
              {(prediction.top_scores?.length ? prediction.top_scores : prediction.most_likely_score ? [{ score: prediction.most_likely_score, prob: null }] : []).map(({ score, prob }, i) => (
                <div key={score} className="flex items-center justify-between mb-1.5 last:mb-0">
                  <div className="flex items-center gap-2">
                    {i === 0 && <span className="text-[9px] font-bold text-cn-red bg-cn-red/[0.10] px-1.5 py-0.5 rounded">{t('matchDetail.topScoreLabel')}</span>}
                    {i > 0 && <span className="text-[9px] font-bold text-apple-tertiary bg-apple-raised px-1.5 py-0.5 rounded">#{i + 1}</span>}
                    <span className={`font-bold tabular-nums ${i === 0 ? 'text-lg text-apple-text' : 'text-sm text-apple-secondary'}`}>
                      {score.replace('-', ' – ')}
                    </span>
                  </div>
                  {prob != null && (
                    <span className={`text-[11px] font-medium ${i === 0 ? 'text-cn-red' : 'text-apple-tertiary'}`}>
                      {(prob * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="bg-apple-raised rounded-2xl p-4 text-center">
              <div className="text-[11px] font-medium text-apple-secondary mb-1.5">{t('matchDetail.expectedGoals')}</div>
              <div className="text-lg font-bold text-apple-text">
                {prediction.expected_score_home?.toFixed(1)} – {prediction.expected_score_away?.toFixed(1)}
              </div>
            </div>
            <div className="bg-apple-raised rounded-2xl p-4 text-center">
              <div className="text-[11px] font-medium text-apple-secondary mb-1.5">{t('matchDetail.confidence')}</div>
              <div className={`text-lg font-bold ${CONFIDENCE_COLORS[prediction.confidence] || 'text-apple-tertiary'}`}>
                {prediction.confidence || '—'}
              </div>
            </div>
          </div>

          {/* AI Insight */}
          {prediction.insight && (
            <div className="tang-card p-4 border-l-4 border-cn-red relative">
              <DragonWatermark opacity={0.15} />
              <div className="text-xs text-cn-red font-semibold mb-2 flex items-center gap-1.5"><Sparkles size={12} /> {t('matchDetail.insight')}</div>
              <p className="text-apple-text text-sm leading-relaxed">{prediction.insight}</p>
            </div>
          )}

          {/* Key Factors */}
          {factors.length > 0 && (
            <div className="tang-card p-4">
              <h3 className="font-semibold text-apple-text mb-4 flex items-center gap-2">
                <Activity size={16} className="text-cn-red" /> {t('matchDetail.keyFactors')}
              </h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {factors.map((factor, i) => {
                  const FactorIcon = FACTOR_ICONS[factor.name] || Activity;
                  return (
                    <div key={i} className="rounded-2xl border border-cn-gold/12 p-3 hover:shadow-tang transition-all duration-300">
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-9 h-9 rounded-xl bg-cn-red/[0.08] flex items-center justify-center shrink-0">
                          <FactorIcon size={16} className="text-cn-red" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[13px] font-semibold text-apple-text block truncate">{factor.name}</span>
                          <span className="text-[10px] text-apple-tertiary">{factor.weight.toFixed(0)}% {t('matchDetail.weightLabel')}</span>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                          factor.favors === 'HOME' ? 'bg-cn-red/[0.10] text-cn-red' :
                          factor.favors === 'AWAY' ? 'bg-cn-gold/[0.10] text-cn-gold' :
                          'bg-apple-raised text-apple-secondary'
                        }`}>
                          {factor.favors === 'HOME' ? match.home_name :
                           factor.favors === 'AWAY' ? match.away_name : t('matchDetail.neutral')}
                        </span>
                      </div>
                      <p className="text-[11px] text-apple-secondary mb-2 leading-relaxed">{factor.description}</p>
                      <div className="h-1 bg-apple-raised rounded overflow-hidden">
                        <div
                          className={`h-full rounded transition-all duration-500 ${
                            factor.favors === 'HOME' ? 'bg-cn-red' :
                            factor.favors === 'AWAY' ? 'bg-cn-gold' : 'bg-apple-tertiary/40'
                          }`}
                          style={{ width: `${Math.min(100, factor.impact * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {prediction.methodology && (
                <div className="border-t border-cn-gold/10 mt-4 pt-3">
                  <div className="text-xs text-apple-tertiary">
                    📐 {t('matchDetail.methodology')}: {prediction.methodology}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Multi-Agent Session Viewer — renders itself only when session exists */}
          <AgentSessionViewer
            matchId={id}
            homeName={match.home_name}
            awayName={match.away_name}
          />

          {/* Web Intelligence */}
          {prediction.web_intel && (
            <div className="tang-card p-4">
              <h3 className="font-semibold text-apple-text mb-3">🌐 {t('matchDetail.webIntel')}</h3>

              {/* Key summary */}
              {prediction.web_intel.keySummary && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-3 py-2 mb-4 text-sm text-apple-text">
                  {prediction.web_intel.keySummary}
                </div>
              )}

              {/* Per-team rows */}
              <div className="grid md:grid-cols-2 gap-4">
                {[
                  { name: match.home_name, flag: match.home_flag, injuries: prediction.web_intel.homeInjuries, form: prediction.web_intel.homeForm, motivation: prediction.web_intel.homeMotivation, rotating: prediction.web_intel.homeRotating },
                  { name: match.away_name, flag: match.away_flag, injuries: prediction.web_intel.awayInjuries, form: prediction.web_intel.awayForm, motivation: prediction.web_intel.awayMotivation, rotating: prediction.web_intel.awayRotating },
                ].map(({ name, flag, injuries, form, motivation, rotating }) => (
                  <div key={name} className="space-y-2">
                    <div className="text-xs font-semibold text-apple-secondary">{flag} {name}</div>

                    {/* Injuries */}
                    {injuries?.length > 0 ? (
                      <div className="space-y-1">
                        {injuries.map((p, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm text-red-400">
                            <span>🩹</span> {p}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-apple-tertiary">{t('matchDetail.noInjury')}</div>
                    )}

                    {/* Form / Motivation / Rotation badges */}
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {form && form !== 'normal' && (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          form === 'excellent' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' :
                          form === 'good'      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' :
                                                 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
                        }`}>
                          {form === 'excellent' ? `🔥 ${t('matchDetail.highMotivation')}` : form === 'good' ? `✅ ${t('matchDetail.highMotivation')}` : `📉 ${t('matchDetail.lowMotivation')}`}
                        </span>
                      )}
                      {motivation && motivation !== 'normal' && (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          motivation === 'high' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400'
                                                : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                        }`}>
                          {motivation === 'high' ? `⚡ ${t('matchDetail.highMotivation')}` : `😴 ${t('matchDetail.lowMotivation')}`}
                        </span>
                      )}
                      {rotating && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400">
                          🔄 {t('matchDetail.rotating')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── SUSPENSIONS & CAUTIONS ───────────────────────────── */}
      <SuspensionsPanel
        suspensions={suspensions}
        homeName={match.home_name}
        awayName={match.away_name}
        homeFlag={match.home_flag}
        awayFlag={match.away_flag}
      />

      {/* ── HEAD-TO-HEAD HISTORY ────────────────────────────── */}
      <div className="tang-card p-4 relative">
        <PhoenixWatermark opacity={0.15} />
        <button
          className="flex items-center justify-between w-full"
          onClick={() => setShowH2H(v => !v)}
        >
          <h3 className="font-semibold text-apple-text flex items-center gap-2">
            <span>⚔️</span> {t('matchDetail.h2h')}
            {h2h?.summary && (
              <span className="text-xs text-apple-secondary font-normal ml-1">
                ({h2h.summary.totalMeetings} {t('matchDetail.h2hMeetings')})
              </span>
            )}
          </h3>
          {showH2H ? <ChevronUp size={16} className="text-apple-secondary" /> : <ChevronDown size={16} className="text-apple-secondary" />}
        </button>

        {showH2H && (
          <div className="mt-4">
            {!h2h ? (
              <div className="text-sm text-apple-tertiary animate-pulse">{t('matchDetail.loadingH2h')}</div>
            ) : (
              <>
                {/* W-D-L Summary Bar */}
                {h2h.summary ? (
                  <div className="mb-4">
                    {/* Record boxes — 'a' = home team (first arg passed to getH2H) */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 bg-cn-red/[0.08] rounded-lg p-3 text-center border border-cn-red/[0.20]">
                        <div className="text-2xl font-bold text-cn-red">{h2h.summary.aWins ?? 0}</div>
                        <div className="text-xs text-apple-secondary mt-0.5">{teamName(match?.home_team, match?.home_name)} {t('matchDetail.aWinsLabel')}</div>
                      </div>
                      <div className="flex-1 bg-apple-raised/50 rounded-lg p-3 text-center border border-black/[0.10]/40">
                        <div className="text-2xl font-bold text-apple-text">{h2h.summary.draws ?? 0}</div>
                        <div className="text-xs text-apple-secondary mt-0.5">{t('matchDetail.drawsLabel')}</div>
                      </div>
                      <div className="flex-1 bg-cn-gold/[0.08] rounded-lg p-3 text-center border border-cn-gold/[0.20]">
                        <div className="text-2xl font-bold text-cn-gold">{h2h.summary.bWins ?? 0}</div>
                        <div className="text-xs text-apple-secondary mt-0.5">{teamName(match?.away_team, match?.away_name)} {t('matchDetail.bWinsLabel')}</div>
                      </div>
                    </div>

                    {/* Visual proportion bar */}
                    {h2h.summary.totalMatches > 0 && (
                      <div className="flex h-2 rounded-full overflow-hidden gap-px mt-2">
                        <div className="bg-cn-red transition-all" style={{ width: `${(h2h.summary.aWins / h2h.summary.totalMatches) * 100}%` }} />
                        <div className="transition-all" style={{ width: `${(h2h.summary.draws / h2h.summary.totalMatches) * 100}%`, background: 'rgba(192,57,43,0.40)' }} />
                        <div className="bg-cn-gold transition-all" style={{ width: `${(h2h.summary.bWins / h2h.summary.totalMatches) * 100}%` }} />
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-3 mt-3 text-xs text-apple-secondary">
                      <div>{t('matchDetail.totalMeetingsLabel')}: <span className="text-apple-text font-medium">{h2h.summary.totalMatches}</span></div>
                      <div className="text-center">{t('matchDetail.h2hWcMeetings')}: <span className="text-cn-gold font-medium">{h2h.summary.wcMeetings ?? 0}</span></div>
                      <div className="text-right">
                        {h2h.summary.weightedAdvantage > 0.1
                          ? <span className="text-cn-red">{match?.home_name} {t('matchDetail.historicallyStronger')}</span>
                          : h2h.summary.weightedAdvantage < -0.1
                          ? <span className="text-cn-gold">{match?.away_name} {t('matchDetail.historicallyStronger')}</span>
                          : <span className="text-apple-secondary">{t('matchDetail.evenlyMatched')}</span>
                        }
                      </div>
                    </div>

                    {h2h.summary.lastMeeting && (
                      <div className="mt-3 text-xs text-apple-secondary bg-apple-raised/40 rounded-lg px-3 py-2">
                        {t('matchDetail.lastMeetingLabel')}: <span className="text-apple-text">
                          {h2h.summary.lastMeeting.date?.slice(0, 10)} — {match?.home_name} {h2h.summary.lastMeeting.aGoals}–{h2h.summary.lastMeeting.bGoals} {match?.away_name}
                        </span>
                        {h2h.summary.lastMeeting.tournament && (
                          <span className="text-apple-tertiary"> · {h2h.summary.lastMeeting.tournament}</span>
                        )}
                      </div>
                    )}

                    {/* Data quality badge */}
                    {(() => {
                      const n = h2h.summary.totalMatches;
                      const dq = n >= 8 ? 'STRONG' : n >= 4 ? 'MODERATE' : 'WEAK';
                      return (
                        <div className={`mt-2 text-xs px-2 py-1 rounded inline-block ${
                          dq === 'STRONG' ? 'bg-green-50 text-green-700 border border-green-200' :
                          dq === 'MODERATE' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          'bg-apple-raised text-apple-secondary border border-black/[0.08]'
                        }`}>
                          {t('matchDetail.dataQualityLabel')}: {dq}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="text-sm text-apple-tertiary mb-4">{t('matchDetail.noH2hMeetings')}</div>
                )}

                {/* Timeline */}
                <H2HTimeline
                  meetings={h2h.matches}
                  homeId={match?.home_team}
                  awayId={match?.away_team}
                  homeName={match?.home_name}
                  awayName={match?.away_name}
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* ── CONFIRMED LINEUP ───────────────────────────────── */}
      <div className="tang-card p-4">
        <button
          className="flex items-center justify-between w-full"
          onClick={() => setShowLineup(v => !v)}
        >
          <h3 className="font-semibold text-apple-text flex items-center gap-2">
            <Users size={16} />
            {t('matchDetail.confirmedLineup')}
            {lineup?.available === true && (
              <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">{t('matchDetail.confirmed')}</span>
            )}
            {lineup?.available === false && (
              <span className="text-xs bg-apple-raised text-apple-secondary px-2 py-0.5 rounded-full">{t('matchDetail.lineupAvailable')}</span>
            )}
          </h3>
          {showLineup ? <ChevronUp size={16} className="text-apple-secondary" /> : <ChevronDown size={16} className="text-apple-secondary" />}
        </button>

        {showLineup && (
          <div className="mt-4">
            {!lineup ? (
              <div className="text-sm text-apple-tertiary animate-pulse">{t('matchDetail.loadingLineup')}</div>
            ) : lineup.available === false ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-3">🕐</div>
                <p className="text-apple-secondary text-sm">{t('matchDetail.lineupPending')}</p>
                <p className="text-apple-tertiary text-xs mt-1">{t('matchDetail.lineupAuto')}</p>
              </div>
            ) : (
              <div>
                {/* Source badge */}
                {lineup.source && (
                  <div className="text-xs text-apple-tertiary mb-3 text-right">
                    {t('matchDetail.lineupSource')}: <span className="text-apple-secondary">{lineup.source}</span>
                  </div>
                )}

                {/* Key absences warning — keyAbsences.home/away are arrays of name strings */}
                {(lineup.keyAbsences?.home?.length > 0 || lineup.keyAbsences?.away?.length > 0) && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
                    <div className="text-xs text-red-700 font-semibold mb-1">⚠️ {t('matchDetail.keyAbsences')}</div>
                    <div className="grid grid-cols-2 gap-2">
                      {lineup.keyAbsences?.home?.map((name, i) => (
                        <div key={i} className="text-xs text-red-700">{match?.home_flag} {name}</div>
                      ))}
                      {lineup.keyAbsences?.away?.map((name, i) => (
                        <div key={i} className="text-xs text-red-700">{match?.away_flag} {name}</div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Starting XI grids */}
                <div className="grid md:grid-cols-2 gap-4">
                  {lineup.home?.starters?.length > 0 && (
                    <FormationDisplay
                      starters={lineup.home.starters}
                      formation={lineup.home.formation}
                      teamName={match?.home_name}
                      flag={match?.home_flag}
                      keyAbsenceNames={lineup.keyAbsences?.home || []}
                    />
                  )}
                  {lineup.away?.starters?.length > 0 && (
                    <FormationDisplay
                      starters={lineup.away.starters}
                      formation={lineup.away.formation}
                      teamName={match?.away_name}
                      flag={match?.away_flag}
                      keyAbsenceNames={lineup.keyAbsences?.away || []}
                    />
                  )}
                </div>

                {/* Bench */}
                {(lineup.home?.bench?.length > 0 || lineup.away?.bench?.length > 0) && (
                  <div className="grid md:grid-cols-2 gap-4 mt-4">
                    {[{ side: 'home', team: match?.home_name }, { side: 'away', team: match?.away_name }].map(({ side, team }) => (
                      lineup[side]?.bench?.length > 0 && (
                        <div key={side}>
                          <div className="text-xs text-apple-tertiary mb-1">{t('matchDetail.bench')} — {team}</div>
                          <div className="flex flex-wrap gap-1">
                            {lineup[side].bench.map((p, i) => (
                              <span key={i} className="text-xs bg-apple-raised/60 text-apple-secondary px-2 py-0.5 rounded">
                                {p.shirtNumber && <span className="text-apple-tertiary mr-1">{p.shirtNumber}</span>}
                                {p.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                )}

                {/* Lineup strength scores */}
                {(lineup.home?.strengthScore || lineup.away?.strengthScore) && (
                  <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-black/[0.08]">
                    {['home', 'away'].map(side => (
                      lineup[side]?.strengthScore && (
                        <div key={side} className="text-center">
                          <div className="text-xs text-apple-secondary mb-1">
                            {side === 'home' ? match?.home_name : match?.away_name} {t('matchDetail.strengthScore')}
                          </div>
                          <div className="text-lg font-bold text-apple-text">
                            {lineup[side].strengthScore.toFixed(1)}
                            <span className="text-xs text-apple-tertiary">/100</span>
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                )}

              </div>
            )}
          </div>
        )}
      </div>

      {/* Post-Match Analysis (if completed) */}
      {isCompleted && prediction?.actual_outcome && (
        <div className={`tang-card p-4 border-l-4 ${prediction.was_correct ? 'border-green-600' : 'border-red-600'}`}>
          <h3 className="font-semibold text-apple-text mb-3 flex items-center gap-2">
            {prediction.was_correct ? (
              <><CheckCircle size={16} className="text-apple-green" /> {t('matchDetail.correct')}</>
            ) : (
              <><AlertCircle size={16} className="text-red-400" /> {t('matchDetail.incorrect')}</>
            )}
            {prediction.upset ? <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded ml-2">{t('matchDetail.upset')}</span> : null}
          </h3>
          <div className="grid grid-cols-3 gap-4 text-center text-sm">
            <div>
              <div className="text-apple-secondary text-xs">{t('matchDetail.predicted')}</div>
              <div className="font-bold text-apple-text">
                {prediction.prob_home >= prediction.prob_draw && prediction.prob_home >= prediction.prob_away
                  ? t('matchDetail.outcomeHome') : prediction.prob_away > prediction.prob_home && prediction.prob_away >= prediction.prob_draw
                  ? t('matchDetail.outcomeAway') : t('matchDetail.outcomeDraw')}
              </div>
            </div>
            <div>
              <div className="text-apple-secondary text-xs">{t('tournament.actual')}</div>
              <div className="font-bold text-apple-text">{prediction.actual_outcome === 'HOME' ? t('matchDetail.outcomeHome') : prediction.actual_outcome === 'AWAY' ? t('matchDetail.outcomeAway') : prediction.actual_outcome === 'DRAW' ? t('matchDetail.outcomeDraw') : prediction.actual_outcome}</div>
            </div>
            <div>
              <div className="text-apple-secondary text-xs">{t('matchDetail.brierScore')}</div>
              <div className={`font-bold ${
                prediction.brier_score < 0.3 ? 'text-apple-green' :
                prediction.brier_score < 0.5 ? 'text-apple-orange' : 'text-red-400'
              }`}>
                {prediction.brier_score?.toFixed(3) || '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PREDICTION HISTORY ────────────────────────────────── */}
      {history.length > 0 && (
        <PredictionHistoryPanel
          history={history}
          homeName={match?.home_name}
          awayName={match?.away_name}
          homeFlag={match?.home_flag}
          awayFlag={match?.away_flag}
          isCompleted={isCompleted}
        />
      )}

    </div>
  );
}
