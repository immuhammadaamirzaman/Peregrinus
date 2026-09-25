import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/cn'

export interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  label?: string
  className?: string
}

/** Friendly labels for the camelCase token keys. */
const LABEL_MAP: Record<string, string> = {
  brand50: 'Brand 50 — palest tint',
  brand100: 'Brand 100',
  brand200: 'Brand 200',
  brand300: 'Brand 300',
  brand400: 'Brand 400',
  brand500: 'Brand 500',
  brand600: 'Brand 600 — primary',
  brand700: 'Brand 700',
  brand800: 'Brand 800',
  brand900: 'Brand 900 — deepest',
  brandFg: 'Brand foreground',
  canvas: 'Canvas',
  ink: 'Ink (text)',
  line: 'Line / divider',
  surface: 'Surface',
  surfaceSecondary: 'Surface secondary',
  surfaceRaised: 'Surface raised',
  surfaceHover: 'Surface hover',
  surfaceActive: 'Surface active',
  textPrimary: 'Text primary',
  textSecondary: 'Text secondary',
  textTertiary: 'Text tertiary',
  borderSubtle: 'Border subtle',
  borderDefault: 'Border default',
  success: 'Success',
  successSoft: 'Success background',
  successFg: 'Success foreground',
  warning: 'Warning',
  warningSoft: 'Warning background',
  warningFg: 'Warning foreground',
  error: 'Error',
  errorSoft: 'Error background',
  errorFg: 'Error foreground',
  info: 'Info',
  infoSoft: 'Info background',
  infoFg: 'Info foreground',
  overlay: 'Modal scrim',
  codeBg: 'Console background',
  codeFg: 'Console text',
}

/** Black or white, whichever reads better on the given hex. */
function contrastColor(hex: string): string {
  const clean = hex.replace('#', '')
  if (clean.length < 6) return '#000000'
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.5 ? '#000000' : '#ffffff'
}

/**
 * Expand shorthand (#abc → #aabbcc) and uppercase, preserving an 8-digit alpha
 * hex — the `overlay` token needs its alpha channel to survive an edit.
 */
function normalizeHex(raw: string): string {
  let hex = raw.replace(/[^0-9a-fA-F#]/g, '')
  if (!hex.startsWith('#')) hex = '#' + hex
  if (hex.length === 4) {
    hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
  }
  return hex.toUpperCase()
}

const VALID_HEX = /^#(?:[0-9A-F]{6}|[0-9A-F]{8})$/i

const PALETTE = [
  // Greys
  '#F8FAFC', '#E2E8F0', '#94A3B8', '#475569', '#1E293B', '#0F172A',
  // Brand blues / violets
  '#EEF2FF', '#A5B4FC', '#6366F1', '#4F46E5', '#4338CA', '#312E81',
  // Greens
  '#ECFDF5', '#6EE7B7', '#10B981', '#059669', '#065F46', '#0C2A22',
  // Yellows / ambers
  '#FFFBEB', '#FCD34D', '#F59E0B', '#D97706', '#92400E', '#2B2008',
  // Reds
  '#FEF2F2', '#FCA5A5', '#EF4444', '#DC2626', '#7F1D1D', '#2D1414',
  // Extremes
  '#000000', '#FFFFFF', '#0B1120', '#121A2A', '#F4ECDF', '#2F2013',
]

export function ColorPicker({ value, onChange, label, className }: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const [hex, setHex] = useState(value)
  const [copied, setCopied] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const nativeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setHex(value)
  }, [value])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const commit = (raw: string) => {
    const normalized = normalizeHex(raw)
    setHex(normalized)
    if (VALID_HEX.test(normalized)) onChange(normalized)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(
      () => {
        setCopied(true)
        toast.success('Copied')
        setTimeout(() => setCopied(false), 1500)
      },
      () => toast.error('Could not copy to clipboard'),
    )
  }

  const friendlyLabel = label ? (LABEL_MAP[label] ?? label) : undefined
  const contrast = contrastColor(value)

  return (
    <div className={cn('space-y-1', className)}>
      {friendlyLabel && (
        <label className="block text-xs font-medium text-muted">
          {friendlyLabel}
        </label>
      )}

      <div className="relative" ref={containerRef}>
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface p-2 transition-shadow duration-(--motion-fast) hover:shadow-soft">
          {/* Swatch — opens the palette. */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="dm-tile relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2"
            style={{
              backgroundColor: value,
              borderColor: open ? 'var(--color-brand-600)' : 'var(--color-line)',
            }}
            aria-expanded={open}
            aria-label="Choose colour"
          >
            {open && <Check size={14} strokeWidth={3} style={{ color: contrast }} />}
          </button>

          <input
            type="text"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commit(hex)}
            className="min-w-0 flex-1 bg-transparent font-mono text-sm text-ink focus:outline-none"
            spellCheck={false}
            aria-label="Hex value"
          />

          <button
            type="button"
            onClick={handleCopy}
            className="dm-btn dm-btn-ghost flex h-6 w-6 shrink-0 items-center justify-center rounded"
            title="Copy hex"
            aria-label="Copy hex"
          >
            {copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} />}
          </button>

          {/* Hidden native input, opened by the OS button below. */}
          <input
            ref={nativeRef}
            type="color"
            value={value.slice(0, 7).toLowerCase()}
            onChange={(e) => commit(e.target.value)}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
          />
          <button
            type="button"
            onClick={() => nativeRef.current?.click()}
            className="dm-btn dm-btn-outline shrink-0 rounded px-1.5 py-0.5 text-xs"
            title="Open the system colour dialog"
          >
            OS
          </button>
        </div>

        {open && (
          <div className="animate-pop absolute left-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-line bg-surface-raised p-3 shadow-overlay">
            <div
              className="mb-3 flex items-center justify-between rounded-lg px-3 py-2"
              style={{ backgroundColor: value }}
            >
              <span
                className="font-mono text-sm font-semibold"
                style={{ color: contrast }}
              >
                {value.toUpperCase()}
              </span>
              <span className="text-xs opacity-70" style={{ color: contrast }}>
                Selected
              </span>
            </div>

            <div className="grid grid-cols-6 gap-1.5">
              {PALETTE.map((c) => {
                const isSelected = value.toUpperCase() === c.toUpperCase()
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      commit(c)
                      setOpen(false)
                    }}
                    className="dm-tile relative h-8 w-8 rounded-md border-2"
                    style={{
                      backgroundColor: c,
                      borderColor: isSelected
                        ? 'var(--color-brand-600)'
                        : c === '#FFFFFF'
                          ? 'var(--color-line)'
                          : 'transparent',
                    }}
                    title={c}
                    aria-label={c}
                  >
                    {isSelected && (
                      <Check
                        size={12}
                        strokeWidth={3}
                        className="absolute inset-0 m-auto"
                        style={{ color: contrastColor(c) }}
                      />
                    )}
                  </button>
                )
              })}
            </div>

            <p className="mt-2 text-center text-xs text-faint">
              Use OS for the full picker
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
