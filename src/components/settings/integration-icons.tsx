import { FileText, FolderGit2 } from 'lucide-react'
import { integrationIconRegistry } from './integration-icon-registry'

export function IntegrationIcon({
  id,
  name,
}: {
  readonly id: string
  readonly name: string
}) {
  const brand = integrationIconRegistry[id as keyof typeof integrationIconRegistry]

  if (brand?.kind === 'image') {
    return (
      <span
        role="img"
        aria-label={`${name} logo`}
        data-integration-icon={id}
        data-icon-source={brand.source}
        data-icon-kind={brand.kind}
        className="inline-flex size-5 shrink-0 items-center justify-center"
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
        className={`inline-block size-5 shrink-0 [&>svg]:size-full ${colorClass}`}
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
    <Icon
      role="img"
      aria-label={`${name} integration`}
      data-integration-icon={id}
      data-icon-source="Cutout generic"
      data-icon-kind="generic"
      className="size-5 shrink-0 text-muted-foreground"
    />
  )
}
