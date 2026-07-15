export type VariantDecision = 'undecided' | 'favorite' | 'rejected'
export interface CreativeVariantDecision {
  readonly materialId: string
  readonly version: string
  readonly decision: VariantDecision
  readonly referenceGroup: string
  readonly referenceLocked: boolean
  readonly updatedAt: number
}
export interface CreativeBranchRequest {
  readonly id: string
  readonly baseMaterialId: string
  readonly baseVersion: string
  readonly status: 'requested' | 'running' | 'completed' | 'failed'
  readonly instruction: 'more-like-this'
  readonly createdAt: number
  readonly resultMaterialId?: string
  readonly error?: string
}
export interface CreativeBoardState {
  readonly version: 'creative-board.v1'
  readonly decisions: readonly CreativeVariantDecision[]
  readonly branches: readonly CreativeBranchRequest[]
}
export const emptyCreativeBoard = (): CreativeBoardState => ({ version: 'creative-board.v1', decisions: [], branches: [] })
export function decideVariant(state: CreativeBoardState, input: Omit<CreativeVariantDecision, 'updatedAt'>, now = Date.now()): CreativeBoardState {
  return { ...state, decisions: [...state.decisions.filter((item) => item.materialId !== input.materialId), { ...input, updatedAt: now }] }
}
export function requestMoreLikeThis(state: CreativeBoardState, input: { materialId: string; version: string }, now = Date.now()): CreativeBoardState {
  const id = `branch:${input.materialId}:${input.version}:${now}`
  if (state.branches.some((branch) => branch.id === id)) return state
  return { ...state, branches: [...state.branches, { id, baseMaterialId: input.materialId, baseVersion: input.version, status: 'requested', instruction: 'more-like-this', createdAt: now }] }
}
export function updateCreativeBranch(state: CreativeBoardState, id: string, update: Pick<CreativeBranchRequest, 'status' | 'resultMaterialId' | 'error'>): CreativeBoardState {
  if (!state.branches.some((branch) => branch.id === id)) throw new Error(`Creative branch was not found: ${id}`)
  return { ...state, branches: state.branches.map((branch) => branch.id === id ? { ...branch, ...update } : branch) }
}
export function decisionFor(state: CreativeBoardState, materialId: string): CreativeVariantDecision | undefined { return state.decisions.find((item) => item.materialId === materialId) }
