import { z } from 'zod'

export const designSystemKitVersion = 'design-system-kit.v1' as const

export const designSystemArtifactStageSchema = z.enum([
  'foundation',
  'semantic',
  'primitive',
  'component',
  'pattern',
  'template',
  'binding',
  'documentation',
  'quality',
  'package',
])

export const designSystemProductionModeSchema = z.enum([
  'deterministic',
  'multimodal-analysis',
  'image-generation',
  'image-edit',
])

export const designSystemExecutorSchema = z.enum([
  'compiler',
  'coding-agent',
  'visual-generation',
  'figma-adapter',
])

export const designSystemQualityGateSchema = z.enum([
  'schema',
  'provenance',
  'token-reference',
  'contrast',
  'keyboard',
  'screen-reader',
  'responsive',
  'visual-regression',
  'interaction-contract',
  'motion-reduction',
  'duration',
  'bounds',
  'blank-frames',
  'web-render-screenshot',
  'code-connect',
  'package-consumer',
  'license',
])

export const designSystemArtifactSchema = z.object({
  id: z.string().regex(/^ds\.[a-z0-9.-]+$/),
  title: z.string().min(1),
  stage: designSystemArtifactStageSchema,
  description: z.string().min(1),
  dependsOn: z.array(z.string()).default([]),
  modes: z.array(designSystemProductionModeSchema).min(1),
  executors: z.array(designSystemExecutorSchema).min(1),
  gates: z.array(designSystemQualityGateSchema).min(1),
  outputs: z.array(z.string().min(1)).min(1),
  rebuildKeys: z.array(z.string().min(1)).min(1),
}).strict()

export type DesignSystemArtifact = z.infer<typeof designSystemArtifactSchema>
export type DesignSystemQualityGate = z.infer<typeof designSystemQualityGateSchema>

const foundation = (
  id: string,
  title: string,
  outputs: string[],
  gates: DesignSystemQualityGate[] = ['schema', 'provenance', 'token-reference'],
  modes: DesignSystemArtifact['modes'] = ['deterministic'],
): DesignSystemArtifact => ({
  id: `ds.foundation.${id}`,
  title,
  stage: 'foundation',
  description: `${title} source tokens, usage rules, examples, and machine-readable contracts.`,
  dependsOn: [],
  modes,
  executors: modes.some((mode) => mode === 'image-generation' || mode === 'image-edit' || mode === 'multimodal-analysis')
    ? ['compiler', 'visual-generation']
    : ['compiler'],
  gates,
  outputs,
  rebuildKeys: [`tokens.${id}`, `sources.${id}`],
})

/**
 * Canonical Design System Kit scope. It is intentionally data rather than UI
 * copy so the Workbench, planner, exporters and agent control surfaces consume
 * the same authoritative target list.
 */
