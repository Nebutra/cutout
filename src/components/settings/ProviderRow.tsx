/**
 * ProviderRow (spec §7) — one configured provider in the list.
 *
 * Shows the kind (Badge), label, default model, and a status dot derived from
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
import { cn } from '@/lib/utils'
import type { ProviderConfig } from '@/services/ai/provider-types'
import {
  useProviderStatus,
  useTestKey,
  useRemoveProvider,
} from '@/hooks/queries/providers'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

interface StatusView {
  readonly text: string
  readonly dot: string
}

function statusView(hasKey: boolean, test: TestState): StatusView {
  if (!hasKey) return { text: '未配置', dot: 'bg-muted-foreground/40' }
  if (test === 'ok') return { text: '校验通过', dot: 'bg-emerald-500' }
  if (test === 'fail') return { text: '校验失败', dot: 'bg-destructive' }
  return { text: '已配置', dot: 'bg-amber-500' }
}

interface ProviderRowProps {
  readonly provider: ProviderConfig
  readonly onEdit: (provider: ProviderConfig) => void
}

export function ProviderRow({ provider, onEdit }: ProviderRowProps) {
  const [test, setTest] = useState<TestState>('idle')
  const status = useProviderStatus(provider.id)
  const testKey = useTestKey()
  const removeProvider = useRemoveProvider()

  const hasKey = status.data === true
  const view = statusView(hasKey, test)

  async function onTest() {
    try {
      const { model } = await testKey.mutateAsync(provider.id)
      setTest('ok')
      toast.success('校验通过', { description: `${provider.label} · ${model}` })
    } catch (error) {
      setTest('fail')
      toast.error('校验失败', {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async function onRemove() {
    try {
      await removeProvider.mutateAsync(provider.id)
      toast.success('已删除提供方', { description: provider.label })
    } catch (error) {
      toast.error('删除失败', {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

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
            className={cn('size-1.5 shrink-0 rounded-full', view.dot)}
            aria-hidden
          />
          <span>{view.text}</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="truncate font-mono">{provider.defaultModel}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onTest}
          disabled={!hasKey || testKey.isPending}
          aria-label="校验"
        >
          {testKey.isPending ? <Loader2 className="animate-spin" /> : <Wifi />}
          校验
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onEdit(provider)}
          aria-label="编辑"
        >
          <Pencil />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="删除"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除提供方？</AlertDialogTitle>
              <AlertDialogDescription>
                将删除「{provider.label}」的配置及其保存在系统钥匙串中的密钥，此操作无法撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onRemove}>
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
