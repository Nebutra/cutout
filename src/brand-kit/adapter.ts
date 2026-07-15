import type { BrandKit } from './compiler'

/**
 * Boundary for a future Design Kit integration. The Brand Kit remains pure:
 * adapters receive a verified in-memory result and own any target conversion.
 */
export interface BrandKitDesignKitAdapter<TOutput> {
  readonly id: string
  adapt(brandKit: BrandKit): TOutput | Promise<TOutput>
}

export async function adaptBrandKit<TOutput>(
  brandKit: BrandKit,
  adapter: BrandKitDesignKitAdapter<TOutput>,
): Promise<TOutput> {
  return adapter.adapt(brandKit)
}
