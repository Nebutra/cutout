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
  return [
    'Generate exactly one standalone visual asset as a transparent-background PNG.',
    `Asset: ${input.task.label ?? input.task.manifestItemId}`,
    `Description: ${input.task.description ?? input.task.label ?? input.task.manifestItemId}`,
    `Source page: ${input.page.name} (${input.page.purpose})`,
    `Visual style: ${input.styleSummary}`,
    `Asset direction: ${input.assetDirection}`,
    '',
    'Hard constraints:',
    '- One complete subject only; do not create an asset board, screenshot, panel, card, frame, or adjacent variants.',
    '- Preserve the visual language of the supplied page and design-system references without copying UI chrome.',
    '- Transparent background with the full subject inside the canvas and clear margin on every side.',
    '- No caption, label, isolated text, watermark, measurement, selection outline, or design-tool chrome.',
  ].join('\n')
}

export function prototypeDirectAssetChecklist(task: AssetProductionTask): readonly string[] {
  return [
    `1. The image contains exactly one complete standalone asset matching "${task.description ?? task.label ?? task.manifestItemId}".`,
    '2. The background is transparent and there is no board, card, panel, frame, screenshot, or neighboring variant.',
    '3. The asset is fully inside the canvas with clear margin and no clipped edges.',
    '4. There is no caption, label, watermark, design-tool chrome, or unrelated text.',
  ]
}
