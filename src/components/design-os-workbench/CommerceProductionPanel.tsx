import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  CircleAlert,
  Download,
  FileKey2,
  LoaderCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  Upload,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import { createLocalProviderService } from '@/services/ai/provider-service.local'
import type { ProviderConfig } from '@/services/ai/provider-types'

const MAX_IMPORT_BYTES = 384 * 1024 * 1024
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

function eligibleProvider(provider: ProviderConfig, hasKey: boolean): boolean {
  const baseUrl = provider.baseUrl?.replace(/\/+$/, '') ?? DASHSCOPE_BASE_URL
  return provider.enabled
    && provider.kind === 'dashscope'
    && provider.wireProtocol === 'chat-completions'
    && baseUrl === DASHSCOPE_BASE_URL
    && hasKey
}

export function CommerceProductionPanel() {
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
          <h3 className="text-sm font-semibold">Commerce production</h3>
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
