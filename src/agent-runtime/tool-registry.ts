/**
 * Enumerates every `AgentToolDefinition` factory the app knows about — a
 * plain list for discoverability and completeness testing, NOT a per-turn
 * dispatcher. Which of these apply on a given turn is workspace-state-
 * dependent (does a DESIGN.md with colors exist? does a prototype suite
 * exist yet?) and stays exactly where that state lives: `tryToolGate()` in
 * `IntentWorkspace.tsx`. Adding a fourth tool means registering its factory
 * here (for the completeness test) and wiring its call-site-specific
 * eligibility check wherever it actually applies — this file does not grow
 * that eligibility logic itself.
 */
import { astryxThemeTool } from '@/design-kit/astryx-tool'
import { configureRegenerationTool } from '@/prototype/regeneration-tool'
import { conversationalReplyTool } from '@/prototype/conversational-reply-tool'
import { askClarifyingQuestionTool } from '@/prototype/ask-clarifying-question-tool'
import { configurePageTargetingTool } from '@/prototype/page-targeting-tool'

export {
  astryxThemeTool,
  configureRegenerationTool,
  conversationalReplyTool,
  askClarifyingQuestionTool,
  configurePageTargetingTool,
}

/**
 * No-arg factories only — the others need a DESIGN.md model, a page list,
 * or a clarification bridge + runId and are exported above instead.
 */
export const NO_ARG_TOOL_FACTORIES = [configureRegenerationTool, conversationalReplyTool] as const
