import type { PrototypeAssetManifest } from '@/prototype/asset-manifest'
import type { PrototypePage } from '@/prototype/prototype-plan'
import {
  type AssetProductionPlan,
  type AssetProductionTask,
} from '../contracts'
import { sha256Bytes } from '../hash'
import { compileAssetProductionPlan } from '../planner'

export {
  beginAssetProduction as beginPrototypeProduction,
  cancelAssetProduction as cancelPrototypeProduction,
  carryAssetProductionTask as carryPrototypeTaskPublication,
  failAssetProductionTask as failPrototypeTask,
  finalizeAssetProduction as finalizePrototypeProduction,
  publishAssetProductionTask as publishPrototypeTaskArtifact,
} from '../coordinator'

export interface PrototypePageSource {
  readonly page: PrototypePage
  readonly artifactId: string
  readonly bytes: Uint8Array
}

export async function compilePrototypeProductionPlan(input: {
  readonly projectRevisionId: string
  readonly designSystemArtifactId?: string
  readonly manifest: PrototypeAssetManifest
  readonly pages: readonly PrototypePageSource[]
  readonly createdAt?: number
}): Promise<AssetProductionPlan> {
  const pages = await Promise.all(input.pages.map(async (source) => ({
    pageId: source.page.id,
    artifactId: source.artifactId,
    sha256: await sha256Bytes(source.bytes),
  })))
  return compileAssetProductionPlan({
    sourceRevision: {
      projectRevisionId: input.projectRevisionId,
      designSystemArtifactId: input.designSystemArtifactId,
      pageArtifacts: pages,
    },
    items: input.manifest.assets.map((asset) => ({
      manifestItemId: asset.id,
      pageId: asset.pageId,
      regionId: asset.regionId,
      route: asset.assetRoute,
      transparent: asset.assetOutput === 'transparent-subject',
      boardGroupKey: asset.assetRoute === 'board-cutout'
        ? `${asset.pageId}:${asset.regionId}`
        : undefined,
      label: asset.recommendedName,
      description: asset.description,
    })),
    createdAt: input.createdAt,
  })
}

export function prototypeDirectAssetPrompt(input: {
  readonly task: AssetProductionTask
  readonly page: PrototypePage
  readonly styleSummary: string
  readonly assetDirection: string
}): string {
  const outputContract = input.task.output.transparent
    ? [
        'Generate exactly one standalone visual asset as a transparent-background PNG.',
        '- Transparent background with the full subject inside the canvas and clear margin on every side.',
        '- The outermost pixels on all four sides must remain fully transparent.',
      ]
    : [
        'Generate exactly one complete full-bleed rectangular visual as a PNG.',
        '- Fill the rectangular canvas edge to edge with the complete uncropped scene or artwork.',
        '- No transparent corners, rounded mask, card radius, border, frame, or container shadow.',
      ]
  return [
    outputContract[0],
    `Asset: ${input.task.label ?? input.task.manifestItemId}`,
    `Description: ${input.task.description ?? input.task.label ?? input.task.manifestItemId}`,
    `Source page: ${input.page.name} (${input.page.purpose})`,
    `Visual style: ${input.styleSummary}`,
    `Asset direction: ${input.assetDirection}`,
    '',
    'Hard constraints:',
    '- One semantic asset only; do not create a collage, contact sheet, grid, asset board, screenshot, panel, card, frame, or adjacent variants.',
    '- Preserve the visual language of the supplied page and design-system references without copying UI chrome.',
    outputContract[1],
    outputContract[2],
    '- No caption, label, isolated text, watermark, measurement, selection outline, or design-tool chrome.',
  ].join('\n')
}

export function prototypeDirectAssetChecklist(task: AssetProductionTask): readonly string[] {
  const outputRule = task.output.transparent
    ? '2. The background is transparent, the complete subject has clear margin, and no foreground touches any canvas edge.'
    : '2. The complete uncropped rectangular media fills the canvas edge to edge with no transparent corners, rounded mask, card radius, border, or container shadow.'
  return [
    `1. The image contains exactly one complete standalone asset matching "${task.description ?? task.label ?? task.manifestItemId}".`,
    outputRule,
    '3. The result is not a collage, contact sheet, grid, asset board, screenshot, card, panel, frame, or set of neighboring variants.',
    '4. There is no caption, label, watermark, design-tool chrome, or unrelated text.',
  ]
}
