import type { ReactNode } from 'react'
import { RichText } from '@/components/rich-text/RichText'

export function RichTextArtifact({
  label,
  title,
  meta,
  markdown,
  actions,
}: {
  readonly label: string
  readonly title: string
  readonly meta?: string
  readonly markdown: string
  readonly actions?: ReactNode
}) {
  return (
    <section aria-label={label} data-slot="rich-text-artifact" className="flex h-full min-h-0 min-w-0 flex-col bg-background">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2 sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          {meta ? <p className="truncate text-xs text-muted-foreground">{meta}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center justify-end gap-1">{actions}</div> : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <article data-slot="artifact-document" className="mx-auto w-full max-w-4xl px-6 py-10 sm:px-10 lg:py-14">
          <RichText markdown={markdown} variant="artifact" />
        </article>
      </div>
    </section>
  )
}
