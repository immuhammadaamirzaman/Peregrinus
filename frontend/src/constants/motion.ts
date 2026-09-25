/**
 * Animation intensity preference.
 *
 * The tier is published as `data-motion` on <html>; index.css keys a handful of
 * `--motion-*` variables off it and every animation in the app is expressed in
 * terms of those. Nothing here runs per-frame — switching tiers is a single
 * attribute write, and the browser recomputes the affected animations itself.
 */

export type MotionPreference = 'off' | 'subtle' | 'expressive'

export const MOTION_PREFERENCES: {
  value: MotionPreference
  label: string
  description: string
}[] = [
  {
    value: 'off',
    label: 'None',
    description: 'No animation. Instant state changes throughout.',
  },
  {
    value: 'subtle',
    label: 'Subtle',
    description: 'Short fades and small movements. Recommended.',
  },
  {
    value: 'expressive',
    label: 'Expressive',
    description: 'Longer travel, staggered lists, and hover lift.',
  },
]

export const DEFAULT_MOTION: MotionPreference = 'subtle'

export function isMotionPreference(value: unknown): value is MotionPreference {
  return value === 'off' || value === 'subtle' || value === 'expressive'
}

/**
 * Animation utility class names, matching the `--animate-*` tokens registered
 * in index.css. Referenced through this object rather than typed as literals at
 * each call site so a renamed keyframe is a compile error, not a silent no-op.
 */
export const anim = {
  /** Opacity only. The safest default for frequently re-rendered content. */
  fade: 'animate-fade',
  /** Fade + upward travel. Standard entrance for page sections and cards. */
  rise: 'animate-rise',
  /** Fade + scale. For things that appear over the page: modals, popovers. */
  pop: 'animate-pop',
  /** Enters from the left. Sidebars, drawer content. */
  slideR: 'animate-slide-r',
  /** Enters from the right. Dropdown menus anchored right. */
  slideL: 'animate-slide-l',
  /** Looping opacity pulse for live/streaming indicators. */
  breathe: 'animate-breathe',
} as const

/** Applies an increasing animation-delay to direct children. */
export const STAGGER = 'dm-stagger'

/**
 * Opts an element out of the reduced-motion / "off" kill switch. Reserved for
 * indicators whose animation carries meaning, like a loading spinner.
 */
export const MOTION_KEEP = 'dm-motion-keep'
