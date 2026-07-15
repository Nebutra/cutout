/**
 * Exposes Astryx theme compilation as a real tool the Agent can call from
 * natural language — the mapping (which DESIGN.md color goes to which
 * Astryx variable) is a decision the MODEL makes as tool-call arguments,
 * not something read off pre-existing dropdown state. The dropdown UI in
 * `AstryxMappingPanel` still exists as a second, deterministic entry point;
 * both terminate in the same `compileAstryxThemeFromDesignMarkdown`.
 */
import { z } from 'zod'
import type { AgentToolDefinition } from '@/agent-runtime/tool-loop'
import type { EditableDesignMarkdown } from '@/prototype/design-md'
import {
  astryxColorChoices,
  compileAstryxThemeFromDesignMarkdown,
  type AstryxColorChoice,
} from './astryx-design-md'
import type { AstryxBinding } from './astryx'

const astryxThemeToolInputSchema = z.object({
  themeName: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Lowercase letters, digits and hyphens only, starting with a letter.'),
  mapping: z.array(z.object({
    designTokenLabel: z.string().min(1).describe('The exact label of a DESIGN.md color token, e.g. "Primary".'),
    astryxVariable: z.string().regex(/^--[a-z][a-z0-9-]*$/, 'An Astryx CSS variable, e.g. "--color-accent".'),
    darkModeTokenLabel: z.string().min(1).optional()
      .describe('A second DESIGN.md color label to use for dark mode; omit to reuse the light value for both.'),
  })).min(1),
})

export type AstryxThemeToolInput = z.infer<typeof astryxThemeToolInputSchema>

/** A short, model-readable list of the colors available to map. */
export function describeAstryxColorChoices(choices: readonly AstryxColorChoice[]): string {
  if (!choices.length) return 'No color tokens are defined in DESIGN.md yet.'
  return choices.map((choice) => `- ${choice.label}: ${choice.value}`).join('\n')
}

function findChoice(choices: readonly AstryxColorChoice[], label: string): AstryxColorChoice | undefined {
  const needle = label.trim().toLocaleLowerCase()
  return choices.find((choice) => choice.label.trim().toLocaleLowerCase() === needle)
}

export function astryxThemeTool(
  model: EditableDesignMarkdown,
): AgentToolDefinition<AstryxThemeToolInput, AstryxBinding> {
  const choices = astryxColorChoices(model)
  return {
    name: 'compile_astryx_theme',
    description:
      'Compile an Astryx (astryx.atmeta.com) defineTheme file plus its supporting scaffold '
      + '(globals.css, usage.tsx, package snippet) from this project\'s DESIGN.md colors. '
      + 'Call this ONLY when the user explicitly asks to map/bind DESIGN.md colors to Astryx '
      + 'theme variables or to generate/compile an Astryx theme. Do not call this for a general '
      + 'request to change colors or design something new. '
      + `Available DESIGN.md colors:\n${describeAstryxColorChoices(choices)}`,
    inputSchema: astryxThemeToolInputSchema,
    isReadOnly: true,
    async execute(input) {
      const mappings = input.mapping.map((entry) => {
        const light = findChoice(choices, entry.designTokenLabel)
        if (!light) {
          throw new Error(`No DESIGN.md color token named "${entry.designTokenLabel}".`)
        }
        const dark = entry.darkModeTokenLabel ? findChoice(choices, entry.darkModeTokenLabel) : undefined
        if (entry.darkModeTokenLabel && !dark) {
          throw new Error(`No DESIGN.md color token named "${entry.darkModeTokenLabel}".`)
        }
        return { controlId: light.controlId, astryxVariable: entry.astryxVariable, darkControlId: dark?.controlId }
      })
      return compileAstryxThemeFromDesignMarkdown(model, input.themeName, mappings)
    },
  }
}
