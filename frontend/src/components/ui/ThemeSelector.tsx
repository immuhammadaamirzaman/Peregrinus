import { Check, Pencil } from 'lucide-react'

import { useTheme } from '@/context/ThemeContext'
import { withFallbacks, type Theme } from '@/constants/themes'
import { cn } from '@/lib/cn'

/**
 * A miniature of the app shell rendered in the candidate theme's own colours:
 * canvas, a surface panel, a brand accent bar and two text weights.
 *
 * This is the part the old selector was missing. Three dots showing brand600,
 * brand500 and success told you nothing about whether a theme was light or
 * dark, or whether its text would be readable — which is most of what you're
 * choosing between.
 */
function ThemePreview({ colors }: { colors: Theme['colors'] }) {
  return (
    <div
      className="pointer-events-none flex h-14 w-full gap-1 overflow-hidden rounded-md p-1.5 ring-1 ring-inset"
      style={{
        backgroundColor: colors.canvas,
        // Inline styles are correct here: these are another theme's values, not
        // the active one, so they can't come from CSS variables.
        boxShadow: `inset 0 0 0 1px ${colors.line}`,
      }}
    >
      {/* Sidebar */}
      <div
        className="flex w-1/3 flex-col justify-between rounded-sm p-1"
        style={{ backgroundColor: colors.surface }}
      >
        <div
          className="h-1.5 w-full rounded-full"
          style={{ backgroundColor: colors.brand600 }}
        />
        <div
          className="h-1 w-3/4 rounded-full"
          style={{ backgroundColor: colors.textTertiary }}
        />
      </div>
      {/* Content */}
      <div
        className="flex flex-1 flex-col gap-1 rounded-sm p-1"
        style={{ backgroundColor: colors.surface }}
      >
        <div
          className="h-1.5 w-2/3 rounded-full"
          style={{ backgroundColor: colors.textPrimary }}
        />
        <div
          className="h-1 w-full rounded-full"
          style={{ backgroundColor: colors.textSecondary }}
        />
        <div className="mt-auto flex gap-1">
          <div
            className="h-2 w-5 rounded-sm"
            style={{ backgroundColor: colors.brand600 }}
          />
          <div
            className="h-2 w-3 rounded-sm"
            style={{ backgroundColor: colors.success }}
          />
          <div
            className="h-2 w-3 rounded-sm"
            style={{ backgroundColor: colors.error }}
          />
        </div>
      </div>
    </div>
  )
}

/** Clicking a theme applies and saves it immediately. */
export function ThemeSelector({
  onEditTheme,
}: {
  /** Opens the theme editor for a custom theme. */
  onEditTheme?: (themeName: string) => void
}) {
  const { theme, setTheme, allThemes } = useTheme()
  const themeList = Object.values(allThemes)

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-ink">Theme</h3>
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        role="radiogroup"
        aria-label="Theme"
      >
        {themeList.map((raw) => {
          // Custom themes saved before a token existed would render an
          // incomplete preview otherwise.
          const t = withFallbacks(raw)
          const active = theme === t.name
          return (
            <div key={t.name} className="relative">
              <button
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(t.name)}
                className={cn(
                  'dm-tile w-full rounded-lg border-2 p-2 text-left',
                  active
                    ? 'border-brand-600 bg-brand-50'
                    : 'border-line bg-surface hover:border-brand-300',
                )}
              >
                <ThemePreview colors={t.colors} />
                <div className="mt-2 flex items-center justify-between gap-2 px-0.5">
                  <span
                    className={cn(
                      'truncate text-sm font-medium',
                      active ? 'text-brand-700' : 'text-ink',
                    )}
                  >
                    {t.label}
                  </span>
                  {active && (
                    <Check
                      className="animate-pop h-4 w-4 shrink-0 text-brand-600"
                      aria-hidden
                    />
                  )}
                </div>
              </button>

              {t.isCustom && onEditTheme && (
                <button
                  type="button"
                  onClick={() => onEditTheme(t.name)}
                  // Explicit hover utilities: the translucent background needed
                  // over the preview would otherwise outrank the ghost hover.
                  className="dm-btn absolute right-3 top-3 rounded-md bg-surface/80 p-1 text-muted backdrop-blur hover:bg-surface hover:text-ink"
                  aria-label={`Edit ${t.label}`}
                  title={`Edit ${t.label}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
