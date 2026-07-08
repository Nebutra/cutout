import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react'
import {
  Archive,
  ArrowUp,
  CheckCircle2,
  Circle,
  ExternalLink,
  FileText,
  Globe,
  ImageIcon,
  Layers3,
  Loader2,
  MessageCircle,
  MousePointerClick,
  PackageOpen,
  Paperclip,
  Route,
  Scissors,
  Settings2,
  Tag,
  WandSparkles,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { getStoreState, useStore } from '@/store'
import { useSource, useSlices, useStatus } from '@/store/selectors'
import { useServices } from '@/services/context'
import { isErr } from '@/services/types'
import type { ModelAssignment } from '@/services/ai/model-assignment-types'
import { recordAiNativeDiagnostic } from '@/services/ai-native/diagnostics'
import { useModelAssignments } from '@/hooks/queries/ai-settings'
import {
  useDeconstructMockup,
  useNameSlices,
  usePrepareDeconstructMockup,
} from '@/hooks/queries/pipeline'
import { useSettingsUI } from '@/components/settings/settings-ui'
import { planPrototype } from '@/prototype/planner'
import type {
  PrototypeHumanLoop,
  PrototypePage,
  PrototypePlan,
} from '@/prototype/prototype-plan'
import {
  pagesForScope,
  prototypeBoardExtractionBrief,
  prototypeDesignMarkdown,
  prototypeDesignMarkdownSynthesisSystem,
  prototypeDesignSystemPrompt,
  prototypePagePrompt,
  type PrototypeSuiteScope,
} from '@/prototype/generate-suite'
import {
  fallbackPrototypeSliceNames,
  isGenericSliceFilename,
} from '@/prototype/asset-names'
import { createPrototypeAssetManifest } from '@/prototype/asset-manifest'
import type {
  PersistedPrototypeDesignSystem,
  PersistedPrototypeImage,
  PersistedPrototypePage,
  PersistedReferenceAttachment,
  WorkspaceNamingStatus,
  WorkspaceSnapshot,
  WorkspaceWorkflowPhase,
} from '@/workspace/workspace-snapshot'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { SourceCanvas } from '@/components/source/SourceCanvas'
import { SliceGrid } from '@/components/slices/SliceGrid'
import { OutputCanvas, type CanvasImageItem } from './OutputCanvas'
import { AgentConversation } from './AgentConversation'
import {
  useAgentConversation,
  type AgentMessage,
} from './agent-conversation'
import { bytesToBlob, blobToBytes, decodeImage, isSupportedImage } from '@/lib/image'
import { cn } from '@/lib/utils'

type AssetStageId =
  | 'idle'
  | 'planning'
  | 'review'
  | 'design-system'
  | 'preparing'
  | 'mockup'
  | 'deconstruct'
  | 'cutout'
  | 'naming'
  | 'done'
type WorkflowPhase = WorkspaceWorkflowPhase
type NamingStatus = WorkspaceNamingStatus
type WorkspaceSidebarSection = 'file' | 'agent'

interface AssetStage {
  readonly id: Exclude<AssetStageId, 'idle'>
  readonly label: string
  readonly detail: string
  readonly icon: ComponentType<{ className?: string }>
  readonly status: 'pending' | 'running' | 'done'
}

interface ActivityEvent {
  readonly id: string
  readonly label: string
  readonly detail: string
  readonly status: AssetStage['status']
}

interface PrototypeImageArtifact extends PersistedPrototypeImage {
  readonly blob: Blob
}

interface PrototypeDesignSystemArtifact
  extends PrototypeImageArtifact,
    Omit<PersistedPrototypeDesignSystem, keyof PersistedPrototypeImage> {}

interface PrototypePageArtifact
  extends PrototypeImageArtifact,
    Omit<PersistedPrototypePage, keyof PersistedPrototypeImage> {}

interface ReferenceAttachment extends PersistedReferenceAttachment {
  readonly blob: Blob
  /** `URL.createObjectURL(blob)` — revoked on removal / unmount. */
  readonly url: string
}

type HumanLoopAnswer = Extract<PrototypeHumanLoop, { mode: 'ask' }>['choices'][number]
type ResolvedHumanLoopAnswer =
  | { readonly kind: 'choice'; readonly choice: HumanLoopAnswer; readonly note: string | null }
  | { readonly kind: 'custom'; readonly text: string }

const CUSTOM_HUMAN_LOOP_ID = '__custom__'
const SERIAL_REFERENCE_PAGE_LIMIT = 4
type DesignMarkdownAsset = ReturnType<typeof useStore.getState>['designMarkdown']
type GenerationError = ReturnType<typeof useStore.getState>['genError']

export function IntentWorkspace({
  onArchiveProject,
}: {
  readonly onArchiveProject: () => void
}) {
  const services = useServices()
  const initialWorkspace = useStore((s) => s.workspaceSnapshot)
  const setWorkspaceSnapshot = useStore((s) => s.setWorkspaceSnapshot)
  const [agentBusy, setAgentBusy] = useState(false)
  const [attachments, setAttachments] = useState<readonly ReferenceAttachment[]>(
    () => restoreReferenceAttachments(initialWorkspace?.attachments ?? []),
  )
  const [webSearchEnabled, setWebSearchEnabled] = useState(
    () => initialWorkspace?.webSearchEnabled ?? false,
  )
  // Streaming design-agent conversation (infrastructure; a future agent loop
  // drives `agent.stream(...)` — see AgentConversation).
  const agent = useAgentConversation()
  // Track the live attachment list so unmount can revoke every object URL.
  const attachmentsRef = useRef<readonly ReferenceAttachment[]>([])
  attachmentsRef.current = attachments
  useEffect(
    () => () => {
      for (const item of attachmentsRef.current) URL.revokeObjectURL(item.url)
    },
    [],
  )

  /** Attach files: markdown → the DESIGN.md contract; images → reference set. */
  function onAttachFiles(files: FileList | null): void {
    if (!files) return
    for (const file of Array.from(files)) {
      if (/\.(md|markdown|mdx)$/i.test(file.name)) {
        void file
          .text()
          .then((content) =>
            getStoreState().setDesignMarkdown({
              name: file.name,
              content,
              importedAt: Date.now(),
            }),
          )
      } else if (isSupportedImage(file)) {
        void blobToBytes(file).then((bytes) => {
          setAttachments((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              name: file.name,
              bytes,
              mediaType: file.type || 'image/png',
              blob: file,
              url: URL.createObjectURL(file),
            },
          ])
        })
      }
    }
  }

  function removeAttachment(id: string): void {
    setAttachments((prev) => {
      const found = prev.find((item) => item.id === id)
      if (found) URL.revokeObjectURL(found.url)
      return prev.filter((item) => item.id !== id)
    })
  }
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null)
  const [workflowPhase, setWorkflowPhase] = useState<WorkflowPhase>(() =>
    recoverWorkflowPhase(initialWorkspace),
  )
  const [prototypePlan, setPrototypePlan] = useState<PrototypePlan | null>(
    () => initialWorkspace?.prototypePlan ?? null,
  )
  const [prototypeScope, setPrototypeScope] =
    useState<PrototypeSuiteScope>(() => initialWorkspace?.prototypeScope ?? 'primary-flow')
  const [humanLoopChoiceId, setHumanLoopChoiceId] = useState<string | null>(
    () => initialWorkspace?.humanLoopChoiceId ?? null,
  )
  const [prototypePages, setPrototypePages] = useState<readonly PrototypePageArtifact[]>(
    () => restorePrototypePages(initialWorkspace?.prototypePages ?? []),
  )
  const [prototypeDesignSystem, setPrototypeDesignSystem] =
    useState<PrototypeDesignSystemArtifact | null>(() =>
      restorePrototypeDesignSystem(initialWorkspace?.prototypeDesignSystem ?? null),
    )
  const [selectedPrototypePageId, setSelectedPrototypePageId] =
    useState<string | null>(() => initialWorkspace?.selectedPrototypePageId ?? null)
  const [humanLoopCustomAnswer, setHumanLoopCustomAnswer] = useState(
    () => initialWorkspace?.humanLoopCustomAnswer ?? '',
  )
  const [liveAgentOutput, setLiveAgentOutput] = useState(
    () => initialWorkspace?.liveAgentOutput ?? '',
  )
  const [runError, setRunError] = useState<string | null>(
    () => initialWorkspace?.runError ?? null,
  )
  const [namingStatus, setNamingStatus] =
    useState<NamingStatus>(() => initialWorkspace?.namingStatus ?? 'idle')
  const autoNamePendingRef = useRef(false)
  const brief = useStore((s) => s.brief)
  const setBrief = useStore((s) => s.setBrief)
  const setMockup = useStore((s) => s.setMockup)
  const mockup = useStore((s) => s.mockup)
  const importedDesignMarkdown = useStore((s) => s.designMarkdown)
  const clearDesignMarkdown = useStore((s) => s.clearDesignMarkdown)
  const genPhase = useStore((s) => s.genPhase)
  const genError = useStore((s) => s.genError)
  const source = useSource()
  const slices = useSlices()
  const analysisStatus = useStatus()
  const settings = useSettingsUI()
  const assignments = useModelAssignments()

  const { mutateAsync: deconstructMockup, isPending: deconstructing } =
    useDeconstructMockup()
  const prepareDeconstruct = usePrepareDeconstructMockup()
  const { mutateAsync: nameSlices, isPending: naming } = useNameSlices()

  const hasSource = Boolean(source.bitmap)
  const hasSlices = slices.length > 0
  const hasChatModel = Boolean(assignments.data?.chat)
  const working =
    agentBusy ||
    workflowPhase === 'planning' ||
    workflowPhase === 'design-system' ||
    workflowPhase === 'generating-suite' ||
    deconstructing ||
    naming ||
    analysisStatus === 'running'
  const activeStage = resolveAssetStage({
    genPhase,
    analysisStatus,
    naming,
    hasMockup: Boolean(mockup),
    hasSource,
    hasSlices,
    agentBusy,
    workflowPhase,
    hasPlan: Boolean(prototypePlan),
    hasDesignSystem: Boolean(prototypeDesignSystem),
    hasPrototypePages: prototypePages.length > 0,
  })
  const elapsedSeconds = useElapsedSeconds(runStartedAt, working)
  const stages = buildAssetStages({
    activeStage,
    hasMockup: Boolean(mockup),
    hasSource,
    hasSlices,
    namingStatus,
    hasPlan: Boolean(prototypePlan),
    hasDesignSystem: Boolean(prototypeDesignSystem),
    hasPrototypePages: prototypePages.length > 0,
  })
  const progress = estimateProgress({
    activeStage,
    hasMockup: Boolean(mockup),
    hasSource,
    hasSlices,
    naming,
    namingStatus,
    hasPlan: Boolean(prototypePlan),
    hasDesignSystem: Boolean(prototypeDesignSystem),
    hasPrototypePages: prototypePages.length > 0,
  })

  useLayoutEffect(() => {
    setWorkspaceSnapshot({
      version: 'workspace.v1',
      workflowPhase,
      prototypePlan,
      prototypeScope,
      humanLoopChoiceId,
      humanLoopCustomAnswer,
      prototypeDesignSystem: prototypeDesignSystem
        ? persistPrototypeDesignSystem(prototypeDesignSystem)
        : null,
      prototypePages: prototypePages.map(persistPrototypePage),
      selectedPrototypePageId,
      runError,
      namingStatus,
      liveAgentOutput,
      attachments: attachments.map(persistReferenceAttachment),
      webSearchEnabled,
    })
  }, [
    attachments,
    humanLoopChoiceId,
    humanLoopCustomAnswer,
    liveAgentOutput,
    namingStatus,
    prototypeDesignSystem,
    prototypePages,
    prototypePlan,
    prototypeScope,
    runError,
    selectedPrototypePageId,
    setWorkspaceSnapshot,
    webSearchEnabled,
    workflowPhase,
  ])

  useEffect(() => {
    if (!autoNamePendingRef.current) return
    if (analysisStatus !== 'done' || slices.length === 0) return
    if (!hasChatModel || naming) {
      if (!hasChatModel) {
        autoNamePendingRef.current = false
        const fallbackCount = applyLocalSemanticSliceNames(
          prototypePlan,
          prototypeScope,
          true,
        )
        setNamingStatus(fallbackCount > 0 ? 'done' : 'skipped')
      }
      return
    }

    autoNamePendingRef.current = false
    setNamingStatus('running')
    void (async () => {
      try {
        const count = await nameSlices()
        const fallbackCount = applyLocalSemanticSliceNames(
          prototypePlan,
          prototypeScope,
          true,
        )
        setNamingStatus(count + fallbackCount > 0 ? 'done' : 'skipped')
      } catch (error) {
        const fallbackCount = applyLocalSemanticSliceNames(
          prototypePlan,
          prototypeScope,
          true,
        )
        setNamingStatus(fallbackCount > 0 ? 'done' : 'error')
        console.info(
          '[Cutout] semantic naming skipped:',
          error instanceof Error ? error.message : String(error),
        )
      }
    })()
  }, [analysisStatus, hasChatModel, nameSlices, naming, prototypePlan, prototypeScope, slices.length])

  useEffect(() => {
    if (working) return
    if (!runStartedAt) return
    const timer = window.setTimeout(() => setRunStartedAt(null), 900)
    return () => window.clearTimeout(timer)
  }, [runStartedAt, working])

  function updateBrief(text: string): void {
    setBrief(text)
    setPrototypePlan(null)
    setPrototypePages([])
    setPrototypeDesignSystem(null)
    setSelectedPrototypePageId(null)
    setHumanLoopChoiceId(null)
    setHumanLoopCustomAnswer('')
    setLiveAgentOutput('')
    setRunError(null)
    setNamingStatus('idle')
    setWorkflowPhase('idle')
  }

  async function providerKeyPreflightMessage(
    providerIds: readonly string[],
  ): Promise<string | null> {
    const ids = [...new Set(providerIds)]
    if (ids.length === 0) return null

    try {
      const [providers, statuses] = await Promise.all([
        services.providers.list(),
        services.providers.statuses(ids),
      ])
      const missing = ids.filter((id) => statuses[id] !== true)
      if (missing.length === 0) return null

      const labels = missing.map((id) => {
        const provider = providers.find((item) => item.id === id)
        return provider?.label ?? id
      })
      return `Add an API key for ${labels.join(', ')} in Settings before generating.`
    } catch (error) {
      return `Could not verify provider API key status: ${
        error instanceof Error ? error.message : String(error)
      }`
    }
  }

  /**
   * When web search is on, ground the brief before planning: run the provider's
   * web-search tool and append a concise factual summary. Best-effort — any
   * failure (unsupported provider, tool error) returns the brief unchanged.
   */
  async function researchedBrief(text: string): Promise<string> {
    if (!webSearchEnabled) return text
    const chat = assignments.data?.chat
    if (!chat) return text
    const result = await services.generation.research({
      providerId: chat.providerId,
      model: chat.model,
      prompt: [
        'Research this product brief on the web. Return a concise, factual grounding',
        'summary: key facts, domain conventions, notable brands/competitors, and',
        'constraints. No preamble, no markdown headings.',
        '',
        text,
      ].join('\n'),
    })
    if (isErr(result) || !result.data.trim()) return text
    return `${text}\n\n[Web research grounding]\n${result.data.trim()}`
  }

  async function createAssets(): Promise<void> {
    const text = brief.trim()
    if (!text) return
    const chatAssignment = assignments.data?.chat
    const imageAssignment = assignments.data?.image
    if (!imageAssignment || !chatAssignment) {
      setRunError('Configure both a chat/vision model and an image model before generating.')
      settings.open()
      return
    }
    const providerKeyError = await providerKeyPreflightMessage([
      chatAssignment.providerId,
      imageAssignment.providerId,
    ])
    if (providerKeyError) {
      setRunError(providerKeyError)
      settings.open()
      return
    }

    setRunStartedAt(Date.now())
    setLiveAgentOutput('')
    setRunError(null)
    setAgentBusy(true)
    try {
      let plan = prototypePlan
      const plannerBrief = await researchedBrief(text)
      let generationBrief = plannerBrief

      if (!plan) {
        plan = await planPrototypeSuite(plannerBrief)
        if (plan.humanLoop.mode === 'ask') return
      }

      if (plan.humanLoop.mode === 'ask') {
        const answer = resolveHumanLoopAnswer(
          plan.humanLoop,
          humanLoopChoiceId,
          humanLoopCustomAnswer,
        )
        generationBrief = composeHumanLoopRequirement(plannerBrief, plan.humanLoop, answer)
        plan = await planPrototypeSuite(generationBrief)
        if (plan.humanLoop.mode === 'ask') return
      }

      autoNamePendingRef.current = true
      setNamingStatus('pending')
      await generatePrototypeSuite(generationBrief, plan, {
        startFresh:
          hasSlices &&
          isPrototypeSuiteComplete(
            plan,
            prototypeScope,
            prototypePages,
            prototypeDesignSystem,
          ),
      })
    } catch (error) {
      autoNamePendingRef.current = false
      const message = errorMessage(error)
      const displayMessage = userFacingGenerationError(message)
      recordAiNativeDiagnostic({
        level: 'error',
        scope: 'workspace.create-assets',
        message,
        details: {
          displayMessage,
          briefLength: text.length,
          workflowPhase,
          hasPrototypePlan: Boolean(prototypePlan),
          chatProviderId: chatAssignment.providerId,
          chatModel: chatAssignment.model,
          imageProviderId: imageAssignment.providerId,
          imageModel: imageAssignment.model,
        },
      })
      setRunError(displayMessage)
      toast.error('Generation failed', {
        description: displayMessage,
      })
    } finally {
      setAgentBusy(false)
      setWorkflowPhase((phase) =>
        phase === 'planning' ||
        phase === 'design-system' ||
        phase === 'generating-suite'
          ? 'idle'
          : phase,
      )
    }
  }

  async function planPrototypeSuite(text: string): Promise<PrototypePlan> {
    const chat = assignments.data?.chat
    if (!chat) throw new Error('No chat/vision model is configured.')

    setWorkflowPhase('planning')
    const result = await planPrototype(services.generation, {
      providerId: chat.providerId,
      model: chat.model,
      brief: text,
      intent: getStoreState().intent ?? undefined,
      effort: chat.effort,
    })
    if (isErr(result)) {
      console.info('[Cutout] prototype planner failed:', result.error)
      const displayMessage = userFacingGenerationError(result.error)
      recordAiNativeDiagnostic({
        level: 'error',
        scope: 'prototype-planner',
        message: result.error,
        details: {
          displayMessage,
          briefLength: text.length,
          hasIntent: Boolean(getStoreState().intent),
          providerId: chat.providerId,
          model: chat.model,
          effort: chat.effort,
        },
      })
      setPrototypePlan(null)
      setPrototypePages([])
      setPrototypeDesignSystem(null)
      setSelectedPrototypePageId(null)
      setHumanLoopChoiceId(null)
      setHumanLoopCustomAnswer('')
      setLiveAgentOutput('')
      setRunError(displayMessage)
      setWorkflowPhase('idle')
      throw new Error(displayMessage)
    }

    setPrototypePlan(result.data)
    setPrototypePages([])
    setPrototypeDesignSystem(null)
    setSelectedPrototypePageId(null)
    setHumanLoopChoiceId(defaultHumanLoopChoiceId(result.data))
    setHumanLoopCustomAnswer('')
    setLiveAgentOutput('')
    setWorkflowPhase('review')
    return result.data
  }

  async function generatePrototypeSuite(
    text: string,
    plan: PrototypePlan,
    options: { readonly startFresh?: boolean } = {},
  ): Promise<void> {
    const image = assignments.data?.image
    if (!image) throw new Error('No image-generation model is configured.')

    const pages = pagesForScope(plan, prototypeScope)
    if (pages.length === 0) throw new Error('The prototype plan has no pages.')
    const pageIds = new Set(pages.map((page) => page.id))
    const reusablePages = options.startFresh
      ? []
      : sortPrototypePages(
          prototypePages.filter((artifact) => pageIds.has(artifact.page.id)),
          pages,
        )
    const reusableDesignSystem = options.startFresh ? null : prototypeDesignSystem
    const assetManifest = createPrototypeAssetManifest(plan, pages)
    recordAiNativeDiagnostic({
      level: 'info',
      scope: 'prototype-asset-manifest',
      message: 'Generated prototype asset manifest for this run.',
      details: {
        version: assetManifest.version,
        product: assetManifest.product,
        pageCount: assetManifest.pages.length,
        assetCount: assetManifest.assets.length,
        assets: assetManifest.assets.map((asset) => ({
          id: asset.id,
          recommendedName: asset.recommendedName,
          pageId: asset.pageId,
          regionId: asset.regionId,
          assetRoute: asset.assetRoute,
          source: asset.source,
          description: asset.description,
        })),
      },
    })

    if (options.startFresh) {
      setPrototypePages([])
      setPrototypeDesignSystem(null)
      setSelectedPrototypePageId(null)
    } else if (reusablePages.length > 0) {
      setPrototypePages(reusablePages)
      setSelectedPrototypePageId((selected) =>
        selected && pageIds.has(selected)
          ? selected
          : reusablePages[0]?.page.id ?? null,
      )
    }
    setWorkflowPhase('design-system')

    const deconstructPreflight = prepareDeconstruct(
      prototypeBoardExtractionBrief(plan, pages, text),
      pages.length,
    )
    const chat = assignments.data?.chat
    if (!chat) throw new Error('No chat/vision model is configured.')

    const designSystem =
      reusableDesignSystem ??
      await generatePrototypeDesignSystem(
        plan,
        image,
        chat,
        importedDesignMarkdown?.content,
      )
    if (!reusableDesignSystem) setPrototypeDesignSystem(designSystem)
    setWorkflowPhase('generating-suite')

    const generated =
      pages.length <= SERIAL_REFERENCE_PAGE_LIMIT
        ? await generatePagesSerial(plan, pages, image, designSystem, reusablePages)
        : await generatePagesParallel(plan, pages, image, designSystem, reusablePages)
    const first = generated[0]
    if (!first) throw new Error('The model returned no prototype pages.')

    setSelectedPrototypePageId(first.page.id)
    setMockup(await artifactToMockup(first))
    await deconstructMockup({
      preflight: deconstructPreflight,
      referenceImages: generated.slice(1).map((artifact) => artifact.bytes),
    })
  }

  async function generatePrototypeDesignSystem(
    plan: PrototypePlan,
    image: ModelAssignment,
    chat: ModelAssignment,
    designMarkdown: string | undefined,
  ): Promise<PrototypeDesignSystemArtifact> {
    const prompt = prototypeDesignSystemPrompt(plan, designMarkdown)
    // Attached reference images condition the design system on the user's visual
    // direction (垫图, via editImage). editImage is provider-specific, so on
    // failure — or with no attachments — fall back to a plain prompt generate.
    const references = await Promise.all(
      attachments.map((attachment) => blobToBytes(attachment.blob)),
    )
    const edited =
      references.length > 0
        ? await services.generation.editImage({
            providerId: image.providerId,
            model: image.model,
            prompt,
            images: references,
            inputFidelity: 'high',
          })
        : null
    const result =
      edited && !isErr(edited)
        ? edited
        : await services.generation.generateImages({
            providerId: image.providerId,
            model: image.model,
            prompt,
          })
    if (isErr(result)) throw new Error(result.error)
    const asset = result.data[0]
    if (!asset) throw new Error('The model returned no design-system reference.')
    const groundedDesignMarkdown = await synthesizeDesignMarkdownFromReference(
      plan,
      chat,
      asset.bytes,
      designMarkdown,
    )
    return assetToDesignSystemArtifact(
      asset,
      groundedDesignMarkdown ?? prototypeDesignMarkdown(plan, designMarkdown),
    )
  }

  async function synthesizeDesignMarkdownFromReference(
    plan: PrototypePlan,
    chat: ModelAssignment,
    imageBytes: Uint8Array,
    importedMarkdown: string | undefined,
  ): Promise<string | null> {
    const input = {
      providerId: chat.providerId,
      model: chat.model,
      system: prototypeDesignMarkdownSynthesisSystem(plan, importedMarkdown),
      input: [
        {
          type: 'text' as const,
          text: 'Read the attached design-system reference image and produce the matching DESIGN.md.',
        },
        { type: 'image' as const, image: imageBytes },
      ],
      reasoningEffort: chat.effort,
    }

    let streamed = ''
    try {
      setLiveAgentOutput('')
      for await (const delta of services.generation.streamText(input)) {
        streamed += delta
        setLiveAgentOutput(trimLiveAgentOutput(streamed))
      }
    } catch (error) {
      console.info(
        '[Cutout] image-grounded DESIGN.md stream fell back:',
        error instanceof Error ? error.message : String(error),
      )
      const result = await services.generation.generateText(input)
      if (isErr(result)) {
        console.info('[Cutout] image-grounded DESIGN.md synthesis fell back:', result.error)
        setLiveAgentOutput('')
        return null
      }
      streamed = result.data
      setLiveAgentOutput(trimLiveAgentOutput(streamed))
    }

    const markdown = stripMarkdownFence(streamed).trim()
    if (!markdown.startsWith('---')) {
      console.info('[Cutout] image-grounded DESIGN.md synthesis returned non-DESIGN.md text.')
      return null
    }
    return markdown
  }

  async function generatePagesSerial(
    plan: PrototypePlan,
    pages: readonly PrototypePage[],
    image: ModelAssignment,
    designSystem: PrototypeDesignSystemArtifact,
    existingPages: readonly PrototypePageArtifact[] = [],
  ): Promise<PrototypePageArtifact[]> {
    const generated: PrototypePageArtifact[] = [...existingPages]
    const generatedById = new Map(generated.map((artifact) => [artifact.page.id, artifact]))
    let previous: PrototypePageArtifact | null = null
    for (const page of pages) {
      const existing = generatedById.get(page.id)
      if (existing) {
        previous = existing
        continue
      }
      const references = previous
        ? [designSystem.bytes, previous.bytes]
        : [designSystem.bytes]
      const artifact = await generatePrototypePage(
        plan,
        page,
        image,
        references,
        importedDesignMarkdown?.content,
      )
      generated.push(artifact)
      generatedById.set(page.id, artifact)
      previous = artifact
      setPrototypePages(sortPrototypePages(generated, pages))
    }
    return sortPrototypePages(generated, pages)
  }

  async function generatePagesParallel(
    plan: PrototypePlan,
    pages: readonly PrototypePage[],
    image: ModelAssignment,
    designSystem: PrototypeDesignSystemArtifact,
    existingPages: readonly PrototypePageArtifact[] = [],
  ): Promise<PrototypePageArtifact[]> {
    const results = new Map<string, PrototypePageArtifact>(
      existingPages.map((artifact) => [artifact.page.id, artifact]),
    )
    const missingPages = pages.filter((page) => !results.has(page.id))
    let nextIndex = 0
    const limit = Math.min(2, missingPages.length)

    async function worker(): Promise<void> {
      while (nextIndex < missingPages.length) {
        const page = missingPages[nextIndex]
        nextIndex += 1
        if (!page) continue
        const artifact = await generatePrototypePage(
          plan,
          page,
          image,
          [designSystem.bytes],
          importedDesignMarkdown?.content,
        )
        results.set(page.id, artifact)
        setPrototypePages(sortPrototypePages([...results.values()], pages))
      }
    }

    if (missingPages.length > 0) {
      await Promise.all(Array.from({ length: limit }, () => worker()))
    }
    return pages
      .map((page) => results.get(page.id))
      .filter((item): item is PrototypePageArtifact => Boolean(item))
  }

  async function generatePrototypePage(
    plan: PrototypePlan,
    page: PrototypePage,
    image: ModelAssignment,
    referenceImages: readonly Uint8Array[],
    designMarkdown: string | undefined,
  ): Promise<PrototypePageArtifact> {
    const prompt = prototypePagePrompt(plan, page, designMarkdown)
    const edited = await services.generation.editImage({
      providerId: image.providerId,
      model: image.model,
      prompt,
      images: referenceImages,
      inputFidelity: 'high',
    })
    const result = isErr(edited)
      ? await services.generation.generateImages({
          providerId: image.providerId,
          model: image.model,
          promptRef: { id: 'ui-mockup-generation' },
          input: [
            { type: 'text', text: prompt },
            ...referenceImages.map((bytes) => ({ type: 'image' as const, image: bytes })),
          ],
        })
      : edited
    if (isErr(edited) && isErr(result)) {
      console.info('[Cutout] reference-conditioned prototype fallback failed:', edited.error)
    }
    if (isErr(result)) throw new Error(result.error)
    const asset = result.data[0]
    if (!asset) throw new Error(`No image returned for ${page.name}.`)

    return assetToPageArtifact(page, asset)
  }

  async function assetToDesignSystemArtifact(
    asset: { readonly bytes: Uint8Array; readonly mediaType: string },
    designMarkdown: string,
  ): Promise<PrototypeDesignSystemArtifact> {
    return await decodePrototypeImage(asset, (base) => ({
      ...base,
      name: 'Design system',
      designMarkdown,
    }))
  }

  async function assetToPageArtifact(
    page: PrototypePage,
    asset: { readonly bytes: Uint8Array; readonly mediaType: string },
  ): Promise<PrototypePageArtifact> {
    return await decodePrototypeImage(asset, (base) => ({ ...base, page }))
  }

  async function decodePrototypeImage<T extends PrototypeImageArtifact>(
    asset: { readonly bytes: Uint8Array; readonly mediaType: string },
    build: (base: PrototypeImageArtifact) => T,
  ): Promise<T> {
    const blob = bytesToBlob(asset.bytes, asset.mediaType)
    const bitmap = await decodeImage(blob)
    try {
      return build({
        blob,
        bytes: asset.bytes,
        mediaType: asset.mediaType,
        width: bitmap.width,
        height: bitmap.height,
      })
    } finally {
      bitmap.close()
    }
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background text-foreground">
      <WorkspaceSidebar
        brief={brief}
        onBriefChange={updateBrief}
        importedDesignMarkdown={importedDesignMarkdown}
        onClearDesignMarkdown={clearDesignMarkdown}
        attachments={attachments}
        onAttachFiles={onAttachFiles}
        onRemoveAttachment={removeAttachment}
        onArchiveProject={onArchiveProject}
        webSearchEnabled={webSearchEnabled}
        onToggleWebSearch={() => setWebSearchEnabled((value) => !value)}
        agentMessages={agent.messages}
        onOpenSettings={settings.open}
        working={working}
        workflowPhase={workflowPhase}
        briefEmpty={!brief.trim()}
        hasPlan={Boolean(prototypePlan)}
        hasPrototypePages={prototypePages.length > 0}
        humanLoop={prototypePlan?.humanLoop ?? null}
        humanLoopChoiceId={humanLoopChoiceId}
        onHumanLoopChoiceChange={setHumanLoopChoiceId}
        humanLoopCustomAnswer={humanLoopCustomAnswer}
        onHumanLoopCustomAnswerChange={setHumanLoopCustomAnswer}
        prototypePlan={prototypePlan}
        prototypePages={prototypePages}
        prototypeDesignSystem={prototypeDesignSystem}
        prototypeScope={prototypeScope}
        onScopeChange={setPrototypeScope}
        scopeDisabled={working || prototypePages.length > 0}
        onPrimaryAction={() => void createAssets()}
        hasSlices={hasSlices}
        sliceCount={slices.length}
        activeStage={activeStage}
        elapsedSeconds={elapsedSeconds}
        stages={stages}
        progress={progress}
        liveAgentOutput={liveAgentOutput}
        genError={genError}
        runError={runError}
      />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <OutputHeader
          hasSlices={hasSlices}
          sliceCount={slices.length}
          working={working}
          activeStage={activeStage}
          elapsedSeconds={elapsedSeconds}
          namingStatus={namingStatus}
        />

        <section className="relative min-h-0 flex-1 overflow-hidden bg-muted/10">
          <OutputSurface
            prototypePlan={prototypePlan}
            prototypePages={prototypePages}
            prototypeDesignSystem={prototypeDesignSystem}
            selectedPrototypePageId={selectedPrototypePageId}
            onPrototypePageSelect={setSelectedPrototypePageId}
            prototypeScope={prototypeScope}
            onScopeChange={setPrototypeScope}
            onPrimaryAction={() => void createAssets()}
            hasSource={hasSource}
            hasSlices={hasSlices}
            working={working}
            analysisStatus={analysisStatus}
            runError={runError}
          />
        </section>
      </main>

      <DesignMarkdownInspector
        prototypePlan={prototypePlan}
        prototypeDesignSystem={prototypeDesignSystem}
        importedDesignMarkdown={importedDesignMarkdown}
      />
    </div>
  )
}

