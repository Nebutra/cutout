import type { PrototypePage, PrototypePlan } from './prototype-plan'
import { parseDesignMarkdown, parseEditableDesignMarkdown } from './design-md'
import { hasExportableTokens } from './design-md-export'
import { createPrototypeAssetManifest } from './asset-manifest'
import type { PrototypeSuiteScope } from './scope'

export {
  DEFAULT_PROTOTYPE_SUITE_SCOPE,
  type PrototypeSuiteScope,
} from './scope'

export function pagesForScope(
  plan: PrototypePlan,
  scope: PrototypeSuiteScope,
): PrototypePage[] {
  if (scope === 'full-plan') return [...plan.pages]

  const firstFlow = plan.flows[0]
  if (!firstFlow) return plan.pages.slice(0, 1)

  const ids = new Set<string>([firstFlow.startPageId])
  for (const step of firstFlow.steps) {
    ids.add(step.fromPageId)
    if (step.toPageId) ids.add(step.toPageId)
  }

  const pages = plan.pages.filter((page) => ids.has(page.id))
  return pages.length > 0 ? pages : plan.pages.slice(0, 1)
}

export function prototypePagePrompt(
  plan: PrototypePlan,
  page: PrototypePage,
  importedDesignMarkdown?: string | null,
): string {
  const routeContract = plan.pages
    .map((candidate) =>
      `- ${candidate.name}: ${candidate.route} — ${candidate.purpose}`,
    )
    .join('\n')
  const flowContract = plan.flows
    .map((flow) => {
      const steps = flow.steps
        .map((step) => `${step.fromPageId}${step.toPageId ? ` -> ${step.toPageId}` : ''}`)
        .join(', ')
      return `- ${flow.name}: starts at ${flow.startPageId}${steps ? `; ${steps}` : ''}`
    })
    .join('\n')
  const regions = page.regions
    .map((region) => {
      const assets =
        region.assetOpportunities.length > 0
          ? ` Asset opportunities: ${region.assetOpportunities.join(', ')}.`
          : ''
      return `- ${region.name} (${region.role}, ${region.complexity}): ${region.summary}. Asset route: ${assetRouteCopy(region.assetRoute)}.${assets} Render this region exactly once.`
    })
    .join('\n')

  const interactions = page.interactions.length
    ? page.interactions
        .map((interaction) => {
          const target =
            interaction.action.type === 'navigate'
              ? `navigate to ${interaction.action.targetPageId}`
              : interaction.action.type === 'open-overlay'
                ? `open overlay ${interaction.action.targetOverlayId}`
                : interaction.action.type === 'change-state'
                  ? `change state to ${interaction.action.targetStateId}`
                  : interaction.action.type === 'external'
                    ? `external: ${interaction.action.destination}`
                    : `none: ${interaction.action.reason}`
          return `- ${interaction.sourceElement}: ${interaction.intent}; ${target}.`
        })
        .join('\n')
    : '- No primary interaction required on this screen.'

  return [
    `Generate exactly ONE high-fidelity prototype screen from this planned multi-page product suite.`,
    ``,
    `Product: ${plan.product.name}`,
    `Audience: ${plan.product.audience}`,
    `Primary goal: ${plan.product.primaryGoal}`,
    `Suite summary: ${plan.product.summary}`,
    ``,
    `Shared design system:`,
    `- Style: ${plan.designSystem.styleSummary}`,
    `- Palette: ${plan.designSystem.palette.join(', ')}`,
    `- Typography: ${plan.designSystem.typography}`,
    `- Spacing: ${plan.designSystem.spacing}`,
    `- Component principles: ${plan.designSystem.componentPrinciples.join('; ')}`,
    `- Asset direction: ${plan.designSystem.assetDirection}`,
    importedDesignMarkdown
      ? `- Imported DESIGN.md must be treated as the higher-priority design contract.`
      : undefined,
    importedDesignMarkdown ? ['', `Imported DESIGN.md:`, importedDesignMarkdown].join('\n') : undefined,
    ``,
    `Current page: ${page.name}`,
    `Route: ${page.route}`,
    `Purpose: ${page.purpose}`,
    `Viewport: ${page.viewport.platform}, ${page.viewport.width}x${page.viewport.height}, ${page.viewport.scroll}`,
    `Suite route contract (all planned screens):`,
    routeContract,
    `Reachable flow contract:`,
    flowContract || '- No explicit flow steps.',
    ``,
    `Regions to compose:`,
    regions,
    ``,
    `Meaningful interactions to imply visually:`,
    interactions,
    ``,
    `Rules: keep the same visual system, navigation shell, component morphology, spacing rhythm, and content conventions as the provided design-system reference and anchor prototype reference. Preserve this page's exact route identity and make every declared navigation destination visually reachable. Render only this page, no adjacent frames, no annotations, no device bezel, no asset sheet. Do not treat every UI module as a board asset: complex art-directed regions should remain visually complete for direct image/reference generation; repeated simple assets may be cleanly separable later; code-reproducible UI containers should stay as ordinary UI.`,
    ``,
    `Text discipline (critical): all visible text must be real, short, on-domain copy rendered crisply and legibly — grounded in the plan above. Hard negatives: no lorem/pseudo-text walls, no garbled or melted glyphs, no duplicated characters, no dense fake paragraphs. If a long body-copy block cannot be rendered crisply at this viewport, prefer a clean placeholder bar over degraded text. Compose exactly the planned regions — no extra invented sections, no duplicated regions.`,
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n')
}

export function prototypeDesignSystemPrompt(
  plan: PrototypePlan,
  importedDesignMarkdown?: string | null,
): string {
  const designMd = prototypeDesignMarkdown(plan, importedDesignMarkdown)
  const referenceStrategy = designSystemReferenceStrategy(plan)
  return [
    `Create ONE polished professional design-system reference image for this prototype suite.`,
    ``,
    `This is not an app screen and not a fixed template. It is a scene-native visual contract that later screens will use as reference conditioning.`,
    ``,
    `Product: ${plan.product.name}`,
    `Audience: ${plan.product.audience}`,
    `Primary goal: ${plan.product.primaryGoal}`,
    `Platform: ${plan.product.platform}`,
    `Suite summary: ${plan.product.summary}`,
    ``,
    `Design system to express visually:`,
    `- Style: ${plan.designSystem.styleSummary}`,
    `- Palette: ${plan.designSystem.palette.join(', ')}`,
    `- Typography: ${plan.designSystem.typography}`,
    `- Spacing: ${plan.designSystem.spacing}`,
    `- Component principles: ${plan.designSystem.componentPrinciples.join('; ')}`,
    `- Asset direction: ${plan.designSystem.assetDirection}`,
    ``,
    `Agent-readable DESIGN.md source of truth to visualize:`,
    designMd,
    ``,
    `Scene-driven reference strategy:`,
    referenceStrategy,
    ``,
    `Rules: choose only the reference sections that are useful for this product, platform, and planned regions. Do not force a web/SaaS control board when the scene calls for a game UI, mobile app, embedded panel, editorial surface, marketplace, kiosk, or another interface type. Make the output cohesive, production-grade, crisp, organized, and directly usable as a senior design team’s internal visual contract. No device bezel, no marketing hero, no scattered asset sheet, no red measurement lines, no Figma chrome. Text discipline: type specimens may only be short single-line samples; no paragraph pseudo-text, no lorem walls, no garbled or melted glyphs anywhere in the reference.`,
  ].join('\n')
}

export function prototypeDesignMarkdownSynthesisSystem(
  plan: PrototypePlan,
  importedDesignMarkdown?: string | null,
): string {
  return [
    'You are a senior design-system documentation engineer.',
    'You will receive the generated visual design-system reference image for a prototype suite.',
    'Your task is to write the DESIGN.md that actually matches the image, not a generic template.',
    '',
    'Output requirements:',
    '- Return only DESIGN.md Markdown. No code fences, no prose wrapper.',
    '- Start with YAML frontmatter between --- fences.',
    '- YAML frontmatter MUST contain a `tokens` object with at least five colors in #RRGGBB form, a spacing scale in px, and a radius scale in px. These are required even when the reference is more illustrative than UI-heavy.',
    '- Keep semantic descriptions such as "warm" or "playful" in the Markdown body, never as a replacement for token values.',
    '- Include observed typography scale, component states, surfaces/elevation, icons/illustration treatment, asset direction, and usage rules.',
    '- The Markdown body should be useful to another AI agent or design tool as portable design context.',
    '- Do not invent a different system than the image. If the image shows a token table, component samples, or example fragments, reflect those specifics.',
    '- Keep product/page planning details only where they affect reusable design rules.',
    '- Do not include asset routing, board/direct/cutout routes, slice indices, filenames, naming rules, execution plans, or pipeline instructions. Those belong in asset manifests and pipeline metadata, not DESIGN.md.',
    '',
    'Prototype context:',
    `Product: ${plan.product.name}`,
    `Platform: ${plan.product.platform}`,
    `Audience: ${plan.product.audience}`,
    `Primary goal: ${plan.product.primaryGoal}`,
    `Planned style summary: ${plan.designSystem.styleSummary}`,
    `Planned asset direction: ${plan.designSystem.assetDirection}`,
    '',
    importedDesignMarkdown
      ? [
          '',
          'Imported DESIGN.md context, if visible image details do not contradict it:',
          importedDesignMarkdown.trim(),
        ].join('\n')
      : '',
  ].join('\n')
}

export function prototypeDesignMarkdown(
  plan: PrototypePlan,
  importedDesignMarkdown?: string | null,
): string {
  const imported = importedDesignMarkdown?.trim()
  const parsedImported = imported ? parseDesignMarkdown(imported) : null
  const importedHasTokens = imported
    ? hasExportableTokens(parseEditableDesignMarkdown(imported))
    : false
  const tokenContract = plannerTokenContract()

  return [
    '---',
    ...(parsedImported?.frontmatter && importedHasTokens
      ? [parsedImported.frontmatter]
      : parsedImported?.frontmatter
        ? [parsedImported.frontmatter, ...tokenContract]
      : [
          'version: alpha',
          'source: planner-design-contract',
          `name: ${yamlString(plan.product.name)}`,
          `description: ${yamlString(plan.product.summary)}`,
          `platform: ${yamlString(plan.product.platform)}`,
          'colors:',
          '  intent:',
          ...yamlList(plan.designSystem.palette, 4),
          'typography:',
          `  intent: ${yamlString(plan.designSystem.typography)}`,
          'spacing:',
          `  intent: ${yamlString(plan.designSystem.spacing)}`,
          'components:',
          '  principles:',
          ...yamlList(plan.designSystem.componentPrinciples, 4),
          `assetDirection: ${yamlString(plan.designSystem.assetDirection)}`,
          ...tokenContract,
        ]),
    '---',
    '',
    parsedImported
      ? [
          '# Imported DESIGN.md',
          '',
          parsedImported.body.trim(),
          '',
          '# Cutout Design Addendum',
        ].join('\n')
      : '# Overview',
    parsedImported
      ? `${plan.product.name} maps the imported DESIGN.md contract onto this prototype suite. ${plan.designSystem.styleSummary}`
      : `${plan.product.name} uses a planner-authored visual contract for ${plan.product.platform}. ${plan.designSystem.styleSummary}`,
    '',
    ...(parsedImported
      ? []
      : [
          'This document is a scene-specific visual contract, not a generic token template. If image-grounded DESIGN.md synthesis succeeds, the generated version should replace this planner draft.',
          '',
          '## Color',
          `Palette intent: ${plan.designSystem.palette.join(', ')}. Preserve the planned scene and domain before introducing any additional colors.`,
          '',
        ]),
    '## Typography',
    `${plan.designSystem.typography} Keep hierarchy consistent between pages and match the professional conventions of the planned platform and domain.`,
    '',
    '## Layout & Spacing',
    `${plan.designSystem.spacing} Use the rhythm that fits the planned viewport, content density, and interaction model.`,
    '',
    '## Elevation & Depth',
    'Use depth only where it is part of the planned visual language. Avoid adding generic SaaS shadows or cards when the scene calls for another interface convention.',
    '',
    '## Shapes',
    'Keep shape language consistent with the planned domain. Define reusable radius, mask, frame, and ornament conventions as visual rules only.',
    '',
    '## Components',
    `Component principles: ${plan.designSystem.componentPrinciples.join('; ')}.`,
    '',
    '## Asset Direction',
    plan.designSystem.assetDirection,
    '',
    "## Do's and Don'ts",
    '- Do reuse the same planned visual language across every reachable prototype page.',
    '- Do keep art direction, illustration treatment, material quality, and icon language consistent across pages.',
    '- Do describe reusable visual rules only: palette, typography, spacing, shape, surfaces, elevation, components, iconography, illustration, and asset art direction.',
    '- Do keep interactions visually reachable from the planned flow.',
    "- Don't include asset routing, cutout strategy, filename rules, slice ordering, or execution metadata in DESIGN.md.",
    "- Don't redesign the brand language between pages.",
    "- Don't add unrelated decorative palettes, fonts, heavy shadows, device frames, or design-tool chrome.",
  ].join('\n')
}

function plannerTokenContract(): readonly string[] {
  return [
    'tokens:',
    '  color:',
    '    background: "#FFF8F2"',
    '    surface: "#FFFFFF"',
    '    text: "#2A211C"',
    '    primary: "#C96A3D"',
    '    accent: "#F2B84B"',
    '    border: "#E7D8CB"',
    '  spacing:',
    '    xs: "4px"',
    '    sm: "8px"',
    '    md: "16px"',
    '    lg: "24px"',
    '  radius:',
    '    sm: "8px"',
    '    md: "12px"',
    '    lg: "20px"',
  ]
}

export function prototypeBoardExtractionBrief(
  plan: PrototypePlan,
  pages: readonly PrototypePage[],
  originalBrief: string,
): string {
  const manifest = createPrototypeAssetManifest(plan, pages)
  const pageIds = new Set(pages.map((page) => page.id))
  const scopedPages = plan.pages.filter((page) => pageIds.has(page.id))
  const boardCandidates = scopedPages.flatMap((page) =>
    page.regions
      .filter((region) => region.assetRoute === 'board-cutout')
      .map((region) => routeLine(page, region)),
  )
  const directCandidates = scopedPages.flatMap((page) =>
    page.regions
      .filter((region) => region.assetRoute === 'direct-generate')
      .map((region) => routeLine(page, region)),
  )
  const ignored = scopedPages.flatMap((page) =>
    page.regions
      .filter((region) => region.assetRoute === 'ignore-code-ui')
      .map((region) => routeLine(page, region)),
  )

  return [
    'Asset extraction route brief for this prototype suite.',
    '',
    'Original product brief:',
    originalBrief.trim(),
    '',
    'Asset manifest JSON:',
    JSON.stringify(manifest, null, 2),
    '',
    'Routing principle:',
    '- Do NOT route the entire UI through the board.',
    '- The board should contain only board-cutout candidates: repeated, rule-based, geometric, well-separated atomic assets.',
    '- Complex visual modules are direct-generate candidates. Do not crop them from rounded cards or force them into a board unless they can be regenerated as one complete standalone asset without UI chrome.',
    '- A rounded or masked UI frame is usually a code/layout constraint, not the asset shape. Extract or regenerate the complete underlying image/material unless the mask itself is the valuable artwork.',
    '- Text is not a board asset: exclude headings, labels, UI copy, brand-name text, isolated letters/characters, and typography samples. If a true logo/wordmark is explicitly needed, keep the complete mark as one asset and never split it into characters.',
    '- Ignore code-reproducible UI containers, while preserving non-code-reproducible materials, textures, covers, illustrations, and photo-like subjects inside them as standalone direct-generate candidates.',
    '- Every regenerated asset must be complete inside its own tile with generous whitespace; do not clip off small attached ornaments, highlights, bows, hearts, steam, shadows, or edge details that belong to that asset.',
    '',
    'Board-cutout candidates to prioritize:',
    boardCandidates.length ? boardCandidates.join('\n') : '- None declared; only include obvious simple atomic visual assets if visible.',
    '',
    'Direct-generate candidates to avoid board-packing:',
    directCandidates.length ? directCandidates.join('\n') : '- None declared.',
    '',
    'Code UI to ignore:',
    ignored.length ? ignored.join('\n') : '- Plain containers, inputs, navigation, skeletons, tables, rows, generic buttons, and layout chrome when they have no special material or artwork value.',
  ].join('\n')
}

function routeLine(
  page: PrototypePage,
  region: PrototypePage['regions'][number],
): string {
  const assets = region.assetOpportunities.length
    ? ` Assets: ${region.assetOpportunities.join(', ')}.`
    : ''
  return `- ${page.name} / ${region.name}: ${region.summary}.${assets}`
}

function yamlString(value: string): string {
  return JSON.stringify(value)
}

function yamlList(values: readonly string[], spaces: number): string[] {
  const indent = ' '.repeat(spaces)
  return values.length
    ? values.map((value) => `${indent}- ${yamlString(value)}`)
    : [`${indent}[]`]
}

function designSystemReferenceStrategy(plan: PrototypePlan): string {
  const platforms = uniqueStrings(plan.pages.map((page) => page.viewport.platform))
  const regionRoles = uniqueStrings(
    plan.pages.flatMap((page) => page.regions.map((region) => region.role)),
  )
  const assetThemes = plan.pages.flatMap((page) =>
    page.regions.flatMap((region) => region.assetOpportunities),
  )
  const interactions = plan.pages.flatMap((page) =>
    page.interactions.map((interaction) => interaction.sourceElement),
  )

  return [
    `- Platform conventions to honor: ${platforms.join(', ') || plan.product.platform}.`,
    `- Page/region roles to harmonize: ${regionRoles.join(', ') || 'the planned regions'}.`,
    `- Visual system evidence: show only the color, type, spacing, shape, density, and motion/state examples that this scene needs.`,
    `- Interaction language to make consistent: ${uniqueStrings(interactions).join(', ') || 'the declared reachable flow interactions'}.`,
    `- Visual asset themes to style consistently: ${uniqueStrings(assetThemes).join(', ') || plan.designSystem.assetDirection}.`,
  ].join('\n')
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const raw of values) {
    const value = raw.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    output.push(value)
  }
  return output
}

function assetRouteCopy(route: PrototypePage['regions'][number]['assetRoute']): string {
  switch (route) {
    case 'direct-generate':
      return 'direct-generate; regenerate valuable complex artwork or material as standalone referenced assets, not via board cutout'
    case 'board-cutout':
      return 'board-cutout; safe for flat board only when assets are repeated, geometric, atomic, and well separated'
    case 'ignore-code-ui':
      return 'ignore-code-ui; rebuild this UI chrome in code and do not extract it as an asset'
  }
}
