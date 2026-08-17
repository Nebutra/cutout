import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Boxes,
  CheckCircle2,
  CircleAlert,
  Download,
  FileJson2,
  FileKey2,
  ImagePlus,
  LoaderCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  Upload,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  commerceHeldOutEvaluatorAttestationSchema,
  decodeCommerceHeldOutEvaluatorPackage,
  type CommerceHeldOutEvaluatorAttestation,
  type CommerceHeldOutEvaluatorPackage,
} from '@/commerce-profile/held-out'
import {
  decodeCommerceHeldOutPendingAdmission,
  type CommerceHeldOutPendingAdmission,
} from '@/commerce-profile/production-runner'
import {
  admitCommerceHeldOutPending,
  runCommerceHeldOutEvaluatorPackage,
  type CommerceHeldOutAdmittedEvidence,
} from '@/commerce-profile/production-session'
import {
  COMMERCE_SEMANTIC_ROLES,
  runCommerceProjectProduction,
  type CommerceProjectDeliverable,
  type CommerceProjectProductionResult,
} from '@/commerce-profile'
import { formatBytes } from '@/lib/image'
import { aiDisplayErrorMessage } from '@/services/ai/display-error-message'
import { CommerceDeliverablePreview } from './CommerceDeliverablePreview'
import { commerceRoleLabel } from './commerce-view-labels'
import { createLocalProviderService } from '@/services/ai/provider-service.local'
import type { ProviderConfig } from '@/services/ai/provider-types'

const MAX_IMPORT_BYTES = 384 * 1024 * 1024
const MAX_PROJECT_JSON_BYTES = 8 * 1024 * 1024
const DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function safeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 120)
}

async function readJsonFile(file: File): Promise<unknown> {
  if (file.size < 2 || file.size > MAX_IMPORT_BYTES) {
    throw new Error('Commerce evidence JSON is empty or exceeds the 384 MiB import limit.')
  }
  try {
    return JSON.parse(await file.text())
  } catch {
    throw new Error('Commerce evidence file is not valid JSON.')
  }
}

function downloadJson(filename: string, value: unknown): void {
  const url = URL.createObjectURL(new Blob(
    [`${JSON.stringify(value, null, 2)}\n`],
    { type: 'application/json;charset=utf-8' },
  ))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

async function readProjectJson(file: File, label: string): Promise<string> {
  if (file.size < 2 || file.size > MAX_PROJECT_JSON_BYTES) {
    throw new Error(`${label} is empty or exceeds 8 MiB.`)
  }
  const contents = await file.text()
  try {
    JSON.parse(contents)
  } catch {
    throw new Error(`${label} is not valid JSON.`)
  }
  return contents
}

function eligibleProvider(provider: ProviderConfig, hasKey: boolean): boolean {
  const baseUrl = provider.baseUrl?.replace(/\/+$/, '') ?? DASHSCOPE_BASE_URL
  return provider.enabled
    && provider.kind === 'dashscope'
    && provider.wireProtocol === 'chat-completions'
    && baseUrl === DASHSCOPE_BASE_URL
    && hasKey
}

export interface CommerceProductionPanelProps {
  readonly modeScope?: 'project' | 'benchmark' | 'both'
  readonly retainedResult?: CommerceProjectProductionResult
  readonly retainedResultStale?: boolean
  readonly onCompleted?: (result: CommerceProjectProductionResult) => void
  readonly onReset?: () => void
  readonly onRequestReview?: () => void
}

export function CommerceProductionPanel({
  modeScope = 'both',
  retainedResult,
  retainedResultStale = false,
  onCompleted,
  onReset,
  onRequestReview,
}: CommerceProductionPanelProps = {}) {
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-4" data-slot="commerce-production">
      <div className="flex min-w-0 items-center gap-3 border-b border-border pb-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
          <Boxes className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">
            {modeScope === 'benchmark' ? 'Commerce benchmark admission' : 'Commerce production'}
          </h3>
          <p className="text-xs text-muted-foreground">
            {modeScope === 'benchmark' ? 'Held-out evaluator evidence' : 'Localized product material set'}
          </p>
        </div>
      </div>
      {modeScope === 'project' ? (
        <CommerceProjectMode
          retainedResult={retainedResult}
          retainedResultStale={retainedResultStale}
          onCompleted={onCompleted}
          onReset={onReset}
          onRequestReview={onRequestReview}
        />
      ) : modeScope === 'benchmark' ? <CommerceBenchmarkMode /> : (
        <Tabs defaultValue="project" className="min-w-0 gap-4">
          <TabsList aria-label="Commerce production mode">
            <TabsTrigger value="project">Project</TabsTrigger>
            <TabsTrigger value="benchmark">Benchmark</TabsTrigger>
          </TabsList>
          <TabsContent value="project"><CommerceProjectMode /></TabsContent>
          <TabsContent value="benchmark"><CommerceBenchmarkMode /></TabsContent>
        </Tabs>
      )}
    </div>
  )
}

