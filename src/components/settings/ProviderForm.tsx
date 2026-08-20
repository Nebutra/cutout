/**
 * ProviderForm (spec §7) — add / edit a provider connection.
 *
 * New providers are checked in a short-lived Rust draft and imported atomically;
 * edits retain the existing config/key mutation hooks. A manually entered secret
 * remains transient React state and is wiped after any save attempt.
 *
 * `baseUrl` is surfaced only for `openai-compatible` (the one kind that requires
 * it). The form asks for a **connection**, never a model: the credential probe
 * discovers the endpoint's catalog (layer 2) and stores it on the provider, and
 * which model serves which task is decided later in "Assign models to tasks".
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
  useUpsertProvider,
  useSetKey,
  useVerifyProvider,
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

function discoveryError(error: unknown): { code?: string; message: string } {
  if (typeof error === 'object' && error !== null) {
    const value = error as { code?: unknown; message?: unknown }
    if (typeof value.message === 'string') return { message: value.message, ...(typeof value.code === 'string' ? { code: value.code } : {}) }
  }
  return { message: error instanceof Error ? error.message : String(error) }
}

/** How many catalog entries the connection form previews inline. */
const CATALOG_PREVIEW_LIMIT = 8

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
  // Ephemeral: the replacement secret the user is typing. Never leaves this state
  // except straight into `setKey`, after which it is cleared.
  const [secret, setSecret] = useState('')
  const [probedModels, setProbedModels] = useState<string[]>([])
  const [probeError, setProbeError] = useState<string>()
  const [probing, setProbing] = useState(false)
  const [connectionDirty, setConnectionDirty] = useState(!isEdit)
  /** The endpoint answered, but serves no catalog — save it anyway. */
  const [catalogUnsupported, setCatalogUnsupported] = useState(false)
  const [nativeDraftId, setNativeDraftId] = useState<string>()
  const [importing, setImporting] = useState(false)
  const queryClient = useQueryClient()

  const upsert = useUpsertProvider()
  const setKey = useSetKey()
  const verifyProvider = useVerifyProvider()
  const status = useProviderStatus(initial?.id ?? '')
  const hasKey = isEdit && status.data === true

  const busy = upsert.isPending || setKey.isPending || importing

  useEffect(() => () => {
    if (nativeDraftId) void cancelProviderDraft(nativeDraftId)
  }, [nativeDraftId])

  function invalidateConnection() {
    if (nativeDraftId) void cancelProviderDraft(nativeDraftId)
    setNativeDraftId(undefined); setProbedModels([]); setProbeError(undefined); setCatalogUnsupported(false); setConnectionDirty(true)
  }

  function onKindChange(next: string) {
    const nextKind = next as ProviderKind
    setKind(nextKind)
    setWireProtocol(defaultProviderWireProtocol(nextKind))
    invalidateConnection()
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
  // A connection is saveable once it is named, addressable, and its credential
  // has been checked. It does not need a model — that is layer 3.
  const canSave =
    label.trim().length > 0 &&
    (!needsBaseUrl || baseUrl.trim().length > 0) &&
    !busy && !connectionDirty

  async function probeModels() {
    const resolvedBaseUrl = apiBaseUrl(
      kind,
      baseUrl.trim() || definition?.defaultBaseUrl,
      wireProtocol,
    )
    if (!resolvedBaseUrl) return
    setProbing(true); setProbeError(undefined); setCatalogUnsupported(false)
    try {
      if (nativeDraftId) await cancelProviderDraft(nativeDraftId)
      const draftId = await createProviderDraft({
        kind, baseUrl: resolvedBaseUrl, wireProtocol,
        ...(discovered
          ? { candidateId: discovered.id }
          : secret
            ? { secret }
            : initial?.id
              ? { providerId: initial.id }
              : {}),
      })
      setNativeDraftId(draftId)
      const models = await checkProviderDraft(draftId)
      setProbedModels(models)
      setCatalogUnsupported(false)
      setConnectionDirty(false)
    } catch (error) {
      setProbedModels([])
      const detail = discoveryError(error)
      // An endpoint that serves no catalog is still a usable connection; the
      // user will type model ids in the task slots instead of picking them.
      if (detail.code === 'catalog-unsupported') {
        setCatalogUnsupported(true)
        setConnectionDirty(false)
      }
      setProbeError(detail.message)
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
          enabled: true,
        })
        setSecret(''); setNativeDraftId(undefined)
        // The native import already persisted the catalog it checked.
        setProviderVerification(saved.id,{status:'verified',checkedAt:new Date().toISOString()})
        await queryClient.invalidateQueries({ queryKey: ['providers'] })
        toast.success(t({ id: 'settings.provider_added_toast', message: 'Provider added' }), { description: saved.label })
        onDone()
        return
      }
      const probedCatalog = probedModels.length > 0
        ? { models: probedModels, fetchedAt: new Date().toISOString() }
        : initial?.catalog
      const draft: ProviderDraft = {
        ...(initial?.id ? { id: initial.id } : {}),
        kind,
        label: label.trim(),
        baseUrl: baseUrl.trim() ? baseUrl.trim() : undefined,
        wireProtocol,
        ...(probedCatalog ? { catalog: probedCatalog } : {}),
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
        setProviderVerification(saved.id,{status:'verified',checkedAt:new Date().toISOString()})
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
        void verifyProvider
          .mutateAsync(saved.id)
          .then(({ models }) => {
            toast.success(
              t({ id: 'settings.status_verified', message: 'Verified' }),
              {
                description: t({
                  id: 'settings.models_discovered_toast',
                  message: `${saved.label} · ${models.length} models discovered`,
                }),
              },
            )},
          )
          .catch((error: unknown) => {
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
        {probeError && !catalogUnsupported ? <span className="text-xs text-destructive">{probeError}</span> : null}
      </div>

      {/* The probe result is evidence about the connection, not a choice to
          make here — models are assigned per task after saving. */}
      {probedModels.length > 0 ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-2">
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
            {t({
              id: 'settings.catalog_discovered',
              message: `${probedModels.length} models discovered`,
            })}
          </p>
          <p className="text-[11px] text-muted-foreground">
            <Trans id="settings.catalog_assign_later">
              Pick which of them serves each task under “Assign models to tasks”.
            </Trans>
          </p>
          <div className="flex flex-wrap gap-1">
            {probedModels.slice(0, CATALOG_PREVIEW_LIMIT).map((model) => (
              <span key={model} className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {model}
              </span>
            ))}
            {probedModels.length > CATALOG_PREVIEW_LIMIT ? (
              <span className="px-1 py-0.5 text-[10px] text-muted-foreground">
                {t({
                  id: 'settings.catalog_more',
                  message: `+${probedModels.length - CATALOG_PREVIEW_LIMIT} more`,
                })}
              </span>
            ) : null}
          </div>
        </div>
      ) : catalogUnsupported ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300">
          <Trans id="settings.catalog_unsupported_hint">
            This endpoint serves no model list. You can still save the connection and type model ids by hand when assigning tasks.
          </Trans>
        </p>
      ) : null}

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
