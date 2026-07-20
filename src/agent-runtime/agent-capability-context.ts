import type { AgentToolDefinition } from './tool-loop'

const CAPABILITY_COPY: Readonly<Record<string, string>> = {
  reply_conversationally:
    'Answer questions about Cutout and help turn an idea into a concrete design request.',
  ask_clarifying_question:
    'Ask one focused question when a real design request lacks a decision needed to proceed.',
  proceed_with_generation:
    'Generate a design system and prototype from a clear design or build request.',
  compile_astryx_theme:
    'Compile the current DESIGN.md colors into an Astryx theme.',
  configure_prototype_regeneration:
    'Regenerate the existing design system or prototype with an appropriate scope.',
  select_pages_to_regenerate:
    'Regenerate selected existing prototype pages while keeping the rest unchanged.',
}

/**
 * The model only receives tools that are valid for this workspace and turn.
 * Keep its self-description derived from that same list so it cannot promise
 * an unavailable project operation.
 */
export function agentCapabilityContext(
  tools: readonly Pick<AgentToolDefinition, 'name' | 'description'>[],
): string {
  const capabilities = tools.map((tool) =>
    CAPABILITY_COPY[tool.name] ?? tool.description,
  )

  return [
    'Current workspace capabilities:',
    ...capabilities.map((capability) => `- ${capability}`),
    'Only describe or offer capabilities in this list. Do not imply access to unlisted assets, services, or external systems.',
  ].join('\n')
}
