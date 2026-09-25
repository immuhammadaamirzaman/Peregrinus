/**
 * Theme configuration system.
 *
 * A theme is a flat map of colour tokens. `ThemeContext` writes each one to
 * `<html>` as an inline custom property (`brand50` → `--color-brand-50`), where
 * it overrides the `:root` defaults that Tailwind emits from the `@theme` block
 * in index.css. Because every Tailwind colour utility resolves through those
 * variables, changing a theme recolours the whole app without re-rendering.
 *
 * Adding a token here means adding it to `@theme` in index.css too, otherwise
 * there is no Tailwind utility for it (inline `var()` usage still works).
 */

export type ThemeName = 'light' | 'dark' | 'high-contrast' | 'sepia' | string

export interface ThemeColors {
  // ── Brand ramp ─────────────────────────────────────────────────────────
  // Light themes run pale (50) → deep (900). Dark themes invert the ramp so
  // that the `bg-brand-50` + `text-brand-700` pairing the UI leans on stays
  // legible instead of punching a bright hole in a dark panel.
  brand50: string
  brand100: string
  brand200: string
  brand300: string
  brand400: string
  brand500: string
  brand600: string
  brand700: string
  brand800: string
  brand900: string
  /** Text/icon colour on a brand-600 fill. Not always white — see dark/sepia. */
  brandFg: string

  // ── Base ───────────────────────────────────────────────────────────────
  canvas: string
  ink: string
  line: string

  // ── Surfaces, lowest to highest elevation ──────────────────────────────
  surface: string
  surfaceSecondary: string
  surfaceRaised: string
  surfaceHover: string
  surfaceActive: string

  // ── Text ───────────────────────────────────────────────────────────────
  textPrimary: string
  textSecondary: string
  textTertiary: string

  // ── Borders ────────────────────────────────────────────────────────────
  borderSubtle: string
  borderDefault: string

  // ── Semantic tones ─────────────────────────────────────────────────────
  // Each tone is a triple: the saturated colour, a tinted panel background,
  // and a foreground that is legible on that background.
  success: string
  successSoft: string
  successFg: string

  warning: string
  warningSoft: string
  warningFg: string

  error: string
  errorSoft: string
  errorFg: string

  info: string
  infoSoft: string
  infoFg: string

  // ── Misc ───────────────────────────────────────────────────────────────
  /** Modal scrim. 8-digit hex so alpha is part of the theme. */
  overlay: string
  /** Log console background/foreground. */
  codeBg: string
  codeFg: string
}

export interface Theme {
  name: ThemeName
  label: string
  colors: ThemeColors
  isCustom?: boolean
}

// ── Light ─────────────────────────────────────────────────────────────────
export const lightTheme: Theme = {
  name: 'light',
  label: 'Light',
  isCustom: false,
  colors: {
    brand50: '#eef2ff',
    brand100: '#e0e7ff',
    brand200: '#c7d2fe',
    brand300: '#a5b4fc',
    brand400: '#818cf8',
    brand500: '#6366f1',
    brand600: '#4f46e5',
    brand700: '#4338ca',
    brand800: '#3730a3',
    brand900: '#312e81',
    brandFg: '#ffffff',

    canvas: '#f6f7fb',
    ink: '#0f172a',
    line: '#e4e9f0',

    surface: '#ffffff',
    surfaceSecondary: '#f8fafc',
    surfaceRaised: '#ffffff',
    surfaceHover: '#f1f5f9',
    surfaceActive: '#e2e8f0',

    textPrimary: '#0f172a',
    textSecondary: '#475569',
    // Nudged darker than the old #94a3b8, which failed contrast on white.
    textTertiary: '#8494a8',

    borderSubtle: '#cbd5e1',
    borderDefault: '#94a3b8',

    success: '#059669',
    successSoft: '#ecfdf5',
    successFg: '#046c4e',

    warning: '#d97706',
    warningSoft: '#fffbeb',
    warningFg: '#92400e',

    error: '#dc2626',
    errorSoft: '#fef2f2',
    errorFg: '#b42318',

    info: '#2563eb',
    infoSoft: '#eff6ff',
    infoFg: '#1d4ed8',

    overlay: '#0f172a73',
    codeBg: '#0b1220',
    codeFg: '#cbd5e1',
  },
}