function WorkspaceSidebar({
  brief,
  onBriefChange,
  importedDesignMarkdown,
  onClearDesignMarkdown,
  attachments,
  onAttachFiles,
  onRemoveAttachment,
  onArchiveProject,
  webSearchEnabled,
  onToggleWebSearch,
  agentMessages,
  onOpenSettings,
  working,
  workflowPhase,
  briefEmpty,
  hasPlan,
  hasPrototypePages,
  humanLoop,
  humanLoopChoiceId,
  onHumanLoopChoiceChange,
  humanLoopCustomAnswer,
  onHumanLoopCustomAnswerChange,
  prototypePlan,
  prototypePages,
  prototypeDesignSystem,
  prototypeScope,
  onScopeChange,
  scopeDisabled,
  onPrimaryAction,
  hasSlices,
  sliceCount,
  activeStage,
  elapsedSeconds,
  stages,
  progress,
  liveAgentOutput,
  genError,
  runError,
}: {
  readonly brief: string
  readonly onBriefChange: (text: string) => void
  readonly importedDesignMarkdown: DesignMarkdownAsset
  readonly onClearDesignMarkdown: () => void
  readonly attachments: readonly ReferenceAttachment[]
  readonly onAttachFiles: (files: FileList | null) => void
  readonly onRemoveAttachment: (id: string) => void
  readonly onArchiveProject: () => void
  readonly webSearchEnabled: boolean
  readonly onToggleWebSearch: () => void
  readonly agentMessages: readonly AgentMessage[]
  readonly onOpenSettings: () => void
  readonly working: boolean
  readonly workflowPhase: WorkflowPhase
  readonly briefEmpty: boolean
  readonly hasPlan: boolean
  readonly hasPrototypePages: boolean
  readonly humanLoop: PrototypeHumanLoop | null
  readonly humanLoopChoiceId: string | null
  readonly onHumanLoopChoiceChange: (id: string) => void
  readonly humanLoopCustomAnswer: string
  readonly onHumanLoopCustomAnswerChange: (value: string) => void
  readonly prototypePlan: PrototypePlan | null
  readonly prototypePages: readonly PrototypePageArtifact[]
  readonly prototypeDesignSystem: PrototypeDesignSystemArtifact | null
  readonly prototypeScope: PrototypeSuiteScope
  readonly onScopeChange: (scope: PrototypeSuiteScope) => void
  readonly scopeDisabled: boolean
  readonly onPrimaryAction: () => void
  readonly hasSlices: boolean
  readonly sliceCount: number
  readonly activeStage: AssetStageId
  readonly elapsedSeconds: number
  readonly stages: readonly AssetStage[]
  readonly progress: number
  readonly liveAgentOutput: string
  readonly genError: GenerationError
  readonly runError: string | null
}) {
  const attachInputRef = useRef<HTMLInputElement | null>(null)
  const [activeSection, setActiveSection] =
    useState<WorkspaceSidebarSection>('agent')
  const plannedPages = prototypePlan?.pages ?? []
  const primaryCount = prototypePlan
    ? pagesForScope(prototypePlan, 'primary-flow').length
    : 0
  const fullCount = prototypePlan?.pages.length ?? 0
  const showScope = prototypePlan?.humanLoop.mode === 'continue' && primaryCount < fullCount
  const hasDesignSystem = Boolean(importedDesignMarkdown || prototypeDesignSystem)
  const hasAssetOutput = hasSlices || prototypePages.length > 0
  const humanLoopAsk = activeSection === 'agent' && humanLoop?.mode === 'ask'
  const selectedHumanLoopChoiceId =
    humanLoop?.mode === 'ask'
      ? humanLoopChoiceId === CUSTOM_HUMAN_LOOP_ID
        ? humanLoop.defaultChoiceId
        : humanLoopChoiceId ?? humanLoop.defaultChoiceId
      : null
  const composerValue = humanLoopAsk ? humanLoopCustomAnswer : brief
  const composerPlaceholder = humanLoopAsk
    ? 'Optional: add nuance, constraints, or a different direction.'
    : 'Describe the target product, audience, platform, and visual direction.'
  const composerDisabled = working || (!humanLoopAsk && briefEmpty)
  const prototypeComplete = prototypePlan
    ? isPrototypeSuiteComplete(
        prototypePlan,
        prototypeScope,
        prototypePages,
        prototypeDesignSystem,
      )
    : false

  return (
    <aside className="flex h-full min-h-0 w-[20rem] shrink-0 border-r border-border bg-background">
      <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border py-3">
        <SidebarRailItem
          icon={FileText}
          label="File"
          active={activeSection === 'file'}
          title="Project file"
          onClick={() => setActiveSection('file')}
        />
        <SidebarRailItem
          icon={WandSparkles}
          label="Agent"
          active={activeSection === 'agent'}
          onClick={() => setActiveSection('agent')}
        />
        <SidebarRailItem
          icon={Layers3}
          label="Design"
          active={hasDesignSystem}
          disabled={!hasDesignSystem}
          title={hasDesignSystem ? 'Design system is available.' : 'Design system appears after planning.'}
        />
        <SidebarRailItem
          icon={ImageIcon}
          label="Assets"
          active={hasAssetOutput}
          disabled={!hasAssetOutput}
          title={hasAssetOutput ? 'Assets are available.' : 'Generated assets appear here after the Agent runs.'}
        />
        <SidebarRailItem
          icon={Scissors}
          label="Run"
          active={working}
          disabled={!working}
          title={working ? 'Run is active.' : 'Run status appears while the Agent is working.'}
        />
        <div className="mt-auto w-full">
          <SidebarRailItem
            icon={Settings2}
            label="Settings"
            active={false}
            onClick={onOpenSettings}
          />
        </div>
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-5">
          {activeSection === 'file' ? (
            <FileWorkspacePanel
              brief={brief}
              importedDesignMarkdown={importedDesignMarkdown}
              attachments={attachments}
              prototypePlan={prototypePlan}
              prototypePages={prototypePages}
              prototypeDesignSystem={prototypeDesignSystem}
              hasSlices={hasSlices}
              sliceCount={sliceCount}
              working={working}
              workflowPhase={workflowPhase}
              onArchiveProject={onArchiveProject}
            />
          ) : working ? (
            <AgentActivityPanel
              stage={activeStage}
              elapsedSeconds={elapsedSeconds}
              stages={stages}
              progress={progress}
              prototypePlan={prototypePlan}
              prototypePages={prototypePages}
              prototypeDesignSystem={prototypeDesignSystem}
              sliceCount={sliceCount}
              liveAgentOutput={liveAgentOutput}
              compact={false}
            />
          ) : humanLoop?.mode === 'ask' ? (
            <HumanLoopQuestion
              loop={humanLoop}
              selectedChoiceId={selectedHumanLoopChoiceId}
              onChoiceChange={onHumanLoopChoiceChange}
              compact
            />
          ) : (
            <AgentConversation messages={agentMessages} />
          )}

          {importedDesignMarkdown ? (
            <section className="mt-4 flex min-w-0 items-center gap-2 rounded-md border border-border bg-muted/15 px-3 py-2">
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">DESIGN.md imported</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {importedDesignMarkdown.name}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Clear imported DESIGN.md"
                onClick={onClearDesignMarkdown}
              >
                <X className="size-3.5" />
              </Button>
            </section>
          ) : null}

          {prototypePlan ? (
            <section className="mt-5 border-t border-border pt-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">Pages</p>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {plannedPages.length}
                </span>
              </div>
              <div className="space-y-1">
                {plannedPages.map((page) => (
                  <div
                    key={page.id}
                    className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/30"
                  >
                    <Route className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{page.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {page.regions.length}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {hasSlices ? (
            <section className="mt-4 rounded-md border border-border bg-muted/10 px-3 py-2">
              <p className="text-xs font-medium text-muted-foreground">Assets</p>
              <p className="mt-1 text-sm font-semibold">{sliceCount} generated</p>
            </section>
          ) : null}

          {runError || genError ? (
            <div className="mt-4 min-w-0 whitespace-pre-wrap break-words rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive [overflow-wrap:anywhere]">
              {runError ?? userFacingGenerationError(genError?.message ?? '')}
            </div>
          ) : null}
        </div>

        {activeSection === 'agent' ? (
        <div className="shrink-0 space-y-2 border-t border-border p-3">
          {attachments.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {attachments.map((attachment) => (
                <span
                  key={attachment.id}
                  className="flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-muted/20 py-1 pr-1.5 pl-1"
                >
                  <img
                    src={attachment.url}
                    alt=""
                    className="size-6 shrink-0 rounded object-cover"
                  />
                  <span className="max-w-[7.5rem] truncate text-[11px] text-muted-foreground">
                    {attachment.name}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${attachment.name}`}
                    className="shrink-0 rounded text-muted-foreground opacity-70 transition hover:text-foreground hover:opacity-100"
                    onClick={() => onRemoveAttachment(attachment.id)}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <div className="rounded-2xl border border-border bg-muted/15 shadow-sm transition-colors focus-within:border-ring/50">
            <input
              ref={attachInputRef}
              type="file"
              accept="image/*,.md,.markdown,.mdx"
              multiple
              className="hidden"
              onChange={(event) => {
                onAttachFiles(event.target.files)
                event.target.value = ''
              }}
            />
            <Textarea
              value={composerValue}
              rows={humanLoopAsk ? 3 : 4}
              onChange={(event) => {
                if (humanLoopAsk) {
                  onHumanLoopCustomAnswerChange(event.target.value)
                } else {
                  onBriefChange(event.target.value)
                }
              }}
              placeholder={composerPlaceholder}
              className="min-h-[5.5rem] resize-none border-0 bg-transparent px-3 pt-3 pb-0 text-sm leading-6 shadow-none focus-visible:ring-0"
            />
            <div className="flex items-center justify-between gap-2 px-2 pb-2">
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Attach reference images or a DESIGN.md"
                  onClick={() => attachInputRef.current?.click()}
                >
                  <Paperclip className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant={webSearchEnabled ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  aria-pressed={webSearchEnabled}
                  aria-label="Web search"
                  onClick={onToggleWebSearch}
                >
                  <Globe className="size-4" />
                </Button>
              </div>
              <Button
                type="button"
                size="icon-sm"
                className="size-9 shrink-0 rounded-full"
                disabled={composerDisabled}
                onClick={onPrimaryAction}
                aria-label={primaryButtonLabel({
                  working,
                  workflowPhase,
                  hasPlan,
                  hasPrototypePages,
                  hasPrototypeArtifacts: Boolean(prototypeDesignSystem) || prototypePages.length > 0,
                  prototypeComplete,
                  hasSlices,
                  humanLoop,
                })}
                title={primaryButtonLabel({
                  working,
                  workflowPhase,
                  hasPlan,
                  hasPrototypePages,
                  hasPrototypeArtifacts: Boolean(prototypeDesignSystem) || prototypePages.length > 0,
                  prototypeComplete,
                  hasSlices,
                  humanLoop,
                })}
              >
                {working ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowUp className="size-4" />
                )}
              </Button>
            </div>
          </div>

          {showScope ? (
            <DockScopePicker
              scope={prototypeScope}
              onScopeChange={onScopeChange}
              disabled={scopeDisabled}
              primaryCount={primaryCount}
              fullCount={fullCount}
            />
          ) : null}
        </div>
        ) : null}
      </div>
    </aside>
  )
}

function SidebarRailItem({
  icon: Icon,
  label,
  active,
  disabled = false,
  title,
  onClick,
}: {
  readonly icon: ComponentType<{ className?: string }>
  readonly label: string
  readonly active: boolean
  readonly disabled?: boolean
  readonly title?: string
  readonly onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled && !onClick}
      title={title ?? label}
      className={cn(
        'flex w-full flex-col items-center gap-1 px-1.5 py-2 text-[10px] transition-colors',
        active ? 'text-foreground' : 'text-muted-foreground',
        disabled && !onClick && 'cursor-default opacity-45',
      )}
    >
      <div
        className={cn(
          'flex size-8 items-center justify-center rounded-md',
          active ? 'bg-muted text-foreground' : !disabled && 'hover:bg-muted/50',
        )}
      >
        <Icon className="size-4" />
      </div>
      <span className="leading-none">{label}</span>
    </button>
  )
}

function FileWorkspacePanel({
  brief,
  importedDesignMarkdown,
  attachments,
  prototypePlan,
  prototypePages,
  prototypeDesignSystem,
  hasSlices,
  sliceCount,
  working,
  workflowPhase,
  onArchiveProject,
}: {
  readonly brief: string
  readonly importedDesignMarkdown: DesignMarkdownAsset
  readonly attachments: readonly ReferenceAttachment[]
  readonly prototypePlan: PrototypePlan | null
  readonly prototypePages: readonly PrototypePageArtifact[]
  readonly prototypeDesignSystem: PrototypeDesignSystemArtifact | null
  readonly hasSlices: boolean
  readonly sliceCount: number
  readonly working: boolean
  readonly workflowPhase: WorkflowPhase
  readonly onArchiveProject: () => void
}) {
  const plannedPages = prototypePlan?.pages ?? []
  const generatedPageIds = new Set(prototypePages.map((artifact) => artifact.page.id))
  const designState = prototypeDesignSystem
    ? 'Generated'
    : importedDesignMarkdown
      ? 'Imported'
      : prototypePlan
        ? 'Draft'
        : 'Waiting'

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-medium text-muted-foreground">File</p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">
          {prototypePlan?.product.name || brief.trim().split(/\n+/)[0] || 'Untitled project'}
        </h2>
        <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
          {brief.trim() || 'No intent yet.'}
        </p>
      </div>

      <section className="rounded-lg border border-border bg-muted/10 p-3">
        <div className="grid grid-cols-2 gap-2">
          <FileMetric label="Status" value={working ? 'Running' : workflowPhaseLabel(workflowPhase)} />
          <FileMetric label="Pages" value={`${prototypePages.length || plannedPages.length}`} />
          <FileMetric label="Assets" value={`${hasSlices ? sliceCount : 0}`} />
          <FileMetric label="Design" value={designState} />
        </div>
      </section>

      <FileSection
        icon={Route}
        title="Pages"
        count={plannedPages.length || prototypePages.length}
      >
        {plannedPages.length > 0 ? (
          <div className="space-y-1">
            {plannedPages.map((page) => {
              const generated = generatedPageIds.has(page.id)
              return (
                <div
                  key={page.id}
                  className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/30"
                >
                  <Route className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{page.name}</span>
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {generated ? 'ready' : `${page.regions.length} regions`}
                  </span>
                </div>
              )
            })}
          </div>
        ) : prototypePages.length > 0 ? (
          <div className="space-y-1">
            {prototypePages.map((artifact) => (
              <div
                key={artifact.page.id}
                className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/30"
              >
                <Route className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{artifact.page.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {artifact.width}x{artifact.height}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <FileEmptyRow label="Pages appear after planning." />
        )}
      </FileSection>

      <FileSection icon={Layers3} title="Design" count={designState === 'Waiting' ? 0 : 1}>
        {prototypeDesignSystem ? (
          <FileArtifactRow
            icon={Layers3}
            label="Design system"
            detail={`${prototypeDesignSystem.width}x${prototypeDesignSystem.height}`}
          />
        ) : importedDesignMarkdown ? (
          <FileArtifactRow
            icon={FileText}
            label={importedDesignMarkdown.name}
            detail="Imported DESIGN.md"
          />
        ) : prototypePlan ? (
          <FileArtifactRow
            icon={FileText}
            label="DESIGN.md draft"
            detail="Generated from plan"
          />
        ) : (
          <FileEmptyRow label="DESIGN.md appears after planning or import." />
        )}
      </FileSection>

      <FileSection icon={ImageIcon} title="Assets" count={sliceCount}>
        {hasSlices ? (
          <FileArtifactRow
            icon={ImageIcon}
            label={`${sliceCount} cutout assets`}
            detail="Ready in Output"
          />
        ) : (
          <FileEmptyRow label="Cutout assets appear after generation." />
        )}
      </FileSection>

      <FileSection icon={Paperclip} title="References" count={attachments.length}>
        {attachments.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {attachments.slice(0, 6).map((attachment) => (
              <img
                key={attachment.id}
                src={attachment.url}
                alt=""
                title={attachment.name}
                className="aspect-square w-full rounded-md border border-border object-cover"
              />
            ))}
          </div>
        ) : (
          <FileEmptyRow label="Attach images or DESIGN.md from Agent." />
        )}
      </FileSection>

      <section className="rounded-lg border border-border bg-background p-3">
        <p className="text-xs font-semibold">Project actions</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Move this project out of active files. It can be restored from the
          Archived view on Home.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full justify-start"
          onClick={onArchiveProject}
        >
          <Archive className="size-3.5" />
          Move to archive
        </Button>
      </section>
    </section>
  )
}

function FileMetric({
  label,
  value,
}: {
  readonly label: string
  readonly value: string
}) {
  return (
    <div className="min-w-0 rounded-md bg-background px-2 py-2">
      <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold">{value}</p>
    </div>
  )
}

function FileSection({
  icon: Icon,
  title,
  count,
  children,
}: {
  readonly icon: ComponentType<{ className?: string }>
  readonly title: string
  readonly count: number
  readonly children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-background p-3">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-3.5 text-muted-foreground" />
        <p className="min-w-0 flex-1 text-xs font-semibold">{title}</p>
        <span className="font-mono text-[10px] text-muted-foreground">{count}</span>
      </div>
      {children}
    </section>
  )
}

function FileArtifactRow({
  icon: Icon,
  label,
  detail,
}: {
  readonly icon: ComponentType<{ className?: string }>
  readonly label: string
  readonly detail: string
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{label}</p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

function FileEmptyRow({ label }: { readonly label: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/10 px-2 py-2 text-xs leading-5 text-muted-foreground">
      {label}
    </div>
  )
}

function workflowPhaseLabel(phase: WorkflowPhase): string {
  switch (phase) {
    case 'idle':
      return 'Draft'
    case 'planning':
      return 'Planning'
    case 'review':
      return 'Review'
    case 'design-system':
      return 'Design'
    case 'generating-suite':
      return 'Generating'
  }
}

function DockScopePicker({
  scope,
  onScopeChange,
  disabled,
  primaryCount,
  fullCount,
}: {
  readonly scope: PrototypeSuiteScope
  readonly onScopeChange: (scope: PrototypeSuiteScope) => void
  readonly disabled: boolean
  readonly primaryCount: number
  readonly fullCount: number
}) {
  return (
    <div className="flex items-center gap-1 rounded-md bg-muted/40 p-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onScopeChange('primary-flow')}
        className={cn(
          'h-8 rounded px-3 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
          scope === 'primary-flow'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        Primary · {primaryCount}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onScopeChange('full-plan')}
        className={cn(
          'h-8 rounded px-3 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
          scope === 'full-plan'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        Full · {fullCount}
      </button>
    </div>
  )
}

function DesignMarkdownInspector({
  prototypePlan,
  prototypeDesignSystem,
  importedDesignMarkdown,
}: {
  readonly prototypePlan: PrototypePlan | null
  readonly prototypeDesignSystem: PrototypeDesignSystemArtifact | null
  readonly importedDesignMarkdown: DesignMarkdownAsset
}) {
  const generated = prototypeDesignSystem?.designMarkdown.trim()
  const imported = importedDesignMarkdown?.content.trim()
  const draft =
    !generated && prototypePlan
      ? prototypeDesignMarkdown(prototypePlan, importedDesignMarkdown?.content)
      : null
  const content = generated || imported || draft
  const source = generated ? 'Generated' : imported ? 'Imported' : draft ? 'Draft' : 'Waiting'
  const name = generated
    ? 'Generated DESIGN.md'
    : importedDesignMarkdown?.name ?? 'DESIGN.md'

  async function copyDesignMarkdown(): Promise<void> {
    if (!content) return
    try {
      await navigator.clipboard.writeText(content)
      toast.success('DESIGN.md copied')
    } catch (error) {
      toast.error('Copy failed', {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <aside className="flex h-full min-h-0 w-[18.5rem] shrink-0 flex-col border-l border-border bg-background">
      <div className="flex h-12 items-center gap-2 border-b border-border px-3">
        <button
          type="button"
          className="rounded-md bg-muted px-2.5 py-1 text-xs font-semibold text-foreground"
        >
          Design
        </button>
        <button
          type="button"
          disabled
          className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground"
        >
          Prototype
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="border-b border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">DESIGN.md</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{name}</p>
            </div>
            <span className="shrink-0 rounded-full border border-border bg-muted/20 px-2 py-0.5 text-[10px] text-muted-foreground">
              {source}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            disabled={!content}
            onClick={() => void copyDesignMarkdown()}
          >
            <Tag className="size-3.5" />
            Copy DESIGN.md
          </Button>
        </section>

        {content ? (
          <section className="p-4">
            <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted/15 p-3 font-mono text-[11px] leading-5 text-muted-foreground">
              {content}
            </pre>
          </section>
        ) : (
          <section className="p-4">
            <div className="rounded-md border border-border bg-muted/10 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Import DESIGN.md or generate a design system.
              </p>
            </div>
          </section>
        )}
      </div>
    </aside>
  )
}

function OutputHeader({
  hasSlices,
  sliceCount,
  working,
  activeStage,
  elapsedSeconds,
  namingStatus,
}: {
  readonly hasSlices: boolean
  readonly sliceCount: number
  readonly working: boolean
  readonly activeStage: AssetStageId
  readonly elapsedSeconds: number
  readonly namingStatus: 'idle' | 'pending' | 'running' | 'done' | 'skipped' | 'error'
}) {
  const stageCopy = stageLabel(activeStage)
  const idleDetail =
    hasSlices && namingStatus === 'skipped'
      ? 'Ready; semantic naming is skipped because no vision model is configured.'
      : hasSlices && namingStatus === 'error'
        ? 'Ready; semantic naming failed, filenames are still generic.'
        : hasSlices
          ? 'Ready to review and export.'
          : 'Generated assets will appear here.'
  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold tracking-tight">
          {hasSlices ? `${sliceCount} assets` : 'Output'}
        </h2>
        <p className="text-xs text-muted-foreground">
          {working
            ? stageCopy.detail
            : idleDetail}
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn(
            'size-2 rounded-full',
            working ? 'bg-primary' : hasSlices ? 'bg-emerald-500' : 'bg-muted-foreground/40',
          )}
        />
        {working ? `${stageCopy.label} · ${formatElapsed(elapsedSeconds)}` : hasSlices ? 'Ready' : 'Waiting'}
      </div>
    </div>
  )
}

function OutputSurface({
  prototypePlan,
  prototypePages,
  prototypeDesignSystem,
  selectedPrototypePageId,
  onPrototypePageSelect,
  prototypeScope,
  onScopeChange,
  onPrimaryAction,
  hasSource,
  hasSlices,
  working,
  analysisStatus,
  runError,
}: {
  readonly prototypePlan: PrototypePlan | null
  readonly prototypePages: readonly PrototypePageArtifact[]
  readonly prototypeDesignSystem: PrototypeDesignSystemArtifact | null
  readonly selectedPrototypePageId: string | null
  readonly onPrototypePageSelect: (pageId: string) => void
  readonly prototypeScope: PrototypeSuiteScope
  readonly onScopeChange: (scope: PrototypeSuiteScope) => void
  readonly onPrimaryAction: () => void
  readonly hasSource: boolean
  readonly hasSlices: boolean
  readonly working: boolean
  readonly analysisStatus: ReturnType<typeof useStatus>
  readonly runError: string | null
}) {
  const [previewPageId, setPreviewPageId] = useState<string | null>(null)
  const previewArtifact =
    prototypePages.find((artifact) => artifact.page.id === previewPageId) ?? null
  const canvasSlices = useSlices()
  const plannedPages = prototypePlan ? pagesForScope(prototypePlan, prototypeScope) : []
  const generatedPageIds = new Set(prototypePages.map((artifact) => artifact.page.id))
  const missingPageCount = plannedPages.filter((page) => !generatedPageIds.has(page.id)).length
  const hasPrototypeArtifacts = Boolean(prototypeDesignSystem) || prototypePages.length > 0
  const needsContinuation =
    Boolean(prototypePlan) &&
    hasPrototypeArtifacts &&
    !hasSlices &&
    !working &&
    prototypePlan?.humanLoop.mode !== 'ask'
  const continuationDetail = !prototypeDesignSystem
    ? 'The design system is not finished yet.'
    : missingPageCount > 0
      ? `${missingPageCount} prototype page${missingPageCount === 1 ? '' : 's'} still needs to be generated.`
      : 'Prototype screens are available. Continue to extract assets.'

  // Constrained orchestration board: once a prototype result exists, results +
  // materials are arranged on one governed canvas (design system · pages · assets).
  if (prototypeDesignSystem || prototypePages.length > 0) {
    const canvasDesignSystem: CanvasImageItem | null = prototypeDesignSystem
      ? {
          id: 'design-system',
          label: prototypeDesignSystem.name || 'Design system',
          blob: prototypeDesignSystem.blob,
        }
      : null
    const canvasPages: CanvasImageItem[] = prototypePages.map((artifact) => ({
      id: artifact.page.id,
      label: artifact.page.name,
      blob: artifact.blob,
    }))
    const canvasAssets: CanvasImageItem[] = canvasSlices.map((slice) => ({
      id: slice.id,
      label: slice.name,
      url: slice.objectUrl,
    }))
    return (
      <div className="relative h-full min-h-0">
        <OutputCanvas
          designSystem={canvasDesignSystem}
          pages={canvasPages}
          assets={canvasAssets}
        />
        {needsContinuation ? (
          <ContinueAssetsCallout
            detail={runError ?? continuationDetail}
            onContinue={onPrimaryAction}
          />
        ) : null}
      </div>
    )
  }

  if (hasSlices) {
    return (
      // Fixed-height column: the parent never scrolls. The strip is pinned and
      // only the slice grid scrolls, so browsing assets never hides the header.
      <div className="relative flex h-full min-h-0 flex-col">
        {prototypePages.length > 0 ? (
          <div className="shrink-0 p-3 pb-0">
            <PrototypeSuiteStrip
              designSystem={prototypeDesignSystem}
              pages={prototypePages}
              selectedPageId={selectedPrototypePageId}
              onSelectPage={(pageId) => {
                onPrototypePageSelect(pageId)
                setPreviewPageId(pageId)
              }}
            />
            <PrototypePreviewDialog
              artifact={previewArtifact}
              open={previewArtifact !== null}
              onOpenChange={(open) => {
                if (!open) setPreviewPageId(null)
              }}
            />
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <SliceGrid />
        </div>
      </div>
    )
  }

  if (runError) {
    return (
      <CenteredState
        icon={PackageOpen}
        title="Generation stopped"
        detail={runError}
      />
    )
  }

  if (prototypePlan && prototypePages.length === 0 && !working) {
    if (prototypePlan.humanLoop.mode === 'ask') {
      return (
        <CenteredState
          icon={MessageCircle}
          title="Answer in the Agent panel"
          detail="Choose a direction on the left, or write a custom answer, then continue."
        />
      )
    }

    return (
      <PrototypePlanReview
        plan={prototypePlan}
        scope={prototypeScope}
        onScopeChange={onScopeChange}
      />
    )
  }

  if (prototypePages.length > 0) {
    return (
      <div className="relative h-full min-h-0">
        <PrototypeSuitePreview
          designSystem={prototypeDesignSystem}
          pages={prototypePages}
          selectedPageId={selectedPrototypePageId}
          onSelectPage={onPrototypePageSelect}
        />
      </div>
    )
  }

  if (analysisStatus === 'error') {
    return (
      <CenteredState
        icon={PackageOpen}
        title="No assets found"
        detail="This run did not produce usable cutouts."
      />
    )
  }

  if (hasSource) {
    return (
      <div className="relative flex h-full min-h-0 p-4">
        <SourceCanvas />
      </div>
    )
  }

  if (working) {
    return (
      <CenteredState
        icon={WandSparkles}
        title="Generating assets"
        detail="Agent progress is shown in the left panel."
      />
    )
  }

  return (
    <CenteredState
      icon={WandSparkles}
      title="Assets will appear here"
      detail="Start with a short description on the left."
    />
  )
}

function StageStatusIcon({
  status,
}: {
  readonly status: AssetStage['status']
}) {
  if (status === 'done') return <CheckCircle2 className="mt-0.5 size-3.5 text-emerald-500" />
  if (status === 'running') return <Loader2 className="mt-0.5 size-3.5 animate-spin text-primary" />
  return <Circle className="mt-0.5 size-3.5 text-muted-foreground/50" />
}

function AgentActivityPanel({
  stage,
  elapsedSeconds,
  stages,
  progress,
  prototypePlan,
  prototypePages,
  prototypeDesignSystem,
  sliceCount,
  liveAgentOutput,
  compact,
}: {
  readonly stage: AssetStageId
  readonly elapsedSeconds: number
  readonly stages: readonly AssetStage[]
  readonly progress: number
  readonly prototypePlan: PrototypePlan | null
  readonly prototypePages: readonly PrototypePageArtifact[]
  readonly prototypeDesignSystem: PrototypeDesignSystemArtifact | null
  readonly sliceCount: number
  readonly liveAgentOutput: string
  readonly compact: boolean
}) {
  const copy = stageLabel(stage)
  const events = buildActivityEvents({
    stages,
    stage,
    elapsedSeconds,
    prototypePlan,
    prototypePages,
    prototypeDesignSystem,
    sliceCount,
    liveAgentOutput,
  })
  const visibleEvents = compact ? events.slice(-4) : events

  return (
    <section
      aria-live="polite"
      className={cn(
        'rounded-lg border border-border bg-background/95 text-left shadow-sm backdrop-blur',
        compact ? 'p-3' : 'w-full max-w-2xl p-4',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-40" />
              <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
            </span>
            <p className="text-xs font-medium text-muted-foreground">Agent activity</p>
          </div>
          <h2 className={cn('mt-2 font-semibold', compact ? 'text-sm' : 'text-lg')}>
            {copy.label}
          </h2>
          <p className={cn('mt-1 text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>
            {copy.detail}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-border bg-muted/20 px-2 py-1 font-mono text-[11px] text-muted-foreground">
          {formatElapsed(elapsedSeconds)}
        </span>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className={cn('mt-4 space-y-2', compact ? 'max-h-40 overflow-hidden' : 'max-h-72 overflow-auto pr-1')}>
        {visibleEvents.map((event) => (
          <ActivityRow key={event.id} event={event} compact={compact} />
        ))}
      </div>

      {liveAgentOutput.trim() ? (
        <pre className={cn(
          'mt-4 max-h-32 overflow-hidden whitespace-pre-wrap break-words rounded-md border border-border bg-muted/20 p-3 font-mono text-[11px] leading-5 text-muted-foreground',
          compact ? 'hidden' : null,
        )}>
          {liveAgentOutput}
        </pre>
      ) : null}
    </section>
  )
}

function ActivityRow({
  event,
  compact,
}: {
  readonly event: ActivityEvent
  readonly compact: boolean
}) {
  return (
    <div className="flex gap-2">
      <StageStatusIcon status={event.status} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className={cn('truncate font-medium', compact ? 'text-xs' : 'text-sm')}>
            {event.label}
          </p>
          {event.status === 'running' ? (
            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              live
            </span>
          ) : null}
        </div>
        <p className={cn('break-words text-muted-foreground', compact ? 'line-clamp-1 text-[11px]' : 'text-xs leading-5')}>
          {event.detail}
        </p>
      </div>
    </div>
  )
}

function ScopePicker({
  scope,
  onScopeChange,
  disabled,
  primaryCount,
  fullCount,
}: {
  readonly scope: PrototypeSuiteScope
  readonly onScopeChange: (scope: PrototypeSuiteScope) => void
  readonly disabled: boolean
  readonly primaryCount: number
  readonly fullCount: number
}) {
  if (primaryCount >= fullCount) return null

  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onScopeChange('primary-flow')}
        className={cn(
          'rounded-md border px-3 py-2 text-left transition-colors disabled:pointer-events-none disabled:opacity-60',
          scope === 'primary-flow'
            ? 'border-primary bg-primary/10'
            : 'border-border bg-background hover:bg-muted/60',
        )}
      >
        <span className="block text-xs font-semibold">Primary flow</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          {primaryCount} pages
        </span>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onScopeChange('full-plan')}
        className={cn(
          'rounded-md border px-3 py-2 text-left transition-colors disabled:pointer-events-none disabled:opacity-60',
          scope === 'full-plan'
            ? 'border-primary bg-primary/10'
            : 'border-border bg-background hover:bg-muted/60',
        )}
      >
        <span className="block text-xs font-semibold">Full plan</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          {fullCount} pages
        </span>
      </button>
    </div>
  )
}

function PrototypePlanReview({
  plan,
  scope,
  onScopeChange,
}: {
  readonly plan: PrototypePlan
  readonly scope: PrototypeSuiteScope
  readonly onScopeChange: (scope: PrototypeSuiteScope) => void
}) {
  const scopedPages = pagesForScope(plan, scope)
  const firstFlow = plan.flows[0]
  const primaryCount = pagesForScope(plan, 'primary-flow').length
  const fullCount = plan.pages.length

  return (
    <div className="h-full min-h-0 overflow-auto bg-muted/10 p-5">
      <section className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[18rem_minmax(0,1fr)_18rem]">
        <aside className="rounded-lg border border-border bg-background p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Agent read</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">
            {plan.product.name}
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {plan.product.summary}
          </p>

          <div className="mt-5 space-y-3">
            <PlanFact label="Audience" value={plan.product.audience} />
            <PlanFact label="Goal" value={plan.product.primaryGoal} />
            <PlanFact label="Platform" value={plan.product.platform} />
          </div>
        </aside>

        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-background p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Flow</p>
                <h3 className="mt-1 text-base font-semibold">
                  {firstFlow?.name ?? 'Generated flow'}
                </h3>
              </div>
              <span className="rounded-full border border-border bg-muted/20 px-2.5 py-1 text-xs text-muted-foreground">
                {scopedPages.length} pages
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {firstFlow?.goal ?? plan.product.primaryGoal}
            </p>
            <FlowTimeline plan={plan} pages={scopedPages} />
          </section>

          <section className="rounded-lg border border-border bg-background p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Pages</p>
                <h3 className="mt-1 text-base font-semibold">
                  Prototype structure
                </h3>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {scopedPages.map((page) => (
                <PlanPageCard key={page.id} page={page} />
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          {primaryCount < fullCount ? (
            <section className="rounded-lg border border-border bg-background p-4 shadow-sm">
              <p className="mb-3 text-xs font-medium text-muted-foreground">
                Generation range
              </p>
              <ScopePicker
                scope={scope}
                onScopeChange={onScopeChange}
                disabled={false}
                primaryCount={primaryCount}
                fullCount={fullCount}
              />
            </section>
          ) : null}

          <section className="rounded-lg border border-border bg-background p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">Design system</p>
            <h3 className="mt-1 text-sm font-semibold">Shared visual rules</h3>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {plan.designSystem.styleSummary}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {plan.designSystem.palette.slice(0, 5).map((token) => (
                <span
                  key={token}
                  className="rounded-full border border-border bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground"
                >
                  {token}
                </span>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-background p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">Asset direction</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {plan.designSystem.assetDirection}
            </p>
          </section>
        </aside>
      </section>
    </div>
  )
}

function HumanLoopQuestion({
  loop,
  selectedChoiceId,
  onChoiceChange,
  compact = false,
}: {
  readonly loop: Extract<PrototypeHumanLoop, { mode: 'ask' }>
  readonly selectedChoiceId: string | null
  readonly onChoiceChange: (id: string) => void
  readonly compact?: boolean
}) {
  return (
    <section className={cn(
      'rounded-lg border border-primary/35 bg-background shadow-sm',
      compact ? 'p-3' : 'p-4',
    )}>
      <div>
        <h3 className={cn('min-w-0 font-semibold leading-6', compact ? 'text-sm' : 'text-base')}>
          {loop.question}
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Choose one direction. Add optional context below, then press the arrow.
        </p>
      </div>

      <div className={cn('grid gap-2', compact ? 'mt-3' : 'mt-4 md:grid-cols-2')}>
        {loop.choices.map((choice) => {
          const selected = choice.id === selectedChoiceId
          return (
            <button
              key={choice.id}
              type="button"
              onClick={() => onChoiceChange(choice.id)}
              className={cn(
                'rounded-md border text-left transition-colors',
                compact ? 'min-h-0 p-2.5' : 'min-h-24 p-3',
                selected
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-muted/10 hover:bg-muted/40',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className={cn('font-semibold', compact ? 'text-xs' : 'text-sm')}>
                  {choice.label}
                </span>
                <span
                  className={cn(
                    'size-2 rounded-full',
                    selected ? 'bg-primary' : 'bg-muted-foreground/30',
                  )}
                />
              </div>
              <p className={cn(
                'mt-2 text-xs leading-5 text-muted-foreground',
                compact ? 'line-clamp-3' : null,
              )}>
                {choice.description}
              </p>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function PlanFact({
  label,
  value,
}: {
  readonly label: string
  readonly value: string
}) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm leading-5">{value}</p>
    </div>
  )
}

function FlowTimeline({
  plan,
  pages,
}: {
  readonly plan: PrototypePlan
  readonly pages: readonly PrototypePage[]
}) {
  const pageById = new Map(plan.pages.map((page) => [page.id, page]))
  const firstFlow = plan.flows[0]
  const flowPageIds = firstFlow
    ? [firstFlow.startPageId, ...firstFlow.steps.map((step) => step.toPageId).filter((id): id is string => Boolean(id))]
    : pages.map((page) => page.id)
  const uniqueIds = [...new Set(flowPageIds)].filter((id) =>
    pages.some((page) => page.id === id),
  )
  const timelinePages = uniqueIds.length > 0 ? uniqueIds : pages.map((page) => page.id)

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {timelinePages.map((id, index) => {
        const page = pageById.get(id)
        if (!page) return null
        return (
          <div key={id} className="flex items-center gap-2">
            <div className="rounded-md border border-border bg-muted/10 px-3 py-2">
              <div className="flex items-center gap-2">
                <Route className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold">{page.name}</span>
              </div>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                {page.route}
              </p>
            </div>
            {index < timelinePages.length - 1 ? (
              <ExternalLink className="size-3.5 text-muted-foreground/70" />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function PlanPageCard({ page }: { readonly page: PrototypePage }) {
  const primaryInteraction = page.interactions[0]
  const topAssets = page.regions.flatMap((region) => region.assetOpportunities).slice(0, 3)
  return (
    <article className="rounded-md border border-border bg-muted/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold">{page.name}</h4>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            {page.route}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-background px-2 py-1 text-[10px] text-muted-foreground">
          {page.viewport.scroll === 'long-scroll' ? 'Long' : 'Screen'}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
        {page.purpose}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
        <span>{page.regions.length} regions</span>
        <span>{page.interactions.length} actions</span>
      </div>
      {primaryInteraction ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-border/70 bg-background px-2 py-2">
          <MousePointerClick className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <p className="min-w-0 truncate text-[11px] text-muted-foreground">
            {primaryInteraction.sourceElement} · {primaryInteraction.intent}
          </p>
        </div>
      ) : null}
      {topAssets.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {topAssets.map((asset) => (
            <span
              key={asset}
              className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {asset}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  )
}

function PrototypeSuitePreview({
  designSystem,
  pages,
  selectedPageId,
  onSelectPage,
}: {
  readonly designSystem: PrototypeDesignSystemArtifact | null
  readonly pages: readonly PrototypePageArtifact[]
  readonly selectedPageId: string | null
  readonly onSelectPage: (pageId: string) => void
}) {
  const [previewArtifact, setPreviewArtifact] =
    useState<PrototypePageArtifact | null>(null)
  const selected = pages.find((page) => page.page.id === selectedPageId) ?? pages[0]
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4">
      {designSystem ? (
        <DesignSystemReference artifact={designSystem} />
      ) : null}
      <PrototypePageRail
        pages={pages}
        selectedPageId={selected?.page.id ?? null}
        onSelectPage={onSelectPage}
      />
      {selected ? (
        <PrototypePagePreview
          artifact={selected}
          onOpenPreview={() => setPreviewArtifact(selected)}
        />
      ) : null}
      <PrototypePreviewDialog
        artifact={previewArtifact}
        open={Boolean(previewArtifact)}
        onOpenChange={(open) => {
          if (!open) setPreviewArtifact(null)
        }}
      />
    </div>
  )
}

function PrototypeSuiteStrip({
  designSystem,
  pages,
  selectedPageId,
  onSelectPage,
}: {
  readonly designSystem: PrototypeDesignSystemArtifact | null
  readonly pages: readonly PrototypePageArtifact[]
  readonly selectedPageId: string | null
  readonly onSelectPage: (pageId: string) => void
}) {
  return (
    <section className="mb-3 rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Prototype suite</h3>
          <p className="text-xs text-muted-foreground">
            Planned pages used to seed this asset set.
          </p>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {pages.length} pages
        </span>
      </div>
      {designSystem ? (
        <DesignSystemReference artifact={designSystem} compact />
      ) : null}
      <PrototypePageRail
        pages={pages}
        selectedPageId={selectedPageId}
        onSelectPage={onSelectPage}
        compact
        opensPreview
      />
    </section>
  )
}

function DesignSystemReference({
  artifact,
  compact = false,
}: {
  readonly artifact: PrototypeDesignSystemArtifact
  readonly compact?: boolean
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const next = URL.createObjectURL(artifact.blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [artifact.blob])

  async function copyDesignMd(): Promise<void> {
    try {
      await navigator.clipboard.writeText(artifact.designMarkdown)
      toast.success('DESIGN.md copied')
    } catch (error) {
      toast.error('Copy failed', {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <section className="mb-3 rounded-md border border-border bg-background p-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Open design system reference"
          onClick={() => setOpen(true)}
          className={cn(
            'shrink-0 overflow-hidden rounded-sm border border-border bg-muted/30 outline-none transition-all hover:border-ring/50 focus-visible:ring-3 focus-visible:ring-ring/40',
            compact ? 'size-16' : 'h-20 w-32',
          )}
        >
          {url ? (
            <img
              src={url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <Layers3 className="m-auto size-5 text-muted-foreground" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">Design system</p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            DESIGN.md + visual reference · {artifact.width}×{artifact.height}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void copyDesignMd()}
        >
          <Tag className="size-3.5" />
          DESIGN.md
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          aria-describedby={undefined}
          className="w-fit max-w-[94vw] gap-0 p-2"
        >
          <DialogTitle className="sr-only">Design system reference</DialogTitle>
          {url ? (
            <div className="grid gap-2">
              <div className="flex min-w-0 items-center justify-between gap-4 px-1 pt-1">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">Design system</p>
                  <p className="truncate text-xs text-muted-foreground">
                    DESIGN.md-compatible style contract
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copyDesignMd()}
                >
                  <Tag className="size-3.5" />
                  Copy DESIGN.md
                </Button>
              </div>
              <img
                src={url}
                alt=""
                className="max-h-[82vh] max-w-[90vw] rounded-md object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}

function PrototypePageRail({
  pages,
  selectedPageId,
  onSelectPage,
  compact = false,
  opensPreview = false,
}: {
  readonly pages: readonly PrototypePageArtifact[]
  readonly selectedPageId: string | null
  readonly onSelectPage: (pageId: string) => void
  readonly compact?: boolean
  readonly opensPreview?: boolean
}) {
  return (
    <div
      role="listbox"
      aria-label="Prototype pages"
      className="mb-3 flex gap-2 overflow-x-auto pb-1"
    >
      {pages.map((artifact) => (
        <PrototypePageThumb
          key={artifact.page.id}
          artifact={artifact}
          selected={artifact.page.id === selectedPageId}
          onSelect={() => onSelectPage(artifact.page.id)}
          compact={compact}
          opensPreview={opensPreview}
        />
      ))}
    </div>
  )
}

function PrototypePageThumb({
  artifact,
  selected,
  onSelect,
  compact,
  opensPreview,
}: {
  readonly artifact: PrototypePageArtifact
  readonly selected: boolean
  readonly onSelect: () => void
  readonly compact: boolean
  readonly opensPreview: boolean
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const next = URL.createObjectURL(artifact.blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [artifact.blob])

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-label={`${opensPreview ? 'Open preview for' : 'Show'} ${artifact.page.name}`}
      onClick={onSelect}
      className={cn(
        'w-36 shrink-0 rounded-md border bg-background p-2 text-left outline-none transition-all',
        opensPreview ? 'cursor-zoom-in' : 'cursor-pointer',
        'hover:border-ring/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40',
        selected ? 'border-primary shadow-sm ring-1 ring-primary/30' : 'border-border',
        compact ? 'w-32' : null,
      )}
    >
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-sm bg-muted/30">
        {url ? (
          <img src={url} alt={artifact.page.name} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="size-5 text-muted-foreground" />
        )}
      </div>
      <p className="mt-2 truncate text-xs font-semibold">{artifact.page.name}</p>
      <p className="truncate font-mono text-[10px] text-muted-foreground">
        {artifact.page.route}
      </p>
    </button>
  )
}

function PrototypePreviewDialog({
  artifact,
  open,
  onOpenChange,
}: {
  readonly artifact: PrototypePageArtifact | null
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!artifact) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(artifact.blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [artifact])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="w-fit max-w-[94vw] gap-0 p-2"
      >
        <DialogTitle className="sr-only">
          {artifact ? `Prototype preview: ${artifact.page.name}` : 'Prototype preview'}
        </DialogTitle>
        {artifact && url ? (
          <div className="grid gap-2">
            <div className="flex min-w-0 items-center justify-between gap-4 px-1 pt-1">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{artifact.page.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {artifact.page.route} · {artifact.width}×{artifact.height}
                </p>
              </div>
            </div>
            <img
              src={url}
              alt=""
              className="max-h-[82vh] max-w-[90vw] rounded-md object-contain"
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function PrototypePagePreview({
  artifact,
  onOpenPreview,
}: {
  readonly artifact: PrototypePageArtifact
  readonly onOpenPreview: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const next = URL.createObjectURL(artifact.blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [artifact.blob])

  return (
    <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-background p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{artifact.page.name}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {artifact.page.purpose}
          </p>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {artifact.width}×{artifact.height}
        </span>
      </div>
      <button
        type="button"
        aria-label={`Open preview for ${artifact.page.name}`}
        onClick={onOpenPreview}
        className="flex h-[calc(100%-3.25rem)] w-full cursor-zoom-in items-center justify-center overflow-hidden rounded-md bg-muted/20 outline-none transition-colors hover:bg-muted/30 focus-visible:ring-3 focus-visible:ring-ring/40"
      >
        {url ? (
          <img
            src={url}
            alt={artifact.page.name}
            className="max-h-full max-w-full rounded-sm object-contain"
          />
        ) : (
          <ImageIcon className="size-8 text-muted-foreground" />
        )}
      </button>
    </div>
  )
}

function CenteredState({
  icon: Icon,
  title,
  detail,
}: {
  readonly icon: ComponentType<{ className?: string }>
  readonly title: string
  readonly detail: string
}) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="text-center">
        <Icon className="mx-auto mb-4 size-9 text-muted-foreground/60" />
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

function ContinueAssetsCallout({
  detail,
  onContinue,
}: {
  readonly detail: string
  readonly onContinue: () => void
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-xl items-center justify-between gap-4 rounded-lg border border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Continue generation</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {detail}
          </p>
        </div>
        <Button
          type="button"
          onClick={onContinue}
          className="shrink-0"
        >
          <WandSparkles className="size-4" />
          Continue assets
        </Button>
      </div>
    </div>
  )
}

function useElapsedSeconds(startedAt: number | null, active: boolean): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!startedAt || !active) {
      setNow(Date.now())
      return
    }
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [active, startedAt])

  if (!startedAt) return 0
  return Math.max(0, Math.floor((now - startedAt) / 1000))
}

function resolveAssetStage({
  genPhase,
  analysisStatus,
  naming,
  hasMockup,
  hasSource,
  hasSlices,
  agentBusy,
  workflowPhase,
  hasPlan,
  hasDesignSystem,
  hasPrototypePages,
}: {
  readonly genPhase: ReturnType<typeof useStore.getState>['genPhase']
  readonly analysisStatus: ReturnType<typeof useStatus>
  readonly naming: boolean
  readonly hasMockup: boolean
  readonly hasSource: boolean
  readonly hasSlices: boolean
  readonly agentBusy: boolean
  readonly workflowPhase: WorkflowPhase
  readonly hasPlan: boolean
  readonly hasDesignSystem: boolean
  readonly hasPrototypePages: boolean
}): AssetStageId {
  if (workflowPhase === 'planning') return 'planning'
  if (workflowPhase === 'review') return 'review'
  if (workflowPhase === 'design-system') return 'design-system'
  if (workflowPhase === 'generating-suite') return 'mockup'
  if (genPhase === 'generating-mockup') return 'mockup'
  if (genPhase === 'deconstructing') return 'deconstruct'
  if (analysisStatus === 'running') return 'cutout'
  if (naming) return 'naming'
  if (hasSlices) return 'done'
  if (hasPrototypePages) return 'mockup'
  if (hasDesignSystem) return 'design-system'
  if (hasPlan) return 'review'
  if (agentBusy) {
    if (hasSource) return 'cutout'
    if (hasMockup) return 'deconstruct'
    return 'preparing'
  }
  return 'idle'
}

function applyLocalSemanticSliceNames(
  plan: PrototypePlan | null,
  scope: PrototypeSuiteScope,
  onlyGeneric: boolean,
): number {
  if (!plan) return 0
  const snapshot = getStoreState()
  const slices = snapshot.analysis.slices
  if (slices.length === 0) return 0

  const names = fallbackPrototypeSliceNames(plan, pagesForScope(plan, scope), slices.length)
  let renamed = 0
  for (let index = 0; index < slices.length; index += 1) {
    const slice = slices[index]
    const name = names[index]
    if (!slice || !name) continue
    if (onlyGeneric && !isGenericSliceFilename(slice.name)) continue
    snapshot.renameSlice(slice.id, name)
    renamed += 1
  }
  return renamed
}

function buildAssetStages({
  activeStage,
  hasMockup,
  hasSource,
  hasSlices,
  namingStatus,
  hasPlan,
  hasDesignSystem,
  hasPrototypePages,
}: {
  readonly activeStage: AssetStageId
  readonly hasMockup: boolean
  readonly hasSource: boolean
  readonly hasSlices: boolean
  readonly namingStatus: 'idle' | 'pending' | 'running' | 'done' | 'skipped' | 'error'
  readonly hasPlan: boolean
  readonly hasDesignSystem: boolean
  readonly hasPrototypePages: boolean
}): readonly AssetStage[] {
  const isDone = (id: AssetStage['id']): boolean => {
    if (id === 'planning') return hasPlan || hasPrototypePages || hasMockup || hasSource || hasSlices
    if (id === 'design-system') return hasDesignSystem || hasPrototypePages || hasMockup || hasSource || hasSlices
    if (id === 'mockup') return hasPrototypePages || hasMockup || hasSource || hasSlices
    if (id === 'deconstruct') return hasSource || hasSlices
    if (id === 'cutout') return hasSlices
    if (id === 'naming') return namingStatus === 'done'
    return activeStage !== 'idle' && activeStage !== 'preparing' && activeStage !== 'review'
  }
  const isRunning = (id: AssetStage['id']): boolean => activeStage === id

  const stage = (
    id: AssetStage['id'],
    label: string,
    detail: string,
    icon: AssetStage['icon'],
  ): AssetStage => ({
    id,
    label,
    detail,
    icon,
    status: isDone(id) ? 'done' : isRunning(id) ? 'running' : 'pending',
  })

  return [
    stage('planning', 'Plan', 'Map pages, flows, and scope.', WandSparkles),
    stage('design-system', 'Design system', 'Create DESIGN.md and visual reference.', Layers3),
    stage('mockup', 'Prototype suite', 'Generate planned pages.', ImageIcon),
    stage('deconstruct', 'Asset board', 'Regenerate valuable visual layers.', Layers3),
    stage('cutout', 'Cutout', 'Detect and split atomic assets.', Scissors),
    stage('naming', 'Names', 'Apply semantic filenames.', Tag),
  ]
}

function estimateProgress({
  activeStage,
  hasMockup,
  hasSource,
  hasSlices,
  naming,
  namingStatus,
  hasPlan,
  hasDesignSystem,
  hasPrototypePages,
}: {
  readonly activeStage: AssetStageId
  readonly hasMockup: boolean
  readonly hasSource: boolean
  readonly hasSlices: boolean
  readonly naming: boolean
  readonly namingStatus: 'idle' | 'pending' | 'running' | 'done' | 'skipped' | 'error'
  readonly hasPlan: boolean
  readonly hasDesignSystem: boolean
  readonly hasPrototypePages: boolean
}): number {
  if (activeStage === 'done') return 100
  let progress = 4
  if (hasPlan) progress += 18
  if (hasDesignSystem) progress += 14
  if (hasPrototypePages || hasMockup) progress += 30
  if (hasSource) progress += 28
  if (hasSlices) progress += 20

  if (activeStage === 'planning') progress = Math.max(progress, 10)
  if (activeStage === 'review') progress = Math.max(progress, 24)
  if (activeStage === 'design-system') progress = Math.max(progress, 28)
  if (activeStage === 'mockup') progress = Math.max(progress, 38)
  if (activeStage === 'deconstruct') progress = Math.max(progress, 48)
  if (activeStage === 'cutout') progress = Math.max(progress, 82)
  if (activeStage === 'naming' || naming || namingStatus === 'running') {
    progress = Math.max(progress, 94)
  }
  if (namingStatus === 'done') return 100

  return Math.min(progress, 98)
}

function buildActivityEvents({
  stages,
  stage,
  elapsedSeconds,
  prototypePlan,
  prototypePages,
  prototypeDesignSystem,
  sliceCount,
  liveAgentOutput,
}: {
  readonly stages: readonly AssetStage[]
  readonly stage: AssetStageId
  readonly elapsedSeconds: number
  readonly prototypePlan: PrototypePlan | null
  readonly prototypePages: readonly PrototypePageArtifact[]
  readonly prototypeDesignSystem: PrototypeDesignSystemArtifact | null
  readonly sliceCount: number
  readonly liveAgentOutput: string
}): readonly ActivityEvent[] {
  const events: ActivityEvent[] = stages.map((item) => ({
    id: `stage-${item.id}`,
    label: item.label,
    detail:
      item.status === 'done'
        ? `Completed. ${item.detail}`
        : item.status === 'running'
          ? `In progress. ${item.detail}`
          : `Queued. ${item.detail}`,
    status: item.status,
  }))

  if (stage === 'planning' && !prototypePlan) {
    events.push({
      id: 'planner-stream-wait',
      label: 'Planner request sent',
      detail: `Waiting for structured model output. Heartbeat ${formatElapsed(elapsedSeconds)}.`,
      status: 'running',
    })
  }

  if (prototypePlan) {
    const pageNames = prototypePlan.pages.map((page) => page.name).join(', ')
    events.push({
      id: 'plan-pages',
      label: `Plan received: ${prototypePlan.pages.length} pages`,
      detail: pageNames || 'The Agent returned a page and flow plan.',
      status: 'done',
    })
  }

  if (stage === 'design-system' && !prototypeDesignSystem) {
    events.push({
      id: 'design-system-stream-wait',
      label: 'Design system generation started',
      detail: 'Waiting for the image model to return the visual reference and DESIGN.md synthesis.',
      status: 'running',
    })
  }

  if (liveAgentOutput.trim()) {
    events.push({
      id: 'text-stream-received',
      label: 'SSE text stream receiving',
      detail: 'DESIGN.md synthesis is streaming into the activity panel.',
      status: 'running',
    })
  }

  if (prototypeDesignSystem) {
    events.push({
      id: 'design-system-ready',
      label: 'Design system received',
      detail: `${prototypeDesignSystem.name} · ${prototypeDesignSystem.width}x${prototypeDesignSystem.height}.`,
      status: 'done',
    })
  }

  if (stage === 'mockup' && prototypePages.length === 0) {
    events.push({
      id: 'prototype-page-stream-wait',
      label: 'Prototype page generation started',
      detail: 'Waiting for the first page image. Each page appears as soon as it is ready.',
      status: 'running',
    })
  }

  for (const artifact of prototypePages) {
    events.push({
      id: `page-${artifact.page.id}`,
      label: `Page received: ${artifact.page.name}`,
      detail: `${artifact.width}x${artifact.height} · ${artifact.page.purpose}`,
      status: 'done',
    })
  }

  if (stage === 'deconstruct') {
    events.push({
      id: 'asset-board-wait',
      label: 'Asset extraction request sent',
      detail: 'Regenerating valuable visual layers before local cutout.',
      status: 'running',
    })
  }

  if (stage === 'cutout') {
    events.push({
      id: 'local-cutout-running',
      label: 'Local cutout running',
      detail: 'Detecting transparent regions, splitting candidates, and preparing PNG slices.',
      status: 'running',
    })
  }

  if (sliceCount > 0) {
    events.push({
      id: 'slice-count',
      label: `${sliceCount} assets visible`,
      detail: 'Assets are available while semantic naming continues in the background.',
      status: 'done',
    })
  }

  if (stage === 'naming') {
    events.push({
      id: 'naming-running',
      label: 'Semantic naming started',
      detail: 'Applying content-aware filenames without blocking asset review.',
      status: 'running',
    })
  }

  return events
}

function stageLabel(stage: AssetStageId): { label: string; detail: string } {
  switch (stage) {
    case 'planning':
      return {
        label: 'Planning prototype',
        detail: 'Agent is mapping pages, flows, regions, and visual system.',
      }
    case 'review':
      return {
        label: 'Review plan',
        detail: 'Answer the Agent only when the plan still has a high-impact uncertainty.',
      }
    case 'design-system':
      return {
        label: 'Creating design system',
        detail: 'Generating a DESIGN.md-compatible style contract and visual reference.',
      }
    case 'preparing':
      return {
        label: 'Preparing run',
        detail: 'Resolving model route and prompt context.',
      }
    case 'mockup':
      return {
        label: 'Generating prototype',
        detail: 'Creating the source interface first, then extraction can begin.',
      }
    case 'deconstruct':
      return {
        label: 'Preparing asset board',
        detail: 'Separating valuable artwork, products, banners, and material layers.',
      }
    case 'cutout':
      return {
        label: 'Cutting assets',
        detail: 'Running local cutout analysis and slice refinement.',
      }
    case 'naming':
      return {
        label: 'Naming assets',
        detail: 'Assets are visible now; semantic filenames are being applied.',
      }
    case 'done':
      return {
        label: 'Ready',
        detail: 'Assets are ready to review and export.',
      }
    case 'idle':
    default:
      return {
        label: 'Waiting',
        detail: 'Start with a clear intent.',
      }
  }
}

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

function trimLiveAgentOutput(text: string): string {
  const compact = text.replace(/\n{4,}/g, '\n\n\n').trimStart()
  if (compact.length <= 1400) return compact
  return `...${compact.slice(-1400)}`
}

function stripMarkdownFence(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i)
  return (fenced?.[1] ?? trimmed).trim()
}

function primaryButtonLabel({
  working,
  workflowPhase,
  hasPlan,
  hasPrototypePages,
  hasPrototypeArtifacts,
  prototypeComplete,
  hasSlices,
  humanLoop,
}: {
  readonly working: boolean
  readonly workflowPhase: WorkflowPhase
  readonly hasPlan: boolean
  readonly hasPrototypePages: boolean
  readonly hasPrototypeArtifacts: boolean
  readonly prototypeComplete: boolean
  readonly hasSlices: boolean
  readonly humanLoop: PrototypeHumanLoop | null
}): string {
  if (working) {
    if (workflowPhase === 'planning') return 'Planning prototype'
    if (workflowPhase === 'design-system') return 'Creating design system'
    if (workflowPhase === 'generating-suite') return 'Generating suite'
    return 'Creating assets'
  }
  if (!hasPlan) return 'Create assets'
  if (humanLoop?.mode === 'ask') return 'Continue planning'
  if (hasPrototypeArtifacts && (!prototypeComplete || !hasSlices)) return 'Continue assets'
  if (!hasPrototypePages) return 'Create assets'
  return 'Recreate assets'
}

function sortPrototypePages(
  pages: readonly PrototypePageArtifact[],
  order: readonly PrototypePage[],
): PrototypePageArtifact[] {
  const index = new Map(order.map((page, i) => [page.id, i]))
  return pages.toSorted((a, b) => {
    return (index.get(a.page.id) ?? 999) - (index.get(b.page.id) ?? 999)
  })
}

function isPrototypeSuiteComplete(
  plan: PrototypePlan,
  scope: PrototypeSuiteScope,
  pages: readonly PrototypePageArtifact[],
  designSystem: PrototypeDesignSystemArtifact | null,
): boolean {
  if (!designSystem) return false
  const generatedIds = new Set(pages.map((artifact) => artifact.page.id))
  return pagesForScope(plan, scope).every((page) => generatedIds.has(page.id))
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function userFacingGenerationError(message: string): string {
  const lower = message.toLowerCase()

  if (
    lower.includes('api_key') ||
    lower.includes('api key') ||
    lower.includes('unauthorized') ||
    lower.includes('invalid key')
  ) {
    return 'The selected AI provider needs a valid API key. Open Settings and update the provider.'
  }

  if (
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('request failed') ||
    lower.includes('network') ||
    lower.includes('fetch failed')
  ) {
    return 'The AI provider timed out. Cutout kept the technical details for Agent diagnostics; try again or switch provider.'
  }

  if (
    lower.includes('schema') ||
    lower.includes('json') ||
    lower.includes('structured')
  ) {
    return 'The AI planner returned invalid structured data. Cutout kept the raw response for Agent diagnostics.'
  }

  if (message.trim().length === 0) return 'Generation stopped.'
  return message.length > 180 ? 'Generation stopped. Details are available in Agent diagnostics.' : message
}

function recoverWorkflowPhase(snapshot: WorkspaceSnapshot | null | undefined): WorkflowPhase {
  if (!snapshot?.prototypePlan) return 'idle'
  if (snapshot.prototypePages.length > 0 || snapshot.prototypeDesignSystem) return 'idle'
  return 'review'
}

function restoreReferenceAttachments(
  attachments: readonly PersistedReferenceAttachment[],
): ReferenceAttachment[] {
  return attachments.map((attachment) => {
    const blob = bytesToBlob(attachment.bytes, attachment.mediaType)
    return {
      ...attachment,
      blob,
      url: URL.createObjectURL(blob),
    }
  })
}

function restorePrototypeDesignSystem(
  artifact: PersistedPrototypeDesignSystem | null,
): PrototypeDesignSystemArtifact | null {
  if (!artifact) return null
  return {
    ...artifact,
    blob: bytesToBlob(artifact.bytes, artifact.mediaType),
  }
}

function restorePrototypePages(
  artifacts: readonly PersistedPrototypePage[],
): PrototypePageArtifact[] {
  return artifacts.map((artifact) => ({
    ...artifact,
    blob: bytesToBlob(artifact.bytes, artifact.mediaType),
  }))
}

function persistReferenceAttachment(
  attachment: ReferenceAttachment,
): PersistedReferenceAttachment {
  return {
    id: attachment.id,
    name: attachment.name,
    bytes: attachment.bytes,
    mediaType: attachment.mediaType,
  }
}

function persistPrototypeImage(
  artifact: PrototypeImageArtifact,
): PersistedPrototypeImage {
  return {
    bytes: artifact.bytes,
    mediaType: artifact.mediaType,
    width: artifact.width,
    height: artifact.height,
  }
}

function persistPrototypeDesignSystem(
  artifact: PrototypeDesignSystemArtifact,
): PersistedPrototypeDesignSystem {
  return {
    ...persistPrototypeImage(artifact),
    name: artifact.name,
    designMarkdown: artifact.designMarkdown,
  }
}

function persistPrototypePage(
  artifact: PrototypePageArtifact,
): PersistedPrototypePage {
  return {
    ...persistPrototypeImage(artifact),
    page: artifact.page,
  }
}

async function artifactToMockup(artifact: PrototypePageArtifact) {
  const bitmap = await decodeImage(artifact.blob)
  return {
    bitmap,
    blob: artifact.blob,
    width: bitmap.width,
    height: bitmap.height,
  }
}

function defaultHumanLoopChoiceId(plan: PrototypePlan): string | null {
  return plan.humanLoop.mode === 'ask' ? plan.humanLoop.defaultChoiceId : null
}

function resolveHumanLoopAnswer(
  loop: Extract<PrototypeHumanLoop, { mode: 'ask' }>,
  choiceId: string | null,
  customAnswer: string,
): ResolvedHumanLoopAnswer {
  const normalizedCustom = customAnswer.trim()
  if (choiceId === CUSTOM_HUMAN_LOOP_ID && normalizedCustom.length > 0) {
    return { kind: 'custom', text: normalizedCustom }
  }
  const id = choiceId === CUSTOM_HUMAN_LOOP_ID
    ? loop.defaultChoiceId
    : choiceId ?? loop.defaultChoiceId
  const answer = loop.choices.find((choice) => choice.id === id) ?? loop.choices[0]
  if (!answer) throw new Error('Human-in-the-loop question has no choices.')
  return {
    kind: 'choice',
    choice: answer,
    note: normalizedCustom.length > 0 ? normalizedCustom : null,
  }
}

function composeHumanLoopRequirement(
  brief: string,
  loop: Extract<PrototypeHumanLoop, { mode: 'ask' }>,
  answer: ResolvedHumanLoopAnswer,
): string {
  const answerLines =
    answer.kind === 'custom'
      ? [
          'Selected choice: Custom option',
          `Custom answer: ${answer.text}`,
        ]
      : [
          `Selected choice: ${answer.choice.label}`,
          `Choice description: ${answer.choice.description}`,
          `Expected planning impact: ${answer.choice.impact}`,
          ...(answer.note ? [`Additional guidance: ${answer.note}`] : []),
        ]

  return [
    brief.trim(),
    '',
    'Human-in-the-loop answer:',
    `Question: ${loop.question}`,
    ...answerLines,
    '',
    'Re-plan from the original requirement and this answer. If the answer resolves the material ambiguity, set humanLoop.mode to "continue". Ask another question only if a new, higher-impact ambiguity still blocks a useful prototype suite.',
  ].join('\n')
}
