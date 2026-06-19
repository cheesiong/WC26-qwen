import { Link, useNavigate } from 'react-router-dom';
import PredictionBar from './PredictionBar';
import FlagImage from './FlagImage';
import { toSGTDateKey } from '../utils/time';
import { useT, useFormatDate, useToSGT, useTeamName } from '../contexts/LanguageContext';
import { QilinMark } from './TangOrnaments';

const CHIP_COLORS = {
  VERY_HIGH: 'chip-gold',
  HIGH:      'chip-gold',
  MEDIUM:    'bg-cn-gold/[0.08] text-cn-gold',
  LOW:       'bg-apple-raised text-apple-secondary',
};

const STATUS_CHIP = {
  COMPLETED: 'bg-apple-raised text-apple-secondary',
  LIVE:      'text-white animate-pulse',
  SCHEDULED: 'bg-cn-red/[0.08] text-cn-red',
};

export default function MatchCard({ match, showPrediction = true }) {
  const navigate = useNavigate();
  const t = useT();
  const formatDate = useFormatDate();
  const toSGT = useToSGT();
  const teamName = useTeamName();
  const hasPrediction = match.prob_home != null;
  const isCompleted   = match.status === 'COMPLETED';

  const scoreOutcome = (() => {
    const score = match.most_likely_score;
    if (!score) return null;
    const [h, a] = score.split('-').map(Number);
    if (isNaN(h) || isNaN(a)) return null;
    return h > a ? 'HOME' : h < a ? 'AWAY' : 'DRAW';
  })();
  const homeLeads = scoreOutcome ? scoreOutcome === 'HOME' : hasPrediction && match.prob_home > match.prob_away;
  const awayLeads = scoreOutcome ? scoreOutcome === 'AWAY' : hasPrediction && match.prob_away > match.prob_home;

  return (
    <Link
      to={`/matches/${match.id}`}
      className="group block tang-card p-6 md:p-7 relative overflow-hidden
        hover:-translate-y-[2px] transition-all duration-300"
      style={{ textDecoration: 'none' }}
    >
      {/* Carnival rainbow top accent */}
      <div className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ background: 'linear-gradient(90deg, #E74C3C 0%, #E67E22 20%, #F1C40F 40%, #2ECC71 60%, #3498DB 80%, #9B59B6 100%)' }} />
      <QilinMark className="top-3 right-3" size={32} opacity={0.14} />

      {/* Meta row */}
      <div className="flex items-center gap-1.5 mb-5 flex-wrap">
        <span className="text-xs font-medium text-apple-secondary">
          {match.group_code ? `${t('dashboard.group')} ${match.group_code}` : match.stage}
        </span>
        <span className="text-apple-tertiary text-[10px]">·</span>
        <span className="text-xs font-medium text-apple-secondary">{formatDate(toSGTDateKey(match.scheduled_date, match.scheduled_time))}</span>
        {toSGT(match.scheduled_date, match.scheduled_time) && (
          <>
            <span className="text-apple-tertiary text-[10px]">·</span>
            <span className="text-xs text-apple-tertiary">
              {toSGT(match.scheduled_date, match.scheduled_time)}
            </span>
          </>
        )}
        {match.confidence && (
          <span className={`text-[10px] font-bold uppercase tracking-[0.03em] px-2 py-0.5 rounded-full ml-0.5
            ${CHIP_COLORS[match.confidence] || 'bg-apple-raised text-apple-secondary'}`}>
            {t(`confidence.${match.confidence}`)}
          </span>
        )}
        <span className={`text-[10px] font-bold uppercase tracking-[0.03em] px-2 py-0.5 rounded-full
          ${STATUS_CHIP[match.status] || 'bg-apple-raised text-apple-secondary'}`}
          style={match.status === 'LIVE' ? { background: 'linear-gradient(90deg, #E74C3C, #C0392B)', boxShadow: '0 0 10px rgba(231,76,60,0.35)' } : {}}>
          {t(`status.${match.status}`) || match.status}
        </span>
      </div>

      {/* Teams */}
      <div className="grid gap-4 mb-5 items-center" style={{ gridTemplateColumns: '1fr 110px 1fr' }}>
        {/* Home */}
        <div className="flex flex-col gap-1.5">
          <FlagImage teamId={match.home_team} className="w-14 md:w-20" />
          <span
            className="text-[15px] font-bold tracking-[-0.02em] text-apple-text leading-tight hover:text-cn-red hover:underline cursor-pointer"
            onClick={e => { e.preventDefault(); e.stopPropagation(); navigate(`/teams/${match.home_team}`); }}
          >
            {teamName(match.home_team, match.home_name)}
          </span>
          {hasPrediction && !isCompleted ? (
            <span className={`text-[38px] sm:text-[42px] font-extrabold leading-none tracking-[-0.05em] ${homeLeads ? '' : 'text-apple-tertiary'}`}
              style={homeLeads ? { backgroundImage: 'linear-gradient(135deg, #E74C3C, #E67E22)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } : {}}>
              {Math.round(match.prob_home * 100)}%
            </span>
          ) : isCompleted ? (
            <span className="text-[32px] font-extrabold leading-none tracking-[-0.04em] text-apple-text">
              {match.home_score}
            </span>
          ) : (
            <span className="text-[11px] text-apple-tertiary bg-apple-raised px-2 py-0.5 rounded-lg w-fit">
              {t('common.tapToPredict')}
            </span>
          )}
        </div>

        {/* Centre */}
        <div className="flex flex-col items-center gap-3">
          {match.most_likely_score && (
            <div className="text-center">
              <div className="text-[32px] font-extrabold leading-none tracking-[-0.03em] bg-clip-text text-transparent"
                style={{ backgroundImage: 'linear-gradient(135deg, #F1C40F, #E67E22, #E74C3C)' }}>
                {match.most_likely_score.replace('-', ' – ')}
              </div>
              <div className="text-[9px] font-bold uppercase tracking-[0.06em] mt-1 bg-clip-text text-transparent"
                style={{ backgroundImage: 'linear-gradient(90deg, #F1C40F, #E67E22)' }}>{t('matchDetail.predicted')}</div>
            </div>
          )}
          <div className="text-center">
            <div className={`text-[32px] font-extrabold leading-none tracking-[-0.03em]
              ${isCompleted ? 'text-cn-jade' : 'text-apple-tertiary'}`}>
              {isCompleted ? `${match.home_score} – ${match.away_score}` : '? – ?'}
            </div>
            <div className={`text-[9px] font-bold uppercase tracking-[0.06em] mt-1
              ${isCompleted ? 'text-cn-jade' : 'text-apple-tertiary'}`}>{t('predictions.actual')}</div>
          </div>
        </div>

        {/* Away */}
        <div className="flex flex-col gap-1.5 items-end">
          <FlagImage teamId={match.away_team} className="w-14 md:w-20" />
          <span
            className="text-[15px] font-bold tracking-[-0.02em] text-apple-text leading-tight text-right hover:text-cn-red hover:underline cursor-pointer"
            onClick={e => { e.preventDefault(); e.stopPropagation(); navigate(`/teams/${match.away_team}`); }}
          >
            {teamName(match.away_team, match.away_name)}
          </span>
          {hasPrediction && !isCompleted ? (
            <span className={`text-[38px] sm:text-[42px] font-extrabold leading-none tracking-[-0.05em] ${awayLeads ? '' : 'text-apple-tertiary'}`}
              style={awayLeads ? { backgroundImage: 'linear-gradient(135deg, #3498DB, #9B59B6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } : {}}>
              {Math.round(match.prob_away * 100)}%
            </span>
          ) : isCompleted ? (
            <span className="text-[32px] font-extrabold leading-none tracking-[-0.04em] text-apple-text">
              {match.away_score}
            </span>
          ) : (
            <span className="text-[11px] text-apple-tertiary bg-apple-raised px-2 py-0.5 rounded-lg w-fit">
              {t('common.tapToPredict')}
            </span>
          )}
        </div>
      </div>

      {/* Prediction bar */}
      {showPrediction && hasPrediction && !isCompleted && (
        <PredictionBar
          probHome={match.prob_home}
          probDraw={match.prob_draw}
          probAway={match.prob_away}
          homeName={teamName(match.home_team, match.home_name)}
          awayName={teamName(match.away_team, match.away_name)}
        />
      )}

      {/* Completed insight */}
      {isCompleted && match.insight && (
        <p className="text-xs text-apple-secondary border-t border-cn-gold/10 pt-3 mt-1 line-clamp-2">
          {match.insight}
        </p>
      )}
    </Link>
  );
}
