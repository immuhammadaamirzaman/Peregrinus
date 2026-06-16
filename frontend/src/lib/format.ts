/** Small, dependency-free formatting helpers used across the UI. */

/** Locale date-time, e.g. "Jun 16, 2026, 3:04 PM". Returns "—" for null. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Compact relative time, e.g. "3m ago", "2h ago", "just now". */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const secs = Math.round((Date.now() - then) / 1000)
  if (secs < 45) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDateTime(iso)
}

/** Thousands-separated integer, e.g. 1234567 → "1,234,567". */
export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '0'
  return n.toLocaleString()
}

/** Duration between two ISO timestamps (or to now), e.g. "1m 12s". */
export function formatDuration(
  startIso: string | null | undefined,
  endIso?: string | null,
): string {
  if (!startIso) return '—'
  const start = new Date(startIso).getTime()
  const end = endIso ? new Date(endIso).getTime() : Date.now()
  if (Number.isNaN(start) || Number.isNaN(end)) return '—'
  let secs = Math.max(0, Math.round((end - start) / 1000))
  const h = Math.floor(secs / 3600)
  secs -= h * 3600
  const m = Math.floor(secs / 60)
  secs -= m * 60
  const parts: string[] = []
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  parts.push(`${secs}s`)
  return parts.join(' ')
}

/** Progress percentage (0–100, clamped), guarding against zero totals. */
export function progressPct(processed: number, total: number): number {
  if (!total || total <= 0) return 0
  return Math.min(100, Math.round((processed / total) * 100))
}
