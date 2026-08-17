import { describe, expect, it } from 'vitest'
import { recognizeCommerceMaterialIntent } from './intent'

describe('Commerce material intent recognition', () => {
  it('recognizes explicit and compound localization outcomes', () => {
    expect(recognizeCommerceMaterialIntent('为这个商品生成跨境电商本地化素材')).toMatchObject({
      reason: 'explicit-deliverable',
      intent: { sourceText: '为这个商品生成跨境电商本地化素材' },
    })
    expect(recognizeCommerceMaterialIntent(
      'Create Amazon market-specific product images, copy, and video assets',
    )).toMatchObject({ reason: 'compound-domain-intent' })
  })

  it('does not intercept general product, UI, or isolated translation requests', () => {
    expect(recognizeCommerceMaterialIntent('Design a product settings page')).toBeUndefined()
    expect(recognizeCommerceMaterialIntent('Translate this paragraph to Korean')).toBeUndefined()
    expect(recognizeCommerceMaterialIntent('Create a product hero image')).toBeUndefined()
  })
})
