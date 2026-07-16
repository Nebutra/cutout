/**
 * Opt-in real-model verification for region-primed naming. The browser CV path
 * is covered separately; this test owns live image + vision naming quality,
 * stable index-to-slice mapping, manifest lineage, and region name paths.
 *
 * Real spend is gated behind CUTOUT_RUN_PIPELINE_BENCHMARK=1 and requires
 * MOX_API_KEY + MOX_BASE_URL. Default test runs must skip this suite.
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
import { nameRegionSlices, regionNameContext, regionSlug } from './region-deconstruct'
import type { PrototypeRegion } from './prototype-plan'
import type { SliceInput } from '@/store/types'

const RUN = process.env.CUTOUT_RUN_PIPELINE_BENCHMARK === '1'
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required.`)
  return value
}

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

function box(index: number, x: number, assetManifestItemId: string): SliceInput {
  return {
    id: `slice-${index}`,
    index,
    box: { x, y: 340, width: 260, height: 340 },
    blob: new Blob(),
    width: 260,
    height: 340,
    regionId: REGION.id,
    pageId: 'page-1',
    assetManifestItemId,
  }
}

describe.skipIf(!RUN)('region-primed slice naming vs. a real model', () => {
  const generation = RUN
    ? createGatewayGenerationService(required('MOX_API_KEY'), apiBase(required('MOX_BASE_URL')))
    : null

  it('names real board assets with stable manifest lineage and structured name paths', { timeout: 180_000 }, async () => {
    const board = await generation!.generateImages({
      providerId: GATEWAY_PROVIDER_ID,
      model: GATEWAY_IMAGE_MODEL,
      prompt:
        'A flat, pure-white (#FFFFFF) UI asset board. Exactly three well-separated assets in a single row, left to right, with wide white margins: ' +
        '(1) a blue primary button labeled "Submit"; (2) a dark magnifying-glass search icon; ' +
        '(3) a circular user avatar photo. Nothing else, no background, no container.',
    })
    expect(isErr(board)).toBe(false)
    if (isErr(board)) throw new Error(board.error)

    const slices = [
      box(0, 60, 'page-1-region-hero-1'),
      box(1, 382, 'page-1-region-hero-2'),
      box(2, 704, 'page-1-region-hero-3'),
    ]
    const renames = await nameRegionSlices(
      generation!,
      { providerId: GATEWAY_PROVIDER_ID, model: GATEWAY_CHAT_MODEL },
      board.data[0]!.bytes,
      slices,
      regionNameContext(REGION),
    )

    const sliceById = new Map(slices.map((slice) => [slice.id, slice]))
    const seenIds = new Set<string>()
    const seenManifestIds = new Set<string>()
    const structured = renames.map(({ id, name }) => {
      const slice = sliceById.get(id)
      expect(slice).toBeDefined()
      expect(seenIds.has(id)).toBe(false)
      seenIds.add(id)
      expect(name).toMatch(KEBAB)
      expect(name.length).toBeLessThanOrEqual(40)
      expect(slice?.assetManifestItemId).toBeTruthy()
      expect(seenManifestIds.has(slice!.assetManifestItemId!)).toBe(false)
      seenManifestIds.add(slice!.assetManifestItemId!)
      return {
        assetManifestItemId: slice!.assetManifestItemId!,
        name: `${regionSlug(REGION.name)}-${name}`,
      }
    })

    // eslint-disable-next-line no-console -- intentional human semantic-quality evidence for opt-in runs
    console.log('[region-naming] structured names:', structured)
    expect(renames.length).toBeGreaterThan(0)
    expect(structured.every((entry) => entry.name.startsWith('hero-'))).toBe(true)
    expect(structured.every((entry) => KEBAB.test(entry.name))).toBe(true)
  })
})
