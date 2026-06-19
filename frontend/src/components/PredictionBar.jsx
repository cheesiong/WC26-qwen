import { useT } from '../contexts/LanguageContext';

export default function PredictionBar({ probHome, probDraw, probAway, homeName, awayName, size = 'md', isKnockout = false }) {
  const t = useT();
  const pct = (v) => `${(v * 100).toFixed(0)}%`;
  const large = size === 'lg';

  return (
    <div className="w-full">
      {/* Segmented bar — Landscape terracotta/amber palette */}
      <div className={`flex rounded-full overflow-hidden gap-[1.5px] ${large ? 'h-4' : 'h-2.5'}`}
        style={{ background: 'rgba(174,174,178,0.25)' }}>
        <div
          className="h-full rounded-l-full transition-all duration-500"
          style={{
            width: pct(probHome),
            background: 'linear-gradient(90deg, #C0392B, #A93226)',
          }}
        />
        <div
          className="h-full transition-all duration-500"
          style={{ width: pct(probDraw), background: 'linear-gradient(90deg, rgba(139,37,0,0.40), rgba(139,37,0,0.50))' }}
        />
        <div
          className="h-full rounded-r-full transition-all duration-500"
          style={{
            width: pct(probAway),
            background: 'linear-gradient(90deg, #D4A03C, #E8C547)',
          }}
        />
      </div>

      {/* Labels */}
      <div className={`relative flex justify-between mt-2 ${large ? 'text-sm' : 'text-xs'}`}>
        <span className="font-semibold text-cn-red truncate max-w-[38%]">
          {homeName} <span className="font-bold">{pct(probHome)}</span>
        </span>
        <span
          className="absolute -translate-x-1/2 text-apple-tertiary whitespace-nowrap"
          style={{ left: `${(probHome + probDraw / 2) * 100}%` }}
        >
          {isKnockout ? t('matchDetail.extraTime') : t('matchDetail.draw')} <span className="font-semibold">{pct(probDraw)}</span>
        </span>
        <span className="font-semibold text-cn-gold truncate max-w-[38%] text-right">
          {awayName} <span className="font-bold">{pct(probAway)}</span>
        </span>
      </div>
    </div>
  );
}
