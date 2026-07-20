import type { Box } from '@/algorithm/types'
import type {
  BoardLayoutManifest,
  ProductionArtifactRef,
  ProductionIssue,
} from '../contracts'
import { integrityIssue } from '../quality-policy'

export interface BoardCandidate {
  readonly box: Box
  readonly artifact: ProductionArtifactRef
}

export interface BoardGroupResult {
  readonly width: number
  readonly height: number
  readonly candidates: readonly BoardCandidate[]
  readonly reviewIssues: readonly ProductionIssue[]
  readonly verificationIssues?: readonly ProductionIssue[]
}

export interface BoardCandidateAssignment {
  readonly byTaskId: ReadonlyMap<string, BoardCandidate>
  readonly issues: readonly ProductionIssue[]
}

export function assignBoardCandidates(
  layout: BoardLayoutManifest,
  result: Pick<BoardGroupResult, 'width' | 'height' | 'candidates'>,
  at = Date.now(),
): BoardCandidateAssignment {
  const byTaskId = new Map<string, BoardCandidate>()
  const issues: ProductionIssue[] = []
  const unassigned = new Set(result.candidates)

  for (const slot of layout.slots) {
    const slotBounds = {
      x: slot.normalizedBounds.x * result.width,
      y: slot.normalizedBounds.y * result.height,
      width: slot.normalizedBounds.width * result.width,
      height: slot.normalizedBounds.height * result.height,
    }
    const matches = result.candidates.filter((candidate) => containedBy(candidate.box, slotBounds))
    if (matches.length === 0) {
      issues.push(integrityIssue('board-slot-empty', `Board slot for ${slot.taskId} has no contained asset.`, at))
      continue
    }
    if (matches.length > 1) {
      issues.push(integrityIssue('board-slot-ambiguous', `Board slot for ${slot.taskId} contains ${matches.length} assets.`, at))
      continue
    }
    const candidate = matches[0]!
    byTaskId.set(slot.taskId, candidate)
    unassigned.delete(candidate)
  }

  for (const candidate of unassigned) {
    const crossesSlot = layout.slots.some((slot) => intersects(candidate.box, {
      x: slot.normalizedBounds.x * result.width,
      y: slot.normalizedBounds.y * result.height,
      width: slot.normalizedBounds.width * result.width,
      height: slot.normalizedBounds.height * result.height,
    }))
    issues.push(integrityIssue(
      crossesSlot ? 'board-candidate-crosses-slot' : 'board-candidate-unassigned',
      crossesSlot
        ? 'A board candidate crosses or exceeds its declared slot.'
        : 'A board candidate is outside every declared slot.',
      at,
    ))
  }

  return { byTaskId, issues }
}

function containedBy(box: Box, container: Box): boolean {
  return box.x >= container.x
    && box.y >= container.y
    && box.x + box.width <= container.x + container.width
    && box.y + box.height <= container.y + container.height
}

function intersects(left: Box, right: Box): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y
}
