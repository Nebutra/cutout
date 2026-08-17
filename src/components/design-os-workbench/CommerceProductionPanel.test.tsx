import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommerceProductionPanel } from './CommerceProductionPanel'

describe('Commerce production desktop operator (not benchmark evidence)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeAll(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterAll(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = false
  })

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('defaults to ordinary Project production without evaluator authority claims', async () => {
    await act(async () => {
      root.render(<CommerceProductionPanel />)
    })
    expect(container.textContent).toContain('Commerce production')
    expect(container.textContent).toContain('Run inputs')
    expect(container.textContent).toContain('Catalog records and product references for this run.')
    expect(container.textContent).toContain('Product record')
    expect(container.textContent).toContain('No eligible DashScope Provider')
    expect(container.textContent).not.toContain('Held-out evaluator run')
    expect(container.textContent).not.toContain('14/14')
    const start = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Generate set'))
    expect(start?.disabled).toBe(true)
  })

  it('keeps the existing held-out workflow inside the isolated Benchmark mode', async () => {
    await act(async () => {
      root.render(<CommerceProductionPanel />)
    })
    const benchmark = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'Benchmark')
    expect(benchmark).toBeDefined()
    await act(async () => {
      benchmark?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
      benchmark?.click()
    })
    expect(container.textContent).toContain('Held-out evaluator run')
    expect(container.textContent).toContain('Evaluator run')
    expect(container.textContent).toContain('5/14')
    expect(container.textContent).toContain('Import evaluator package')
    expect(container.textContent).not.toContain('Run inputs')
    expect(container.textContent).not.toContain('14/14')
  })

  it('projects Project and Benchmark scopes without cross-exposing their controls', async () => {
    await act(async () => {
      root.render(<CommerceProductionPanel modeScope="project" />)
    })
    expect(container.querySelector('[data-slot="commerce-production"]')).toBeTruthy()
    expect(container.textContent).toContain('Run inputs')
    expect(container.textContent).not.toContain('Held-out evaluator run')
    expect(container.querySelector('[aria-label="Commerce production mode"]')).toBeNull()

    await act(async () => {
      root.render(<CommerceProductionPanel modeScope="benchmark" />)
    })
    expect(container.querySelector('[data-slot="commerce-production"]')).toBeTruthy()
    expect(container.textContent).toContain('Commerce benchmark admission')
    expect(container.textContent).toContain('Evaluator run')
    expect(container.textContent).not.toContain('Commerce production')
    expect(container.textContent).toContain('Held-out evaluator run')
    expect(container.textContent).not.toContain('Run inputs')
    expect(container.querySelector('[aria-label="Commerce production mode"]')).toBeNull()
  })

  it('invalidates retained production whenever a JSON input or reference changes', async () => {
    const onReset = vi.fn()
    await act(async () => {
      root.render(<CommerceProductionPanel modeScope="project" onReset={onReset} />)
    })

    const jsonInputs = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[accept="application/json,.json"]'),
    )
    expect(jsonInputs).toHaveLength(3)
    for (const [index, input] of jsonInputs.entries()) {
      const file = new File(['{}'], `input-${index}.json`, { type: 'application/json' })
      Object.defineProperty(input, 'files', { configurable: true, value: [file] })
      await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
    }
    expect(onReset).toHaveBeenCalledTimes(3)

    const imageInput = container.querySelector<HTMLInputElement>('input[accept="image/png,image/jpeg,image/webp"]')
    expect(imageInput).toBeTruthy()
    const reference = new File(['reference'], 'front.png', { type: 'image/png' })
    Object.defineProperty(imageInput!, 'files', { configurable: true, value: [reference] })
    await act(async () => imageInput!.dispatchEvent(new Event('change', { bubbles: true })))
    expect(onReset).toHaveBeenCalledTimes(4)

    const remove = container.querySelector<HTMLButtonElement>('button[aria-label="Remove front.png"]')
    expect(remove).toBeTruthy()
    act(() => remove?.click())
    expect(onReset).toHaveBeenCalledTimes(5)
  })
})
