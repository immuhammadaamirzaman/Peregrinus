import type { ElementType, HTMLAttributes, ReactNode } from 'react'

import { anim, STAGGER } from '@/constants/motion'
import { cn } from '@/lib/cn'

type Variant = keyof typeof anim

/**
 * Child-targeting variants for `<Stagger>`.
 *
 * Spelled out as complete literals rather than built as `'[&>*]:' + anim[v]`.
 * Tailwind discovers utilities by scanning source text for candidate strings,
 * so a concatenated class name is never generated and silently does nothing.
 */
const CHILD_ANIM: Record<Variant, string> = {
  fade: '[&>*]:animate-fade',
  rise: '[&>*]:animate-rise',
  pop: '[&>*]:animate-pop',
  slideR: '[&>*]:animate-slide-r',
  slideL: '[&>*]:animate-slide-l',
  breathe: '[&>*]:animate-breathe',
}

interface RevealProps extends HTMLAttributes<HTMLElement> {
  /** Entrance style. Defaults to `rise` (fade + small upward travel). */
  variant?: Variant
  /** Render as a different element, e.g. `section` or `li`. */
  as?: ElementType
  children: ReactNode
}

/**
 * Plays a one-shot entrance animation when mounted.
 *
 * Intentionally just a class on an element: the animation runs entirely in the
 * browser's compositor, with no React state, no timers and no per-frame work.
 * Duration and travel come from the `--motion-*` tier variables, so the user's
 * animation preference already applies and `prefers-reduced-motion` is honoured
 * by the global opt-out in index.css.
 *
 * Because it is keyed on mount, avoid wrapping content that re-mounts on every
 * data tick (live log lines, streaming counters) — it would re-animate on each
 * update and the movement becomes noise.
 */
export function Reveal({
  variant = 'rise',
  as,
  className,
  children,
  ...props
}: RevealProps) {
  const Tag = (as ?? 'div') as ElementType
  return (
    <Tag className={cn(anim[variant], className)} {...props}>
      {children}
    </Tag>
  )
}

interface StaggerProps extends HTMLAttributes<HTMLElement> {
  /** Entrance style applied to each direct child. */
  variant?: Variant
  as?: ElementType
  children: ReactNode
}

/**
 * Animates direct children in sequence.
 *
 * The per-child delay is pure CSS (`nth-child` rules in index.css), so adding
 * items costs nothing at runtime and the sequence flattens automatically when
 * the motion tier sets `--motion-stagger` to 0. Delays stop growing after the
 * twelfth child so long lists don't develop a slow tail.
 */
export function Stagger({
  variant = 'rise',
  as,
  className,
  children,
  ...props
}: StaggerProps) {
  const Tag = (as ?? 'div') as ElementType
  return (
    <Tag className={cn(STAGGER, CHILD_ANIM[variant], className)} {...props}>
      {children}
    </Tag>
  )
}
