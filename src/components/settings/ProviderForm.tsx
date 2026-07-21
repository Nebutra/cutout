/**
 * ProviderForm (spec §7) — add / edit a provider connection.
 *
 * New providers are checked in a short-lived Rust draft and imported atomically;
 * edits retain the existing config/key mutation hooks. A manually entered secret
 * remains transient React state and is wiped after any save attempt.
 *
 * `baseUrl` is surfaced only for `openai-compatible` (the one kind that requires
 * it); `defaultModel` is a Select seeded from `SUGGESTED_MODELS`, degrading to a
 * free-text input for kinds without a catalog (e.g. `openai-compatible`).
 */
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { v4 as uuidv4 } from 'uuid'
import { toast } from 'sonner'
import { Loader2, RefreshCw } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  PROVIDER_KINDS,
  type ProviderConfig,
  type ProviderDraft,
  type ProviderKind,
  type ProviderWireProtocol,
  defaultProviderWireProtocol,
  supportedProviderWireProtocols,
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
import { setProviderVerification } from '@/services/ai/provider-verification'
import { cancelProviderDraft, checkProviderDraft, createProviderDraft, importProviderDraft, type ProviderDiscoveryCandidate } from '@/services/ai/provider-discovery'
import { apiBaseUrl } from '@/services/ai/base-url'

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

function discoveryError(error: unknown): { code?: string; message: string } {
  if (typeof error === 'object' && error !== null) {
    const value = error as { code?: unknown; message?: unknown }
    if (typeof value.message === 'string') return { message: value.message, ...(typeof value.code === 'string' ? { code: value.code } : {}) }
  }
  return { message: error instanceof Error ? error.message : String(error) }
}

interface ProviderFormProps {
  /** Existing config → edit mode; absent → add mode. */
  readonly initial?: ProviderConfig
  readonly initialKind?: ProviderKind
  readonly discovered?: ProviderDiscoveryCandidate
  /** Leave the form (back to the list). */
  readonly onDone: () => void
}

