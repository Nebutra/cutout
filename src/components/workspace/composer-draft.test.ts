import { describe, expect, it } from 'vitest'
import { consumeComposerDraft } from './composer-draft'

describe('consumeComposerDraft', () => {
  it('captures submitted text and clears the next editor value', () => {
    expect(consumeComposerDraft('  Build a fitness dashboard  ')).toEqual({
      submitted: 'Build a fitness dashboard',
      nextValue: '',
    })
  })

  it('does not consume an empty draft', () => {
    expect(consumeComposerDraft('   ')).toEqual({
      submitted: null,
      nextValue: '   ',
    })
  })
})
