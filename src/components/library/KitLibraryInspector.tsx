import { useMemo, useState } from 'react'
import { Check, Clipboard, Download, FileCode2, Upload, TriangleAlert, X } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { plural } from '@lingui/core/macro'
import { brandCandidateConflicts, brandCandidateSchema, confirmBrandCandidates, type BrandCandidate, type GlobalLibraryItem, type ProjectLibraryReference } from '@/global-library'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { auditKit, BRAND_SECTIONS, DESIGN_TABS } from './kit-library-audit'

export function KitLibraryInspector({ item, versions, references, onPublishBrandDecision, onClose }: {
  readonly item: GlobalLibraryItem
  readonly versions: readonly GlobalLibraryItem[]
  readonly references: readonly ProjectLibraryReference[]
  readonly onPublishBrandDecision?: (item: GlobalLibraryItem, candidates: readonly BrandCandidate[]) => Promise<void>
  readonly onClose: () => void
}) {
  const { t } = useLingui()
  const [density, setDensity] = useState<'compact' | 'extended'>('extended')
  const [tab, setTab] = useState<string>(DESIGN_TABS[0][0])
  const previous = [...versions].filter((candidate) => candidate.version !== item.version).at(-1)
  const report = useMemo(() => auditKit(item), [item])
  const consumption = references.filter((reference) => reference.itemId === item.id)
  const downloadManifest = () => {
    const blob = new Blob([JSON.stringify(item, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${item.id}-${item.version}.library.json`; anchor.click(); URL.revokeObjectURL(url)
  }
  return <aside aria-label={t({ id: 'kit_library.editor_aria', message: `${item.name} kit editor` })} className="flex min-h-0 w-full flex-col border-l border-border bg-background lg:w-[38rem]">
    <header className="flex items-center gap-2 border-b border-border px-3 py-2">
      <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">{item.name}</h2><p className="text-xs text-muted-foreground">v{item.version} · {item.contentSha256.slice(0, 12)}</p></div>
      <Button type="button" size="sm" variant="ghost" onClick={() => setDensity((value) => value === 'compact' ? 'extended' : 'compact')}>{density === 'compact' ? t({ id: 'kit_library.density_extended', message: 'Extended' }) : t({ id: 'kit_library.density_compact', message: 'Compact' })}</Button>
      <Button type="button" size="icon-sm" variant="ghost" aria-label={t({ id: 'kit_library.close_editor_aria', message: 'Close kit editor' })} onClick={onClose}><X /></Button>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <AuditSummary report={report} />
      {item.kind === 'brand-kit' ? <><BrandKitView item={item} compact={density === 'compact'} /><BrandBookConfirmation item={item} onPublish={onPublishBrandDecision} /></> : <DesignSystemView item={item} tab={tab} onTab={setTab} compact={density === 'compact'} />}
      <VersionDiff item={item} previous={previous} />
      <section className="border-t border-border p-3"><h3 className="text-xs font-semibold uppercase text-muted-foreground"><Trans id="kit_library.consumption_heading">Consumption</Trans></h3><p className="mt-2 text-sm">{consumption.length ? t({ id: 'kit_library.project_reference_count', message: plural(consumption.length, { one: '# project reference', other: '# project references' }) }) : t({ id: 'kit_library.not_used_by_project', message: 'Not used by a project' })}</p>{consumption.map((reference) => <p key={reference.id} className="mt-1 text-xs text-muted-foreground">{reference.projectId} · {reference.status} · {reference.updatePolicy}</p>)}</section>
    </div>
    <footer className="flex gap-2 border-t border-border p-3"><Button type="button" size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(JSON.stringify(item, null, 2))}><Clipboard /><Trans id="kit_library.copy_manifest">Copy manifest</Trans></Button><Button type="button" size="sm" onClick={downloadManifest}><Download /><Trans id="kit_library.download">Download</Trans></Button></footer>
  </aside>
}

function BrandBookConfirmation({ item, onPublish }: { readonly item: GlobalLibraryItem; readonly onPublish?: (item: GlobalLibraryItem, candidates: readonly BrandCandidate[]) => Promise<void> }) {
  const { t } = useLingui()
  const [candidates, setCandidates] = useState<readonly BrandCandidate[]>([]), [confirmed, setConfirmed] = useState<ReadonlySet<string>>(new Set()), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const decisions = confirmBrandCandidates(candidates, confirmed), conflicts = brandCandidateConflicts(decisions)
  const load = async (file: File) => { try { const parsed = JSON.parse(await file.text()) as unknown; const values = Array.isArray(parsed) ? parsed : (parsed as { candidates?: unknown })?.candidates; if (!Array.isArray(values)) throw new Error(t({ id: 'kit_library.error_expected_candidates', message: 'Expected a candidates array from the authorized Brand Book parser.' })); const next = values.map((value) => brandCandidateSchema.parse(value)); setCandidates(next); setConfirmed(new Set(next.filter(({ status }) => status === 'confirmed').map(({ id }) => id))); setError(null) } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) } }
  const publish = async () => { if (!onPublish || conflicts.length || !confirmed.size) return; setBusy(true); try { await onPublish(item, decisions); setCandidates([]); setConfirmed(new Set()); setError(null) } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) } finally { setBusy(false) } }
  return <section aria-label={t({ id: 'kit_library.brand_book_confirmation_aria', message: 'Brand Book confirmation' })} className="border-t border-border p-3">
    <div className="flex flex-wrap items-center gap-2"><div className="mr-auto"><h3 className="text-xs font-semibold uppercase text-muted-foreground"><Trans id="kit_library.brand_book_confirmation_heading">Brand Book confirmation</Trans></h3><p className="mt-1 text-xs text-muted-foreground"><Trans id="kit_library.brand_book_confirmation_hint">Import an authorized parser result. Nothing enters the kit until you confirm it.</Trans></p></div><Button asChild size="sm" variant="outline"><label><Upload /><Trans id="kit_library.import_candidates">Import candidates</Trans><input type="file" accept="application/json,.json" className="sr-only" aria-label={t({ id: 'kit_library.import_candidates_aria', message: 'Import Brand Book candidates' })} onChange={(event) => { const file = event.target.files?.[0]; if (file) void load(file); event.currentTarget.value = '' }} /></label></Button></div>
    {candidates.length ? <div className="mt-3 divide-y divide-border border-y border-border">{candidates.map((candidate) => <label key={candidate.id} className="flex items-start gap-2 py-2 text-xs"><input type="checkbox" checked={confirmed.has(candidate.id)} onChange={(event) => setConfirmed((current) => { const next = new Set(current); if (event.target.checked) next.add(candidate.id); else next.delete(candidate.id); return next })} /><span className="min-w-0 flex-1"><b className="uppercase">{candidate.kind}</b> · {candidate.value}<span className="ml-2 text-muted-foreground">{Math.round(candidate.confidence * 100)}% · {candidate.evidenceIds.join(', ')}</span></span></label>)}</div> : <p className="mt-3 text-xs text-muted-foreground"><Trans id="kit_library.parser_host_not_configured">Parser host not configured in this surface. Import its signed JSON result to review candidates.</Trans></p>}
    {conflicts.length ? <p role="alert" className="mt-2 text-xs text-destructive">{t({ id: 'kit_library.resolve_conflicts', message: `Resolve conflicting ${conflicts.map(({ kind }) => kind).join(', ')} candidates before publishing.` })}</p> : null}{error ? <p role="alert" className="mt-2 text-xs text-destructive">{error}</p> : null}
    {candidates.length ? <div className="mt-3 flex items-center justify-between"><span className="text-xs text-muted-foreground">{t({ id: 'kit_library.confirmed_rejected_summary', message: `${confirmed.size} confirmed · ${candidates.length - confirmed.size} rejected` })}</span><Button size="sm" disabled={busy || !confirmed.size || Boolean(conflicts.length)} onClick={() => void publish()}>{busy ? t({ id: 'kit_library.publishing', message: 'Publishing…' }) : t({ id: 'kit_library.publish_new_version', message: 'Publish new version' })}</Button></div> : null}
  </section>
}

function AuditSummary({ report }: { readonly report: ReturnType<typeof auditKit> }) {
  const { t } = useLingui()
  return <section aria-label={t({ id: 'kit_library.audit_aria', message: 'Kit audit' })} className="grid grid-cols-3 border-b border-border text-xs"><Audit label={t({ id: 'kit_library.audit_present', message: 'Present' })} value={report.present} icon={Check} /><Audit label={t({ id: 'kit_library.audit_missing', message: 'Missing' })} value={report.missing.length} icon={TriangleAlert} warn={report.missing.length > 0} /><Audit label={t({ id: 'kit_library.audit_conflicts', message: 'Conflicts' })} value={report.conflicts.length} icon={TriangleAlert} warn={report.conflicts.length > 0} /></section>
}
function Audit({ label, value, icon: Icon, warn=false }: { readonly label:string; readonly value:number; readonly icon:typeof Check; readonly warn?:boolean }) { return <div className="border-r border-border p-3 last:border-r-0"><Icon className={cn('mb-1 size-4', warn ? 'text-destructive' : 'text-muted-foreground')} /><b>{value}</b><span className="ml-1 text-muted-foreground">{label}</span></div> }

function BrandKitView({ item, compact }: { readonly item:GlobalLibraryItem; readonly compact:boolean }) {
  const { t } = useLingui()
  return <div className={cn('grid', compact ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2')}>{BRAND_SECTIONS.map(([label, pattern]) => { const files=item.content.artifacts.filter((artifact)=>pattern.test(artifact.path)); return <section key={label} className="min-h-24 border-b border-r border-border p-3"><h3 className="text-sm font-medium">{label}</h3>{files.length ? files.map((file)=><Artifact key={file.path} file={file}/>) : <p className="mt-3 text-xs text-destructive">{t({ id: 'kit_library.missing_from_kit', message: 'Missing from approved kit' })}</p>}</section> })}</div>
}

function DesignSystemView({ item, tab, onTab, compact }: { readonly item:GlobalLibraryItem; readonly tab:string; readonly onTab:(tab:string)=>void; readonly compact:boolean }) {
  const { t } = useLingui()
  const pattern=DESIGN_TABS.find(([label])=>label===tab)?.[1] ?? /$^/; const files=item.content.artifacts.filter((artifact)=>pattern.test(artifact.path))
  return <section><div role="tablist" aria-label={t({ id: 'kit_library.design_system_files_aria', message: 'Design system kit files' })} className="flex overflow-x-auto border-b border-border p-2">{DESIGN_TABS.map(([label])=><Button key={label} role="tab" aria-selected={tab===label} size="sm" variant={tab===label?'secondary':'ghost'} onClick={()=>onTab(label)}>{label}</Button>)}</div><div className={cn('grid min-h-48',compact?'grid-cols-1':'lg:grid-cols-2')}><div className="border-r border-border p-4"><p className="text-xs font-semibold uppercase text-muted-foreground"><Trans id="kit_library.preview_heading">Preview</Trans></p><div className="mt-3 grid grid-cols-3 gap-2">{['Aa','Primary','8 px'].map((value)=><div key={value} className="grid min-h-16 place-items-center border border-border bg-muted/20 text-xs">{value}</div>)}</div></div><div className="p-4"><p className="text-xs font-semibold uppercase text-muted-foreground"><Trans id="kit_library.source_heading">Source</Trans></p>{files.length?files.map((file)=><Artifact key={file.path} file={file}/>):<p className="mt-3 text-xs text-destructive">{t({ id: 'kit_library.missing_from_kit', message: 'Missing from approved kit' })}</p>}</div></div></section>
}

function Artifact({ file }: { readonly file:GlobalLibraryItem['content']['artifacts'][number] }) { return <div className="mt-2 flex items-start gap-2 text-xs"><FileCode2 className="mt-0.5 size-3.5 text-muted-foreground"/><div className="min-w-0"><p className="truncate font-mono">{file.path}</p><p className="text-muted-foreground">{file.mediaType} · {file.sha256.slice(0,8)}</p></div></div> }
function VersionDiff({ item, previous }: { readonly item:GlobalLibraryItem; readonly previous?:GlobalLibraryItem }) {
  const { t } = useLingui()
  const current=new Set(item.content.artifacts.map(({path})=>path)), old=new Set(previous?.content.artifacts.map(({path})=>path)??[]); const added=[...current].filter((path)=>!old.has(path)), removed=[...old].filter((path)=>!current.has(path))
  return <section aria-label={t({ id: 'kit_library.version_diff_aria', message: 'Version diff' })} className="border-t border-border p-3"><h3 className="text-xs font-semibold uppercase text-muted-foreground"><Trans id="kit_library.version_diff_heading">Version diff</Trans></h3>{previous?<p className="mt-2 text-sm">{t({ id: 'kit_library.version_diff_summary', message: `v${previous.version} → v${item.version} · +${added.length} / −${removed.length}` })}</p>:<p className="mt-2 text-sm text-muted-foreground"><Trans id="kit_library.first_available_version">First available version</Trans></p>}</section>
}
