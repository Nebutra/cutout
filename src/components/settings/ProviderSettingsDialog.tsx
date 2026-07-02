/**
 * ProviderSettingsDialog (spec §7) — BYOK provider management.
 *
 * A controlled shadcn Dialog with two internal views: the provider **list**
 * (status + Test/Edit/Remove per row) and the add/edit **form**. It holds no
 * secret state — every key operation flows through `ProviderForm` → `setKey`
 * straight to Rust. The view resets to the list whenever the dialog closes.
 */
import { useEffect, useState } from 'react'
import { KeyRound, Plus } from 'lucide-react'
import type { ProviderConfig } from '@/services/ai/provider-types'
import { useProviders } from '@/hooks/queries/providers'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ProviderRow } from './ProviderRow'
import { ProviderForm } from './ProviderForm'

type View =
  | { readonly mode: 'list' }
  | { readonly mode: 'add' }
  | { readonly mode: 'edit'; readonly provider: ProviderConfig }

interface ProviderSettingsDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

export function ProviderSettingsDialog({
  open,
  onOpenChange,
}: ProviderSettingsDialogProps) {
  const [view, setView] = useState<View>({ mode: 'list' })
  const providers = useProviders()

  // Always return to the list when the dialog is (re)opened or closed, so a
  // half-finished form never lingers across sessions.
  useEffect(() => {
    if (!open) setView({ mode: 'list' })
  }, [open])

  const isForm = view.mode !== 'list'
  const list = providers.data ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" />
            {view.mode === 'add'
              ? '添加提供方'
              : view.mode === 'edit'
                ? '编辑提供方'
                : 'API Keys / 提供方'}
          </DialogTitle>
          <DialogDescription>
            {isForm
              ? '密钥仅保存在系统钥匙串，永不进入网页或磁盘明文。'
              : '管理模型提供方与密钥（BYOK）。密钥安全存于系统钥匙串。'}
          </DialogDescription>
        </DialogHeader>

        {view.mode === 'add' && (
          <ProviderForm onDone={() => setView({ mode: 'list' })} />
        )}

        {view.mode === 'edit' && (
          <ProviderForm
            initial={view.provider}
            onDone={() => setView({ mode: 'list' })}
          />
        )}

        {view.mode === 'list' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              {providers.isLoading ? (
                <>
                  <Skeleton className="h-14 w-full rounded-lg" />
                  <Skeleton className="h-14 w-full rounded-lg" />
                </>
              ) : providers.isError ? (
                <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-6 text-center text-sm text-destructive">
                  加载提供方失败
                </p>
              ) : list.length === 0 ? (
                <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-3 py-8 text-center">
                  <KeyRound className="size-5 text-muted-foreground" />
                  <p className="text-sm font-medium">尚未配置提供方</p>
                  <p className="text-xs text-muted-foreground">
                    添加一个提供方并填入 API Key 即可开始使用 AI 功能。
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
              添加提供方
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
