import ReactMarkdown, { type Components, type UrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

export type RichTextVariant = 'message' | 'artifact'

export function RichText({
  markdown,
  variant = 'message',
  className,
}: {
  readonly markdown: string
  readonly variant?: RichTextVariant
  readonly className?: string
}) {
  return (
    <div
      data-rich-text={variant}
      className={cn(
        'min-w-0 break-words text-foreground',
        variant === 'artifact'
          ? 'text-[15px] leading-7 sm:text-base sm:leading-8'
          : 'text-sm leading-6',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={componentsFor(variant)}
        skipHtml
        urlTransform={safeUrlTransform}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}

const safeUrlTransform: UrlTransform = (url) => {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.href
      : ''
  } catch {
    return ''
  }
}

function componentsFor(variant: RichTextVariant): Components {
  const artifact = variant === 'artifact'
  return {
    h1: ({ children }) => (
      <h1 className={artifact ? 'mb-6 text-3xl font-semibold leading-tight sm:text-4xl' : 'my-3 text-base font-semibold leading-6'}>{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className={artifact ? 'mb-4 mt-10 border-t border-border pt-8 text-2xl font-semibold leading-tight first:mt-0 first:border-t-0 first:pt-0' : 'my-3 text-sm font-semibold leading-5'}>{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className={artifact ? 'mb-3 mt-8 text-xl font-semibold leading-snug' : 'my-3 text-sm font-semibold leading-5'}>{children}</h3>
    ),
    h4: ({ children }) => (
      <h4 className={artifact ? 'mb-2 mt-6 text-base font-semibold leading-6' : 'my-2 text-sm font-semibold leading-5'}>{children}</h4>
    ),
    p: ({ children }) => <p className={artifact ? 'my-4' : 'my-2'}>{children}</p>,
    a: ({ href, children }) => href
      ? <a href={href} target="_blank" rel="noreferrer noopener" className="font-medium underline decoration-border underline-offset-4 hover:decoration-foreground">{children}</a>
      : <>{children}</>,
    blockquote: ({ children }) => (
      <blockquote className={cn('my-5 border-l-2 border-border pl-4 text-muted-foreground', !artifact && 'my-3 pl-3')}>{children}</blockquote>
    ),
    ul: ({ children }) => <ul className={cn('my-4 list-disc space-y-1.5 pl-6', !artifact && 'my-2 space-y-1 pl-5')}>{children}</ul>,
    ol: ({ children }) => <ol className={cn('my-4 list-decimal space-y-1.5 pl-6', !artifact && 'my-2 space-y-1 pl-5')}>{children}</ol>,
    li: ({ children }) => <li className="pl-1 marker:text-muted-foreground">{children}</li>,
    hr: () => <hr className="my-8 border-border" />,
    pre: ({ children }) => <pre className={cn('my-5 overflow-x-auto border border-border bg-muted/25 p-4 font-mono text-sm leading-6', !artifact && 'my-3 rounded-md p-3 text-xs leading-5')}>{children}</pre>,
    code: ({ className, children }) => (
      <code className={cn(className ? 'font-mono' : 'rounded bg-muted px-1.5 py-0.5 font-mono text-[0.875em]', className)}>{children}</code>
    ),
    table: ({ children }) => (
      <div className="my-6 max-w-full overflow-x-auto border-y border-border">
        <table className="w-full border-collapse text-left text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="border-b border-border bg-muted/25">{children}</thead>,
    tbody: ({ children }) => <tbody className="divide-y divide-border/70">{children}</tbody>,
    th: ({ children }) => <th className="px-3 py-2 font-semibold text-foreground">{children}</th>,
    td: ({ children }) => <td className="px-3 py-2 align-top text-muted-foreground">{children}</td>,
    del: ({ children }) => <del className="text-muted-foreground">{children}</del>,
    img: ({ alt }) => alt ? <span className="text-muted-foreground">{alt}</span> : null,
    input: ({ checked }) => (
      <input type="checkbox" checked={checked} readOnly disabled className="mr-2 align-middle" />
    ),
  }
}
