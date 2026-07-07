/**
 * Agent conversation view — renders the streaming message list with auto-scroll
 * and a calm empty state. State + the streaming primitive live in the companion
 * `agent-conversation.ts` (see {@link useAgentConversation}); no agent policy
 * lives here yet — this is the presentational foundation.
 */
import { useEffect, useRef } from 'react'
import { WandSparkles } from 'lucide-react'
import type { AgentMessage } from './agent-conversation'
import { cn } from '@/lib/utils'

export function AgentConversation({
  messages,
}: {
  readonly messages: readonly AgentMessage[]
}) {
  const endRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-16 text-center text-muted-foreground">
        <WandSparkles className="size-6 opacity-60" />
        <p className="max-w-[15rem] text-xs leading-5">
          The design agent will collaborate here — refining the brief, planning,
          and iterating with you.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.map((message) => (
        <AgentBubble key={message.id} message={message} />
      ))}
      <div ref={endRef} />
    </div>
  )
}

function AgentBubble({ message }: { readonly message: AgentMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]',
          isUser ? 'bg-muted text-foreground' : 'text-foreground',
        )}
      >
        {message.content}
        {message.pending ? (
          <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-muted-foreground/60" />
        ) : null}
      </div>
    </div>
  )
}
