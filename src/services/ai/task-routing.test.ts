import { describe, expect, it } from 'vitest'
import { resolveTaskAssignment, resolveTaskRoute, taskFallbackChain } from './task-routing'
import type { CapabilityBindings } from './model-capabilities'

const route = (providerId: string, model: string) => ({ providerId, model })

const bindings = (
  map: CapabilityBindings['bindings'],
): CapabilityBindings['bindings'] => map

describe('resolveTaskRoute', () => {
  it('prefers a task’s own binding over anything it could inherit', () => {
    const table = bindings({
      text: route('p', 'chat'),
      webdev: route('p', 'coder'),
    })
    expect(resolveTaskRoute(table, 'webdev')).toEqual({
      assignment: route('p', 'coder'),
    })
  })

  it('honours a distinct webdev binding — the bug this module exists to fix', () => {
    // The old two-slot projection collapsed `webdev` into `chat = text ?? …`,
    // so a webdev binding was dead code whenever `text` was set.
    const table = bindings({
      text: route('p', 'chat'),
      webdev: route('other', 'coder'),
    })
    expect(resolveTaskAssignment(table, 'webdev')).toEqual(route('other', 'coder'))
    expect(resolveTaskAssignment(table, 'text')).toEqual(route('p', 'chat'))
  })

  it('honours a distinct image-edit binding alongside image-generation', () => {
    const table = bindings({
      'image-generation': route('p', 'gen'),
      'image-edit': route('q', 'edit'),
    })
    expect(resolveTaskAssignment(table, 'image-generation')).toEqual(route('p', 'gen'))
    expect(resolveTaskAssignment(table, 'image-edit')).toEqual(route('q', 'edit'))
  })

  it('inherits along the documented chain and reports the source', () => {
    const table = bindings({ text: route('p', 'chat') })
    expect(resolveTaskRoute(table, 'vision')).toEqual({
      assignment: route('p', 'chat'),
      inheritedFrom: 'text',
    })
    expect(resolveTaskRoute(table, 'webdev')?.inheritedFrom).toBe('text')
    expect(resolveTaskRoute(table, 'image-to-webdev')?.inheritedFrom).toBe('text')
  })

  it('walks image-to-webdev in order: vision, then webdev, then text', () => {
    expect(resolveTaskRoute(bindings({
      text: route('p', 'chat'),
      webdev: route('p', 'coder'),
      vision: route('p', 'seer'),
    }), 'image-to-webdev')).toEqual({
      assignment: route('p', 'seer'),
      inheritedFrom: 'vision',
    })
    expect(resolveTaskRoute(bindings({
      text: route('p', 'chat'),
      webdev: route('p', 'coder'),
    }), 'image-to-webdev')?.inheritedFrom).toBe('webdev')
  })

  it('inherits image-edit from image-generation but never the reverse', () => {
    const generationOnly = bindings({ 'image-generation': route('p', 'gen') })
    expect(resolveTaskRoute(generationOnly, 'image-edit')).toEqual({
      assignment: route('p', 'gen'),
      inheritedFrom: 'image-generation',
    })
    const editOnly = bindings({ 'image-edit': route('p', 'edit') })
    expect(resolveTaskAssignment(editOnly, 'image-generation')).toBeUndefined()
  })

  it('keeps root tasks unrouted rather than borrowing an unrelated model', () => {
    const imagesOnly = bindings({ 'image-generation': route('p', 'gen') })
    expect(resolveTaskAssignment(imagesOnly, 'text')).toBeUndefined()
    expect(resolveTaskAssignment(imagesOnly, 'vision')).toBeUndefined()
    expect(taskFallbackChain('text')).toEqual([])
    expect(taskFallbackChain('image-generation')).toEqual([])
  })

  it('resolves nothing from an absent or empty table', () => {
    expect(resolveTaskAssignment(undefined, 'text')).toBeUndefined()
    expect(resolveTaskAssignment({}, 'image-edit')).toBeUndefined()
  })

  it('leaves speech and video tasks without inheritance', () => {
    const table = bindings({ text: route('p', 'chat') })
    for (const task of ['asr', 'tts', 'video-generation', 'video-edit'] as const) {
      expect(resolveTaskAssignment(table, task)).toBeUndefined()
    }
  })
})