export const designSystemArtifacts: readonly DesignSystemArtifact[] = [
  foundation('color', 'Color', ['tokens/color.dtcg.json', 'docs/foundations/color.mdx'], ['schema', 'provenance', 'token-reference', 'contrast']),
  foundation('typography', 'Typography', ['tokens/typography.dtcg.json', 'docs/foundations/typography.mdx']),
  foundation('spacing', 'Spacing', ['tokens/spacing.dtcg.json', 'docs/foundations/spacing.mdx']),
  foundation('grid', 'Grid and breakpoints', ['tokens/layout.dtcg.json', 'docs/foundations/grid.mdx'], ['schema', 'provenance', 'responsive']),
  foundation('radius', 'Radius', ['tokens/radius.dtcg.json', 'docs/foundations/radius.mdx']),
  foundation('elevation', 'Elevation', ['tokens/elevation.dtcg.json', 'docs/foundations/elevation.mdx']),
  foundation('motion', 'Motion', ['tokens/motion.dtcg.json', 'motion/motion-ir.schema.json', 'motion/components.json', 'docs/foundations/motion.mdx'], ['schema', 'provenance', 'duration', 'bounds', 'blank-frames', 'motion-reduction', 'web-render-screenshot']),
  foundation('iconography', 'Iconography', ['assets/icons/manifest.json', 'docs/foundations/iconography.mdx'], ['schema', 'provenance', 'license'], ['deterministic', 'multimodal-analysis']),
  foundation('imagery', 'Imagery', ['assets/imagery/manifest.json', 'docs/foundations/imagery.mdx'], ['schema', 'provenance', 'license', 'visual-regression'], ['multimodal-analysis', 'image-generation', 'image-edit']),
  foundation('accessibility', 'Accessibility', ['contracts/accessibility.json', 'docs/foundations/accessibility.mdx'], ['schema', 'contrast', 'keyboard', 'screen-reader', 'motion-reduction']),
  foundation('content', 'Content design', ['contracts/content.json', 'docs/foundations/content.mdx']),
  {
    id: 'ds.semantic.themes', title: 'Semantic themes and modes', stage: 'semantic',
    description: 'Role-based aliases for light, dark, high-contrast and brand modes without duplicating primitives.',
    dependsOn: ['ds.foundation.color', 'ds.foundation.typography', 'ds.foundation.elevation', 'ds.foundation.motion'],
    modes: ['deterministic'], gates: ['schema', 'token-reference', 'contrast', 'motion-reduction'],
    executors: ['compiler'],
    outputs: ['tokens/semantic.dtcg.json', 'tokens/modes.css', 'contracts/themes.json'],
    rebuildKeys: ['tokens.color', 'tokens.typography', 'tokens.elevation', 'tokens.motion', 'themes'],
  },
  {
    id: 'ds.primitive.library', title: 'Accessible primitives', stage: 'primitive',
    description: 'Headless interaction primitives with stable parts, slots, focus behavior and state contracts.',
    dependsOn: ['ds.semantic.themes', 'ds.foundation.spacing', 'ds.foundation.radius', 'ds.foundation.accessibility'],
    modes: ['deterministic'], gates: ['schema', 'keyboard', 'screen-reader', 'interaction-contract'],
    executors: ['compiler', 'coding-agent'],
    outputs: ['contracts/primitives.json', 'packages/primitives/index.ts'],
    rebuildKeys: ['themes', 'tokens.spacing', 'tokens.radius', 'accessibility', 'primitives'],
  },
  {
    id: 'ds.component.library', title: 'Components, variants and states', stage: 'component',
    description: 'Composable components with explicit anatomy, properties, variants, states, slots and token bindings.',
    dependsOn: ['ds.primitive.library', 'ds.foundation.iconography', 'ds.foundation.content'],
    modes: ['deterministic', 'multimodal-analysis'], gates: ['schema', 'token-reference', 'keyboard', 'screen-reader', 'responsive', 'interaction-contract', 'visual-regression'],
    executors: ['compiler', 'coding-agent'],
    outputs: ['contracts/components.json', 'packages/components/index.ts', 'stories/components'],
    rebuildKeys: ['primitives', 'components', 'tokens', 'assets.icons', 'content'],
  },
  {
    id: 'ds.pattern.library', title: 'Product patterns', stage: 'pattern',
    description: 'Validated compositions for navigation, forms, search, CRUD, feedback, onboarding, empty/error/loading and agent activity.',
    dependsOn: ['ds.component.library'], modes: ['deterministic', 'multimodal-analysis'],
    executors: ['compiler', 'coding-agent'],
    gates: ['schema', 'keyboard', 'screen-reader', 'responsive', 'interaction-contract', 'visual-regression'],
    outputs: ['contracts/patterns.json', 'stories/patterns'], rebuildKeys: ['components', 'patterns'],
  },
  {
    id: 'ds.template.library', title: 'Responsive templates', stage: 'template',
    description: 'Outcome-oriented app shells, dashboards, editors, commerce and content layouts across declared breakpoints.',
    dependsOn: ['ds.pattern.library', 'ds.foundation.grid', 'ds.foundation.imagery'],
    modes: ['deterministic', 'multimodal-analysis', 'image-generation', 'image-edit'],
    executors: ['compiler', 'coding-agent', 'visual-generation'],
    gates: ['schema', 'provenance', 'license', 'responsive', 'visual-regression'],
    outputs: ['contracts/templates.json', 'stories/templates'], rebuildKeys: ['patterns', 'templates', 'tokens.grid', 'assets.imagery'],
  },
  {
    id: 'ds.binding.web', title: 'Web token and code bindings', stage: 'binding',
    description: 'DTCG tokens projected to CSS variables, Tailwind v4 theme variables and typed runtime bindings.',
    dependsOn: ['ds.semantic.themes', 'ds.component.library'], modes: ['deterministic'],
    executors: ['compiler'],
    gates: ['schema', 'token-reference', 'interaction-contract'],
    outputs: ['tokens/tokens.json', 'tokens/tokens.css', 'tokens/tailwind.css', 'tokens/theme.ts'],
    rebuildKeys: ['tokens', 'themes', 'components'],
  },
  {
    id: 'ds.binding.figma', title: 'Figma interchange payload', stage: 'binding',
    description: 'Offline authorized Snapshot/Variables payload and Code Connect mapping; this is not live sync.',
    dependsOn: ['ds.semantic.themes', 'ds.component.library'], modes: ['deterministic'],
    executors: ['compiler', 'figma-adapter'],
    gates: ['schema', 'token-reference', 'code-connect', 'provenance'],
    outputs: ['figma/variables.payload.json', 'figma/component-bindings.json', 'figma/code-connect'],
    rebuildKeys: ['tokens', 'themes', 'components', 'figma-bindings'],
  },
  {
    id: 'ds.binding.astryx', title: 'Astryx consumer binding', stage: 'binding',
    description: 'Explicit Design IR token and component mappings projected to an Astryx defineTheme input and reviewable CLI build plan. Astryx is a consumer, never the fact source.',
    dependsOn: ['ds.semantic.themes', 'ds.component.library'], modes: ['deterministic'],
    executors: ['compiler'], gates: ['schema', 'token-reference', 'package-consumer', 'provenance'],
    outputs: ['astryx/cutout.theme.ts', 'astryx/component-mapping.json', 'astryx/cli-plan.json'],
    rebuildKeys: ['tokens', 'themes', 'components', 'astryx-bindings'],
  },
  {
    id: 'ds.documentation.portal', title: 'Documentation and examples', stage: 'documentation',
    description: 'Foundations, component API, do/don’t guidance, recipes, story examples, migration notes and agent-readable indexes.',
    dependsOn: ['ds.pattern.library', 'ds.template.library', 'ds.binding.web', 'ds.binding.figma', 'ds.binding.astryx'],
    modes: ['deterministic', 'multimodal-analysis'], gates: ['schema', 'provenance', 'visual-regression'],
    executors: ['compiler', 'coding-agent'],
    outputs: ['DESIGN.md', 'docs/index.json', 'stories/index.json'], rebuildKeys: ['tokens', 'components', 'patterns', 'templates', 'bindings', 'docs'],
  },
  {
    id: 'ds.quality.suite', title: 'Quality contract suite', stage: 'quality',
    description: 'Executable schema, accessibility, visual, interaction, binding and consumer contract gates.',
    dependsOn: ['ds.documentation.portal'], modes: ['deterministic'],
    executors: ['compiler'],
    gates: ['schema', 'contrast', 'keyboard', 'screen-reader', 'responsive', 'visual-regression', 'interaction-contract', 'motion-reduction', 'code-connect', 'package-consumer'],
    outputs: ['quality/manifest.json', 'quality/receipts.json'], rebuildKeys: ['quality', 'tokens', 'components', 'patterns', 'templates', 'bindings'],
  },
  {
    id: 'ds.package.release', title: 'Package and starter consumption', stage: 'package',
    description: 'Versioned package exports and Next/Vite starter fixtures proven against the exact generated kit.',
    dependsOn: ['ds.quality.suite'], modes: ['deterministic'],
    executors: ['compiler', 'coding-agent'],
    gates: ['schema', 'package-consumer', 'provenance'],
    outputs: ['packages/design-system', 'starters/next-app-router', 'starters/vite-react', 'starters/nuxt', 'starters/tanstack-start', 'manifest.json'],
    rebuildKeys: ['package', 'quality', 'tokens', 'components', 'templates'],
  },
] as const