// ── Dark ──────────────────────────────────────────────────────────────────
// Rebuilt around a single coherent slate ramp. The previous version mixed
// three unrelated blues (canvas #0f172a, surface #1a1f35, surfaceSecondary
// #0f1419) which is what made it look muddy — surfaceSecondary was *darker*
// than the canvas, so "secondary" panels read as holes.
export const darkTheme: Theme = {
  name: 'dark',
  label: 'Dark',
  isCustom: false,
  colors: {
    // Inverted ramp: 50 is the darkest violet tint, 900 the palest.
    brand50: '#1e1b4b',
    brand100: '#2a2263',
    brand200: '#3b2f8a',
    brand300: '#5b4bc4',
    brand400: '#7c6df0',
    brand500: '#8b5cf6',
    brand600: '#9575ff',
    brand700: '#b39dff',
    brand800: '#cdbfff',
    brand900: '#e7deff',
    // brand600 is a light violet here, so white text on it would smear.
    brandFg: '#17102e',

    canvas: '#0b1120',
    ink: '#e8eef7',
    line: '#212c40',

    surface: '#121a2a',
    surfaceSecondary: '#0e1523',
    surfaceRaised: '#182234',
    surfaceHover: '#1b2437',
    surfaceActive: '#243049',

    textPrimary: '#e8eef7',
    textSecondary: '#a9b6c9',
    textTertiary: '#6d7d94',

    borderSubtle: '#2c3a52',
    borderDefault: '#405070',

    success: '#34d399',
    successSoft: '#0c2a22',
    successFg: '#6ee7b7',

    warning: '#fbbf24',
    warningSoft: '#2b2008',
    warningFg: '#fcd34d',

    error: '#f87171',
    errorSoft: '#2d1414',
    errorFg: '#fca5a5',

    info: '#60a5fa',
    infoSoft: '#10233d',
    infoFg: '#93c5fd',

    overlay: '#000000a6',
    codeBg: '#080d17',
    codeFg: '#c7d2e0',
  },
}

// ── High contrast ─────────────────────────────────────────────────────────
// Targets WCAG AAA body text. Borders are pure black so every boundary is
// unambiguous; the old version's #666 tertiary text undercut the whole point.
export const highContrastTheme: Theme = {
  name: 'high-contrast',
  label: 'High Contrast',
  isCustom: false,
  colors: {
    brand50: '#e8e8ff',
    brand100: '#d0d0ff',
    brand200: '#b0b0ff',
    brand300: '#8080ff',
    brand400: '#5555ee',
    brand500: '#2222dd',
    brand600: '#0000cc',
    brand700: '#000099',
    brand800: '#000077',
    brand900: '#000055',
    brandFg: '#ffffff',

    canvas: '#ffffff',
    ink: '#000000',
    line: '#000000',

    surface: '#ffffff',
    surfaceSecondary: '#f2f2f2',
    surfaceRaised: '#ffffff',
    surfaceHover: '#e8e8e8',
    surfaceActive: '#d0d0d0',

    textPrimary: '#000000',
    textSecondary: '#1a1a1a',
    textTertiary: '#3d3d3d',

    borderSubtle: '#000000',
    borderDefault: '#000000',

    success: '#006b00',
    successSoft: '#e0f5e0',
    successFg: '#004d00',

    warning: '#8a4b00',
    warningSoft: '#fff0dd',
    warningFg: '#6b3a00',

    error: '#b00000',
    errorSoft: '#ffe8e8',
    errorFg: '#8a0000',

    info: '#0000cc',
    infoSoft: '#e6e6ff',
    infoFg: '#000099',

    overlay: '#000000bf',
    codeBg: '#000000',
    codeFg: '#ffffff',
  },
}

