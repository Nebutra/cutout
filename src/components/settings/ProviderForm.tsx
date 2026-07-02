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
import {
  PROVIDER_KINDS,
  type ProviderConfig,
  type ProviderDraft,
  type ProviderKind,
} from '@/services/ai/provider-types'
import { DEFAULT_MODEL, SUGGESTED_MODELS } from '@/services/ai/models'
import {
  useUpsertProvider,
  useSetKey,
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

/** Human-facing kind labels (Chinese-friendly, consistent with the app). */
const KIND_LABEL: Record<ProviderKind, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  gateway: 'AI Gateway',
  'openai-compatible': 'OpenAI 兼容',
}

/** Is `model` one of the known per-kind defaults? (safe to auto-replace) */
function isKnownDefault(model: string): boolean {
  return Object.values(DEFAULT_MODEL).includes(model)
}

interface ProviderFormProps {
  /** Existing config → edit mode; absent → add mode. */
  readonly initial?: ProviderConfig
  /** Leave the form (back to the list). */
  readonly onDone: () => void
}

export function ProviderForm({ initial, onDone }: ProviderFormProps) {
  const isEdit = initial !== undefined
  const [kind, setKind] = useState<ProviderKind>(initial?.kind ?? 'anthropic')
  const [label, setLabel] = useState(initial?.label ?? '')
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '')
  const [defaultModel, setDefaultModel] = useState(
    initial?.defaultModel ?? DEFAULT_MODEL.anthropic,
  )
  // Ephemeral: the replacement secret the user is typing. Never leaves this state
  // except straight into `setKey`, after which it is cleared.
  const [secret, setSecret] = useState('')

  const upsert = useUpsertProvider()
  const setKey = useSetKey()
  const status = useProviderStatus(initial?.id ?? '')
  const hasKey = isEdit && status.data === true

  const busy = upsert.isPending || setKey.isPending

  function onKindChange(next: string) {
    const nextKind = next as ProviderKind
    setKind(nextKind)
    // Re-seed the model only when it is empty or a stock default, so a custom
    // slug the user typed survives a kind switch.
    setDefaultModel((cur) =>
      cur.trim() === '' || isKnownDefault(cur) ? DEFAULT_MODEL[nextKind] : cur,
    )
  }

  const needsBaseUrl = kind === 'openai-compatible'
  const modelOptions = Array.from(
    new Set([...SUGGESTED_MODELS[kind], defaultModel].filter((m) => m.trim())),
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
      const saved = await upsert.mutateAsync(draft)
      if (secret.trim()) {
        await setKey.mutateAsync({ id: saved.id, secret })
        setSecret('') // wipe the secret from JS the moment Rust has it
      }
      toast.success(isEdit ? '已更新提供方' : '已添加提供方', {
        description: saved.label,
      })
      onDone()
    } catch (error) {
      setSecret('') // never keep a secret around after a failed attempt
      toast.error('保存失败', {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="provider-label">名称</Label>
        <Input
          id="provider-label"
          value={label}
          disabled={busy}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="我的 Anthropic"
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="provider-kind">类型</Label>
        <Select value={kind} onValueChange={onKindChange} disabled={busy}>
          <SelectTrigger id="provider-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {KIND_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {needsBaseUrl && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="provider-baseurl">Base URL</Label>
          <Input
            id="provider-baseurl"
            value={baseUrl}
            disabled={busy}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
            className="font-mono"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="provider-model">默认模型</Label>
        {modelOptions.length > 0 ? (
          <Select
            value={defaultModel}
            onValueChange={setDefaultModel}
            disabled={busy}
          >
            <SelectTrigger id="provider-model" className="font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((m) => (
                <SelectItem key={m} value={m} className="font-mono">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id="provider-model"
            value={defaultModel}
            disabled={busy}
            onChange={(e) => setDefaultModel(e.target.value)}
            placeholder={DEFAULT_MODEL[kind]}
            className="font-mono"
          />
        )}
      </div>

      <KeyField
        id="provider-key"
        value={secret}
        onChange={setSecret}
        hasKey={hasKey}
        disabled={busy}
      />

      <div className="mt-1 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={busy}>
          取消
        </Button>
        <Button type="submit" disabled={!canSave}>
          {busy && <Loader2 className="animate-spin" />}
          {isEdit ? '保存' : '添加'}
        </Button>
      </div>
    </form>
  )
}