export const designSystemProfileSchema = z.enum(['foundation', 'product', 'complete'])
export type DesignSystemProfile = z.infer<typeof designSystemProfileSchema>

const profileRoots: Readonly<Record<DesignSystemProfile, readonly string[]>> = {
  foundation: [
    'ds.foundation.color', 'ds.foundation.typography', 'ds.foundation.spacing',
    'ds.foundation.grid', 'ds.foundation.radius', 'ds.foundation.elevation',
    'ds.foundation.motion', 'ds.foundation.iconography', 'ds.foundation.imagery',
    'ds.foundation.accessibility', 'ds.foundation.content', 'ds.semantic.themes',
  ],
  product: [
    'ds.foundation.color', 'ds.foundation.typography', 'ds.foundation.spacing',
    'ds.foundation.grid', 'ds.foundation.radius', 'ds.foundation.elevation',
    'ds.foundation.motion', 'ds.foundation.iconography', 'ds.foundation.imagery',
    'ds.foundation.accessibility', 'ds.foundation.content', 'ds.pattern.library',
    'ds.binding.web',
  ],
  complete: ['ds.package.release'],
}

export interface DesignSystemBuildNode {
  readonly id: string
  readonly artifactId: string
  readonly dependsOn: readonly string[]
  readonly modes: DesignSystemArtifact['modes']
  readonly executors: DesignSystemArtifact['executors']
  readonly gates: DesignSystemArtifact['gates']
  readonly outputs: DesignSystemArtifact['outputs']
  readonly reason: 'selected' | 'dependency' | 'changed'
}

