import { describe, expect, it } from 'vitest'
import { MODEL_DIMENSIONS, requiresVerifiedVision } from './model-dimensions'

describe('intelligent model settings dimensions', () => {
  it('offers every outcome-oriented routing dimension without model-name authority', () => {
    expect(MODEL_DIMENSIONS.map((item) => item.task)).toEqual([
      'text', 'vision', 'webdev', 'image-to-webdev', 'image-generation', 'image-edit',
    ])
    expect(JSON.stringify(MODEL_DIMENSIONS)).not.toMatch(/gpt|claude|gemini/i)
  })

  it('hard-requires verified vision for visual understanding and image-to-web development', () => {
    expect(requiresVerifiedVision('vision')).toBe(true)
    expect(requiresVerifiedVision('image-to-webdev')).toBe(true)
    expect(requiresVerifiedVision('text')).toBe(false)
    expect(requiresVerifiedVision('webdev')).toBe(false)
  })
})
