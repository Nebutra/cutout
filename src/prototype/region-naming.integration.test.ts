/**
 * Real-model verification that region-primed slice naming produces well-formed,
 * on-domain names from a REAL board image — the naming half of the per-region
 * slice loop. Generates an actual UI asset board via the gateway image model,
 * then runs the shipping `nameRegionSlices` (region-primed vision call +
 * index->id mapping) against the real gateway, and asserts the returned names
 * are well-formed kebab-case, correctly mapped to slice ids, and logs them so a
 * human can eyeball semantic quality.
 *
 * The CV boxes are supplied here (thirds of a "three assets left-to-right"
 * board) rather than run through canvas CV — the real CV->boxes path is proven
 * separately in tests/visual/region-slicing.spec.ts (a real browser), and the
 * index->id mapping/namespacing in region-deconstruct.test.ts. This test's job
 * is specifically the vision-naming quality/wiring.
 *
 * Gated behind CUTOUT_RUN_PIPELINE_BENCHMARK=1 (real image + vision calls, real
 * spend); requires MOX_API_KEY + MOX_BASE_URL.
 */
import { describe, expect, it } from 'vitest'
import { isErr } from '@/services/types'
import {
  apiBase,
  createGatewayGenerationService,
  GATEWAY_CHAT_MODEL,
  GATEWAY_IMAGE_MODEL,
  GATEWAY_PROVIDER_ID,
} from '@/services/ai/gateway-generation.testkit'
import { nameRegionSlices, regionNameContext } from './region-deconstruct'
import type { PrototypeRegion } from './prototype-plan'
import type { SliceInput } from '@/store/types'

const RUN = process.env.CUTOUT_RUN_PIPELINE_BENCHMARK === '1'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required.`)
  return value
}

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const REGION: PrototypeRegion = {
  id: 'region-hero',
  name: 'Hero',
  role: 'introduction',
  summary: 'The primary call-to-action area with a button, a search entry, and the signed-in user.',
  complexity: 'high',
  decompositionStrategy: 'direct',
  assetRoute: 'board-cutout',
  assetOpportunities: ['button', 'icon', 'avatar'],
} as PrototypeRegion

function box(x: number): SliceInput {
  return {
    id: `slice-${x}`,
    index: 0,
    box: { x, y: 340, width: 260, height: 340 },
    blob: new Blob(),
    width: 260,
    height: 340,
    regionId: 'region-hero',
    pageId: 'page-1',
  }
}

describe.skipIf(!RUN)('region-primed slice naming vs. a real model', () => {
  const generation = RUN
    ? createGatewayGenerationService(required('MOX_API_KEY'), apiBase(required('MOX_BASE_URL')))
    : null

  it(
    'names real board assets with well-formed, id-mapped names',
    { timeout: 180_000 },
    async () => {
      const board = await generation!.generateImages({
        providerId: GATEWAY_PROVIDER_ID,
        model: GATEWAY_IMAGE_MODEL,
        prompt:
          'A flat, pure-white (#FFFFFF) UI asset board. Exactly three well-separated assets in a ' +
          'single row, left to right, with wide white margins between them: ' +
          '(1) a blue primary button labeled "Submit"; ' +
          '(2) a dark magnifying-glass search icon; ' +
          '(3) a circular user avatar photo. Nothing else, no background, no container.',
      })
      expect(isErr(board)).toBe(false)
      if (isErr(board)) throw new Error(board.error)
      const boardBytes = board.data[0]!.bytes

      // Three boxes over the left / center / right thirds of the 1024-wide board.
      const slices = [box(60), box(382), box(704)]

      const renames = await nameRegionSlices(
        generation!,
        { providerId: GATEWAY_PROVIDER_ID, model: GATEWAY_CHAT_MODEL },
        boardBytes,
        slices,
        regionNameContext(REGION),
      )

      // eslint-disable-next-line no-console -- surface the names for human quality review
      console.log('[region-naming] names:', renames.map((r) => r.name).join(', '))

      // Well-formed, mapped to our slice ids, no duplicates, reasonable length.
      expect(renames.length).toBeGreaterThan(0)
      const validIds = new Set(slices.map((s) => s.id))
      const seenIds = new Set<string>()
      for (const { id, name } of renames) {
        expect(validIds.has(id)).toBe(true)
        expect(seenIds.has(id)).toBe(false)
        seenIds.add(id)
        expect(name).toMatch(KEBAB)
        expect(name.length).toBeLessThanOrEqual(40)
      }
    },
  )
})
