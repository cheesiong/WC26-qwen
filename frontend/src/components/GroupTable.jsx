import { Link } from 'react-router-dom';
import { LayoutGrid, Check } from 'lucide-react';
import FlagImage from './FlagImage';
import { useT, useTeamName } from '../contexts/LanguageContext';
import { BatCluster } from './TangOrnaments';

export default function GroupTable({ group, teams }) {
  const t = useT();
  const teamName = useTeamName();
  return (
    <div className="tang-card overflow-hidden relative">
      <BatCluster className="bottom-2 right-3" opacity={0.12} />
      <div className="px-5 py-3 border-b border-cn-gold/10 flex items-center gap-2"
        style={{ background: 'linear-gradient(90deg, rgba(192,57,43,0.03), rgba(212,160,60,0.02), transparent)' }}>
        <LayoutGrid size={15} className="text-cn-gold shrink-0" />
        <h3 className="font-bold text-h3 tracking-[-0.02em] text-apple-text">{t('dashboard.group')} {group}</h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-[0.03em] text-apple-tertiary border-b border-cn-gold/8">
            <th className="text-left px-3 py-2.5">#</th>
            <th className="text-left px-3 py-2.5">{t('groups.teamHeader')}</th>
            <th className="text-center px-2 py-2.5">{t('groups.played')}</th>
            <th className="text-center px-2 py-2.5">{t('groups.won')}</th>
            <th className="text-center px-2 py-2.5">{t('groups.drawn')}</th>
            <th className="text-center px-2 py-2.5">{t('groups.lost')}</th>
            <th className="text-center px-2 py-2.5">{t('groups.gf')}</th>
            <th className="text-center px-2 py-2.5">{t('groups.ga')}</th>
            <th className="text-center px-2 py-2.5">{t('groups.gd')}</th>
            <th className="text-center px-2 py-2.5 text-apple-text">{t('groups.pts')}</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team, i) => (
            <tr
              key={team.id}
              className={`border-b border-cn-gold/6 transition-colors hover:bg-cn-gold/[0.04] ${
                i < 2 ? 'bg-cn-gold/[0.05] border-l-[3px] border-l-cn-gold' : ''
              }`}
            >
              <td className="px-3 py-2.5 text-apple-tertiary text-xs">{i + 1}</td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <FlagImage teamId={team.id} className="w-6 flex-shrink-0" />
                  <Link to={`/teams/${team.id}`} className={`font-medium tracking-[-0.01em] hover:underline ${i < 2 ? 'text-apple-text' : 'text-apple-secondary'}`}>
                    {teamName(team.id, team.name)}
                  </Link>
                  {i < 2 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-cn-gold/[0.12] text-cn-gold px-1.5 py-0.5 rounded-full">
                      <Check size={8} strokeWidth={3} />Q
                    </span>
                  )}
                </div>
              </td>
              <td className="text-center px-2 py-2.5 text-apple-secondary">{team.gs_played}</td>
              <td className="text-center px-2 py-2.5 text-cn-jade font-medium">{team.gs_won}</td>
              <td className="text-center px-2 py-2.5 text-apple-secondary">{team.gs_drawn}</td>
              <td className="text-center px-2 py-2.5 text-cn-red/80">{team.gs_lost}</td>
              <td className="text-center px-2 py-2.5 text-apple-secondary">{team.gs_gf}</td>
              <td className="text-center px-2 py-2.5 text-apple-secondary">{team.gs_ga}</td>
              <td className="text-center px-2 py-2.5 text-apple-secondary">
                {team.gs_gf - team.gs_ga > 0 ? '+' : ''}{team.gs_gf - team.gs_ga}
              </td>
              <td className="text-center px-2 py-2.5 font-bold text-apple-text">{team.gs_pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 text-[11px] text-apple-tertiary flex items-center gap-2 border-t border-cn-gold/8">
        <span className="w-2 h-2 bg-cn-gold rounded-sm inline-block"></span>
        {t('groups.topTwoAdvance')}
      </div>
    </div>
  );
}
