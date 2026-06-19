import { useEffect, useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Medal } from 'lucide-react';
import SEO from '../components/SEO';
import { getRoadToFinal, getWinnerProbabilities } from '../api/client';
import FlagImage from '../components/FlagImage';
import { useT, useTeamName } from '../contexts/LanguageContext';
import { DragonPhoenixPair, BatCluster, QilinMark } from '../components/TangOrnaments';

// Bracket layout constants
const SLOTS = 16;
const SLOT_H = 80;
const CARD_H = 54;
const COL_W = 160;
const CONN_W = 24;

function BracketMatchCard({ match }) {
  const teamName = useTeamName();
  const { home, away, winner, score, isActual } = match;
  if (!home && !away) return null;

  const homeWins = winner?.id === home?.id;
  const awayWins = winner?.id === away?.id;
  const scores = score ? score.split('–') : [null, null];

  const TeamRow = ({ team, isWinner, scoreVal }) => (
    <div className={`flex items-center gap-1.5 px-2 py-[5px] ${isWinner ? 'bg-cn-red/[0.07]' : ''}`}>
      {team?.id ? <FlagImage teamId={team.id} className="w-5 flex-shrink-0" /> : <span className="w-5 h-3 bg-apple-raised rounded-sm flex-shrink-0" />}
      {team?.id ? (
        <Link to={`/teams/${team.id}`} onClick={e => e.stopPropagation()} className={`flex-1 text-[11px] font-bold tracking-wider hover:underline ${
          isWinner ? 'text-cn-red' : 'text-apple-text'
        }`}>
          {teamName(team.id, team.name)}
        </Link>
      ) : (
        <span className="flex-1 text-[11px] font-bold tracking-wider text-apple-tertiary">TBD</span>
      )}
      {isActual && isWinner && (
        <span className="text-[9px] text-cn-gold font-bold flex-shrink-0">✓</span>
      )}
      {isActual && scoreVal != null && (
        <span className={`text-[11px] font-bold tabular-nums flex-shrink-0 ${
          isWinner ? 'text-cn-red' : 'text-apple-secondary'
        }`}>{scoreVal}</span>
      )}
      {!isActual && team?.winPct != null && (
        <span className={`text-[10px] font-semibold tabular-nums flex-shrink-0 ${
          isWinner ? 'text-cn-red' : 'text-apple-tertiary'
        }`}>{team.winPct}%</span>
      )}
    </div>
  );

  return (
    <div className="tang-card bg-apple-surface/80 rounded-xl border border-cn-gold/12 overflow-hidden shadow-tang">
      <TeamRow team={home} isWinner={homeWins} scoreVal={scores[0]} />
      {!isActual && home?.winPct != null ? (
        <div className="h-[2px] bg-apple-raised">
          <div className="h-full bg-cn-gold/45" style={{ width: `${home.winPct}%` }} />
        </div>
      ) : (
        <div className="h-px bg-black/[0.05] mx-2" />
      )}
      <TeamRow team={away} isWinner={awayWins} scoreVal={scores[1]} />
    </div>
  );
}

const STAGE_META_KEYS = ['R32', 'R16', 'QF', 'SF', 'F'];

