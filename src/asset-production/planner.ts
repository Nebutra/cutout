import {
  assetProductionPlanSchema,
  type AssetProductionPlan,
  type AssetProductionRoute,
  type SourceRevision,
} from './contracts'
import { sha256Json } from './hash'

export interface AssetProductionPlanItem {
  readonly manifestItemId: string
  readonly pageId: string
  readonly regionId: string
  readonly route: Exclude<AssetProductionRoute, 'semantic-repair'> | 'ignore-code-ui'
  readonly required?: boolean
  readonly transparent?: boolean
  readonly boardGroupKey?: string
  readonly label?: string
  readonly description?: string
}

export interface CompileAssetProductionPlanInput {
  readonly sourceRevision: SourceRevision
  readonly items: readonly AssetProductionPlanItem[]
  readonly createdAt?: number
}

export async function compileAssetProductionPlan(
  input: CompileAssetProductionPlanInput,
): Promise<AssetProductionPlan> {
  assertCurrentRoutes(input.items)
  assertUniqueManifestItems(input.items)
  const normalized = input.items
    .map((item) => ({
      manifestItemId: item.manifestItemId,
      pageId: item.pageId,
      regionId: item.regionId,
      route: item.route,
      required: item.required ?? true,
      transparent: item.transparent ?? true,
      boardGroupKey: item.route === 'board-cutout'
        ? item.boardGroupKey ?? `${item.pageId}:${item.regionId}`
        : undefined,
      label: item.label,
      description: item.description,
    }))
    .sort((left, right) => left.manifestItemId.localeCompare(right.manifestItemId))
  const planHash = await sha256Json({ sourceRevision: input.sourceRevision, items: normalized })
  const planId = `asset-production:${planHash.slice(0, 24)}`
  const executable = normalized.filter((item) => item.route !== 'ignore-code-ui')
  const taskEntries = await Promise.all(executable.map(async (item) => {
    const taskHash = await sha256Json({ planHash, manifestItemId: item.manifestItemId })
    const boardGroupId = item.boardGroupKey
      ? `asset-board:${(await sha256Json({ planHash, group: item.boardGroupKey })).slice(0, 24)}`
      : undefined
    return {
      item,
      task: {
        taskId: `asset-task:${taskHash.slice(0, 32)}`,
        manifestItemId: item.manifestItemId,
        pageId: item.pageId,
        regionId: item.regionId,
        route: item.route as AssetProductionRoute,
        required: item.required,
        output: {
          mediaType: 'image/png' as const,
          subjectCount: 1 as const,
          transparent: item.transparent,
        },
        boardGroupId,
        label: item.label,
        description: item.description,
      },
    }
  }))
  const groups = new Map<string, typeof taskEntries>()
  for (const entry of taskEntries) {
    if (!entry.task.boardGroupId) continue
    groups.set(entry.task.boardGroupId, [...(groups.get(entry.task.boardGroupId) ?? []), entry])
  }
  const boardLayouts = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([boardGroupId, entries]) => {
      const ordered = [...entries].sort((left, right) =>
        compareStableIds(left.task.manifestItemId, right.task.manifestItemId))
      const columns = Math.max(1, Math.ceil(Math.sqrt(ordered.length)))
      const rows = Math.ceil(ordered.length / columns)
      return {
        version: 'asset-board-layout.v1' as const,
        boardGroupId,
        taskIds: ordered.map(({ task }) => task.taskId),
        slots: ordered.map(({ task }, index) => ({
          taskId: task.taskId,
          normalizedBounds: {
            x: (index % columns) / columns,
            y: Math.floor(index / columns) / rows,
            width: 1 / columns,
            height: 1 / rows,
          },
        })),
      }
    })

  return assetProductionPlanSchema.parse({
    version: 'asset-production-plan.v1',
    planId,
    planHash,
    sourceRevision: input.sourceRevision,
    tasks: taskEntries.map(({ task }) => task),
    boardLayouts,
    ignoredManifestItemIds: normalized
      .filter((item) => item.route === 'ignore-code-ui')
      .map((item) => item.manifestItemId),
    createdAt: input.createdAt ?? Date.now(),
  })
}

function assertCurrentRoutes(items: readonly AssetProductionPlanItem[]): void {
  for (const item of items) {
    const route: unknown = item.route
    if (route === 'semantic-repair') {
      throw new Error('semantic-repair is decode-only and cannot be emitted by new asset production plans')
    }
  }
}

function assertUniqueManifestItems(items: readonly AssetProductionPlanItem[]): void {
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.manifestItemId)) {
      throw new Error(`Duplicate asset manifest item: ${item.manifestItemId}`)
    }
    seen.add(item.manifestItemId)
  }
}

function compareStableIds(left: string, right: string): number {
  const leftParts = left.match(/\d+|\D+/g) ?? [left]
  const rightParts = right.match(/\d+|\D+/g) ?? [right]
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index]
    const rightPart = rightParts[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    if (leftPart === rightPart) continue
    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : null
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : null
    if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber
    return leftPart < rightPart ? -1 : 1
  }
  return 0
}