function CommerceProjectMode({
  retainedResult,
  retainedResultStale,
  onCompleted,
  onReset,
  onRequestReview,
}: Omit<CommerceProductionPanelProps, 'modeScope'>) {
  const providerService = useMemo(() => createLocalProviderService(), [])
  const abortController = useRef<AbortController | null>(null)
  const [providers, setProviders] = useState<readonly ProviderConfig[]>([])
  const [providerId, setProviderId] = useState('')
  const [productFile, setProductFile] = useState<File | null>(null)
  const [categoryFile, setCategoryFile] = useState<File | null>(null)
  const [attributeFile, setAttributeFile] = useState<File | null>(null)
  const [referenceFiles, setReferenceFiles] = useState<readonly File[]>([])
  const [partial, setPartial] = useState<readonly CommerceProjectDeliverable[]>(
    () => retainedResult?.deliverables ?? [],
  )
  const [result, setResult] = useState<CommerceProjectProductionResult | null>(
    () => retainedResult ?? null,
  )
  const [activeRole, setActiveRole] = useState<(typeof COMMERCE_SEMANTIC_ROLES)[number] | null>(null)
  const [busy, setBusy] = useState<'providers' | 'running' | null>('providers')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setResult(retainedResult ?? null)
    setPartial(retainedResult?.deliverables ?? [])
  }, [retainedResult])

  useEffect(() => {
    let active = true
    void providerService.list()
      .then(async (configured) => {
        const statuses = await providerService.statuses(configured.map((provider) => provider.id))
        if (!active) return
        const eligible = configured.filter((provider) => eligibleProvider(provider, statuses[provider.id] === true))
        setProviders(eligible)
        setProviderId((current) => current || eligible[0]?.id || '')
      })
      .catch((reason) => {
        if (active) setError(aiDisplayErrorMessage(reason))
      })
      .finally(() => {
        if (active) setBusy(null)
      })
    return () => {
      active = false
      abortController.current?.abort()
    }
  }, [providerService])

  const clearRun = () => {
    abortController.current?.abort()
    abortController.current = null
    setPartial([])
    setResult(null)
    setActiveRole(null)
    setError(null)
    setBusy(null)
    onReset?.()
  }

  const addReferences = (files: FileList | null) => {
    const next = [...referenceFiles, ...Array.from(files ?? [])]
    if (next.length > 3) {
      setError('Commerce Project accepts up to three product reference images.')
      return
    }
    setReferenceFiles(next)
    setError(null)
    setResult(null)
    setPartial([])
    setActiveRole(null)
    onReset?.()
  }

  const replaceJsonFile = (
    setter: (file: File | null) => void,
    file: File | null,
  ) => {
    setter(file)
    setResult(null)
    setPartial([])
    setActiveRole(null)
    setError(null)
    onReset?.()
  }

  const removeReference = (index: number) => {
    setReferenceFiles((current) => current.filter((_, item) => item !== index))
    setResult(null)
    setPartial([])
    setActiveRole(null)
    setError(null)
    onReset?.()
  }

  const canRun = Boolean(
    productFile && categoryFile && attributeFile && referenceFiles.length && providerId,
  ) && busy !== 'running'

  const run = async () => {
    if (!productFile || !categoryFile || !attributeFile || referenceFiles.length < 1 || !providerId || busy) return
    const controller = new AbortController()
    abortController.current = controller
    setBusy('running')
    setError(null)
    setResult(null)
    setPartial([])
    setActiveRole(null)
    try {
      const [productContents, categoryContents, attributeContents, references] = await Promise.all([
        readProjectJson(productFile, 'Product record'),
        readProjectJson(categoryFile, 'Category catalog'),
        readProjectJson(attributeFile, 'Attribute catalog'),
        Promise.all(referenceFiles.map(async (file) => ({
          fileName: file.name,
          mediaType: file.type || undefined,
          bytes: new Uint8Array(await file.arrayBuffer()),
        }))),
      ])
      const completed = await runCommerceProjectProduction({
        providerId,
        product: { fileName: productFile.name, contents: productContents },
        categoryCatalog: { fileName: categoryFile.name, contents: categoryContents },
        attributeCatalog: { fileName: attributeFile.name, contents: attributeContents },
        references,
        signal: controller.signal,
        onProgress: (event) => {
          setActiveRole(event.semanticRole)
          if (event.type !== 'deliverable-completed') return
          setPartial((current) => [
            ...current.filter((deliverable) => deliverable.semanticRole !== event.semanticRole),
            event.deliverable,
          ].sort((left, right) => (
            COMMERCE_SEMANTIC_ROLES.indexOf(left.semanticRole) - COMMERCE_SEMANTIC_ROLES.indexOf(right.semanticRole)
          )))
        },
      })
      setResult(completed)
      setPartial(completed.deliverables)
      setActiveRole(null)
      onCompleted?.(completed)
    } catch (reason) {
      setError(controller.signal.aborted ? 'Commerce Project run cancelled.' : aiDisplayErrorMessage(reason))
    } finally {
      if (abortController.current === controller) abortController.current = null
      setBusy(null)
    }
  }

  const setupStatus = result
    ? retainedResultStale ? 'Stale revision' : 'Completed'
    : busy === 'providers'
      ? 'Checking provider'
      : busy === 'running'
        ? `${partial.length}/${COMMERCE_SEMANTIC_ROLES.length}`
        : providers.length === 0
          ? 'Provider required'
          : canRun
            ? 'Ready to run'
            : 'Setup required'

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
      <section className="min-w-0 border-r-0 border-border lg:border-r lg:pr-5" aria-label="Commerce Project setup">
        <div className="mb-4 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-semibold">Run inputs</h4>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              Catalog records and product references for this run.
            </p>
          </div>
          <Badge className="ml-auto" variant={result && !retainedResultStale ? 'secondary' : 'outline'}>
            {setupStatus}
          </Badge>
          {(result || partial.length || error) && busy !== 'running' ? (
            <Button type="button" variant="ghost" size="icon-sm" onClick={clearRun} title="Clear run">
              <RotateCcw className="size-4" />
            </Button>
          ) : null}
        </div>

        {error ? (
          <div role="alert" className="mb-4 flex items-start gap-2 border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="grid gap-3">
          <ProjectFileField label="Product record" file={productFile} icon={<FileJson2 />} disabled={busy === 'running'} onSelect={(file) => replaceJsonFile(setProductFile, file)} />
          <ProjectFileField label="Category catalog" file={categoryFile} icon={<FileJson2 />} disabled={busy === 'running'} onSelect={(file) => replaceJsonFile(setCategoryFile, file)} />
          <ProjectFileField label="Attribute catalog" file={attributeFile} icon={<FileJson2 />} disabled={busy === 'running'} onSelect={(file) => replaceJsonFile(setAttributeFile, file)} />
          <div className="grid gap-1.5">
            <Label className="text-xs">Product references</Label>
            <Button asChild type="button" variant="outline" size="sm" className={busy === 'running' || referenceFiles.length >= 3 ? 'pointer-events-none opacity-50' : undefined}>
              <label aria-disabled={busy === 'running' || referenceFiles.length >= 3}><ImagePlus /> Add images<input className="sr-only" type="file" multiple disabled={busy === 'running' || referenceFiles.length >= 3} accept="image/png,image/jpeg,image/webp" onChange={(event) => { addReferences(event.currentTarget.files); event.currentTarget.value = '' }} /></label>
            </Button>
            {referenceFiles.map((file, index) => (
              <div key={`${file.name}:${file.size}:${index}`} className="flex min-w-0 items-center gap-2 border-b border-border py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="shrink-0 text-muted-foreground">{formatBytes(file.size)}</span>
                <Button type="button" variant="ghost" size="icon-sm" disabled={busy === 'running'} aria-label={`Remove ${file.name}`} onClick={() => removeReference(index)}>
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Provider</Label>
            <Select value={providerId} onValueChange={setProviderId} disabled={busy === 'providers' || busy === 'running'}>
              <SelectTrigger><SelectValue placeholder="No eligible DashScope Provider" /></SelectTrigger>
              <SelectContent>{providers.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>{provider.label}</SelectItem>
              ))}</SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" size="sm" onClick={() => void run()} disabled={!canRun}>
              {busy === 'running' ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
              {busy === 'running' ? 'Running' : error && partial.length ? 'Retry run' : 'Generate set'}
            </Button>
            {busy === 'running' ? (
              <Button type="button" variant="outline" size="icon-sm" onClick={() => abortController.current?.abort()} title="Cancel run">
                <Square className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="min-w-0" aria-label="Commerce Project production">
        <div className="mb-3 flex min-w-0 items-center gap-3">
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-semibold">Material set</h4>
            <p className="truncate text-xs text-muted-foreground">
              {result ? result.run.runId : activeRole ? commerceRoleLabel(activeRole) : 'No run started'}
            </p>
          </div>
          {result && onRequestReview ? (
            <Button type="button" variant="outline" size="sm" onClick={onRequestReview}>
              <ShieldCheck /> {retainedResultStale ? 'Review stale result' : 'Review set'}
            </Button>
          ) : null}
        </div>
        <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden border border-border bg-border sm:grid-cols-4 lg:grid-cols-6">
          {COMMERCE_SEMANTIC_ROLES.map((role) => {
            const complete = partial.some((deliverable) => deliverable.semanticRole === role)
            const failed = Boolean(error && activeRole === role && !complete)
            const running = busy === 'running' && activeRole === role && !complete
            return (
              <div key={role} className="min-h-14 bg-background p-2 text-[11px]">
                <div className="mb-1 flex items-center gap-1.5">
                  {complete ? <CheckCircle2 className="size-3.5 text-emerald-600" />
                    : failed ? <CircleAlert className="size-3.5 text-destructive" />
                      : running ? <LoaderCircle className="size-3.5 animate-spin" />
                        : <span className="size-2 rounded-full bg-muted-foreground/30" />}
                  <span className="truncate font-medium">{shortRoleLabel(role)}</span>
                </div>
                <span className="text-muted-foreground">{complete ? 'QA complete' : failed ? 'Stopped' : running ? 'Producing' : 'Queued'}</span>
              </div>
            )
          })}
        </div>

        {partial.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Retained Commerce deliverables">
            {partial.map((deliverable) => (
              <CommerceDeliverablePreview key={deliverable.semanticRole} deliverable={deliverable} />
            ))}
          </div>
        ) : (
          <div className="flex min-h-52 items-center justify-center border border-dashed border-border text-xs text-muted-foreground">
            <Boxes className="mr-2 size-4" /> Material set
          </div>
        )}
      </section>
    </div>
  )
}

function CommerceBenchmarkMode() {
  const providerService = useMemo(() => createLocalProviderService(), [])
  const abortController = useRef<AbortController | null>(null)
  const [providers, setProviders] = useState<readonly ProviderConfig[]>([])
  const [providerId, setProviderId] = useState('')
  const [evaluatorPackage, setEvaluatorPackage] = useState<CommerceHeldOutEvaluatorPackage | null>(null)
  const [pending, setPending] = useState<CommerceHeldOutPendingAdmission | null>(null)
  const [attestation, setAttestation] = useState<CommerceHeldOutEvaluatorAttestation | null>(null)
  const [admitted, setAdmitted] = useState<CommerceHeldOutAdmittedEvidence | null>(null)
  const [busy, setBusy] = useState<'providers' | 'running' | 'admitting' | null>('providers')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void providerService.list()
      .then(async (configured) => {
        const statuses = await providerService.statuses(configured.map((provider) => provider.id))
        if (!active) return
        const eligible = configured.filter((provider) => eligibleProvider(provider, statuses[provider.id] === true))
        setProviders(eligible)
        setProviderId((current) => current || eligible[0]?.id || '')
      })
      .catch((reason) => {
        if (active) setError(errorMessage(reason))
      })
      .finally(() => {
        if (active) setBusy(null)
      })
    return () => {
      active = false
      abortController.current?.abort()
    }
  }, [providerService])

  const reset = () => {
    abortController.current?.abort()
    abortController.current = null
    setEvaluatorPackage(null)
    setPending(null)
    setAttestation(null)
    setAdmitted(null)
    setError(null)
  }

  const importEvaluatorPackage = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      const decoded = await decodeCommerceHeldOutEvaluatorPackage(await readJsonFile(file))
      setEvaluatorPackage(decoded)
      setPending(null)
      setAttestation(null)
      setAdmitted(null)
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }

  const importPending = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      setPending(await decodeCommerceHeldOutPendingAdmission(await readJsonFile(file)))
      setAttestation(null)
      setAdmitted(null)
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }

  const importAttestation = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      setAttestation(commerceHeldOutEvaluatorAttestationSchema.parse(await readJsonFile(file)))
      setAdmitted(null)
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }

  const run = async () => {
    if (!evaluatorPackage || !providerId || busy) return
    const controller = new AbortController()
    abortController.current = controller
    setBusy('running')
    setError(null)
    setPending(null)
    setAttestation(null)
    setAdmitted(null)
    try {
      setPending(await runCommerceHeldOutEvaluatorPackage({
        evaluatorPackage,
        providerId,
        signal: controller.signal,
      }))
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      if (abortController.current === controller) abortController.current = null
      setBusy(null)
    }
  }

  const admit = async () => {
    if (!pending || !attestation || busy) return
    setBusy('admitting')
    setError(null)
    try {
      setAdmitted(await admitCommerceHeldOutPending({ pending, evaluatorAttestation: attestation }))
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(null)
    }
  }

  const runId = pending?.commitment.runId ?? evaluatorPackage?.evaluatorChallenge.payload.allowedRunId
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-4" data-slot="commerce-production">
      <div className="flex min-w-0 items-center gap-3 border-b border-border pb-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
          <ShieldCheck className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Evaluator run</h3>
          <p className="truncate text-xs text-muted-foreground">
            {admitted ? 'Native admission complete' : pending ? 'Evaluator completion pending' : 'Held-out evaluator run'}
          </p>
        </div>
        <Badge variant={admitted ? 'secondary' : 'outline'}>{admitted ? '14/14' : '5/14'}</Badge>
        {(evaluatorPackage || pending || admitted) ? (
          <Button type="button" variant="ghost" size="icon" onClick={reset} title="New run">
            <RotateCcw className="size-4" />
          </Button>
        ) : null}
      </div>

      {error ? (
        <div role="alert" className="flex items-start gap-2 border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Stage number="1" title="Challenge" ready={Boolean(evaluatorPackage || pending)}>
          {evaluatorPackage ? (
            <dl className="grid gap-1 text-xs">
              <Row label="Challenge" value={evaluatorPackage.evaluatorChallenge.payload.challengeId} />
              <Row label="Run" value={evaluatorPackage.evaluatorChallenge.payload.allowedRunId} />
              <Row label="Sources" value={String(evaluatorPackage.inputManifest.selectedSources.length)} />
              <Row label="Expires" value={new Date(evaluatorPackage.evaluatorChallenge.payload.expiresAt).toLocaleString()} />
            </dl>
          ) : (
            <Button asChild type="button" variant="outline" size="sm">
              <label><Upload /> Import evaluator package<input className="sr-only" type="file" accept="application/json,.json" onChange={(event) => void importEvaluatorPackage(event.target.files?.[0])} /></label>
            </Button>
          )}
        </Stage>

        <Stage number="2" title="Provider run" ready={Boolean(pending)}>
          {!pending ? (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Provider</Label>
                <Select value={providerId} onValueChange={setProviderId} disabled={busy === 'providers'}>
                  <SelectTrigger><SelectValue placeholder="No eligible DashScope Provider" /></SelectTrigger>
                  <SelectContent>{providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>{provider.label}</SelectItem>
                  ))}</SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={() => void run()} disabled={!evaluatorPackage || !providerId || Boolean(busy)}>
                  {busy === 'running' ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
                  {busy === 'running' ? 'Running' : 'Start run'}
                </Button>
                {busy === 'running' ? (
                  <Button type="button" variant="outline" size="icon-sm" onClick={() => abortController.current?.abort()} title="Cancel run">
                    <Square className="size-4" />
                  </Button>
                ) : null}
              </div>
              <Button asChild type="button" variant="ghost" size="sm">
                <label><Upload /> Recover pending bundle<input className="sr-only" type="file" accept="application/json,.json" onChange={(event) => void importPending(event.target.files?.[0])} /></label>
              </Button>
            </div>
          ) : (
            <div className="grid gap-2 text-xs">
              <Row label="Run" value={pending.commitment.runId} />
              <Row label="Deliverables" value={String(pending.bundle.artifacts.length)} />
              <Row label="Bundle" value={pending.completionRequest.bundleHash} />
              <Button type="button" variant="outline" size="sm" onClick={() => downloadJson(`commerce-${safeFilePart(pending.commitment.runId)}-pending.json`, pending)}>
                <Download /> Export pending bundle
              </Button>
            </div>
          )}
        </Stage>

        <Stage number="3" title="Admission" ready={Boolean(admitted)}>
          {admitted ? (
            <div className="grid gap-2 text-xs">
              <div className="flex items-center gap-2 text-foreground"><CheckCircle2 className="size-4" /> Production ready</div>
              <Row label="Coverage" value="14/14" />
              <Row label="Run" value={admitted.pending.commitment.runId} />
              <Button type="button" variant="outline" size="sm" onClick={() => downloadJson(`commerce-${safeFilePart(admitted.pending.commitment.runId)}-admitted.json`, admitted)}>
                <Download /> Export admitted evidence
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {attestation ? (
                <dl className="grid gap-1 text-xs">
                  <Row label="Attestation" value={attestation.payload.attestationId} />
                  <Row label="Key" value={attestation.payload.evaluatorKeyId} />
                </dl>
              ) : (
                <Button asChild type="button" variant="outline" size="sm">
                  <label><FileKey2 /> Import completion<input className="sr-only" type="file" accept="application/json,.json" onChange={(event) => void importAttestation(event.target.files?.[0])} /></label>
                </Button>
              )}
              <Button type="button" size="sm" onClick={() => void admit()} disabled={!pending || !attestation || Boolean(busy)}>
                {busy === 'admitting' ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                Verify and admit
              </Button>
            </div>
          )}
        </Stage>
      </div>

      {runId ? <p className="truncate font-mono text-[11px] text-muted-foreground">{runId}</p> : null}
    </div>
  )
}

