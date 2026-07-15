import type { PrototypePage, PrototypePlan } from './prototype-plan'

export interface PrototypeAssetManifestItem {
  readonly id: string
  readonly recommendedName: string
  readonly pageId: string
  readonly pageName: string
  readonly route: string
  readonly regionId: string
  readonly regionName: string
  readonly assetRoute: PrototypePage['regions'][number]['assetRoute']
  readonly source: 'asset-opportunity' | 'region'
  readonly description: string
}

export interface PrototypeAssetManifestPage {
  readonly id: string
  readonly name: string
  readonly route: string
  readonly assets: readonly PrototypeAssetManifestItem[]
}

export interface PrototypeAssetManifest {
  readonly version: 'asset-manifest.v0'
  readonly product: string
  readonly pages: readonly PrototypeAssetManifestPage[]
  readonly assets: readonly PrototypeAssetManifestItem[]
}

export function createPrototypeAssetManifest(
  plan: PrototypePlan,
  pages: readonly PrototypePage[],
): PrototypeAssetManifest {
  const scoped = pages.length ? pages : plan.pages
  const usedNames = new Map<string, number>()
  const manifestPages = scoped.map((page) => {
    const assets = page.regions
      .filter((region) => region.assetRoute !== 'ignore-code-ui')
      .flatMap((region) => {
        const opportunities =
          region.assetOpportunities.length > 0
            ? region.assetOpportunities.map((description) => ({
                source: 'asset-opportunity' as const,
                description,
              }))
            : [
                {
                  source: 'region' as const,
                  description: region.name || region.role || region.summary,
                },
              ]

        return opportunities.map((item, index) => {
          const base = uniqueName(
            [page.name, item.description].filter(Boolean).join('-'),
            usedNames,
          )
          return {
            id: `${slugify(page.id || page.name)}-${slugify(region.id || region.name)}-${index + 1}`,
            recommendedName: base,
            pageId: page.id,
            pageName: page.name,
            route: page.route,
            regionId: region.id,
            regionName: region.name,
            assetRoute: region.assetRoute,
            source: item.source,
            description: item.description,
          }
        })
      })

    return {
      id: page.id,
      name: page.name,
      route: page.route,
      assets,
    }
  })

  return {
    version: 'asset-manifest.v0',
    product: plan.product.name,
    pages: manifestPages,
    assets: manifestPages.flatMap((page) => page.assets),
  }
}

function uniqueName(value: string, used: Map<string, number>): string {
  const slug = slugify(value) || 'visual-asset'
  const seen = used.get(slug) ?? 0
  used.set(slug, seen + 1)
  return seen === 0 ? slug : `${slug}-${seen + 1}`
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .split('')
    .filter((character) => character.charCodeAt(0) <= 127)
    .join('')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}
