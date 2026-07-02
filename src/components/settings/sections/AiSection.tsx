/**
 * AiSection — BYOK credentials (list + add/edit form).
 *
 * Folds the retired `ProviderSettingsDialog` into the Settings dialog: same
 * list | add | edit view machine, minus the outer `Dialog` (it now lives inside
 * `SettingsDialog`). Reuses `ProviderRow` / `ProviderForm` and all provider
 * hooks unchanged. A trust line surfaces the keychain guarantee inline.
 *
 * The Models block (assignment by output modality) is added in Phase 3.
 */
import { useState } from 'react'
import { KeyRound, Plus, ShieldCheck } from 'lucide-react'
import { Trans } from '@lingui/react/macro'
import type { ProviderConfig } from '@/services/ai/provider-types'
import { useProviders } from '@/hooks/queries/providers'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ProviderRow } from '../ProviderRow'
import { ProviderForm } from '../ProviderForm'

type View =
  | { readonly mode: 'list' }
  | { readonly mode: 'add' }
  | { readonly mode: 'edit'; readonly provider: ProviderConfig }

export function AiSection() {
  const [view, setView] = useState<View>({ mode: 'list' })
  const providers = useProviders()
  const list = providers.data ?? []

  if (view.mode !== 'list') {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-medium">
            {view.mode === 'add' ? (
              <Trans id="settings.add_provider">Add provider</Trans>
            ) : (
              <Trans id="settings.dialog_edit_title">Edit provider</Trans>
            )}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <Trans id="settings.dialog_form_desc">
              Keys are stored only in the system keychain, never written to the
              web page or disk in plaintext.
            </Trans>
          </p>
        </div>
        <ProviderForm
          initial={view.mode === 'edit' ? view.provider : undefined}
          onDone={() => setView({ mode: 'list' })}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-lg border border-border bg-card/40 px-3 py-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
        <Trans id="settings.keychain_trust">
          API keys are stored only in your OS keychain and injected in the native
          layer — they never enter the web page.
        </Trans>
      </div>

      <div className="flex flex-col gap-2">
        {providers.isLoading ? (
          <>
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </>
        ) : providers.isError ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-6 text-center text-sm text-destructive">
            <Trans id="settings.load_failed">Failed to load providers</Trans>
          </p>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-3 py-8 text-center">
            <KeyRound className="size-5 text-muted-foreground" />
            <p className="text-sm font-medium">
              <Trans id="settings.empty_title">
                No providers configured yet
              </Trans>
            </p>
            <p className="text-xs text-muted-foreground">
              <Trans id="settings.empty_desc">
                Add a provider and enter an API key to start using AI features.
              </Trans>
            </p>
          </div>
        ) : (
          list.map((provider) => (
            <ProviderRow
              key={provider.id}
              provider={provider}
              onEdit={(p) => setView({ mode: 'edit', provider: p })}
            />
          ))
        )}
      </div>

      <Button
        variant="outline"
        className="w-full"
        onClick={() => setView({ mode: 'add' })}
      >
        <Plus />
        <Trans id="settings.add_provider">Add provider</Trans>
      </Button>
    </div>
  )
}
