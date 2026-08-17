import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createCommerceProjectLifecycleRecord,
  type CommerceProjectLifecycleRecord,
} from '@/commerce-profile/project-lifecycle'
import { createCommerceProjectContractResult } from '@/commerce-profile/project-production.test-fixture'
import { CommerceProjectLifecycleReview } from './CommerceProjectLifecycleReview'

describe('Commerce Canvas lifecycle review (contract evidence only)', () => {
  let record: CommerceProjectLifecycleRecord
  const containers: HTMLDivElement[] = []

  beforeAll(async () => {
    record = createCommerceProjectLifecycleRecord({
      designRevisionId: 'revision:commerce:1',
      result: await createCommerceProjectContractResult(),
    })
  })

  afterAll(() => containers.forEach((container) => container.remove()))

  it('accepts only the exact retained ordered artifact closure', async () => {
    const container = document.createElement('div')
    containers.push(container)
    document.body.append(container)
    const root = createRoot(container)
    const onLifecycleChange = vi.fn()

    await act(async () => {
      root.render(
        <CommerceProjectLifecycleReview
          record={record}
          currentRevisionId="revision:commerce:1"
          onLifecycleChange={onLifecycleChange}
          onRegenerate={vi.fn()}
        />,
      )
    })

    const accept = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Accept exact set'))
    expect(accept).toBeDefined()
    await act(async () => accept?.click())
    expect(onLifecycleChange).toHaveBeenCalledOnce()
    expect(onLifecycleChange.mock.calls[0]?.[0].review.artifactHashes).toEqual(
      record.result.deliverables.map((deliverable) => deliverable.sha256),
    )
    expect(container.querySelectorAll('[aria-label="Commerce retained artifact previews"] article'))
      .toHaveLength(record.result.deliverables.length)

    await act(async () => root.unmount())
  })

  it('blocks acceptance for a stale revision and offers regeneration', async () => {
    const container = document.createElement('div')
    containers.push(container)
    document.body.append(container)
    const root = createRoot(container)
    const onRegenerate = vi.fn()

    await act(async () => {
      root.render(
        <CommerceProjectLifecycleReview
          record={record}
          currentRevisionId="revision:commerce:2"
          onLifecycleChange={vi.fn()}
          onRegenerate={onRegenerate}
        />,
      )
    })

    expect(container.textContent).toContain('Stale revision')
    expect(container.textContent).not.toContain('Accept exact set')
    const regenerate = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Regenerate'))
    await act(async () => regenerate?.click())
    expect(onRegenerate).toHaveBeenCalledOnce()

    await act(async () => root.unmount())
  })
})
