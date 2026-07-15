/**
 * ProviderForm (spec §7) — add / edit a provider connection.
 *
 * Save is a two-step, secret-safe sequence:
 *   1. `upsert(draft)` persists the **non-secret** config and returns it with a
 *      stable id (generated on create).
 *   2. iff the user typed a key, `setKey(id, secret)` sends it straight to Rust;
 *      the secret is then wiped from local state (`setSecret('')`) before the
 *      form closes. The secret is never placed in Query/Zustand state, never
 *      echoed, never persisted in JS.
 *
 * `baseUrl` is surfaced only for `openai-compatible` (the one kind that requires
 * it); `defaultModel` is a Select seeded from `SUGGESTED_MODELS`, degrading to a
 * free-text input for kinds without a catalog (e.g. `openai-compatible`).
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  PROVIDER_KINDS,
  type ProviderConfig,
  type ProviderDraft,
  type ProviderKind,
} from '@/services/ai/provider-types'
import {
  DEFAULT_MODEL,
  SUGGESTED_MODELS,
  POPULAR_MODELS,
} from '@/services/ai/models'
import {
  useUpsertProvider,
  useSetKey,
  useTestKey,
  useProviderStatus,
} from '@/hooks/queries/providers'
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
import { KeyField } from './KeyField'
import { createBuiltinProviderRegistry } from '@/services/ai/provider-registry'

/**
 * Brand kind labels. These are product names and stay verbatim across locales;
 * the one translatable kind (`openai-compatible`) is resolved via the `t` macro
 * inside the component so it participates in the catalog.
 */
const KIND_BRAND: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  gateway: 'AI Gateway',
}

/** Is `model` one of the known per-kind defaults? (safe to auto-replace) */
function isKnownDefault(model: string): boolean {
  return Object.values(DEFAULT_MODEL).includes(model)
}

interface ProviderFormProps {
  /** Existing config → edit mode; absent → add mode. */
  readonly initial?: ProviderConfig
  readonly initialKind?: ProviderKind
  /** Leave the form (back to the list). */
  readonly onDone: () => void
}

