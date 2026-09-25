import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { authApi } from '@/api/auth'
import {
  DEFAULT_MOTION,
  isMotionPreference,
  type MotionPreference,
} from '@/constants/motion'
import {
  getAllThemes,
  getThemeByName,
  lightTheme,
  saveCustomTheme as persistCustomTheme,
  tokenToCssVar,
  withFallbacks,
  type Theme,
  type ThemeName,
} from '@/constants/themes'

/** Active theme name. */
const LS_THEME_KEY = 'app-theme'
/** Animation intensity. */
const LS_MOTION_KEY = 'app-motion'
/** Custom theme definitions, kept in sync with server preferences. */
const LS_CUSTOM_KEY = 'custom-themes'
/**
 * Resolved `--color-*` map for the active theme. Written here purely so the
 * boot script in index.html can paint the correct colours before React loads —
 * it has no access to the theme modules, so it replays this map instead.
 */
const LS_VARS_KEY = 'app-theme-vars'

/** How long the global colour cross-fade stays enabled after a theme change. */
const SWITCH_TRANSITION_MS = 260
/** Debounce before persisting preferences to the API. */
const SAVE_DEBOUNCE_MS = 400

interface ThemeContextValue {
  /** Currently active theme name. */
  theme: ThemeName
  /** Apply + persist a theme. Cross-fades the colour change. */
  setTheme: (name: ThemeName) => void
  /**
   * Apply a theme without the cross-fade or a persisted write. For the theme
   * editor's live preview, where colours change on every keystroke and both the
   * transition and the API round-trip would get in the way.
   */
  previewTheme: (name: ThemeName) => void
  /** Animation intensity. */
  motion: MotionPreference
  setMotion: (preference: MotionPreference) => void
  /** All available themes (built-in + custom). */
  allThemes: Record<string, Theme>
  /** Reload available themes (e.g. after saving a new custom theme). */
  reloadThemes: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initialised lazily from localStorage so the very first render already has
  // the right values. The previous implementation defaulted to 'light' and
  // withheld children until an effect ran, which cost a blank frame and then a
  // flash of the wrong theme.
  const [theme, setThemeState] = useState<ThemeName>(readStoredTheme)
  const [motion, setMotionState] = useState<MotionPreference>(readStoredMotion)
  const [allThemes, setAllThemes] = useState<Record<string, Theme>>(getAllThemes)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reloadThemes = useCallback(() => {
    setAllThemes(getAllThemes())
  }, [])