export function ProviderForm({ initial, initialKind, discovered, onDone }: ProviderFormProps) {
  const { t } = useLingui()
  const isEdit = initial !== undefined
  const [kind, setKind] = useState<ProviderKind>(initial?.kind ?? discovered?.kind ?? initialKind ?? 'anthropic')
  const [label, setLabel] = useState(initial?.label ?? discovered?.label ?? '')
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? discovered?.baseUrl ?? '')
  const [wireProtocol, setWireProtocol] = useState<ProviderWireProtocol | undefined>(
    initial?.wireProtocol ?? discovered?.wireProtocol ?? defaultProviderWireProtocol(initial?.kind ?? discovered?.kind ?? initialKind ?? 'anthropic'),
  )
  const [defaultModel, setDefaultModel] = useState(
    initial?.defaultModel ?? discovered?.modelHint ?? DEFAULT_MODEL[discovered?.kind ?? initialKind ?? 'anthropic'] ?? '',
  )
  // Ephemeral: the replacement secret the user is typing. Never leaves this state
  // except straight into `setKey`, after which it is cleared.
  const [secret, setSecret] = useState('')
  const [probedModels, setProbedModels] = useState<string[]>([])
  const [probeError, setProbeError] = useState<string>()
  const [probeErrorCode, setProbeErrorCode] = useState<string>()
  const [probing, setProbing] = useState(false)
  const [connectionDirty, setConnectionDirty] = useState(!isEdit)
  const [manualModel, setManualModel] = useState(false)
  const [nativeDraftId, setNativeDraftId] = useState<string>()
  const [importing, setImporting] = useState(false)
  const queryClient = useQueryClient()

  const upsert = useUpsertProvider()
  const setKey = useSetKey()
  const testKey = useTestKey()
  const status = useProviderStatus(initial?.id ?? '')
  const hasKey = isEdit && status.data === true

  const busy = upsert.isPending || setKey.isPending || importing

  useEffect(() => () => {
    if (nativeDraftId) void cancelProviderDraft(nativeDraftId)
  }, [nativeDraftId])

  function invalidateConnection() {
    if (nativeDraftId) void cancelProviderDraft(nativeDraftId)
    setNativeDraftId(undefined); setProbedModels([]); setProbeError(undefined); setProbeErrorCode(undefined); setConnectionDirty(true)
  }

  function onKindChange(next: string) {
    const nextKind = next as ProviderKind
    setKind(nextKind)
    setWireProtocol(defaultProviderWireProtocol(nextKind))
    invalidateConnection()
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
          message: 'Custom endpoint',
        })
      : createBuiltinProviderRegistry().definition(k)?.label ?? KIND_BRAND[k] ?? k
  }

  const definition = createBuiltinProviderRegistry().definition(kind)
  const needsBaseUrl = definition?.configurableBaseUrl ?? kind === 'openai-compatible'
  const needsKey = definition?.authMethods.includes('api-key') ?? true
  const needsOAuth = definition?.authMethods.includes('oauth2') ?? false
  const wireProtocols = definition?.wireProtocols ?? supportedProviderWireProtocols(kind)
  const modelOptions = Array.from(
    new Set(
      [
        ...(SUGGESTED_MODELS[kind] ?? []),
        // Relays proxy many upstreams → offer the curated mainstream shortlist.
        ...(kind === 'openai-compatible' ? POPULAR_MODELS : []),
        ...probedModels,
        defaultModel,
      ].filter((m) => m.trim()),
    ),
  )

  const canSave =
    label.trim().length > 0 &&
    defaultModel.trim().length > 0 &&
    (!needsBaseUrl || baseUrl.trim().length > 0) &&
    !busy && !connectionDirty

  async function probeModels() {
    const resolvedBaseUrl = apiBaseUrl(
      kind,
      baseUrl.trim() || definition?.defaultBaseUrl,
      wireProtocol,
    )
    if (!resolvedBaseUrl) return
    setProbing(true); setProbeError(undefined); setProbeErrorCode(undefined)
    try {
      if (nativeDraftId) await cancelProviderDraft(nativeDraftId)
      const draftId = await createProviderDraft({
        kind, baseUrl: resolvedBaseUrl, wireProtocol,
        ...(discovered ? { candidateId: discovered.id } : {}),
        ...(initial?.id ? { providerId: initial.id } : {}),
        ...(secret ? { secret } : {}),
      })
      setNativeDraftId(draftId)
      const models = await checkProviderDraft(draftId)
      setProbedModels(models)
      setConnectionDirty(false)
      if (!models.includes(defaultModel)) setDefaultModel(models[0] ?? '')
    } catch (error) {
      setProbedModels([])
      const detail = discoveryError(error)
      setProbeError(detail.message); setProbeErrorCode(detail.code)
    } finally { setProbing(false) }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSave) return
    try {
      if (!initial && nativeDraftId) {
        setImporting(true)
        const saved = await importProviderDraft({
          draftId: nativeDraftId, providerId: uuidv4(), label: label.trim(),
          defaultModel: defaultModel.trim(), enabled: true,
        })
        setSecret(''); setNativeDraftId(undefined)
        setProviderVerification(saved.id,{status:'verified',model:defaultModel,checkedAt:new Date().toISOString()})
        await queryClient.invalidateQueries({ queryKey: ['providers'] })
        toast.success(t({ id: 'settings.provider_added_toast', message: 'Provider added' }), { description: saved.label })
        onDone()
        return
      }
      const draft: ProviderDraft = {
        ...(initial?.id ? { id: initial.id } : {}),
        kind,
        label: label.trim(),
        baseUrl: baseUrl.trim() ? baseUrl.trim() : undefined,
        wireProtocol,
        defaultModel: defaultModel.trim(),
        enabled: initial?.enabled ?? true,
      }
      const providedKey = secret.trim().length > 0
      const saved = await upsert.mutateAsync(draft)
      setProviderVerification(saved.id,{status:'unverified'})
      if (providedKey) {
        await setKey.mutateAsync({ id: saved.id, secret })
        setSecret('') // wipe the secret from JS the moment Rust has it
      }
      if (probedModels.length > 0) {
        setProviderVerification(saved.id,{status:'verified',model:defaultModel,checkedAt:new Date().toISOString()})
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
          .then(({ model }) => {
            setProviderVerification(saved.id,{status:'verified',model,checkedAt:new Date().toISOString()})
            toast.success(
              t({ id: 'settings.status_verified', message: 'Verified' }),
              { description: `${saved.label} · ${model}` },
            )},
          )
          .catch((error: unknown) => {
            setProviderVerification(saved.id,{status:'failed',checkedAt:new Date().toISOString(),detail:error instanceof Error?error.message:String(error)})
            toast.error(
              t({ id: 'settings.status_failed', message: 'Verification failed' }),
              {
                description:
                  error instanceof Error ? error.message : String(error),
              },
            )},
          )
      }
    } catch (error) {
      setSecret('') // never keep a secret around after a failed attempt
      toast.error(t({ id: 'settings.save_failed_toast', message: 'Save failed' }), {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setImporting(false)
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
            onChange={(e) => { setBaseUrl(e.target.value); invalidateConnection() }}
            placeholder="https://api.example.com/v1"
            className="font-mono"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
      )}

      {wireProtocols.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="provider-wire-protocol"><Trans id="settings.provider_api_protocol">API protocol</Trans></Label>
          <Select value={wireProtocol} onValueChange={(value) => { setWireProtocol(value as ProviderWireProtocol); invalidateConnection() }} disabled={busy}>
            <SelectTrigger id="provider-wire-protocol"><SelectValue /></SelectTrigger>
            <SelectContent>
              {wireProtocols.includes('responses') ? <SelectItem value="responses"><Trans id="settings.provider_protocol_responses">OpenAI Responses</Trans></SelectItem> : null}
              {wireProtocols.includes('chat-completions') ? <SelectItem value="chat-completions"><Trans id="settings.provider_protocol_chat_completions">OpenAI Chat Completions</Trans></SelectItem> : null}
              {wireProtocols.includes('anthropic-messages') ? <SelectItem value="anthropic-messages"><Trans id="settings.provider_protocol_anthropic_messages">Anthropic Messages</Trans></SelectItem> : null}
              {wireProtocols.includes('google-generate-content') ? <SelectItem value="google-generate-content"><Trans id="settings.provider_protocol_google_generate_content">Google GenerateContent</Trans></SelectItem> : null}
            </SelectContent>
          </Select>
        </div>
      )}

      {needsKey ? <KeyField id="provider-key" value={secret} onChange={(value) => { setSecret(value); invalidateConnection() }} hasKey={hasKey} disabled={busy} /> : null}
      {needsOAuth ? <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300">Authorization is required. An injected desktop OAuth host must complete the connection before this provider becomes available.</p> : null}

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={() => void probeModels()} disabled={busy || probing || (!secret && !hasKey && !discovered?.credential.available && needsKey)}>
          {probing ? <Loader2 className="animate-spin" /> : <RefreshCw />}<Trans id="settings.check_connection_load_models">Check credentials and load models</Trans>
        </Button>
        {probeError ? <span className="text-xs text-destructive">{probeError}</span> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="provider-model">
          <Trans id="settings.provider_model_label">Default model</Trans>
        </Label>
        {manualModel ? <Input id="provider-model" value={defaultModel} onChange={(event) => setDefaultModel(event.target.value)} className="font-mono" placeholder="Model ID" /> :
          <Select value={defaultModel} onValueChange={setDefaultModel} disabled={busy || probing || connectionDirty}>
            <SelectTrigger id="provider-model" className="font-mono"><SelectValue placeholder={t({ id: 'settings.select_model', message: 'Select a model' })} /></SelectTrigger>
            <SelectContent>
              {modelOptions.map((model) => <SelectItem key={model} value={model} className="font-mono">{model}</SelectItem>)}
            </SelectContent>
          </Select>}
        {probeErrorCode === 'catalog-unsupported' ? <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => { setManualModel(true); setConnectionDirty(false) }}><Trans id="settings.enter_model_manually">Enter model ID manually</Trans></Button> : null}
      </div>

      <div className="mt-1 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => { if (nativeDraftId) void cancelProviderDraft(nativeDraftId); onDone() }} disabled={busy}>
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
