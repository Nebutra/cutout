/**
 * ProviderRow (spec §7) — one configured provider in the list.
 *
 * Shows the kind (Badge), label, endpoint host, and a status dot derived from
 * keychain state + this session's test result:
 *   未配置 (no key) · 已配置 (key present) · 校验通过 / 校验失败 (last test).
 * The test outcome is intentionally session-local (not persisted) — it reflects
 * "did the key just work", not a stored claim.
 *
 * Actions: Test (round-trips through the Rust proxy → toast), Edit (re-opens the
 * form), Remove (AlertDialog confirm → deletes config **and** the keychain
 * secret). No secret is ever read or shown here.
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Pencil, Trash2, Wifi } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn } from '@/lib/utils'
import type { ProviderConfig } from '@/services/ai/provider-types'
import {
  useProviderStatus,
  useTestKey,
  useRemoveProvider,
} from '@/hooks/queries/providers'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { loadProviderVerifications, setProviderVerification } from '@/services/ai/provider-verification'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

type TestState = 'idle' | 'ok' | 'fail'

type StatusKind = 'unconfigured' | 'configured' | 'ok' | 'fail'

/**
 * The endpoint host — a provider is a *connection* (endpoint + key), not a single
 * model. Models are assigned per capability in the Models slots below, so the row
 * shows where it connects, not one model name.
 */
function hostOf(baseUrl?: string): string | undefined {
  if (!baseUrl) return undefined
  try {
    return new URL(baseUrl).host
  } catch {
    return baseUrl
  }
}

/** Pure status derivation; text is resolved via the catalog in the component. */
function statusKind(hasKey: boolean, test: TestState): StatusKind {
  if (!hasKey) return 'unconfigured'
  if (test === 'ok') return 'ok'
  if (test === 'fail') return 'fail'
  return 'configured'
}

const STATUS_DOT: Record<StatusKind, string> = {
  unconfigured: 'bg-muted-foreground/40',
  configured: 'bg-amber-500',
  ok: 'bg-emerald-500',
  fail: 'bg-destructive',
}

interface ProviderRowProps {
  readonly provider: ProviderConfig
  readonly onEdit: (provider: ProviderConfig) => void
}

export function ProviderRow({ provider, onEdit }: ProviderRowProps) {
  const { t } = useLingui()
  const [test, setTest] = useState<TestState>(()=>{const status=loadProviderVerifications()[provider.id]?.status;return status==='verified'?'ok':status==='failed'?'fail':'idle'})
  const status = useProviderStatus(provider.id)
  const testKey = useTestKey()
  const removeProvider = useRemoveProvider()

  const hasKey = status.data === true
  const kind = statusKind(hasKey, test)
  const statusText: Record<StatusKind, string> = {
    unconfigured: t({ id: 'settings.status_unconfigured', message: 'Not configured' }),
    configured: t({ id: 'settings.status_configured', message: 'Configured' }),
    ok: t({ id: 'settings.status_verified', message: 'Verified' }),
    fail: t({ id: 'settings.status_failed', message: 'Verification failed' }),
  }

  async function onTest() {
    try {
      const { model } = await testKey.mutateAsync(provider.id)
      setTest('ok')
      setProviderVerification(provider.id,{status:'verified',model,checkedAt:new Date().toISOString()})
      toast.success(t({ id: 'settings.status_verified', message: 'Verified' }), {
        description: `${provider.label} · ${model}`,
      })
    } catch (error) {
      setTest('fail')
      setProviderVerification(provider.id,{status:'failed',checkedAt:new Date().toISOString(),detail:error instanceof Error?error.message:String(error)})
      toast.error(
        t({ id: 'settings.status_failed', message: 'Verification failed' }),
        {
          description: error instanceof Error ? error.message : String(error),
        },
      )
    }
  }

  async function onRemove() {
    try {
      await removeProvider.mutateAsync(provider.id)
      toast.success(
        t({ id: 'settings.provider_removed_toast', message: 'Provider removed' }),
        { description: provider.label },
      )
    } catch (error) {
      toast.error(
        t({ id: 'settings.remove_failed_toast', message: 'Remove failed' }),
        {
          description: error instanceof Error ? error.message : String(error),
        },
      )
    }
  }

  const label = provider.label
  const endpointHost = hostOf(provider.baseUrl)

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/40 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="shrink-0">
            {provider.kind}
          </Badge>
          <span className="truncate text-sm font-medium">{provider.label}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[kind])}
            aria-hidden
          />
          <span>{statusText[kind]}</span>
          {endpointHost ? (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className="truncate font-mono">{endpointHost}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onTest}
          disabled={!hasKey || testKey.isPending}
          aria-label={t({ id: 'settings.test_action', message: 'Test' })}
        >
          {testKey.isPending ? <Loader2 className="animate-spin" /> : <Wifi />}
          <Trans id="settings.test_action">Test</Trans>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onEdit(provider)}
          aria-label={t({ id: 'settings.edit_action', message: 'Edit' })}
        >
          <Pencil />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t({ id: 'settings.remove_action', message: 'Remove' })}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                <Trans id="settings.remove_confirm_title">Remove provider?</Trans>
              </AlertDialogTitle>
              <AlertDialogDescription>
                <Trans id="settings.remove_confirm_desc">
                  This removes the configuration for “{label}” and its locally
                  stored key. This action cannot be undone.
                </Trans>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                <Trans id="settings.cancel">Cancel</Trans>
              </AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onRemove}>
                <Trans id="settings.remove_action">Remove</Trans>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