function ProjectFileField({ label, file, icon, disabled, onSelect }: {
  readonly label: string
  readonly file: File | null
  readonly icon: React.ReactNode
  readonly disabled: boolean
  readonly onSelect: (file: File | null) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Button asChild type="button" variant="outline" size="sm" className={disabled ? 'pointer-events-none opacity-50' : undefined}>
        <label aria-disabled={disabled}>
          {icon}
          <span className="min-w-0 flex-1 truncate text-left">{file?.name ?? 'Choose JSON'}</span>
          <input className="sr-only" type="file" disabled={disabled} accept="application/json,.json" onChange={(event) => {
            onSelect(event.currentTarget.files?.[0] ?? null)
            event.currentTarget.value = ''
          }} />
        </label>
      </Button>
    </div>
  )
}

function shortRoleLabel(role: (typeof COMMERCE_SEMANTIC_ROLES)[number]): string {
  if (role === 'localized-description:en-US') return 'EN copy'
  if (role === 'localized-description:ko-KR') return 'KO copy'
  if (role === 'localized-description:pt-BR') return 'PT copy'
  if (role === 'main-image') return 'Main'
  if (role.startsWith('detail-image:')) return `Detail ${role.split(':')[1]}`
  if (role === 'product-video') return 'Video'
  return 'Strategy'
}

function Stage({ number, title, ready, children }: {
  readonly number: string
  readonly title: string
  readonly ready: boolean
  readonly children: React.ReactNode
}) {
  return (
    <section className="min-w-0 border border-border bg-background p-3">
      <header className="mb-3 flex items-center gap-2 border-b border-border pb-2">
        <span className="flex size-6 items-center justify-center rounded-sm bg-muted text-xs font-semibold">{number}</span>
        <h4 className="text-xs font-semibold">{title}</h4>
        {ready ? <CheckCircle2 className="ml-auto size-4 text-emerald-600" /> : null}
      </header>
      {children}
    </section>
  )
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[80px_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono" title={value}>{value}</dd>
    </div>
  )
}
