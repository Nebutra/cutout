import { useEffect, useState } from 'react'
import { FolderOpen, ShieldCheck } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { plural } from '@lingui/core/macro'
import { Button } from '@/components/ui/button'
import { createTauriRegistryDesktopBridge, type RegistryDesktopBridge, type RegistryInstallPlan, type RegistryInstallReceipt, type RegistryItem } from '@/registry'
import { setAuthorizedWorkspace } from '@/platform/authorized-workspace'

export function RegistryInstallPanel({ item, files }: { readonly item: RegistryItem; readonly files: readonly { path: string; bytes: Uint8Array }[] }) {
  const { t } = useLingui()
  const [bridge, setBridge] = useState<RegistryDesktopBridge>()
  const [workspace, setWorkspace] = useState<{ handle: string; label?: string }>()
  const [plan, setPlan] = useState<RegistryInstallPlan>()
  const [receipt, setReceipt] = useState<RegistryInstallReceipt>()
  useEffect(() => { void createTauriRegistryDesktopBridge().then(setBridge) }, [])
  return (
    <section aria-label={t({ id: 'registry_install.section_aria', message: 'Registry install' })} className="space-y-2 border-t border-border p-3">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!bridge}
          onClick={() => void bridge?.authorize().then((result) => { if (!result.canceled && result.handle) { const authorized={ handle: result.handle, label: result.label };setWorkspace(authorized);setAuthorizedWorkspace(authorized) } })}
        >
          <FolderOpen />
          <Trans id="registry_install.authorize_workspace">Authorize workspace</Trans>
        </Button>
        {workspace ? <span className="text-xs text-muted-foreground">{workspace.label ?? t({ id: 'registry_install.authorized_workspace_fallback', message: 'Authorized workspace' })}</span> : null}
      </div>
      <Button
        size="sm"
        disabled={!bridge || !workspace}
        onClick={() => workspace && void bridge?.preview({ workspaceHandle: workspace.handle, item, files }).then(setPlan)}
      >
        <Trans id="registry_install.preview_install">Preview install</Trans>
      </Button>
      {plan ? (
        <div className="rounded border border-border p-2 text-xs">
          <p>{t({
            id: 'registry_install.plan_summary',
            message: `${plural(plan.files.length, { one: '# file', other: '# files' })} · ${plural(plan.conflicts.length, { one: '# conflict', other: '# conflicts' })}`,
          })}</p>
          {plan.files.map((file) => <p key={file.path}>{file.status} · {file.path}</p>)}
          <Button className="mt-2" size="sm" disabled={Boolean(plan.conflicts.length)} onClick={() => void bridge?.apply(plan.id, `approval.${crypto.randomUUID()}`).then(setReceipt)}>
            <ShieldCheck />
            <Trans id="registry_install.approve_and_install">Approve and install</Trans>
          </Button>
        </div>
      ) : null}
      {receipt ? (
        <p role="status" className="text-xs">
          {t({
            id: 'registry_install.receipt_summary',
            message: `${receipt.status} · ${plural(receipt.fileHashes.length, { one: '# verified file', other: '# verified files' })}`,
          })}
        </p>
      ) : null}
      {!bridge ? (
        <p className="text-xs text-muted-foreground">
          <Trans id="registry_install.requires_desktop_app">Registry desktop host requires the Cutout desktop app.</Trans>
        </p>
      ) : null}
    </section>
  )
}
