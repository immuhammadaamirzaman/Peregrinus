import { useState } from 'react'
import { Check, Play } from 'lucide-react'

import { MOTION_PREFERENCES } from '@/constants/motion'
import { useTheme } from '@/context/ThemeContext'
import { cn } from '@/lib/cn'

/**
 * Animation intensity picker.
 *
 * "Replay" remounts the sample tiles by bumping a key, which restarts their
 * entrance animation so the choice can be felt rather than guessed at. Cheap:
 * three elements, one-shot, and the animation itself is CSS.
 */
export function MotionSelector() {
  const { motion, setMotion } = useTheme()
  const [replayKey, setReplayKey] = useState(0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-ink">Animation</h3>
        <button
          type="button"
          onClick={() => setReplayKey((k) => k + 1)}
          className="dm-btn dm-btn-ghost inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium"
        >
          <Play className="h-3 w-3" />
          Replay
        </button>
      </div>

      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        role="radiogroup"
        aria-label="Animation intensity"
      >
        {MOTION_PREFERENCES.map((option) => {
          const active = motion === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setMotion(option.value)}
              className={cn(
                'dm-tile rounded-lg border-2 p-3 text-left',
                active
                  ? 'border-brand-600 bg-brand-50'
                  : 'border-line bg-surface hover:border-brand-300',
              )}
            >
              {/* The sample inherits whichever tier is currently active, so
                  selecting an option immediately changes how this looks. */}
              <div
                key={replayKey}
                className="dm-stagger [&>*]:animate-rise mb-3 flex h-10 items-end gap-1"
                aria-hidden
              >
                <span className="h-4 w-full rounded-sm bg-brand-300" />
                <span className="h-7 w-full rounded-sm bg-brand-500" />
                <span className="h-10 w-full rounded-sm bg-brand-600" />
              </div>

              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    'text-sm font-medium',
                    active ? 'text-brand-700' : 'text-ink',
                  )}
                >
                  {option.label}
                </span>
                {active && (
                  <Check
                    className="animate-pop h-4 w-4 shrink-0 text-brand-600"
                    aria-hidden
                  />
                )}
              </div>
              <p className="mt-1 text-xs text-muted">{option.description}</p>
            </button>
          )
        })}
      </div>

      <p className="text-xs text-faint">
        If your system requests reduced motion, animations stay off regardless of
        this setting.
      </p>
    </div>
  )
}
