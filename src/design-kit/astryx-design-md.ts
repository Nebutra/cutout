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

/**
 * Produces a complete no-setup mapping for the common theme roles. Explicit
 * token labels win; unlabelled palettes are assigned by visual role so a user
 * can export a usable theme without becoming an Astryx token expert. Any
 * remaining colors are still exported as namespaced custom properties.
 */
export function automaticAstryxMapping(
  choices: readonly AstryxColorChoice[],
): ReadonlyMap<string, string | null> {
  const mapping = new Map(suggestAstryxMapping(choices))
  const assigned = new Set([...mapping.values()].filter((value): value is string => value !== null))
  const available = (variable: string) => !assigned.has(variable)
  const unassigned = () => choices.filter((choice) => mapping.get(choice.controlId) === null)
  const assign = (variable: string, pick: (items: readonly AstryxColorChoice[]) => AstryxColorChoice | undefined) => {
    if (!available(variable)) return
    const choice = pick(unassigned())
    if (!choice) return
    mapping.set(choice.controlId, variable)
    assigned.add(variable)
  }

  assign('--color-background-body', (items) => brightest(items))
  assign('--color-background-surface', (items) => brightest(items))
  assign('--color-text-primary', (items) => darkest(items))
  assign('--color-accent', (items) => mostSaturated(items))
  assign('--color-border', (items) => brightest(items))

  return mapping
}

function rgb(value: string): readonly [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim())
  if (!match) return null
  const number = Number.parseInt(match[1], 16)
  return [(number >> 16) & 0xff, (number >> 8) & 0xff, number & 0xff]
}

function brightness(items: readonly AstryxColorChoice[], direction: 1 | -1): AstryxColorChoice | undefined {
  return [...items].sort((left, right) => {
    const a = rgb(left.value)
    const b = rgb(right.value)
    const aValue = a ? a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722 : 0
    const bValue = b ? b[0] * 0.2126 + b[1] * 0.7152 + b[2] * 0.0722 : 0
    return direction * (bValue - aValue)
  })[0]
}

function brightest(items: readonly AstryxColorChoice[]) { return brightness(items, 1) }
function darkest(items: readonly AstryxColorChoice[]) { return brightness(items, -1) }

function mostSaturated(items: readonly AstryxColorChoice[]): AstryxColorChoice | undefined {
  return [...items].sort((left, right) => {
    const a = rgb(left.value)
    const b = rgb(right.value)
    const aValue = a ? Math.max(...a) - Math.min(...a) : 0
    const bValue = b ? Math.max(...b) - Math.min(...b) : 0
    return bValue - aValue
  })[0]
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
