/** Live motion preference. With prefers-reduced-motion, intensity drops and flashes stop. */
export interface MotionPreference {
  readonly reduced: boolean;
  /** 0..1 multiplier for movement and brightness swings. */
  readonly intensity: number;
}

export function watchMotionPreference(): MotionPreference {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pref = { reduced: false, intensity: 1 };
  const apply = () => {
    pref.reduced = mq.matches;
    pref.intensity = mq.matches ? 0.35 : 1;
  };
  apply();
  mq.addEventListener('change', apply);
  return pref;
}