// ── Sepia ─────────────────────────────────────────────────────────────────
// Warm paper. The old palette jumped from yellow (#f9e79f) to burnt orange
// (#ba4a00) mid-ramp, so brand colours clashed with each other; this is a
// single continuous amber→umber ramp.
export const sepiaTheme: Theme = {
  name: 'sepia',
  label: 'Sepia',
  isCustom: false,
  colors: {
    brand50: '#f7ead3',
    brand100: '#f0dcb8',
    brand200: '#e4c48c',
    brand300: '#d4a55c',
    brand400: '#c08740',
    brand500: '#a86d2c',
    brand600: '#8f5720',
    brand700: '#74441a',
    brand800: '#5a3414',
    brand900: '#42260f',
    brandFg: '#fffaf0',

    canvas: '#f4ecdf',
    ink: '#2f2013',
    line: '#ddcdb4',

    surface: '#fdf8f0',
    surfaceSecondary: '#f7f0e4',
    surfaceRaised: '#fffdf8',
    surfaceHover: '#efe5d5',
    surfaceActive: '#e3d5bf',

    textPrimary: '#2f2013',
    textSecondary: '#5d4632',
    textTertiary: '#8a7255',

    borderSubtle: '#cbb79a',
    borderDefault: '#a88f6c',

    success: '#2f7d48',
    successSoft: '#e7f1e3',
    successFg: '#245c37',

    warning: '#9a6414',
    warningSoft: '#f9edd4',
    warningFg: '#794f10',

    error: '#a8392b',
    errorSoft: '#f7e3df',
    errorFg: '#862c21',

    info: '#4a5f9e',
    infoSoft: '#e6eaf5',
    infoFg: '#39497b',

    overlay: '#2f2013a6',
    codeBg: '#2b1d12',
    codeFg: '#e8dcc8',
  },
}

export const builtInThemes: Record<string, Theme> = {
  light: lightTheme,
  dark: darkTheme,
  'high-contrast': highContrastTheme,
  sepia: sepiaTheme,
}

export const themeList = Object.values(builtInThemes)

/** Ordered token keys, grouped for the theme editor UI. */
export const THEME_COLOR_KEYS = Object.keys(lightTheme.colors) as (keyof ThemeColors)[]

/**
 * camelCase token key → CSS custom property name.
 *
 * The digit boundary matters: the previous implementation only split on
 * uppercase letters, so `brand50` became `--color-brand50` while index.css
 * declared `--color-brand-50`. Every brand shade silently failed to apply,
 * which is why switching themes never changed the accent colour.
 */
export function tokenToCssVar(key: string): string {
  const kebab = key.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase()
  return `--color-${kebab}`
}

/**
 * Fill in any tokens a theme is missing, using the built-in theme closest in
 * lightness as the donor. Custom themes saved before a token existed would
 * otherwise leave that variable stuck on whatever the previous theme set.
 */
export function withFallbacks(theme: Theme): Theme {
  const donor = isDarkish(theme) ? darkTheme : lightTheme
  return {
    ...theme,
    colors: { ...donor.colors, ...theme.colors },
  }
}

/** Rough light/dark classification from the canvas colour's luminance. */
export function isDarkish(theme: Theme): boolean {
  const canvas = theme.colors?.canvas
  if (!canvas) return false
  return relativeLuminance(canvas) < 0.5
}

function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '')
  if (clean.length < 6) return 1
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

// ── Custom theme persistence (localStorage) ───────────────────────────────

const LS_CUSTOM_KEY = 'custom-themes'

function readCustomThemes(): Record<string, Theme> {
  try {
    const raw = localStorage.getItem(LS_CUSTOM_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    // Guard against a corrupted entry taking the whole selector down.
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeCustomThemes(themes: Record<string, Theme>): void {
  try {
    localStorage.setItem(LS_CUSTOM_KEY, JSON.stringify(themes))
  } catch {
    // Storage full or blocked — the in-memory theme still applies.
  }
}

/** Load all themes including custom ones from localStorage. */
export function getAllThemes(): Record<string, Theme> {
  return { ...builtInThemes, ...readCustomThemes() }
}

/** Save a custom theme to localStorage. */
export function saveCustomTheme(theme: Theme): void {
  const customThemes = readCustomThemes()
  customThemes[theme.name] = theme
  writeCustomThemes(customThemes)
}

/** Delete a custom theme from localStorage. */
export function deleteCustomTheme(themeName: string): void {
  const customThemes = readCustomThemes()
  delete customThemes[themeName]
  writeCustomThemes(customThemes)
}

/** Get a theme by name, including custom themes. */
export function getThemeByName(name: string): Theme | undefined {
  return getAllThemes()[name]
}