export interface DesignSystemBuildPlan {
  readonly version: typeof designSystemKitVersion
  readonly profile: DesignSystemProfile
  readonly fullBuild: boolean
  readonly nodes: readonly DesignSystemBuildNode[]
  readonly order: readonly string[]
}

export interface DesignSystemNodeCoverage {
  readonly artifactId: string
  readonly status: 'ready' | 'capability-required'
  readonly producedOutputs: readonly string[]
  readonly missingOutputs: readonly string[]
  readonly requiredExecutors: DesignSystemArtifact['executors']
}

export interface DesignSystemPlanCoverage {
  readonly complete: boolean
  readonly nodes: readonly DesignSystemNodeCoverage[]
  readonly missingOutputs: readonly string[]
}

/**
 * Reconcile a plan against actual compiler/runtime receipts. A planned node is
 * never treated as delivered merely because it exists in the catalog.
 */
export function evaluateDesignSystemPlanOutputs(
  plan: DesignSystemBuildPlan,
  generatedPaths: readonly string[],
): DesignSystemPlanCoverage {
  const paths = new Set(generatedPaths)
  const nodes = plan.nodes.map((node): DesignSystemNodeCoverage => {
    const producedOutputs = node.outputs.filter((output) => hasOutput(paths, output))
    const missingOutputs = node.outputs.filter((output) => !hasOutput(paths, output))
    return {
      artifactId: node.artifactId,
      status: missingOutputs.length === 0 ? 'ready' : 'capability-required',
      producedOutputs,
      missingOutputs,
      requiredExecutors: node.executors,
    }
  })
  return {
    complete: nodes.every((node) => node.status === 'ready'),
    nodes,
    missingOutputs: nodes.flatMap((node) => node.missingOutputs),
  }
}

function hasOutput(paths: ReadonlySet<string>, output: string): boolean {
  if (paths.has(output)) return true
  const prefix = output.endsWith('/') ? output : `${output}/`
  for (const path of paths) if (path.startsWith(prefix)) return true
  return false
}

