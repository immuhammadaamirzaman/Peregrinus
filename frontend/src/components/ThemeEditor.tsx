import { useEffect, useRef, useState } from 'react'
import { Palette, RotateCcw, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { ColorPicker } from '@/components/ui/ColorPicker'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Reveal } from '@/components/ui/Motion'
import { useTheme, saveCustomTheme } from '@/context/ThemeContext'
import {
  deleteCustomTheme,
  getThemeByName,
  saveCustomTheme as persistCustomTheme,
  withFallbacks,
} from '@/constants/themes'
import type { Theme, ThemeColors } from '@/constants/themes'

interface ThemeEditorProps {
  /** Edit an existing theme. Omit to fork the active theme into a new one. */
  themeName?: string
  onSave?: () => void
  onCancel?: () => void
}

const COLOR_GROUPS: { name: string; hint: string; colors: (keyof ThemeColors)[] }[] = [
  {
    name: 'Brand',
    hint: 'On dark themes this ramp runs backwards: 50 is the darkest tint so that badges and active states stay readable.',
    colors: [
      'brand50',
      'brand100',
      'brand200',
      'brand300',
      'brand400',
      'brand500',
      'brand600',
      'brand700',
      'brand800',
      'brand900',
      'brandFg',
    ],
  },
  {
    name: 'Base',
    hint: 'The page background, default text colour, and the divider colour used between sections.',
    colors: ['canvas', 'ink', 'line'],
  },
  {
    name: 'Surfaces',
    hint: 'Panels, in ascending elevation. Secondary should sit between canvas and surface, not below both.',
    colors: [
      'surface',
      'surfaceSecondary',
      'surfaceRaised',
      'surfaceHover',
      'surfaceActive',
    ],
  },
  {
    name: 'Text',
    hint: 'Primary for headings and values, secondary for body copy, tertiary for timestamps and captions.',
    colors: ['textPrimary', 'textSecondary', 'textTertiary'],
  },
  {
    name: 'Borders',
    hint: 'Subtle for inputs and hovered cards, default for emphasised edges.',
    colors: ['borderSubtle', 'borderDefault'],
  },
  {
    name: 'Success',
    hint: 'Each tone is a triple: the saturated colour, a panel background, and text that is legible on it.',
    colors: ['success', 'successSoft', 'successFg'],
  },
  {
    name: 'Warning',
    hint: '',
    colors: ['warning', 'warningSoft', 'warningFg'],
  },
  {
    name: 'Error',
    hint: '',
    colors: ['error', 'errorSoft', 'errorFg'],
  },
  {
    name: 'Info',
    hint: '',
    colors: ['info', 'infoSoft', 'infoFg'],
  },
  {
    name: 'Other',
    hint: 'The scrim accepts an 8-digit hex so it can carry transparency. The console pair styles the live log output.',
    colors: ['overlay', 'codeBg', 'codeFg'],
  },
]

/** Advanced theme editor with per-token colour pickers and live preview. */
export function ThemeEditor({ themeName, onSave, onCancel }: ThemeEditorProps) {
  const { theme, previewTheme, setTheme, reloadThemes } = useTheme()
  const [confirmDelete, setConfirmDelete] = useState(false)

  // The theme that was active when the editor opened, so Cancel can restore it.
  const originalThemeRef = useRef(theme)

  const [editing, setEditing] = useState<Theme | null>(() => {
    if (themeName) {
      const existing = getThemeByName(themeName)
      if (existing) return structuredClone(withFallbacks(existing))
    }
    const current = getThemeByName(theme)
    if (!current) return null
    return {
      name: `custom-${Date.now()}`,
      label: 'My Theme',
      isCustom: true,
      colors: structuredClone(withFallbacks(current).colors),
    }
  })

  // Leaving without saving must not strand the user on a half-edited draft.
  const savedRef = useRef(false)
  useEffect(
    () => () => {
      if (!savedRef.current) previewTheme(originalThemeRef.current)
    },
    [previewTheme],
  )

  if (!editing) return null

  function handleColorChange(colorKey: keyof ThemeColors, value: string) {
    const next: Theme = {
      ...editing!,
      colors: { ...editing!.colors, [colorKey]: value },
    }
    setEditing(next)
    // Write the draft to localStorage so applyThemeToDom can resolve it, then
    // preview it. `previewTheme` deliberately skips the cross-fade and the API
    // write — this fires on every keystroke in a hex field.
    persistCustomTheme(next)
    previewTheme(next.name)
  }

  function handleSave() {
    if (!editing!.label.trim()) {
      toast.error('Give the theme a name')
      return
    }
    savedRef.current = true
    saveCustomTheme(editing!)
    setTheme(editing!.name)
    reloadThemes()
    toast.success(`Saved "${editing!.label}"`)
    onSave?.()
  }

  function handleDelete() {
    savedRef.current = true
    deleteCustomTheme(editing!.name)
    reloadThemes()
    setTheme('light')
    toast.success('Theme deleted')
    setConfirmDelete(false)
    onCancel?.()
  }

  function handleReset() {
    const original = themeName ? getThemeByName(themeName) : null
    if (!original) {
      toast.error('Nothing to reset to — this theme has not been saved yet')
      return
    }
    const restored = structuredClone(withFallbacks(original))
    setEditing(restored)
    persistCustomTheme(restored)
    previewTheme(restored.name)
  }

  return (
    <div className="space-y-5">
      <Reveal>
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-brand-600" />
                {themeName ? 'Edit theme' : 'New theme'}
              </span>
            }
            description="Changes preview live. Nothing is saved until you press Save."
          />
          <CardBody>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Theme name" htmlFor="theme-name" required>
                <Input
                  id="theme-name"
                  value={editing.label}
                  onChange={(e) =>
                    setEditing((prev) =>
                      prev ? { ...prev, label: e.target.value } : null,
                    )
                  }
                  placeholder="My Custom Theme"
                />
              </Field>
            </div>
          </CardBody>
        </Card>
      </Reveal>

      <div className="space-y-4">
        {COLOR_GROUPS.map((group) => (
          <Card key={group.name}>
            <CardHeader title={group.name} description={group.hint || undefined} />
            <CardBody>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.colors.map((colorKey) => (
                  <ColorPicker
                    key={colorKey}
                    label={colorKey}
                    value={editing.colors[colorKey]}
                    onChange={(value) => handleColorChange(colorKey, value)}
                  />
                ))}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Sticky so the actions stay reachable through a long token list. */}
      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-canvas/90 px-1 py-3 backdrop-blur">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={handleReset}
          title="Discard changes since the last save"
        >
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
        {editing.isCustom && themeName && (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        )}
        <Button onClick={handleSave}>
          <Save className="h-4 w-4" />
          Save theme
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete theme"
        message={
          <>
            Delete <strong>{editing.label}</strong>? This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  )
}
