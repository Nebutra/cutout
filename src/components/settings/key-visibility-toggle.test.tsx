import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { setupI18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

vi.mock('@/hooks/queries/vectorize', () => {
  const mutation = () => ({ isPending: false, mutateAsync: vi.fn() })

  return {
    useDeleteVectorizerApiKey: mutation,
    useSetVectorizerApiId: mutation,
    useSetVectorizerApiKey: mutation,
    useSetVectorizerApiMode: mutation,
    useVectorizePrefs: () => ({ data: { apiId: 'vect_test', apiMode: 'test' } }),
    useVectorizerKeyStatus: () => ({ data: false }),
    vectorizePrefsOrDefault: (prefs: { apiId: string; apiMode: 'test' }) => prefs,
  }
})

import { KeyField } from './KeyField'
import { VectorizerPanel } from './VectorizerPanel'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const i18n = setupI18n()
i18n.loadAndActivate({ locale: 'en', messages: {} })

let host: HTMLDivElement | undefined
let root: Root | undefined

afterEach(() => {
  if (root) act(() => root?.unmount())
  host?.remove()
  host = undefined
  root = undefined
})

function render(node: ReactNode) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(<I18nProvider i18n={i18n}>{node}</I18nProvider>))
  return host
}

function expectStableVisibilityToggle(button: HTMLButtonElement) {
  expect(button.classList).toContain('inset-y-0')
  expect(button.classList).toContain('my-auto')
  expect(button.classList).toContain('size-6')
  expect(button.classList).toContain(
    'active:not-aria-[haspopup]:translate-y-0',
  )
  expect(button.classList).not.toContain(
    'active:not-aria-[haspopup]:translate-y-px',
  )
  expect(button.querySelector('svg')?.classList).toContain('size-3')
}

describe('secret visibility toggles', () => {
  it('keeps the provider key toggle centered with stable dimensions while active', () => {
    const view = render(
      <KeyField
        id="provider-key"
        value="replacement"
        onChange={vi.fn()}
        hasKey
      />,
    )

    const button = view.querySelector<HTMLButtonElement>('button[aria-label="Show"]')
    expect(button).not.toBeNull()
    expectStableVisibilityToggle(button!)

    act(() => button?.click())

    const hiddenButton = view.querySelector<HTMLButtonElement>(
      'button[aria-label="Hide"]',
    )
    expect(hiddenButton).not.toBeNull()
    expectStableVisibilityToggle(hiddenButton!)
  })

  it('uses the same stable active positioning for the Vectorizer secret toggle', () => {
    const view = render(<VectorizerPanel />)
    const button = view.querySelector<HTMLButtonElement>('button[aria-label="Show"]')

    expect(button).not.toBeNull()
    expectStableVisibilityToggle(button!)
  })
})