export function ProviderForm({ initial, initialKind, onDone }: ProviderFormProps) {
  const { t } = useLingui()
  const isEdit = initial !== undefined
  const [kind, setKind] = useState<ProviderKind>(initial?.kind ?? initialKind ?? 'anthropic')
  const [label, setLabel] = useState(initial?.label ?? '')
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '')
  const [defaultModel, setDefaultModel] = useState(
    initial?.defaultModel ?? DEFAULT_MODEL[initialKind ?? 'anthropic'] ?? '',
  )
  // Ephemeral: the replacement secret the user is typing. Never leaves this state
  // except straight into `setKey`, after which it is cleared.
  const [secret, setSecret] = useState('')

  const upsert = useUpsertProvider()
  const setKey = useSetKey()
  const testKey = useTestKey()
  const status = useProviderStatus(initial?.id ?? '')
  const hasKey = isEdit && status.data === true

  const busy = upsert.isPending || setKey.isPending

  function onKindChange(next: string) {
    const nextKind = next as ProviderKind
    setKind(nextKind)
    // Re-seed the model only when it is empty or a stock default, so a custom
    // slug the user typed survives a kind switch.
    setDefaultModel((cur) =>
      cur.trim() === '' || isKnownDefault(cur) ? DEFAULT_MODEL[nextKind] ?? '' : cur,
    )
  }

  function kindLabel(k: ProviderKind): string {
    return k === 'openai-compatible'
      ? t({
          id: 'settings.provider_kind_openai_compatible',
          message: 'OpenAI Compatible',
        })
      : createBuiltinProviderRegistry().definition(k)?.label ?? KIND_BRAND[k] ?? k
  }

  const definition = createBuiltinProviderRegistry().definition(kind)
  const needsBaseUrl = definition?.configurableBaseUrl ?? kind === 'openai-compatible'
  const needsKey = definition?.authMethods.includes('api-key') ?? true
  const needsOAuth = definition?.authMethods.includes('oauth2') ?? false
  const modelOptions = Array.from(
    new Set(
      [
        ...(SUGGESTED_MODELS[kind] ?? []),
        // Relays proxy many upstreams → offer the curated mainstream shortlist.
        ...(kind === 'openai-compatible' ? POPULAR_MODELS : []),
        defaultModel,
      ].filter((m) => m.trim()),
    ),
  )

  const canSave =
    label.trim().length > 0 &&
    defaultModel.trim().length > 0 &&
    (!needsBaseUrl || baseUrl.trim().length > 0) &&
    !busy

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSave) return
    try {
      const draft: ProviderDraft = {
        ...(initial?.id ? { id: initial.id } : {}),
        kind,
        label: label.trim(),
        baseUrl: baseUrl.trim() ? baseUrl.trim() : undefined,
        defaultModel: defaultModel.trim(),
        enabled: initial?.enabled ?? true,
      }
      const providedKey = secret.trim().length > 0
      const saved = await upsert.mutateAsync(draft)
      if (providedKey) {
        await setKey.mutateAsync({ id: saved.id, secret })
        setSecret('') // wipe the secret from JS the moment Rust has it
      }
      toast.success(
        isEdit
          ? t({ id: 'settings.provider_updated_toast', message: 'Provider updated' })
          : t({ id: 'settings.provider_added_toast', message: 'Provider added' }),
        {
          description: saved.label,
        },
      )
      onDone()
      // Auto-test: verify the key without a separate click. Non-blocking — a
      // failure only toasts; the provider stays saved either way.
      if (!needsKey || providedKey || hasKey) {
        void testKey
          .mutateAsync(saved.id)
          .then(({ model }) =>
            toast.success(
              t({ id: 'settings.status_verified', message: 'Verified' }),
              { description: `${saved.label} · ${model}` },
            ),
          )
          .catch((error: unknown) =>
            toast.error(
              t({ id: 'settings.status_failed', message: 'Verification failed' }),
              {
                description:
                  error instanceof Error ? error.message : String(error),
              },
            ),
          )
      }
    } catch (error) {
      setSecret('') // never keep a secret around after a failed attempt
      toast.error(t({ id: 'settings.save_failed_toast', message: 'Save failed' }), {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="provider-label">
          <Trans id="settings.provider_name_label">Name</Trans>
        </Label>
        <Input
          id="provider-label"
          value={label}
          disabled={busy}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t({
            id: 'settings.provider_name_placeholder',
            message: 'My Anthropic',
          })}
          autoFocus
        />
      </div>

      {definition ? (
        <p className="rounded-md border border-border bg-muted/20 px-2.5 py-2 text-[11px] text-muted-foreground">
          Catalog available · {definition.adapterIds.length ? 'Adapter available' : 'Adapter unavailable'} ·{' '}
          {needsOAuth ? 'OAuth authorization required' : needsKey ? `API key required${definition.env.length ? ` (${definition.env.join(', ')})` : ''}` : 'No authorization required'}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="provider-kind">
          <Trans id="settings.provider_kind_label">Type</Trans>
        </Label>
        <Select value={kind} onValueChange={onKindChange} disabled={busy}>
          <SelectTrigger id="provider-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {kindLabel(k)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {needsBaseUrl && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="provider-baseurl">
            <Trans id="settings.provider_baseurl_label">Base URL</Trans>
          </Label>
          <Input
            id="provider-baseurl"
            value={baseUrl}
            disabled={busy}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
            className="font-mono"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="provider-model">
          <Trans id="settings.provider_model_label">Default model</Trans>
        </Label>
        {/* Free-text so relays / openai-compatible can enter ANY model slug;
            the suggestions (per-kind + discovered) are offered via datalist, not
            a locked Select. */}
        <Input
          id="provider-model"
          list="provider-model-suggestions"
          value={defaultModel}
          disabled={busy}
          onChange={(e) => setDefaultModel(e.target.value)}
          placeholder={DEFAULT_MODEL[kind] ?? 'Model ID from provider catalog'}
          className="font-mono"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {modelOptions.length > 0 && (
          <datalist id="provider-model-suggestions">
            {modelOptions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        )}
      </div>

      {needsKey ? <KeyField id="provider-key" value={secret} onChange={setSecret} hasKey={hasKey} disabled={busy} /> : null}
      {needsOAuth ? <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300">Authorization is required. An injected desktop OAuth host must complete the connection before this provider becomes available.</p> : null}

      <div className="mt-1 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={busy}>
          <Trans id="settings.cancel">Cancel</Trans>
        </Button>
        <Button type="submit" disabled={!canSave}>
          {busy && <Loader2 className="animate-spin" />}
          {isEdit ? (
            <Trans id="settings.save">Save</Trans>
          ) : (
            <Trans id="settings.add">Add</Trans>
          )}
        </Button>
      </div>
    </form>
  )
}
