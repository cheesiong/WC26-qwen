let _fired = false;

export function celebrate(opts = {}) {
  if (typeof window === 'undefined') return;
  if (_fired) return;
  _fired = true;

  import('canvas-confetti').then(({ default: confetti }) => {
    confetti({
      particleCount: opts.particleCount ?? 120,
      spread: opts.spread ?? 70,
      origin: opts.origin ?? { y: 0.55 },
      colors: opts.colors ?? ['#FFB703', '#FB6A3C', '#1D4ED8', '#0F7B3C', '#E63946'],
      startVelocity: opts.startVelocity ?? 35,
      ticks: opts.ticks ?? 80,
      gravity: opts.gravity ?? 0.9,
      scalar: opts.scalar ?? 1.1,
      zIndex: 9999,
    });
  });
}

export function resetCelebrate() {
  _fired = false;
}