  /** Debounced best-effort write of the full preference snapshot. */
  const syncToServer = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const customThemes = readJson<Record<string, unknown>>(LS_CUSTOM_KEY)
      authApi
        .updatePreferences({
          theme: localStorage.getItem(LS_THEME_KEY) ?? 'light',
          motion: (localStorage.getItem(LS_MOTION_KEY) ??
            DEFAULT_MOTION) as MotionPreference,
          ...(customThemes ? { customThemes } : {}),
        })
        .catch(() => {
          // Offline or unauthenticated — localStorage remains the source of truth.
        })
    }, SAVE_DEBOUNCE_MS)
  }, [])

  /** Enable the global colour transition for one switch, then turn it back off. */
  const flashTransition = useCallback(() => {
    const root = document.documentElement
    root.setAttribute('data-theme-switching', '')
    if (switchTimerRef.current) clearTimeout(switchTimerRef.current)
    switchTimerRef.current = setTimeout(() => {
      root.removeAttribute('data-theme-switching')
    }, SWITCH_TRANSITION_MS)
  }, [])

  const previewTheme = useCallback((name: ThemeName) => {
    setThemeState(name)
    applyThemeToDom(name)
  }, [])

  const setTheme = useCallback(
    (name: ThemeName) => {
      flashTransition()
      setThemeState(name)
      applyThemeToDom(name)
      safeSet(LS_THEME_KEY, name)
      syncToServer()
    },
    [flashTransition, syncToServer],
  )

  const setMotion = useCallback(
    (preference: MotionPreference) => {
      setMotionState(preference)
      applyMotionToDom(preference)
      safeSet(LS_MOTION_KEY, preference)
      syncToServer()
    },
    [syncToServer],
  )

  // Reconcile the DOM with state on mount. The boot script has usually done
  // this already; this covers a missing/stale cache and keeps React the
  // authority afterwards.
  useEffect(() => {
    applyThemeToDom(theme)
    applyMotionToDom(motion)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pull the authoritative preferences from the server once, if signed in.
  useEffect(() => {
    let cancelled = false

    authApi
      .me()
      .then((user) => {
        if (cancelled) return
        const prefs = user.preferences ?? {}

        // Custom themes live server-side so they follow the user across
        // browsers; mirror them into localStorage where getAllThemes() looks.
        if (prefs.customThemes) {
          safeSet(LS_CUSTOM_KEY, JSON.stringify(prefs.customThemes))
          reloadThemes()
        }

        const serverTheme = prefs.theme as ThemeName | undefined
        if (serverTheme && getThemeByName(serverTheme)) {
          setThemeState(serverTheme)
          applyThemeToDom(serverTheme)
          safeSet(LS_THEME_KEY, serverTheme)
        }

        if (isMotionPreference(prefs.motion)) {
          setMotionState(prefs.motion)
          applyMotionToDom(prefs.motion)
          safeSet(LS_MOTION_KEY, prefs.motion)
        }
      })
      .catch(() => {
        // Not authenticated — the local values are correct.
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Clear pending timers on unmount so a debounced write can't fire into a
  // torn-down tree.
  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current)
    },
    [],
  )

  return (
    <ThemeContext
      value={{
        theme,
        setTheme,
        previewTheme,
        motion,
        setMotion,
        allThemes,
        reloadThemes,
      }}
    >
      {children}
    </ThemeContext>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = use(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}

/**
 * Save a custom theme locally, then push the whole custom-theme map to the
 * server so it survives across devices.
 */
export function saveCustomTheme(theme: Theme): void {
  persistCustomTheme(theme)

  const customThemes = readJson<Record<string, unknown>>(LS_CUSTOM_KEY)
  authApi
    .updatePreferences({ customThemes: customThemes ?? {} })
    .catch(() => {
      // Best-effort — already persisted locally.
    })
}

// ── DOM application ─────────────────────────────────────────────────────────

/**
 * Write a theme's tokens to <html> as inline custom properties.
 *
 * Inline styles on the root element outrank the `:root` block Tailwind emits
 * from `@theme`, so every utility that resolves through `var(--color-*)` picks
 * the new value up on the next paint. No component re-renders as a result.
 */
function applyThemeToDom(themeName: ThemeName) {
  const found = getThemeByName(themeName)
  // An unknown name (custom theme deleted on another device) must not leave the
  // UI half-themed — fall back to light rather than bailing out.
  const themeConfig = withFallbacks(found ?? lightTheme)

  const root = document.documentElement
  root.setAttribute('data-theme', found ? themeName : 'light')

  const vars: Record<string, string> = {}
  for (const [key, value] of Object.entries(themeConfig.colors)) {
    if (typeof value !== 'string') continue
    const cssVar = tokenToCssVar(key)
    root.style.setProperty(cssVar, value)
    vars[cssVar] = value
  }

  // Also mark the root as light/dark so form controls, scrollbars and any
  // `light-dark()` usage follow the theme.
  root.style.colorScheme = isDarkTheme(themeConfig) ? 'dark' : 'light'

  // Cache for the pre-paint boot script.
  safeSet(LS_VARS_KEY, JSON.stringify({ name: themeName, vars }))
}

function applyMotionToDom(preference: MotionPreference) {
  document.documentElement.setAttribute('data-motion', preference)
}

function isDarkTheme(theme: Theme): boolean {
  const canvas = theme.colors.canvas.replace('#', '')
  if (canvas.length < 6) return false
  const r = parseInt(canvas.slice(0, 2), 16)
  const g = parseInt(canvas.slice(2, 4), 16)
  const b = parseInt(canvas.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5
}

// ── Storage helpers ─────────────────────────────────────────────────────────

function readStoredTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(LS_THEME_KEY)
    return stored && getThemeByName(stored) ? stored : 'light'
  } catch {
    return 'light'
  }
}

function readStoredMotion(): MotionPreference {
  try {
    const stored = localStorage.getItem(LS_MOTION_KEY)
    return isMotionPreference(stored) ? stored : DEFAULT_MOTION
  } catch {
    return DEFAULT_MOTION
  }
}

function readJson<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private mode / quota exceeded — non-fatal, state still applies in memory.
  }
}