function HorizontalBracket({ snapshot }) {
  const t = useT();
  const byStage = {};
  for (const r of snapshot.rounds) byStage[r.stage] = r;

  const totalH = SLOTS * SLOT_H;
  const totalW = STAGE_META_KEYS.length * COL_W + (STAGE_META_KEYS.length - 1) * CONN_W;

  return (
    <div className="overflow-x-auto pb-2">
      <div style={{ minWidth: totalW }}>
        {/* Column headers */}
        <div className="flex mb-3">
          {STAGE_META_KEYS.map((stage, idx) => {
            const round = byStage[stage];
            return (
              <Fragment key={stage}>
                <div className="flex-shrink-0 flex flex-col gap-0.5" style={{ width: COL_W }}>
                  <span className={`text-[10px] font-bold uppercase tracking-[0.06em] leading-none ${
                    stage === 'F' ? 'text-cn-gold' : 'text-apple-secondary'
                  }`}>
                    {t(`stage.${stage}`)}
                  </span>
                  {round && (
                    <span className={`text-[9px] font-bold px-1.5 py-px rounded-full w-fit ${
                      round.isActual
                        ? 'bg-cn-gold/[0.12] text-cn-gold'
                        : 'bg-cn-red/[0.08] text-cn-red'
                    }`}>
                      {round.isActual ? t('tournament.actual') : t('tournament.predicted')}
                    </span>
                  )}
                </div>
                {idx < STAGE_META_KEYS.length - 1 && (
                  <div className="flex-shrink-0" style={{ width: CONN_W }} />
                )}
              </Fragment>
            );
          })}
        </div>

        {/* Bracket columns + SVG connectors */}
        <div className="flex" style={{ height: totalH }}>
          {STAGE_META_KEYS.map((stage, stageIdx) => {
            const round = byStage[stage];
            const nextRound = stageIdx < STAGE_META_KEYS.length - 1
              ? byStage[STAGE_META_KEYS[stageIdx + 1]]
              : null;
            const isFinal = stage === 'F';

            const col = round ? (
              <div className={`relative flex-shrink-0 ${isFinal ? 'rounded-2xl overflow-hidden' : ''}`} style={{ width: COL_W }}>
                {round.matches.map((match, i) => {
                  const slotsPerMatch = SLOTS / round.matches.length;
                  const top = Math.round((i + 0.5) * slotsPerMatch * SLOT_H - CARD_H / 2);
                  return (
                    <div key={match.id} className="absolute inset-x-0" style={{ top }}>
                      {isFinal ? (
                        <div className="rounded-2xl overflow-hidden shadow-tang-gold border border-cn-gold/30">
                          <div className="px-2 py-1 flex items-center gap-1.5" style={{ background: 'linear-gradient(135deg, #1C2833, #2C3E50)' }}>
                            <Trophy size={10} className="text-cn-gold" />
                            <span className="text-[9px] font-bold uppercase tracking-widest text-cn-gold">{t('stage.F')}</span>
                          </div>
                          <BracketMatchCard match={match} />
                        </div>
                      ) : (
                        <BracketMatchCard match={match} />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex-shrink-0" style={{ width: COL_W }} />
            );

            const connector = nextRound ? (
              <svg className="flex-shrink-0" width={CONN_W} height={totalH}
                style={{ overflow: 'visible' }}>
                {Array.from({ length: nextRound.matches.length }).map((_, j) => {
                  const slotsA = SLOTS / (round?.matches.length || 1);
                  const slotsB = SLOTS / nextRound.matches.length;
                  const y0   = (j * 2 + 0.5) * slotsA * SLOT_H;
                  const y1   = (j * 2 + 1.5) * slotsA * SLOT_H;
                  const midY = (j + 0.5)      * slotsB * SLOT_H;
                  const X    = CONN_W / 2;
                  return (
                    <path key={j}
                      d={`M 0,${y0} H ${X} V ${y1} M 0,${y1} H ${X} M ${X},${midY} H ${CONN_W}`}
                      fill="none"
                      stroke="var(--bracket-stroke)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  );
                })}
              </svg>
            ) : null;

            return (
              <Fragment key={stage}>
                {col}
                {connector}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RoadToFinal() {
  const t = useT();
  const teamName = useTeamName();
  const [data, setData]           = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading]     = useState(true);

  const model = 'predicted';

  useEffect(() => {
    getRoadToFinal()
      .then(d => {
        setData(d);
        setSelectedId(d.predicted?.[0]?.id ?? null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => <div key={i} className="card h-16 animate-pulse bg-apple-raised/50" />)}
      </div>
    );
  }

  const snapshots = data?.[model] ?? [];
  const snapshot = snapshots.find(s => s.id === selectedId);
  const finalRound = snapshot?.rounds.find(r => r.stage === 'F');
  const predictedWinner = finalRound?.matches[0]?.winner;

  return (
    <div className="space-y-4">

      {snapshots.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {snapshots.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`px-3 py-1.5 rounded-seal text-[12px] font-semibold transition-all duration-200 border ${
                selectedId === s.id
                  ? 'text-white shadow-md border-transparent'
                  : 'border-cn-gold/15 bg-apple-raised/30 text-apple-secondary hover:text-apple-text'
              }`}
              style={selectedId === s.id ? { background: 'linear-gradient(135deg, #C0392B, #8B2500)' } : {}}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Predicted champion banner */}
      {predictedWinner && (
        <div className="tang-palace flex items-center gap-4 px-5 py-4 rounded-2xl">
          <FlagImage teamId={predictedWinner.id} size="md" />
          <div className="flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/50">
              {t('tournament.predicted')} {t('tournament.champion')}
            </div>
            <Link to={`/teams/${predictedWinner.id}`} className="text-[18px] font-extrabold text-white hover:text-cn-gold transition-colors">
              {teamName(predictedWinner.id, predictedWinner.name)}
            </Link>
          </div>
          <Trophy size={32} className="text-cn-gold shrink-0" />
        </div>
      )}

      {snapshot && (
        <div className="tang-card px-4 pt-4 pb-5 relative">
          <QilinMark className="top-4 right-4" />
          <HorizontalBracket snapshot={snapshot} />
        </div>
      )}
    </div>
  );
}

function WinnerProbabilities() {
  const t = useT();
  const teamName = useTeamName();
  const [probs, setProbs] = useState([]);
  const [simCount, setSimCount] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getWinnerProbabilities()
      .then(data => {
        setProbs(data.probabilities);
        setSimCount(data.simCount);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="card p-5 space-y-3 animate-pulse">
        {Array(8).fill(null).map((_, i) => <div key={i} className="h-7 bg-apple-raised rounded-xl" />)}
      </div>
    );
  }

  const top3 = probs.slice(0, 3);
  const MEDAL_STYLES = [
    { rank: 2, bg: 'from-slate-400/20 to-slate-300/10', border: 'border-slate-400/30', pctColor: 'text-apple-secondary', labelKey: 'tournament.runnerUp', medalColor: 'text-slate-400' },
    { rank: 1, bg: 'from-cn-gold/20 to-amber-300/10',   border: 'border-cn-gold/40',   pctColor: 'text-cn-gold',          labelKey: 'tournament.favourite',  medalColor: 'text-cn-gold' },
    { rank: 3, bg: 'from-amber-700/20 to-amber-600/10', border: 'border-amber-600/30', pctColor: 'text-amber-600',        labelKey: 'tournament.darkHorse', medalColor: 'text-amber-600' },
  ];

  return (
    <div className="space-y-4">
      {/* Podium */}
      {top3.length > 0 && (
        <div className="grid grid-cols-3 gap-3 items-end">
          {[top3[1], top3[0], top3[2]].map((team, i) => {
            if (!team) return null;
            const style = MEDAL_STYLES[i];
            const isFirst = style.rank === 1;
            return (
              <div
                key={team.teamId}
                className={`tang-card p-4 text-center bg-gradient-to-b ${style.bg} border ${style.border} relative ${isFirst ? 'shadow-tang-gold' : ''}`}
              >
                <div className={`flex justify-center mb-1 ${style.medalColor}`}>
                  <Medal size={isFirst ? 22 : 18} strokeWidth={2} />
                </div>
                <div className={`mb-2 flex justify-center`}>
                  <FlagImage teamId={team.teamId} className={isFirst ? 'w-20 shadow-apple-md' : 'w-16 shadow-apple-sm'} />
                </div>
                <Link to={`/teams/${team.teamId}`} className={`font-bold hover:underline hover:text-cn-red ${isFirst ? 'text-[17px] text-apple-text' : 'text-[15px] text-apple-text'}`}>
                  {teamName(team.teamId, team.name)}
                </Link>
                <div className={`font-extrabold my-1.5 tabular-nums ${isFirst ? 'text-[28px]' : 'text-[22px]'} ${style.pctColor}`}>
                  {(team.probability * 100).toFixed(1)}%
                </div>
                <div className="text-[11px] text-apple-tertiary">{t(style.labelKey)}</div>
                <div className="h-1.5 bg-apple-raised rounded-full mt-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${isFirst ? 'bg-cn-gold' : 'bg-apple-tertiary/40'}`}
                    style={{ width: `${(team.probability * 100).toFixed(1)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full table */}
      <div className="tang-card p-5 relative">
        <BatCluster className="bottom-4 right-5" />
        <h3 className="text-eyebrow text-cn-red mb-4 uppercase tracking-widest flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-cn-red" />
          {t('tournament.winnerProbs')}
        </h3>
        <div className="space-y-2">
          {probs.map((team, i) => (
            <div key={team.teamId} className="flex items-center gap-3">
              <span className={`text-[13px] font-bold w-5 text-right flex-shrink-0 ${
                i === 0 ? 'text-cn-gold' : i < 3 ? 'text-cn-red' : 'text-apple-tertiary'
              }`}>
                {i + 1}
              </span>
              <FlagImage teamId={team.teamId} className="w-7 flex-shrink-0" />
              <Link to={`/teams/${team.teamId}`} className="text-[13px] text-apple-text font-medium flex-1 truncate hover:text-cn-red hover:underline">{teamName(team.teamId, team.name)}</Link>
              <div className="w-24 h-1.5 bg-apple-raised rounded-full overflow-hidden flex-shrink-0">
                <div
                  className={`h-full rounded-full ${
                    i === 0 ? 'bg-cn-gold' : i < 3 ? 'bg-cn-red' : i < 8 ? 'bg-cn-red/50' : 'bg-apple-tertiary/30'
                  }`}
                  style={{ width: `${Math.max(1, (team.probability / (probs[0]?.probability || 1)) * 100)}%` }}
                />
              </div>
              <span className={`text-[13px] font-bold tabular-nums w-12 text-right flex-shrink-0 ${
                i === 0 ? 'text-cn-gold' : i < 3 ? 'text-cn-red' : 'text-apple-secondary'
              }`}>
                {(team.probability * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-apple-tertiary mt-4">
          {simCount ? simCount.toLocaleString() : '—'} {t('tournament.simCount')}
        </p>
      </div>
    </div>
  );
}

export default function Tournament() {
  const t = useT();
  const [activeTab, setActiveTab] = useState('road');

  const tabs = [
    { id: 'road', label: t('tournament.roadToFinal') },
    { id: 'odds', label: t('tournament.winnerProbs') },
  ];

  return (
    <div className="space-y-6">
      <SEO
        title="Knockout Bracket & Winner Odds — World Cup 2026 | WC2026 Predictor"
        description="FIFA World Cup 2026 knockout bracket with AI-predicted winners from the Round of 32 to the Final. See each team's probability of winning the tournament."
        path="/tournament"
      />
      {/* ══════════════════════════════════════════════════════
          HEADER — 上海装饰风 · Deco lacquer banner (Royal Purple)
          ══════════════════════════════════════════════════════ */}
      <div className="rounded-[28px] overflow-hidden relative tang-border" style={{
        background: 'linear-gradient(160deg, #1E1338 0%, #2D1B55 30%, #4C2882 50%, #2A1848 75%, #1E1338 100%)',
      }}>
        <div className="absolute top-0 right-0 w-[280px] h-[280px] rounded-full opacity-[0.10]"
          style={{ background: 'radial-gradient(circle, #A78BFA 0%, #7C3AED 30%, transparent 60%)' }} />
        <div className="absolute inset-[8px] rounded-[22px] pointer-events-none"
          style={{ border: '1px solid rgba(212,160,60,0.10)' }} />
        <DragonPhoenixPair opacity={0.15} />
        <BatCluster className="bottom-4 right-6" />
        <div className="relative px-6 py-6 sm:px-8 sm:py-7">
          <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 rounded-seal"
            style={{ background: 'rgba(212,160,60,0.10)', border: '1px solid rgba(212,160,60,0.20)' }}>
            <Trophy size={11} className="text-yellow-300" />
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">
              {t('common.worldCup2026')}
            </span>
          </div>
          <h1 className="text-[36px] sm:text-[44px] font-extrabold tracking-[-0.04em] text-white leading-[0.92] mb-2 font-serif">
            {t('nav.championship')}
          </h1>
          <p className="text-[15px] text-white/50">
            {t('tournament.subtitle')}
          </p>
        </div>
      </div>

      {/* Tabs — Tang seal style */}
      <div className="flex gap-2">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-seal text-[13px] font-semibold transition-all duration-200 border ${
              activeTab === t.id
                ? 'text-white shadow-md border-transparent'
                : 'border-cn-gold/15 bg-apple-raised/30 text-apple-secondary hover:text-apple-text'
            }`}
            style={activeTab === t.id ? { background: 'linear-gradient(135deg, #C0392B, #8B2500)' } : {}}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'road' && <RoadToFinal />}
      {activeTab === 'odds' && <WinnerProbabilities />}
    </div>
  );
}
