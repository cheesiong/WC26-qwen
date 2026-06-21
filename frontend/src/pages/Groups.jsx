import { useEffect, useState } from 'react';
import SEO from '../components/SEO';
import { getGroups } from '../api/client';
import GroupTable from '../components/GroupTable';
import MatchCard from '../components/MatchCard';
import FlagImage from '../components/FlagImage';
import { useT, useTeamName } from '../contexts/LanguageContext';
import { DragonWatermark, QilinMark, BatCluster } from '../components/TangOrnaments';
import { Users } from 'lucide-react';

export default function Groups() {
  const t = useT();
  const teamName = useTeamName();
  const [groups, setGroups] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeGroup, setActiveGroup] = useState('A');

  useEffect(() => {
    getGroups()
      .then(setGroups)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="rounded-[28px] h-40 animate-pulse" style={{ background: 'linear-gradient(135deg, rgba(192,57,43,0.08), rgba(212,160,60,0.06))' }} />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-pulse">
          {Array(12).fill(null).map((_, i) => (
            <div key={i} className="tang-card h-48" />
          ))}
        </div>
      </div>
    );
  }

  const groupLetters = 'ABCDEFGHIJKL'.split('');
  const current = groups[activeGroup];

  return (
    <div className="space-y-6">
      <SEO
        title="Group Standings — World Cup 2026 | WC2026 by Qwen"
        description="Live FIFA World Cup 2026 group standings for all 12 groups (A–L). See points tables, qualification probabilities, and what-if scenarios for all 48 teams."
        path="/groups"
      />
      {/* ══════════════════════════════════════════════════════
          HEADER — 上海装饰风 · Deco lacquer banner (Emerald)
          ══════════════════════════════════════════════════════ */}
      <div className="rounded-[28px] overflow-hidden relative tang-border" style={{
        background: 'linear-gradient(160deg, #0B3D2E 0%, #145A42 30%, #1E7A5A 50%, #0F4A38 75%, #0B3D2E 100%)',
      }}>
        <div className="absolute top-0 right-0 w-[280px] h-[280px] rounded-full opacity-[0.10]"
          style={{ background: 'radial-gradient(circle, #34D399 0%, #059669 30%, transparent 60%)' }} />
        <div className="absolute inset-[8px] rounded-[22px] pointer-events-none"
          style={{ border: '1px solid rgba(212,160,60,0.10)' }} />
        <DragonWatermark opacity={0.18} />
        <div className="relative px-6 py-6 sm:px-8 sm:py-7">
          <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 rounded-seal"
            style={{ background: 'rgba(212,160,60,0.10)', border: '1px solid rgba(212,160,60,0.20)' }}>
            <Users size={11} className="text-yellow-300" />
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">
              {t('common.worldCup2026')}
            </span>
          </div>
          <h1 className="text-[36px] sm:text-[44px] font-extrabold tracking-[-0.04em] text-white leading-[0.92] mb-2 font-serif">
            {t('nav.groups')}
          </h1>
          <p className="text-[15px] text-white/50">
            {t('groups.subtitle')}
          </p>
        </div>
      </div>

      {/* Group selector tabs — Tang seal style */}
      <div className="flex flex-wrap gap-2">
        {groupLetters.map(g => (
          <button
            key={g}
            onClick={() => setActiveGroup(g)}
            className={`w-10 h-10 rounded-seal font-bold text-sm transition-all duration-200 border ${
              activeGroup === g
                ? 'text-white shadow-md border-transparent'
                : 'border-cn-gold/15 bg-apple-raised/30 text-apple-secondary hover:text-apple-text hover:bg-apple-raised/50 hover:border-cn-gold/30'
            }`}
            style={activeGroup === g ? { background: 'linear-gradient(135deg, #C0392B, #8B2500)' } : {}}
          >
            {g}
            {g === 'A' && <QilinMark className="top-0 right-0" size={24} opacity={0.18} />}
          </button>
        ))}
      </div>

      {current && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Standings table + scenarios */}
          <div>
            <GroupTable group={activeGroup} teams={current.teams} />
          </div>

          {/* Group matches */}
          <div className="space-y-3">
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.03em] text-apple-secondary flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cn-gold" />
              {t('dashboard.group')} {activeGroup} {t('nav.matches')}
            </h3>
            {current.matches.map(m => (
              <MatchCard key={m.id} match={m} showPrediction={true} />
            ))}
          </div>
        </div>
      )}

      {/* All groups overview */}
      <div>
        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-apple-text mb-4 font-serif flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cn-gold" />
          {t('nav.groups')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {groupLetters.map(g => {
            const gData = groups[g];
            if (!gData) return null;
            return (
              <button
                key={g}
                onClick={() => { setActiveGroup(g); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="tang-card p-4 text-left hover:shadow-tang-lg transition-all relative"
              >
                {g === 'A' && <BatCluster className="bottom-2 right-3" />}
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-cn-red mb-3 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-cn-red" />
                  {t('dashboard.group')} {g}
                </div>
                {gData.teams.map((team, i) => (
                  <div key={team.id} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold w-4 ${i < 2 ? 'text-cn-gold' : 'text-apple-tertiary'}`}>
                        {i+1}
                      </span>
                      <FlagImage teamId={team.id} className="w-6" />
                      <span className={`text-sm font-medium ${i < 2 ? 'text-apple-text' : 'text-apple-tertiary'}`}>
                        {teamName(team.id, team.name)}
                      </span>
                    </div>
                    <span className={`text-xs font-bold tabular-nums ${i < 2 ? 'text-cn-gold' : 'text-apple-tertiary'}`}>
                      {team.gs_pts}
                    </span>
                  </div>
                ))}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
