import type { SliceInput } from '@/store/types'
import type {
  BoardCandidate,
  BoardCandidateMergeRequest,
} from './board'

interface DecodedSlice {
  readonly width: number
  readonly height: number
  close(): void
}

interface CompositeSurface {
  draw(image: DecodedSlice, x: number, y: number): void
  encode(): Promise<Blob>
}

export interface BoardCandidateMergeRenderDeps {
  decode(blob: Blob): Promise<DecodedSlice>
  createSurface(width: number, height: number): CompositeSurface
}

export interface BoardCandidateSliceSource {
  readonly candidate: BoardCandidate
  readonly slice: SliceInput
}

/** Render a single logical material from all disconnected foreground crops. */
export async function renderBoardCandidateMerge(
  request: BoardCandidateMergeRequest,
  sources: readonly BoardCandidateSliceSource[],
  deps: BoardCandidateMergeRenderDeps = browserMergeRenderDeps,
): Promise<SliceInput> {
  if (request.placements.length < 2) {
    throw new Error('Board merge requires multiple foreground candidates.')
  }
  const sourceByCandidate = new Map(
    sources.map((source) => [source.candidate, source] as const),
  )
  const first = sourceByCandidate.get(request.placements[0]!.candidate)?.slice
  if (!first) throw new Error('Board merge source is unavailable.')

  let surface: CompositeSurface
  try {
    surface = deps.createSurface(request.box.width, request.box.height)
  } catch {
    throw new Error('Board composition failed while creating the merge surface.')
  }
  for (const placement of request.placements) {
    const source = sourceByCandidate.get(placement.candidate)
    if (!source) throw new Error('Board merge source is unavailable.')
    if (
      source.slice.width !== placement.candidate.box.width
      || source.slice.height !== placement.candidate.box.height
    ) {
      throw new Error('Board merge source dimensions do not match its candidate bounds.')
    }
    let image: DecodedSlice
    try {
      image = await deps.decode(source.slice.blob)
    } catch {
      throw new Error('Board decode failed while composing foreground candidates.')
    }
    try {
      if (
        image.width !== placement.candidate.box.width
        || image.height !== placement.candidate.box.height
      ) {
        throw new Error('Board composition failed because decoded crop dimensions changed.')
      }
      try {
        surface.draw(image, placement.offset.x, placement.offset.y)
      } catch {
        throw new Error('Board composition failed while drawing foreground candidates.')
      }
    } finally {
      image.close()
    }
  }

  let blob: Blob
  try {
    blob = await surface.encode()
  } catch {
    throw new Error('Board composition failed while encoding the merged PNG.')
  }
  if (blob.size === 0 || blob.type !== 'image/png') {
    throw new Error('Board composition failed because the merged PNG is invalid.')
  }
  return {
    ...first,
    box: request.box,
    blob,
    width: request.box.width,
    height: request.box.height,
  }
}

const browserMergeRenderDeps: BoardCandidateMergeRenderDeps = {
  decode: (blob) => createImageBitmap(blob),
  createSurface: (width, height) => {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Board merge canvas is unavailable.')
    context.clearRect(0, 0, width, height)
    return {
      draw: (image, x, y) => context.drawImage(image as ImageBitmap, x, y),
      encode: () => canvas.convertToBlob({ type: 'image/png' }),
    }
  },
}
