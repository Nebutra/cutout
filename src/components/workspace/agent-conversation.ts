/**
 * Agent conversation state (foundation for the streaming design agent).
 *
 * Transport-agnostic: {@link useAgentConversation} owns the message list and a
 * `stream()` primitive that consumes ANY `AsyncIterable<string>` of text deltas
 * (e.g. `GenerationService.streamText`), so a future agent loop plugs in without
 * touching the UI. Kept as `.ts` (no JSX) so the hook can live beside the types
 * without a fast-refresh warning — mirrors `settings-ui.ts` / `library-ui.ts`.
 */
import { useCallback, useState } from 'react'

export type AgentRole = 'user' | 'assistant'

export interface AgentMessage {
  readonly id: string
  readonly role: AgentRole
  readonly content: string
  /** True while an assistant message is still streaming in. */
  readonly pending: boolean
}

export interface AgentConversationApi {
  readonly messages: readonly AgentMessage[]
  /** Append a fully-formed message; returns its id. */
  readonly append: (role: AgentRole, content: string) => string
  /**
   * Append an assistant message and stream `source`'s deltas into it. Resolves
   * with the final text; errors propagate after the message is marked settled.
   */
  readonly stream: (source: AsyncIterable<string>) => Promise<string>
  readonly reset: () => void
}

export function useAgentConversation(): AgentConversationApi {
  const [messages, setMessages] = useState<readonly AgentMessage[]>([])

  const append = useCallback((role: AgentRole, content: string): string => {
    const id = crypto.randomUUID()
    setMessages((prev) => [...prev, { id, role, content, pending: false }])
    return id
  }, [])

  const stream = useCallback(
    async (source: AsyncIterable<string>): Promise<string> => {
      const id = crypto.randomUUID()
      setMessages((prev) => [
        ...prev,
        { id, role: 'assistant', content: '', pending: true },
      ])
      let text = ''
      try {
        for await (const delta of source) {
          text += delta
          setMessages((prev) =>
            prev.map((message) =>
              message.id === id ? { ...message, content: text } : message,
            ),
          )
        }
        return text
      } finally {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === id ? { ...message, pending: false } : message,
          ),
        )
      }
    },
    [],
  )

  const reset = useCallback(() => setMessages([]), [])

  return { messages, append, stream, reset }
}
