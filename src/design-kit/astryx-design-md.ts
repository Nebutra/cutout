/**
 * Bridges an editable DESIGN.md's color tokens into a minimal Design IR
 * document so `compileAstryxBinding` (astryx.ts) can produce a real,
 * CLI-buildable `cutout.theme.ts`.
 *
 * DESIGN.md tokens don't carry Astryx variable names or light/dark pairs on
 * their own. `suggestAstryxMapping` proposes a mapping by matching common
 * token labels (Primary, Background, Text...) against the Astryx variables
 * most themes override — a starting point, not a guarantee. The caller (the
 * Source panel) shows every suggestion as an editable field and only compiles
 * once the user (or, when this is Agent-authored, the Agent) confirms it —
 * nothing here writes or ships silently.
 */
import type { DesignDocument, DesignToken } from '@/design-ir'
import type { EditableDesignMarkdown } from '@/prototype/design-md'
import { compileAstryxBinding, type AstryxBinding } from './astryx'

export interface AstryxColorChoice {
  readonly controlId: string
  readonly label: string
  readonly value: string
}

export interface AstryxTokenMapping {
  readonly controlId: string
  readonly astryxVariable: string
  /** A second DESIGN.md color control to use as the dark-mode value; omit to reuse the light value. */
  readonly darkControlId?: string
}

/** The DESIGN.md colors available to map, in document order. */
export function astryxColorChoices(model: EditableDesignMarkdown): readonly AstryxColorChoice[] {
  return model.controls
    .filter((control) => control.kind === 'color')
    .map((control) => ({ controlId: control.id, label: control.label, value: control.value }))
}

/**
 * The Astryx theme variables (astryx.atmeta.com/docs/tokens) most custom
 * themes override, ranked by how a label commonly maps to them. Order
 * matters: the first pattern to match a label wins.
 */
const ASTRYX_VARIABLE_HINTS: readonly { readonly variable: string; readonly patterns: readonly RegExp[] }[] = [
  { variable: '--color-accent', patterns: [/^(brand|primary|accent)$/, /(brand|primary|accent)/] },
  { variable: '--color-accent-muted', patterns: [/(primary|accent).*(muted|light|soft|tint)/] },
  { variable: '--color-on-accent', patterns: [/(on|text).*(accent|primary|brand)/] },
  { variable: '--color-background-body', patterns: [/^(background|bg|canvas|page)$/, /(background|canvas).*(body|page|main)/] },
  { variable: '--color-background-surface', patterns: [/(surface|card|panel)/] },
  { variable: '--color-text-primary', patterns: [/^(text|ink|foreground)$/, /(text|ink).*(primary|main|body)/] },
  { variable: '--color-text-secondary', patterns: [/(text|ink).*(secondary|muted|subtle)/] },
  { variable: '--color-border', patterns: [/^border$/, /border/] },
  { variable: '--color-success', patterns: [/success|positive|confirm/] },
  { variable: '--color-warning', patterns: [/warn|caution/] },
  { variable: '--color-error', patterns: [/error|danger|destructive|negative/] },
]

/** The curated variable choices offered in the mapping dropdown, plus a free-text "Custom..." escape hatch. */
export const ASTRYX_COMMON_VARIABLES: readonly string[] = [
  ...new Set(ASTRYX_VARIABLE_HINTS.map((hint) => hint.variable)),
  '--color-background-card',
  '--color-background-muted',
  '--color-brand',
].sort()

/** Best-effort label match against common Astryx variables; unmatched controls map to null. */
export function suggestAstryxMapping(
  choices: readonly AstryxColorChoice[],
): ReadonlyMap<string, string | null> {
  const used = new Set<string>()
  const suggestions = new Map<string, string | null>()
  for (const choice of choices) {
    const needle = choice.label.trim().toLocaleLowerCase()
    const hint = ASTRYX_VARIABLE_HINTS.find(
      ({ variable, patterns }) => !used.has(variable) && patterns.some((pattern) => pattern.test(needle)),
    )
    if (hint) used.add(hint.variable)
    suggestions.set(choice.controlId, hint?.variable ?? null)
  }
  return suggestions
}

export async function compileAstryxThemeFromDesignMarkdown(
  model: EditableDesignMarkdown,
  themeName: string,
  mappings: readonly AstryxTokenMapping[],
): Promise<AstryxBinding> {
  const colorControls = new Map(
    model.controls.filter((control) => control.kind === 'color').map((control) => [control.id, control]),
  )
  const now = new Date().toISOString()
  const tokens: DesignToken[] = [...colorControls.values()].map((control) => ({
    id: control.id,
    name: control.label,
    kind: 'color',
    value: control.value,
  }))
  const document: DesignDocument = {
    version: 'design-ir.v1',
    meta: { id: 'design-md', title: 'DESIGN.md', createdAt: now, updatedAt: now },
    revision: {
      id: 'design-md-current',
      number: 1,
      createdAt: now,
      author: { kind: 'import', id: 'design-md' },
    },
    needs: [],
    sources: [],
    brands: [],
    tokens,
    components: [],
    materials: [],
    provenance: [],
    relations: [],
  }
  return compileAstryxBinding({
    document,
    themeName,
    extends: 'neutral',
    tokens: mappings.map((mapping) => ({
      astryxVariable: mapping.astryxVariable,
      lightTokenId: mapping.controlId,
      darkTokenId: mapping.darkControlId,
    })),
    components: [],
  })
}
