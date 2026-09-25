/**
 * Throwaway check: every colour token the ThemeProvider writes at runtime must
 * correspond to a custom property the compiled CSS actually declares.
 *
 * This is the regression that mattered most — the old kebab-case conversion did
 * not split digit boundaries, so `brand50` was written as `--color-brand50`
 * while the stylesheet declared `--color-brand-50`. Nothing errored; the brand
 * colours just never changed. A name mismatch is silent, so it needs asserting.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Mirror of tokenToCssVar() in src/constants/themes.ts
const tokenToCssVar = (key) =>
  `--color-${key.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase()}`

// Pull the token keys straight out of the lightTheme colours block.
const themesSrc = readFileSync('src/constants/themes.ts', 'utf8')
const lightBlock = themesSrc.slice(
  themesSrc.indexOf('export const lightTheme'),
  themesSrc.indexOf('// ── Dark'),
)
const keys = [...lightBlock.matchAll(/^\s{4}([a-zA-Z0-9]+):\s*'#/gm)].map((m) => m[1])

// Custom properties declared by the compiled stylesheet.
const cssFile = readdirSync('dist/assets').find((f) => f.endsWith('.css'))
const css = readFileSync(join('dist/assets', cssFile), 'utf8')
const declared = new Set(
  [...css.matchAll(/(--color-[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
)

console.log(`tokens found in lightTheme: ${keys.length}`)
console.log(`--color-* declared in CSS:  ${declared.size}\n`)

const missing = []
for (const key of keys) {
  const cssVar = tokenToCssVar(key)
  if (!declared.has(cssVar)) missing.push(`${key} -> ${cssVar}`)
}

// Spot-check the exact cases the old regex got wrong.
console.log('digit-boundary cases:')
for (const k of ['brand50', 'brand100', 'brand900']) {
  console.log(`  ${k.padEnd(10)} -> ${tokenToCssVar(k)}`)
}
console.log('camelCase cases:')
for (const k of ['brandFg', 'surfaceSecondary', 'textTertiary', 'errorSoft', 'codeBg']) {
  console.log(`  ${k.padEnd(18)} -> ${tokenToCssVar(k)}`)
}

if (missing.length) {
  console.log(`\nFAIL - ${missing.length} token(s) map to undeclared variables:`)
  missing.forEach((m) => console.log('  ' + m))
  process.exit(1)
}
console.log(`\nPASS - all ${keys.length} tokens map to declared CSS variables.`)
