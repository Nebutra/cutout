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

export interface BoardCandidateMergePlacement {
  readonly candidate: BoardCandidate
  readonly offset: Pick<Box, 'x' | 'y'>
}

export interface BoardCandidateMergeRequest {
  readonly kind: 'merge'
  readonly box: Box
  readonly placements: readonly BoardCandidateMergePlacement[]
}

export type BoardCandidateAssignmentInput = BoardCandidate | BoardCandidateMergeRequest

export interface BoardGroupResult {
  readonly width: number
  readonly height: number
  readonly candidates: readonly BoardCandidate[]
  readonly reviewIssues: readonly ProductionIssue[]
  readonly verificationIssues?: readonly ProductionIssue[]
}

export interface BoardCandidateAssignment {
  readonly byTaskId: ReadonlyMap<string, BoardCandidateAssignmentInput>
  readonly issues: readonly ProductionIssue[]
}

export function assignBoardCandidates(
  layout: BoardLayoutManifest,
  result: Pick<BoardGroupResult, 'width' | 'height' | 'candidates'>,
  at = Date.now(),
): BoardCandidateAssignment {
  const byTaskId = new Map<string, BoardCandidateAssignmentInput>()
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
      if (layout.slots.length === 1 && matches.length === result.candidates.length) {
        byTaskId.set(slot.taskId, createBoardCandidateMergeRequest(matches))
        for (const candidate of matches) unassigned.delete(candidate)
        continue
      }
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

export function isBoardCandidateMergeRequest(
  input: BoardCandidateAssignmentInput,
): input is BoardCandidateMergeRequest {
  return 'kind' in input && input.kind === 'merge'
}

function createBoardCandidateMergeRequest(
  candidates: readonly BoardCandidate[],
): BoardCandidateMergeRequest {
  const left = Math.min(...candidates.map((candidate) => candidate.box.x))
  const top = Math.min(...candidates.map((candidate) => candidate.box.y))
  const right = Math.max(...candidates.map((candidate) => candidate.box.x + candidate.box.width))
  const bottom = Math.max(...candidates.map((candidate) => candidate.box.y + candidate.box.height))
  const box = { x: left, y: top, width: right - left, height: bottom - top }
  return {
    kind: 'merge',
    box,
    placements: candidates.map((candidate) => ({
      candidate,
      offset: {
        x: candidate.box.x - box.x,
        y: candidate.box.y - box.y,
      },
    })),
  }
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
