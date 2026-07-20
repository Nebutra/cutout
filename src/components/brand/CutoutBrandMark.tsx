import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

export type CutoutBrandVariant = 'symbol' | 'wordmark' | 'horizontal' | 'stacked'

const assets: Record<CutoutBrandVariant, { readonly url: string; readonly aspectRatio: string }> = {
  symbol: { url: '/brand/symbol-current-color.svg', aspectRatio: '833.940469 / 809.781978' },
  wordmark: { url: '/brand/wordmark-current-color.svg', aspectRatio: '1337.203059 / 316.677258' },
  horizontal: { url: '/brand/lockup-horizontal-current-color.svg', aspectRatio: '1063.160622 / 212.870755' },
  stacked: { url: '/brand/lockup-stacked-current-color.svg', aspectRatio: '468.380384 / 408' },
}

export function CutoutBrandMark({
  variant = 'symbol',
  label,
  className,
}: {
  readonly variant?: CutoutBrandVariant
  readonly label?: string
  readonly className?: string
}) {
  const asset = assets[variant]
  const style: CSSProperties = {
    aspectRatio: asset.aspectRatio,
    maskImage: `url(${asset.url})`,
    WebkitMaskImage: `url(${asset.url})`,
    maskPosition: 'center',
    WebkitMaskPosition: 'center',
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskSize: 'contain',
    WebkitMaskSize: 'contain',
  }

  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-cutout-brand={variant}
      className={cn('inline-block shrink-0 bg-current', className)}
      style={style}
    />
  )
}
