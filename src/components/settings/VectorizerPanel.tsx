/**
 * VectorizerPanel — config for the optional SVG API route.
 *
 * Local SVG export has no settings. Vectorizer.AI needs an API Id plus a
 * write-only API Secret stored through Rust in the system keychain.
 */
import { useEffect, useState } from 'react'
import { CloudCog, Eye, EyeOff, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  useDeleteVectorizerApiKey,
  useSetVectorizerApiId,
  useSetVectorizerApiKey,
  useSetVectorizerApiMode,
  useVectorizePrefs,
  useVectorizerKeyStatus,
  vectorizePrefsOrDefault,
} from '@/hooks/queries/vectorize'
import type { VectorizePreferences } from '@/services/vectorize-prefs.local'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export function VectorizerPanel() {
  const { t } = useLingui()
  const prefsQuery = useVectorizePrefs()
  const prefs = vectorizePrefsOrDefault(prefsQuery.data)
  const [apiId, setApiId] = useState(prefs.apiId)
  const [secret, setSecret] = useState('')
  const [reveal, setReveal] = useState(false)

  const status = useVectorizerKeyStatus(apiId)
  const saveApiId = useSetVectorizerApiId()
  const saveMode = useSetVectorizerApiMode()
  const saveSecret = useSetVectorizerApiKey()
  const deleteSecret = useDeleteVectorizerApiKey()

  useEffect(() => {
    setApiId(prefs.apiId)
  }, [prefs.apiId])

  const busy =
    saveApiId.isPending ||
    saveMode.isPending ||
    saveSecret.isPending ||
    deleteSecret.isPending
  const trimmedApiId = apiId.trim()
  const hasKey = status.data === true

  async function onSaveApiId() {
    try {
      await saveApiId.mutateAsync(trimmedApiId)
      toast.success(t({ id: 'vectorizer.api_id_saved', message: 'API Id saved' }))
    } catch (error) {
      toast.error(t({ id: 'settings.save_failed_toast', message: 'Save failed' }), {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async function onSaveSecret() {
    try {
      await saveSecret.mutateAsync({
        apiId: trimmedApiId,
        apiSecret: secret,
      })
      setSecret('')
      toast.success(
        t({ id: 'vectorizer.secret_saved', message: 'API Secret saved' }),
      )
    } catch (error) {
      setSecret('')
      toast.error(t({ id: 'settings.save_failed_toast', message: 'Save failed' }), {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async function onDeleteSecret() {
    try {
      await deleteSecret.mutateAsync(trimmedApiId)
      setSecret('')
      toast.success(
        t({ id: 'vectorizer.secret_removed', message: 'API Secret removed' }),
      )
    } catch (error) {
      toast.error(t({ id: 'settings.remove_failed_toast', message: 'Remove failed' }), {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async function onModeChange(next: string) {
    try {
      await saveMode.mutateAsync(next as VectorizePreferences['apiMode'])
    } catch (error) {
      toast.error(t({ id: 'settings.save_failed_toast', message: 'Save failed' }), {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <CloudCog className="size-3.5" />
            <Trans id="vectorizer.heading">SVG export</Trans>
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            <Trans id="vectorizer.hint">
              Local SVG works offline. API SVG uses Vectorizer.AI when configured.
            </Trans>
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 text-xs',
            hasKey ? 'text-emerald-600' : 'text-muted-foreground',
          )}
        >
          {hasKey ? (
            <Trans id="settings.status_configured">Configured</Trans>
          ) : (
            <Trans id="settings.status_unconfigured">Not configured</Trans>
          )}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_9rem]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vectorizer-api-id">
            <Trans id="vectorizer.api_id_label">Vectorizer.AI API Id</Trans>
          </Label>
          <div className="flex gap-2">
            <Input
              id="vectorizer-api-id"
              value={apiId}
              disabled={busy}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setApiId(e.target.value)}
              placeholder="vect_..."
              className="font-mono"
            />
            <Button
              type="button"
              variant="outline"
              disabled={busy || trimmedApiId.length === 0}
              onClick={() => void onSaveApiId()}
            >
              {saveApiId.isPending && <Loader2 className="animate-spin" />}
              <Trans id="settings.save">Save</Trans>
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vectorizer-mode">
            <Trans id="vectorizer.mode_label">API mode</Trans>
          </Label>
          <Select
            value={prefs.apiMode}
            onValueChange={onModeChange}
            disabled={busy}
          >
            <SelectTrigger id="vectorizer-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="test">
                <Trans id="vectorizer.mode_test">Test</Trans>
              </SelectItem>
              <SelectItem value="production">
                <Trans id="vectorizer.mode_production">Production</Trans>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="vectorizer-secret">
          <Trans id="vectorizer.secret_label">API Secret</Trans>
        </Label>
        <div className="relative">
          <Input
            id="vectorizer-secret"
            type={reveal ? 'text' : 'password'}
            value={secret}
            disabled={busy || trimmedApiId.length === 0}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={
              hasKey
                ? t({
                    id: 'settings.key_placeholder_replace',
                    message: 'Configured — type to replace',
                  })
                : t({
                    id: 'vectorizer.secret_placeholder',
                    message: 'Enter API Secret',
                  })
            }
            className="pr-8 font-mono"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            tabIndex={-1}
            disabled={busy || trimmedApiId.length === 0}
            aria-label={
              reveal
                ? t({ id: 'settings.key_hide', message: 'Hide' })
                : t({ id: 'settings.key_show', message: 'Show' })
            }
            onClick={() => setReveal((v) => !v)}
            className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
          >
            {reveal ? <EyeOff /> : <Eye />}
          </Button>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy || !hasKey || trimmedApiId.length === 0}
            onClick={() => void onDeleteSecret()}
          >
            {deleteSecret.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Trash2 />
            )}
            <Trans id="settings.remove_action">Remove</Trans>
          </Button>
          <Button
            type="button"
            disabled={busy || trimmedApiId.length === 0 || secret.length === 0}
            onClick={() => void onSaveSecret()}
          >
            {saveSecret.isPending && <Loader2 className="animate-spin" />}
            <Trans id="settings.save">Save</Trans>
          </Button>
        </div>
      </div>
    </div>
  )
}
