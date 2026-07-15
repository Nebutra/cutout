/**
 * Exposes "regenerate only these specific pages" as a tool — today the only
 * entry point for `generatePrototypeSuite`'s `targetPageIds` option is
 * clicking a page's card in the UI (the targeted-repair path); there is no
 * natural-language way to say "redo just the Login and Settings pages,
 * leave the rest." This tool doesn't do any generation itself — it's a pure
 * decision the model makes from the brief and the current page list; the
 * caller feeds the resolved ids into the SAME, unmodified
 * `generatePrototypeSuite(...)` call that already exists, so none of its
 * checkpoint/lease/store-coupled machinery is touched.
 *
 * The input schema is built from the CURRENT page list (a closed `z.enum`
 * of real page names), not a free-form string — an invalid or made-up page
 * name fails tool-call validation before `execute()` ever runs, the same
 * way `ask_clarifying_question`'s `defaultChoiceId` is now cross-checked
 * against its own `choices`.
 */
import { z } from 'zod'
import type { AgentToolDefinition } from '@/agent-runtime/tool-loop'

export interface TargetablePage {
  readonly id: string
  readonly name: string
}

export interface PageTargetingInput {
  readonly pageNames: readonly string[]
}

export interface PageTargetingDecision {
  readonly targetPageIds: readonly string[]
  readonly targetPageNames: readonly string[]
}

export function configurePageTargetingTool(
  pages: readonly TargetablePage[],
): AgentToolDefinition<PageTargetingInput, PageTargetingDecision> {
  const idsByName = new Map<string, string[]>()
  for (const page of pages) {
    const ids = idsByName.get(page.name)
    if (ids) {
      ids.push(page.id)
    } else {
      idsByName.set(page.name, [page.id])
    }
  }
  const uniqueNames = [...idsByName.keys()]
  const [firstName, ...restNames] = uniqueNames
  const pageNameSchema = z.enum([firstName, ...restNames] as [string, ...string[]])
  return {
    name: 'select_pages_to_regenerate',
    description:
      'Decide to regenerate ONLY specific existing pages, leaving the rest of the prototype '
      + 'suite untouched. Call this ONLY when the user explicitly names one or more of the '
      + `current pages to redo (current pages: ${pages.map((page) => page.name).join(', ')}). `
      + 'Do not call this for a request to design something new, to regenerate the entire suite, '
      + 'or when the named page(s) don\'t match anything in the list above.',
    inputSchema: z.object({
      pageNames: z.array(pageNameSchema).min(1)
        .describe('Exact names of the existing pages to regenerate, taken from the current page list.'),
    }),
    isReadOnly: true,
    async execute(input) {
      return {
        targetPageIds: input.pageNames.flatMap((name) => idsByName.get(name)!),
        targetPageNames: input.pageNames,
      }
    },
  }
}
