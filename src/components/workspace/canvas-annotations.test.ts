import { describe, expect, it } from 'vitest'
import {
  createNoteAnnotation,
  createShapeAnnotation,
  createStrokeAnnotation,
  createTextAnnotation,
  withCanvasAnnotations,
} from './canvas-annotations'

describe('withCanvasAnnotations', () => {
  it('appends note and text content, ignoring shapes and blank text', () => {
    const result = withCanvasAnnotations('Design a poster', [
      { kind: 'note', id: 'a', x: 0, y: 0, text: ' logo bigger ' },
      { kind: 'text', id: 'b', x: 0, y: 0, text: 'keep lime palette' },
      { kind: 'text', id: 'c', x: 0, y: 0, text: '  ' },
      { kind: 'shape', id: 'd', shape: 'rect', x: 0, y: 0, width: 10, height: 10 },
    ])
    expect(result).toContain('- logo bigger')
    expect(result).toContain('- keep lime palette')
    expect(result.match(/^- /gm)).toHaveLength(2)
  })

  it('returns brief untouched with no textual annotations', () => {
    expect(withCanvasAnnotations('x', [])).toBe('x')
  })
})

describe('shape and stroke geometry', () => {
  it('normalizes shape bounds regardless of drag direction', () => {
    const shape = createShapeAnnotation('rect', { x: 100, y: 100 }, { x: 40, y: 60 })
    expect(shape).toMatchObject({ x: 40, y: 60, width: 60, height: 40 })
  })

  it('normalizes stroke points to the bounding-box origin', () => {
    const stroke = createStrokeAnnotation('arrow', [
      { x: 50, y: 80 },
      { x: 10, y: 20 },
    ])
    expect(stroke).toMatchObject({ x: 10, y: 20, width: 40, height: 60 })
    expect(stroke?.points).toEqual([[40, 60], [0, 0]])
  })

  it('rejects strokes with fewer than two points', () => {
    expect(createStrokeAnnotation('ink', [{ x: 1, y: 1 }])).toBeNull()
  })

  it('creates empty note/text annotations at the given position', () => {
    expect(createNoteAnnotation({ x: 1, y: 2 })).toMatchObject({ kind: 'note', x: 1, y: 2, text: '' })
    expect(createTextAnnotation({ x: 3, y: 4 })).toMatchObject({ kind: 'text', x: 3, y: 4, text: '' })
  })
})
