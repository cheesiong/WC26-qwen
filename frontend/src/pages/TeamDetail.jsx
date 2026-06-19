import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import SEO from '../components/SEO';
import { getTeam } from '../api/client';
import { toSGTDateKey } from '../utils/time';
import FlagImage from '../components/FlagImage';
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Area, AreaChart,
} from 'recharts';
import { useT, useFormatDate, useTeamName } from '../contexts/LanguageContext';
import { DragonWatermark, PhoenixWatermark, QilinMark, BatCluster } from '../components/TangOrnaments';

function EloChart({ eloHistory, startingElo }) {
  const t = useT();
  if (!eloHistory || eloHistory.length === 0) {
    return <div className="text-sm text-apple-tertiary text-center py-4">{t('teamDetail.eloTrend')}</div>;
  }

  const data = [
    { label: t('teamDetail.startingElo'), elo: Math.round(startingElo || eloHistory[0]?.elo_before || 1500), match: 'Tournament start' },
    ...eloHistory.map((h, i) => ({
      label: h.opponent_name || `M${i+1}`,
      elo: Math.round(h.elo_after),
      result: h.result,
      opponent: h.opponent_name,
      stage: t(`stageShort.${h.stage}`) || h.stage,
    })),
  ];

  const minElo = Math.min(...data.map(d => d.elo)) - 20;
  const maxElo = Math.max(...data.map(d => d.elo)) + 20;

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.[0]) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-apple-text rounded-xl p-3 text-xs shadow-apple-md">
        <div className="text-apple-surface font-semibold">ELO: {d.elo}</div>
        {d.result && (
          <div className={`mt-1 font-bold ${d.result === 'W' ? 'text-apple-green' : d.result === 'D' ? 'text-apple-orange' : 'text-red-400'}`}>
            {d.result === 'W' ? '✓ Win' : d.result === 'D' ? '= Draw' : '✗ Loss'}
          </div>
        )}
        {d.opponent && <div className="text-apple-raised mt-0.5">vs {d.opponent}</div>}
        {d.stage && <div className="text-apple-raised/70">{d.stage}</div>}
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="eloGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#C0392B" stopOpacity={0.20} />
            <stop offset="95%" stopColor="#C0392B" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#E8E8ED" strokeDasharray="2 4" />
        <XAxis dataKey="label" tick={{ fill: '#515154', fontSize: 10 }} />
        <YAxis domain={[minElo, maxElo]} tick={{ fill: '#515154', fontSize: 10 }} width={45} />
        <Tooltip content={<CustomTooltip />} />
        <Area type="monotone" dataKey="elo" stroke="#C0392B" strokeWidth={2}
          fill="url(#eloGrad)" dot={{ r: 4, fill: '#C0392B', stroke: '#FDE8EC' }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function StatBox({ label, value, sub, highlight }) {
  return (
    <div className="bg-apple-raised rounded-2xl p-4 text-center">
      <div className="text-[11px] font-medium text-apple-secondary mb-1.5">{label}</div>
      <div className={`text-2xl font-bold ${highlight || 'text-apple-text'}`}>{value ?? '—'}</div>
      {sub && <div className="text-[11px] text-apple-tertiary mt-0.5">{sub}</div>}
    </div>
  );
}


export default function TeamDetail() {
  const t = useT();
  const formatDate = useFormatDate();
  const teamName = useTeamName();
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let interval;

    async function load() {
      try {
        const result = await getTeam(id);
        setData(result);
        return result;
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }

    load().then(result => {
      if (!result) return;
      const today = new Date().toISOString().split('T')[0];
      const isMatchDay = result.matches?.some(
        m => m.scheduled_date === today || m.status === 'LIVE'
      );
      if (isMatchDay) {
        interval = setInterval(load, 60000);
      }
    });

    return () => clearInterval(interval);
  }, [id]);

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="card h-40" />
      <div className="grid grid-cols-4 gap-3">{Array(4).fill(null).map((_, i) => <div key={i} className="bg-apple-raised rounded-2xl h-20" />)}</div>
    </div>
  );

  if (!data?.team) return <div className="card p-8 text-center text-apple-secondary">Team not found</div>;

  const { team, matches, eloHistory, groupTeams } = data;
  const played = matches.filter(m => m.status === 'COMPLETED');
  const upcoming = matches.filter(m => m.status !== 'COMPLETED');
  const wins = played.filter(m => m.winner === team.id).length;
  const draws = played.filter(m => m.status === 'COMPLETED' && !m.winner && (m.home_score === m.away_score)).length;
  const losses = played.length - wins - draws;
  const gf = played.reduce((s, m) => s + (m.home_team === team.id ? (m.home_score||0) : (m.away_score||0)), 0);
  const ga = played.reduce((s, m) => s + (m.home_team === team.id ? (m.away_score||0) : (m.home_score||0)), 0);

  const groupPos = groupTeams.findIndex(t => t.id === team.id) + 1;
  const knockoutMatches = matches.filter(m => m.stage !== 'GROUP');
  const nextMatch = upcoming[0];

  const teamTitle = `${team.name} — World Cup 2026 Schedule & Predictions | WC2026`;
  const teamDesc = `${team.name} World Cup 2026 profile — Group ${team.group_code}, FIFA ranking #${team.fifa_rank ?? '?'}. See all matches, results, AI predictions, and ELO rating trajectory.`;

  const sportsTeamSchema = {
    '@type': 'SportsTeam',
    name: team.name,
    sport: 'Association Football',
    memberOf: {
      '@type': 'SportsEvent',
      name: 'FIFA World Cup 2026',
      startDate: '2026-06-11',
      endDate: '2026-07-19',
      location: { '@type': 'Place', name: 'United States, Canada and Mexico' },
    },
    ...(team.fifa_rank ? { description: `FIFA ranking: #${team.fifa_rank}. Group ${team.group_code} at the 2026 FIFA World Cup.` } : {}),
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <SEO title={teamTitle} description={teamDesc} path={`/teams/${id}`} jsonLd={sportsTeamSchema} />
      {/* Back */}
      <Link to="/groups" className="text-sm text-apple-secondary hover:text-apple-text transition-colors inline-flex items-center gap-1">
        {t('teamDetail.backToGroups')}
      </Link>

      {/* Team header — hero with blurred flag backdrop */}
      <div className="card-hero overflow-hidden relative">
        <QilinMark className="top-3 right-3 z-10" size={42} opacity={0.18} />
        <BatCluster className="bottom-3 right-4 z-10" opacity={0.16} />
        {/* Blurred flag backdrop */}
        <div className="absolute inset-0 overflow-hidden">
          <img
            src={`https://flagcdn.com/w320/${team.id?.toLowerCase()}.png`}
            alt=""
            className="absolute inset-0 w-full h-full object-cover scale-150 opacity-15"
            style={{ filter: 'blur(40px) saturate(180%)' }}
            aria-hidden="true"
          />
        </div>
        {/* Host-nation stripe */}
        <div className="h-1 bg-grad-host relative z-10" />
        <div className="relative z-10 p-6">
          <div className="flex items-center gap-6">
            <FlagImage teamId={team.id} size="lg" className="shadow-apple-md" />
            <div className="flex-1">
              <h1 className="text-h2 text-apple-text font-serif">{teamName(team.id, team.name)}</h1>
              <div className="flex flex-wrap gap-2 mt-2 text-sm">
                {team.confederation && (
                  <span className="bg-apple-raised text-apple-secondary px-2 py-0.5 rounded-lg text-[12px] font-medium">
                    {team.confederation}
                  </span>
                )}
                {team.group_code && (
                  <span className="bg-cn-red/[0.08] text-cn-red px-2 py-0.5 rounded-lg text-[12px] font-medium">
                    {t('dashboard.group')} {team.group_code}
                    {groupPos > 0 && ` · ${groupPos}${groupPos === 1 ? 'st' : groupPos === 2 ? 'nd' : groupPos === 3 ? 'rd' : 'th'} place`}
                  </span>
                )}
                {team.fifa_rank && <span className="text-apple-secondary text-[13px]">FIFA rank #{team.fifa_rank}</span>}
                {team.last_wc_round && <span className="text-apple-secondary text-[13px]">{t('teamDetail.lastWC')}: {team.last_wc_round}</span>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-4xl font-bold text-cn-red">{Math.round(team.elo || 1500)}</div>
              <div className="text-[11px] text-apple-secondary mt-1">{t('teamDetail.currentElo')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBox label={t('teamDetail.eloRating')} value={Math.round(team.elo)} highlight="text-cn-red" />
        <StatBox label={t('teamDetail.fifaRank')} value={team.fifa_rank ? `#${team.fifa_rank}` : '—'} />
        <StatBox label={t('teamDetail.wcApps')} value={team.wc_appearances || 0} />
        <StatBox label={t('teamDetail.groupPoints')} value={team.gs_pts}
          sub={`${t('groups.pos')} ${groupPos || '?'} · ${t('dashboard.group')} ${team.group_code || '?'}`}
          highlight={groupPos <= 2 ? 'text-cn-jade' : 'text-apple-text'} />
      </div>

      {/* Tournament stats */}
      {played.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatBox label={t('teamDetail.played')} value={played.length} />
          <StatBox label={t('teamDetail.record')} value={`${wins}W ${draws}D ${losses}L`} />
          <StatBox label={t('teamDetail.goals')} value={`${gf} – ${ga}`}
            sub={`GD: ${gf - ga > 0 ? '+' : ''}${gf - ga}`}
            highlight={gf - ga > 0 ? 'text-apple-green' : gf - ga < 0 ? 'text-red-500' : 'text-apple-text'} />
          <StatBox label={t('teamDetail.points')} value={team.gs_pts}
            sub={`${Math.round(team.gs_pts / Math.max(played.length, 1) * 10) / 10} ${t('dashboard.perGame')}`} />
        </div>
      )}

      {/* ELO trend */}
      {eloHistory?.length > 0 && (
        <div className="card p-5 relative">
          <PhoenixWatermark opacity={0.15} />
          <h3 className="text-[15px] font-semibold text-apple-text mb-4">{t('teamDetail.eloTrend')}</h3>
          <EloChart eloHistory={eloHistory} startingElo={team.fifa_points} />
          {eloHistory?.length > 0 && (
            <div className="flex justify-between mt-3 text-[11px] text-apple-secondary">
              <span>{t('teamDetail.startingElo')}: {Math.round(eloHistory[0]?.elo_before || team.elo)}</span>
              <span>{t('teamDetail.currentElo')}: {Math.round(team.elo)}</span>
              <span className={`font-semibold ${(team.elo - (eloHistory[0]?.elo_before || team.elo)) > 0 ? 'text-apple-green' : 'text-red-500'}`}>
                {(team.elo - (eloHistory[0]?.elo_before || team.elo)) > 0 ? '+' : ''}
                {Math.round(team.elo - (eloHistory[0]?.elo_before || team.elo))} pts
              </span>
            </div>
          )}
        </div>
      )}

      {/* Group standing */}
      {groupTeams.length > 0 && (
        <div className="card p-5">
          <h3 className="text-[15px] font-semibold text-apple-text mb-3">{t('dashboard.group')} {team.group_code} {t('teamDetail.groupContext')}</h3>
          <div className="space-y-1">
            {groupTeams.map((t, i) => (
              <Link key={t.id} to={`/teams/${t.id}`}
                className={`flex items-center justify-between py-2 px-3 rounded-xl transition-colors ${
                  t.id === team.id
                    ? 'bg-cn-red/[0.07] border border-cn-red/20'
                    : 'hover:bg-apple-raised/60'
                }`}>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-bold w-5 text-right ${i < 2 ? 'text-cn-jade' : 'text-apple-tertiary'}`}>{i+1}</span>
                  <FlagImage teamId={t.id} className="w-6" />
                  <span className={`text-sm ${t.id === team.id ? 'text-cn-red font-semibold' : 'text-apple-text'}`}>{teamName(t.id, t.name)}</span>
                </div>
                <div className="flex gap-4 text-xs text-apple-secondary">
                  <span>P{t.gs_played}</span>
                  <span>{t.gs_gf - t.gs_ga > 0 ? '+' : ''}{t.gs_gf - t.gs_ga}</span>
                  <span className={`font-bold ${i < 2 ? 'text-cn-jade' : 'text-apple-secondary'}`}>{t.gs_pts} pts</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Next match */}
      {nextMatch && (
        <div className="card p-5 border-l-4 border-cn-red">
          <h3 className="text-[15px] font-semibold text-apple-text mb-3">{t('teamDetail.nextMatch')}</h3>
          <Link to={`/matches/${nextMatch.id}`} className="flex items-center justify-between hover:opacity-80 transition-opacity">
            <div className="flex items-center gap-3">
              <FlagImage teamId={nextMatch.home_team} className="w-8" />
              <span className="text-apple-text font-medium">{nextMatch.home_name}</span>
            </div>
            <div className="text-center px-4">
              <div className="text-xs text-apple-secondary">{formatDate(toSGTDateKey(nextMatch.scheduled_date, nextMatch.scheduled_time))}</div>
              <div className="text-sm text-apple-tertiary mt-0.5">{t(`stage.${nextMatch.stage}`) || nextMatch.stage}</div>
              {nextMatch.prob_home != null && (
                <div className="flex h-1.5 rounded-full overflow-hidden w-20 mx-auto mt-1.5">
                  <div className="bg-cn-red" style={{ width: `${Math.round(nextMatch.prob_home * 100)}%` }} />
                  <div className="bg-apple-tertiary/50" style={{ width: `${Math.round(nextMatch.prob_draw * 100)}%` }} />
                  <div className="bg-cn-gold" style={{ width: `${Math.round(nextMatch.prob_away * 100)}%` }} />
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-apple-text font-medium">{nextMatch.away_name}</span>
              <FlagImage teamId={nextMatch.away_team} className="w-8" />
            </div>
          </Link>
        </div>
      )}

      {/* Knockout bracket path */}
      {knockoutMatches.length > 0 && (
        <div className="card p-5">
          <h3 className="text-[15px] font-semibold text-apple-text mb-3">{t('teamDetail.knockoutJourney')}</h3>
          <div className="space-y-2">
            {knockoutMatches.map(m => {
              const isHome = m.home_team === team.id;
              const oppTeamId = isHome ? m.away_team : m.home_team;
              const opponent = teamName(oppTeamId, isHome ? m.away_name : m.home_name);
              const teamScore = isHome ? m.home_score : m.away_score;
              const oppScore  = isHome ? m.away_score : m.home_score;
              const won = m.winner === team.id;
              const isCompleted = m.status === 'COMPLETED';

              return (
                <Link key={m.id} to={`/matches/${m.id}`}
                  className="flex items-center gap-3 bg-apple-raised hover:bg-apple-raised/70 rounded-xl px-3 py-2.5 transition-colors">
                  <span className={`text-xs font-bold w-8 flex-shrink-0 ${
                    isCompleted ? (won ? 'text-apple-green' : 'text-red-500') : 'text-apple-tertiary'
                  }`}>{t(`stage.${m.stage}`) || m.stage}</span>
                  <FlagImage teamId={oppTeamId} className="w-6 flex-shrink-0" />
                  <span className="text-sm text-apple-text flex-1">vs {opponent}</span>
                  {isCompleted ? (
                    <span className={`text-sm font-bold ${won ? 'text-apple-green' : 'text-red-500'}`}>
                      {teamScore} – {oppScore} {won ? 'W' : 'L'}
                    </span>
                  ) : (
                    <span className="text-xs text-apple-tertiary">{formatDate(toSGTDateKey(m.scheduled_date, m.scheduled_time))}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* All matches */}
      <div className="card p-5">
        <h3 className="text-[15px] font-semibold text-apple-text mb-3">{t('teamDetail.allMatches')}</h3>
        <div className="space-y-1">
          {matches.map(m => {
            const isHome = m.home_team === team.id;
            const opponent = isHome ? m.away_name : m.home_name;
            const oppTeamId = isHome ? m.away_team : m.home_team;
            const teamScore = isHome ? m.home_score : m.away_score;
            const oppScore  = isHome ? m.away_score : m.home_score;
            const won = m.winner === team.id;
            const isCompleted = m.status === 'COMPLETED';
            const isDraw = isCompleted && teamScore === oppScore && !m.winner;

            return (
              <Link key={m.id} to={`/matches/${m.id}`}
                className="flex items-center gap-3 hover:bg-apple-raised/60 rounded-xl px-2 py-2 transition-colors">
                <span className="text-[11px] text-apple-tertiary flex-shrink-0 w-16">{formatDate(toSGTDateKey(m.scheduled_date, m.scheduled_time))}</span>
                <span className={`w-7 h-7 flex-shrink-0 rounded-lg text-xs font-bold flex items-center justify-center ${
                  !isCompleted ? 'bg-apple-raised text-apple-tertiary' :
                  won ? 'bg-[rgba(40,205,65,0.15)] text-apple-green' :
                  isDraw ? 'bg-apple-orange/[0.10] text-apple-orange' : 'bg-red-500/[0.10] text-red-500'
                }`}>
                  {!isCompleted ? '—' : won ? 'W' : isDraw ? 'D' : 'L'}
                </span>
                <FlagImage teamId={oppTeamId} className="w-6 flex-shrink-0" />
                <span className="text-sm text-apple-text flex-1">{opponent || '?'}</span>
                <span className="text-[11px] text-apple-tertiary">{t(`stage.${m.stage}`) || m.stage}{m.group_code ? ` ${m.group_code}` : ''}</span>
                {isCompleted ? (
                  <span className="text-sm font-bold text-apple-text w-12 text-right">{teamScore} – {oppScore}</span>
                ) : (
                  <span className="text-[11px] text-apple-tertiary w-12 text-right">
                    {m.prob_home != null ? (
                      <span className="text-cn-red font-medium">
                        {Math.round((isHome ? m.prob_home : m.prob_away) * 100)}%
                      </span>
                    ) : '—'}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
