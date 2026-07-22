import { FileText, FolderGit2 } from 'lucide-react'
import { integrationIconRegistry } from './integration-icon-registry'

export type IntegrationIconSize = 'default' | 'compact'

const integrationIconSizeClass = {
  default: 'size-5',
  compact: 'size-4',
} satisfies Record<IntegrationIconSize, string>

const integrationIconBoxClass =
  'inline-flex shrink-0 self-center align-middle items-center justify-center'

export function IntegrationIcon({
  id,
  name,
  size = 'default',
}: {
  readonly id: string
  readonly name: string
  readonly size?: IntegrationIconSize
}) {
  const brand = integrationIconRegistry[id as keyof typeof integrationIconRegistry]
  const sizeClass = integrationIconSizeClass[size]

  if (brand?.kind === 'image') {
    return (
      <span
        role="img"
        aria-label={`${name} logo`}
        data-integration-icon={id}
        data-icon-source={brand.source}
        data-icon-kind={brand.kind}
        data-icon-size={size}
        className={`${integrationIconBoxClass} ${sizeClass}`}
      >
        <img
          src={brand.src}
          alt=""
          aria-hidden="true"
          className="size-full object-contain"
        />
      </span>
    )
  }

  if (brand) {
    const colorClass =
      brand.kind === 'monochrome-svg'
        ? 'text-foreground [&>svg]:fill-current'
        : ''
    return (
      <span
        role="img"
        aria-label={`${name} logo`}
        data-integration-icon={id}
        data-icon-source={brand.source}
        data-icon-kind={brand.kind}
        data-icon-size={size}
        className={`${integrationIconBoxClass} ${sizeClass} [&>svg]:block [&>svg]:size-full ${colorClass}`}
        dangerouslySetInnerHTML={{
          __html: brand.svg.replace(
            '<svg',
            '<svg aria-hidden="true" focusable="false" style="display:block;width:100%;height:100%"',
          ),
        }}
      />
    )
  }

  const Icon = id === 'cutout.repository' ? FolderGit2 : FileText
  return (
    <span
      role="img"
      aria-label={`${name} integration`}
      data-integration-icon={id}
      data-icon-source="Cutout generic"
      data-icon-kind="generic"
      data-icon-size={size}
      className={`${integrationIconBoxClass} ${sizeClass}`}
    >
      <Icon
        aria-hidden="true"
        focusable="false"
        className="block size-full text-muted-foreground"
      />
    </span>
  )
}
