import type { FilterCondition, FilterOp } from '@/types/api'

/** Operators whose `value` must be a list (mirrors backend FilterCondition). */
export const LIST_OPS: FilterOp[] = ['in', 'nin']

/** Best-effort coercion of a raw string token into number / boolean / string. */
function coerceScalar(raw: string): unknown {
  const t = raw.trim()
  if (t === '') return ''
  if (t === 'true') return true
  if (t === 'false') return false
  if (t === 'null') return null
  // Numeric (int or float), but not things like "01" phone-ish — keep simple.
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
  return raw
}

/**
 * Build a wire-ready FilterCondition from a UI row. For list operators the
 * raw text is split on commas; otherwise it is coerced to a single scalar.
 */
export function toFilterCondition(row: {
  column: string
  op: FilterOp
  value: string
}): FilterCondition {
  const value = LIST_OPS.includes(row.op)
    ? row.value
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map(coerceScalar)
    : coerceScalar(row.value)
  return { column: row.column.trim(), op: row.op, value }
}
