import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CanvasProfileStage } from './CanvasProfileStage'

describe('Canvas Profile stage', () => {
  let container: HTMLDivElement | undefined

  afterEach(() => {
    container?.remove()
    container = undefined
  })

  it('returns to the artifact board without requiring Workbench', async () => {
    container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const onClose = vi.fn()

    await act(async () => {
      root.render(
        <CanvasProfileStage
          launch={{ kind: 'commerce', sourceText: 'Localized Commerce set' }}
          currentRevisionId={null}
          commerceLifecycle={null}
          onCommerceLifecycleChange={vi.fn()}
          onClose={onClose}
        />,
      )
    })

    const back = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Back to artifact board"]',
    )
    expect(back).not.toBeNull()
    await act(async () => back?.click())
    expect(onClose).toHaveBeenCalledOnce()
    expect(container.querySelector('[data-canvas-profile-stage="commerce"]')).not.toBeNull()

    await act(async () => root.unmount())
  })
})
