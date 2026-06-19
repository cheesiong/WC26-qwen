import { getFlagUrl } from '../utils/flag';

const SIZE_CLASS = {
  xs:   'w-5',
  sm:   'w-6',
  md:   'w-10',
  lg:   'w-20',
  xl:   'w-32 md:w-40',
  hero: 'w-48 md:w-64',
};

const SIZE_PX = {
  xs: 80, sm: 80, md: 120, lg: 160, xl: 240, hero: 320,
};

export default function FlagImage({ teamId, className = '', alt, size }) {
  const px = size ? SIZE_PX[size] : 160;
  const src = getFlagUrl(teamId, px);
  if (!src) return null;
  const sizeClass = size ? SIZE_CLASS[size] : '';
  return (
    <img
      src={src}
      alt={alt || teamId}
      className={`aspect-[3/2] rounded-[4px] object-cover shadow-[0_2px_8px_rgba(0,0,0,0.22)] ring-1 ring-black/[0.06] ${sizeClass} ${className}`}
      loading="lazy"
      onError={e => { e.currentTarget.style.display = 'none'; }}
    />
  );
}