/** Build a deterministic, acyclic full or incremental material-production DAG. */
export function planDesignSystemKit(input: {
  readonly profile: DesignSystemProfile
  readonly changedKeys?: readonly string[]
}): DesignSystemBuildPlan {
  designSystemProfileSchema.parse(input.profile)
  validateDesignSystemCatalog(designSystemArtifacts)
  const byId = new Map(designSystemArtifacts.map((artifact) => [artifact.id, artifact]))
  const selected = new Set(profileRoots[input.profile])
  for (const id of [...selected]) includeDependencies(id, selected, byId)

  const changedKeys = [...new Set(input.changedKeys ?? [])].sort()
  const fullBuild = changedKeys.length === 0
  const affected = fullBuild ? selected : affectedArtifacts(changedKeys, selected, byId)
  const order = topologicalOrder(affected, byId)
  const directlyChanged = new Set(designSystemArtifacts
    .filter((artifact) => artifact.rebuildKeys.some((key) => changedKeys.some((changed) => keysOverlap(key, changed))))
    .map((artifact) => artifact.id))

  return {
    version: designSystemKitVersion,
    profile: input.profile,
    fullBuild,
    order,
    nodes: order.map((id) => {
      const artifact = byId.get(id) as DesignSystemArtifact
      return {
        id: `build:${id}`,
        artifactId: id,
        dependsOn: artifact.dependsOn.filter((dependency) => affected.has(dependency)).map((dependency) => `build:${dependency}`),
        modes: artifact.modes,
        executors: artifact.executors,
        gates: artifact.gates,
        outputs: artifact.outputs,
        reason: directlyChanged.has(id) ? 'changed' : selected.has(id) ? 'selected' : 'dependency',
      }
    }),
  }
}

export function validateDesignSystemCatalog(catalog: readonly DesignSystemArtifact[]): void {
  const parsed = z.array(designSystemArtifactSchema).min(1).parse(catalog)
  const byId = new Map<string, DesignSystemArtifact>()
  const outputs = new Map<string, string>()
  for (const artifact of parsed) {
    if (byId.has(artifact.id)) throw new Error(`Duplicate Design System artifact: ${artifact.id}`)
    byId.set(artifact.id, artifact)
    for (const output of artifact.outputs) {
      const owner = outputs.get(output)
      if (owner) throw new Error(`Design System output "${output}" is owned by both ${owner} and ${artifact.id}.`)
      outputs.set(output, artifact.id)
    }
  }
  for (const artifact of parsed) {
    for (const dependency of artifact.dependsOn) {
      if (!byId.has(dependency)) throw new Error(`${artifact.id} depends on unknown artifact ${dependency}.`)
      if (dependency === artifact.id) throw new Error(`${artifact.id} cannot depend on itself.`)
    }
  }
  topologicalOrder(new Set(byId.keys()), byId)
}

function includeDependencies(id: string, selected: Set<string>, byId: ReadonlyMap<string, DesignSystemArtifact>): void {
  for (const dependency of byId.get(id)?.dependsOn ?? []) {
    if (selected.has(dependency)) continue
    selected.add(dependency)
    includeDependencies(dependency, selected, byId)
  }
}

function affectedArtifacts(
  changedKeys: readonly string[],
  selected: ReadonlySet<string>,
  byId: ReadonlyMap<string, DesignSystemArtifact>,
): Set<string> {
  const affected = new Set<string>()
  for (const id of selected) {
    const artifact = byId.get(id) as DesignSystemArtifact
    if (artifact.rebuildKeys.some((key) => changedKeys.some((changed) => keysOverlap(key, changed)))) affected.add(id)
  }
  let grew = true
  while (grew) {
    grew = false
    for (const id of selected) {
      if (affected.has(id)) continue
      if ((byId.get(id)?.dependsOn ?? []).some((dependency) => affected.has(dependency))) {
        affected.add(id)
        grew = true
      }
    }
  }
  return affected
}

function keysOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`)
}

function topologicalOrder(ids: ReadonlySet<string>, byId: ReadonlyMap<string, DesignSystemArtifact>): string[] {
  const state = new Map<string, 'visiting' | 'visited'>()
  const order: string[] = []
  const visit = (id: string): void => {
    if (!ids.has(id)) return
    if (state.get(id) === 'visiting') throw new Error(`Design System artifact dependency cycle detected at ${id}.`)
    if (state.get(id) === 'visited') return
    state.set(id, 'visiting')
    const artifact = byId.get(id)
    if (!artifact) throw new Error(`Unknown Design System artifact ${id}.`)
    for (const dependency of [...artifact.dependsOn].sort()) visit(dependency)
    state.set(id, 'visited')
    order.push(id)
  }
  for (const id of [...ids].sort()) visit(id)
  return order
}
