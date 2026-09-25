import { useState } from 'react'
import { ArrowLeft, Palette, Plus } from 'lucide-react'

import { ThemeSelector } from '@/components/ui/ThemeSelector'
import { MotionSelector } from '@/components/ui/MotionSelector'
import { ThemeEditor } from '@/components/ThemeEditor'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Reveal } from '@/components/ui/Motion'
import { PageHeader } from '@/components/layout/PageHeader'
import { useAuth } from '@/auth/AuthContext'

/** `null` = editor closed, `undefined` = creating a new theme. */
type EditorTarget = string | undefined | null

export function SettingsPage() {
  const { user } = useAuth()
  const [editorTarget, setEditorTarget] = useState<EditorTarget>(null)

  if (editorTarget !== null) {
    return (
      <>
        <PageHeader
          title={
            <span className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-brand-600" />
              {editorTarget ? 'Edit theme' : 'Create theme'}
            </span>
          }
          description="Every colour in the app comes from these tokens."
          actions={
            <Button variant="outline" onClick={() => setEditorTarget(null)}>
              <ArrowLeft className="h-4 w-4" />
              Back to settings
            </Button>
          }
        />
        {/* Keyed so switching which theme is being edited rebuilds the editor
            state instead of holding the previous theme's draft. */}
        <ThemeEditor
          key={editorTarget ?? 'new'}
          themeName={editorTarget}
          onCancel={() => setEditorTarget(null)}
          onSave={() => setEditorTarget(null)}
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Customise how DataMovers looks and moves."
      />

      <div className="space-y-5">
        <Reveal>
          <Card>
            <CardHeader
              title="Appearance"
              description="Click a theme to apply it instantly. Changes are saved to your account."
            />
            <CardBody className="space-y-5">
              <ThemeSelector onEditTheme={(name) => setEditorTarget(name)} />
              <div className="border-t border-line pt-5">
                <Button variant="secondary" onClick={() => setEditorTarget(undefined)}>
                  <Plus className="h-4 w-4" />
                  Create custom theme
                </Button>
                <p className="mt-2 text-xs text-faint">
                  Starts from the theme you have applied now. Hover a custom theme
                  above to edit it later.
                </p>
              </div>
            </CardBody>
          </Card>
        </Reveal>

        <Reveal>
          <Card>
            <CardHeader
              title="Motion"
              description="How much the interface animates. Lower settings do less work per frame."
            />
            <CardBody>
              <MotionSelector />
            </CardBody>
          </Card>
        </Reveal>

        <Reveal>
          <Card>
            <CardHeader title="Account" description="Your account information." />
            <CardBody>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-faint">
                    Email
                  </dt>
                  <dd className="mt-1 truncate text-sm text-ink">{user?.email}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-faint">
                    Role
                  </dt>
                  <dd className="mt-1 text-sm capitalize text-ink">{user?.role}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>
        </Reveal>
      </div>
    </>
  )
}
