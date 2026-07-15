/**
 * Canvas annotations — user marks layered over the output canvas: sticky
 * notes, text labels, outlined shapes, and freehand/line/arrow strokes.
 *
 * They exist for the Agent, not for pixel output: textual annotations are
 * appended to every run brief as constraints, and spatial marks let the user
 * point at regions while talking to the Agent.
 */
export type StrokeVariant = 'ink' | 'line' | 'arrow'
export type ShapeVariant = 'rect' | 'ellipse'

export interface CanvasNoteAnnotation {
  readonly kind: 'note'
  readonly id: string
  readonly x: number
  readonly y: number
  readonly text: string
}

export interface CanvasTextAnnotation {
  readonly kind: 'text'
  readonly id: string
  readonly x: number
  readonly y: number
  readonly text: string
}

export interface CanvasShapeAnnotation {
  readonly kind: 'shape'
  readonly id: string
  readonly shape: ShapeVariant
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface CanvasStrokeAnnotation {
  readonly kind: 'stroke'
  readonly id: string
  readonly variant: StrokeVariant
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** Points relative to (x, y). Line/arrow have exactly two. */
  readonly points: readonly (readonly [number, number])[]
}

export type CanvasAnnotation =
  | CanvasNoteAnnotation
  | CanvasTextAnnotation
  | CanvasShapeAnnotation
  | CanvasStrokeAnnotation

export interface FlowPoint {
  readonly x: number
  readonly y: number
}

function annotationId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function createNoteAnnotation(position: FlowPoint): CanvasNoteAnnotation {
  return { kind: 'note', id: annotationId('note'), x: position.x, y: position.y, text: '' }
}

export function createTextAnnotation(position: FlowPoint): CanvasTextAnnotation {
  return { kind: 'text', id: annotationId('text'), x: position.x, y: position.y, text: '' }
}

export function createShapeAnnotation(
  shape: ShapeVariant,
  a: FlowPoint,
  b: FlowPoint,
): CanvasShapeAnnotation {
  return {
    kind: 'shape',
    id: annotationId('shape'),
    shape,
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.max(8, Math.abs(a.x - b.x)),
    height: Math.max(8, Math.abs(a.y - b.y)),
  }
}

export function createStrokeAnnotation(
  variant: StrokeVariant,
  points: readonly FlowPoint[],
): CanvasStrokeAnnotation | null {
  if (points.length < 2) return null
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return {
    kind: 'stroke',
    id: annotationId('stroke'),
    variant,
    x: minX,
    y: minY,
    width: Math.max(1, Math.max(...xs) - minX),
    height: Math.max(1, Math.max(...ys) - minY),
    points: points.map((point) => [point.x - minX, point.y - minY] as const),
  }
}

/** Textual annotations become explicit constraints for every Agent run. */
export function withCanvasAnnotations(
  brief: string,
  annotations: readonly CanvasAnnotation[],
): string {
  const remarks = annotations
    .filter(
      (annotation): annotation is CanvasNoteAnnotation | CanvasTextAnnotation =>
        annotation.kind === 'note' || annotation.kind === 'text',
    )
    .map((annotation) => annotation.text.trim())
    .filter((text) => text.length > 0)
  if (!remarks.length) return brief
  return [
    brief,
    '',
    'Canvas notes from the user (treat as constraints and context):',
    ...remarks.map((text) => `- ${text}`),
  ].join('\n')
}
