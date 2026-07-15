import { describe, expect, it } from 'vitest'
import { shouldShowDesignInspector } from './workspace-inspector-state'

describe('shouldShowDesignInspector', () => {
  it('does not reserve inspector space for an empty workspace', () => {
    expect(shouldShowDesignInspector({
      explicitlyOpen: false,
      dismissed: false,
      hasContent: false,
    })).toBe(false)
  })

  it('keeps details hidden until explicitly requested, even when content exists', () => {
    expect(shouldShowDesignInspector({
      explicitlyOpen: false,
      dismissed: false,
      hasContent: true,
    })).toBe(false)
    expect(shouldShowDesignInspector({
      explicitlyOpen: false,
      dismissed: true,
      hasContent: true,
    })).toBe(false)
  })

  it('allows the user to explicitly open an empty inspector', () => {
    expect(shouldShowDesignInspector({
      explicitlyOpen: true,
      dismissed: true,
      hasContent: false,
    })).toBe(true)
  })
})
