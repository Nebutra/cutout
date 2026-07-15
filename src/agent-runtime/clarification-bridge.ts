/**
 * The in-call suspend/resume mechanism for human-in-the-loop clarification —
 * a tool's `execute()` awaits a Promise that only a UI interaction can
 * resolve, mirroring the already-proven pattern in `desktop-tool-loop.ts`
 * (paid-tool approval: `calls: Map<id, PendingCall>`, `resolve` stashed from
 * a Promise executor, resolved by a UI button calling `approve()`/`deny()`).
 * This is a narrower version of that same idea for a simpler case (asking a
 * question, no approval/receipt/retry machinery).
 *
 * The bridge — not `runToolLoop` — emits the `human-loop-asked` run event,
 * and does so live, the instant `ask()` is called, not after the model call
 * eventually resolves. `runToolLoop` only learns about a tool call once the
 * WHOLE `generateText` call has settled (it walks the completed result), but
 * that call won't settle until this suspended `execute()` returns — so the
 * "please answer" signal has to come from inside the suspension itself, the
 * same way `desktop-tool-loop.ts`'s `request()` emits `tool-approval-
 * requested` before its own async execution even starts.
 *
 * Unlike `desktop-tool-loop.ts`'s `cancel()`, which is only ever invoked
 * explicitly, a suspended ask must also settle when the caller's
 * `AgentRunLease` is superseded — `generateText`'s own `abortSignal` does
 * NOT reach into a tool's `execute()` Promise once it's blocked on something
 * outside the AI SDK's control. Without racing the signal here, a superseded
 * ask would hang forever and leak its Map entry.
 */
import { createRunEvent, type AgentRunEvent } from './run-events'
import { AgentRunCancelledError } from './run-coordinator'
import type { PrototypeHumanLoopAsk, ResolvedHumanLoopAnswer } from '@/prototype/prototype-plan'

interface PendingAsk {
  readonly runId: string
  resolve(answer: ResolvedHumanLoopAnswer): void
  reject(reason: unknown): void
}

export interface ClarificationBridgeDependencies {
  readonly append: (events: readonly AgentRunEvent[]) => void
  readonly now?: () => number
}

export interface ClarificationBridge {
  /** Called from `askClarifyingQuestionTool.execute()` — suspends until `answer()` resolves it or `signal` aborts. */
  ask(runId: string, question: PrototypeHumanLoopAsk, signal?: AbortSignal): Promise<ResolvedHumanLoopAnswer>
  /** Called by the UI (`HumanLoopQuestion`'s submit) — resolves the matching pending ask. No-op if `askId` is unknown/already settled. */
  answer(askId: string, answer: ResolvedHumanLoopAnswer): void
}

export function createClarificationBridge(deps: ClarificationBridgeDependencies): ClarificationBridge {
  const asks = new Map<string, PendingAsk>()
  const now = deps.now ?? Date.now

  return {
    ask(runId, question, signal) {
      signal?.throwIfAborted()
      const askId = crypto.randomUUID()
      deps.append([createRunEvent(runId, {
        type: 'human-loop-asked',
        askId,
        question: question.question,
        choices: question.choices,
        defaultChoiceId: question.defaultChoiceId,
      }, { eventId: `event:${askId}:human-loop-asked`, at: now() })])

      return new Promise<ResolvedHumanLoopAnswer>((resolve, reject) => {
        const onAbort = () => {
          if (!asks.has(askId)) return
          asks.delete(askId)
          reject(new AgentRunCancelledError())
        }
        asks.set(askId, {
          runId,
          resolve: (answer) => {
            signal?.removeEventListener('abort', onAbort)
            resolve(answer)
          },
          reject: (reason) => {
            signal?.removeEventListener('abort', onAbort)
            reject(reason)
          },
        })
        signal?.addEventListener('abort', onAbort, { once: true })
      })
    },
    answer(askId, answer) {
      const pending = asks.get(askId)
      if (!pending) return
      asks.delete(askId)
      deps.append([createRunEvent(
        pending.runId,
        { type: 'human-loop-answered', askId },
        { eventId: `event:${askId}:human-loop-answered`, at: now() },
      )])
      pending.resolve(answer)
    },
  }
}
