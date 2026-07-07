import { describe, expect, it } from 'vitest'
import { parseAiNativeAction } from './actions'

describe('AI Native semantic slice actions', () => {
  it('parses a prototype plan action', () => {
    const action = parseAiNativeAction({
      type: 'plan-prototype',
      brief: '多页面 SaaS 官网',
      model: 'gpt-5.5',
    })

    expect(action).toEqual({
      type: 'plan-prototype',
      brief: '多页面 SaaS 官网',
      model: 'gpt-5.5',
    })
  })

  it('parses DESIGN.md control actions', () => {
    expect(
      parseAiNativeAction({
        type: 'set-design-md',
        name: 'DESIGN.md',
        content: '# System\nUse restrained enterprise UI.',
      }),
    ).toEqual({
      type: 'set-design-md',
      name: 'DESIGN.md',
      content: '# System\nUse restrained enterprise UI.',
    })

    expect(parseAiNativeAction({ type: 'clear-design-md' })).toEqual({
      type: 'clear-design-md',
    })

    expect(
      parseAiNativeAction({
        type: 'import-design-md',
        path: '/tmp/DESIGN.md',
      }),
    ).toEqual({
      type: 'import-design-md',
      path: '/tmp/DESIGN.md',
    })
  })

  it('parses a semantic slice plan action', () => {
    const action = parseAiNativeAction({
      type: 'plan-semantic-slices',
      brief: '政府官网',
      maxSlices: 8,
      reference: 'mockup',
    })

    expect(action).toEqual({
      type: 'plan-semantic-slices',
      brief: '政府官网',
      maxSlices: 8,
      reference: 'mockup',
    })
  })

  it('parses a semantic slice run action with crossed routes', () => {
    const action = parseAiNativeAction({
      type: 'run-semantic-slices',
      brief: '政府官网',
      maxSlices: 6,
      routes: ['text-to-image', 'image-to-image'],
      validate: true,
      artifactPrefix: 'gov',
    })

    expect(action.type).toBe('run-semantic-slices')
    if (action.type !== 'run-semantic-slices') return
    expect(action.routes).toEqual(['text-to-image', 'image-to-image'])
    expect(action.validate).toBe(true)
    expect(action.artifactPrefix).toBe('gov')
  })

  it('rejects unsupported semantic slice routes', () => {
    expect(() =>
      parseAiNativeAction({
        type: 'run-semantic-slices',
        routes: ['board-collage'],
      }),
    ).toThrow()
  })
})
