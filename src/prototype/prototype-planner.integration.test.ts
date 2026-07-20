/**
 * Real-model verification that the Agent actually PLANS a usable product from
 * a brief — the "understands what to build" half of "can it deliver". Calls
 * the REAL `planPrototype()` (real `ui-prototype-planner` prompt, real
 * `prototypePlanSchema`, real validation) against a live gateway via the
 * shared gateway-backed generation service. No reimplementation of the
 * planner — if this passes, the shipping planner genuinely turns a brief into
 * a schema-valid prototype plan with pages.
 *
 * Gated behind CUTOUT_RUN_PIPELINE_BENCHMARK=1 (real model calls, real spend);
 * requires MOX_API_KEY + MOX_BASE_URL. Mirrors the opt-in convention of
 * tool-gate-classification.integration.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { planPrototype } from './planner'
import {
  apiBase,
  createGatewayGenerationService,
  GATEWAY_CHAT_MODEL,
  GATEWAY_PROVIDER_ID,
} from '@/services/ai/gateway-generation.testkit'

const RUN = process.env.CUTOUT_RUN_PIPELINE_BENCHMARK === '1'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required.`)
  return value
}

describe.skipIf(!RUN)('planPrototype vs. a real model', () => {
  const generation = RUN
    ? createGatewayGenerationService(required('MOX_API_KEY'), apiBase(required('MOX_BASE_URL')))
    : null

  it(
    'turns a clear build brief into a schema-valid plan with pages',
    { timeout: 90_000 },
    async () => {
      const result = await planPrototype(generation!, {
        providerId: GATEWAY_PROVIDER_ID,
        model: GATEWAY_CHAT_MODEL,
        brief:
          '为独立咖啡店做一个 iPad 点单结账原型：主要用户是店员，只需要两个页面：' +
          '菜单浏览与下单页、结账收款页。平台是 iPad 横屏，风格现代简洁。',
      })

      if (!result.ok) throw new Error(result.error)
      expect(result.ok).toBe(true)
      const plan = result.data
      // A real, plannable product: a name and at least one page to generate.
      expect(plan.product.name.length).toBeGreaterThan(0)
      expect(plan.pages).toHaveLength(2)
      // humanLoop is always resolved to one of the two modes by validation.
      expect(['continue', 'ask']).toContain(plan.humanLoop.mode)
      // Pages carry the human-readable identity the rest of the pipeline keys on.
      for (const page of plan.pages) {
        expect(page.id.length).toBeGreaterThan(0)
        expect(page.name.length).toBeGreaterThan(0)
      }
    },
  )
})
