/**
 * Derived read-only views of an editable DESIGN.md: Tailwind v4 `@theme`,
 * plain CSS variables, and W3C-style design-tokens JSON.
 *
 * These are previews computed from the parsed token controls (color/number),
 * not a second source of truth — DESIGN.md stays canonical and edits happen
 * there; the exports re-derive on every change.
 */
import type { DesignToken } from '@/design-ir'
import {
  editableDesignValueLiteral,
  type EditableDesignControl,
  type EditableDesignMarkdown,
} from './design-md'

export type DesignSourceFormat = 'design-md' | 'tailwind' | 'css-variables' | 'design-tokens'

interface ExportToken {
  readonly controlId: string
  readonly label: string
  readonly name: string
  readonly value: string
  readonly kind: 'color' | 'number'
}

export interface DesignMarkdownTokenProjectionOptions {
  readonly provenanceId: string
}

export function cssName(label: string): string {
  const name = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/g, '')
  return name || 'token'
}

function exportTokens(model: EditableDesignMarkdown): readonly ExportToken[] {
  const occurrences = new Map<string, number>()
  const tokens: ExportToken[] = []
  for (const control of model.controls) {
    if (control.kind === 'text') continue
    const baseName = cssName(control.label)
    const occurrence = (occurrences.get(baseName) ?? 0) + 1
    occurrences.set(baseName, occurrence)
    const suffix = occurrence === 1 ? '' : `-${occurrence}`
    const name = `${baseName.slice(0, 100 - suffix.length)}${suffix}`
    tokens.push({
      controlId: control.id,
      label: control.label,
      name,
      value: tokenValue(control),
      kind: control.kind,
    })
  }
  return tokens
}

function tokenValue(control: EditableDesignControl): string {
  const value = editableDesignValueLiteral(control.value)
  if (control.kind === 'number' && control.unit && !value.endsWith(control.unit)) {
    return `${value}${control.unit}`
  }
  return value
}

export function hasExportableTokens(model: EditableDesignMarkdown): boolean {
  return model.controls.some((control) => control.kind !== 'text')
}

/**
 * Project a validated DESIGN.md into stable Design IR token values. Callers
 * retain authority over promotion; this function only derives deterministic
 * token identities, kinds, values, and provenance from the parsed controls.
 */
export function projectDesignMarkdownTokens(
  model: EditableDesignMarkdown,
  options: DesignMarkdownTokenProjectionOptions,
): readonly DesignToken[] {
  const provenanceId = options.provenanceId.trim()
  if (!provenanceId || provenanceId.length > 160) {
    throw new Error('DESIGN.md token projection requires a provenance id.')
  }
  if (model.frontmatter === null || model.frontmatterError) {
    throw new Error('DESIGN.md token projection requires valid YAML frontmatter.')
  }

  const tokens = exportTokens(model)
  if (!tokens.length || !tokens.some((token) => token.kind === 'color')) {
    throw new Error('DESIGN.md token projection requires exportable color tokens.')
  }

  return tokens.map((token) => {
    const kind = designTokenKind(token)
    return {
      id: `token:design-md:${kind}:${token.name}`,
      name: token.label,
      kind,
      value: token.value,
      provenanceId,
    }
  })
}

function designTokenKind(token: ExportToken): DesignToken['kind'] {
  if (token.kind === 'color') return 'color'
  const semanticName = `${token.controlId} ${token.label}`
  if (/radius|rounded|radii|corner|圆角/i.test(semanticName)) return 'radius'
  if (/font|typography|type|line-height|lineheight|letter-spacing|字号|字体|行高|字距/i.test(semanticName)) {
    return 'typography'
  }
  return 'spacing'
}

export function designMarkdownToCssVariables(model: EditableDesignMarkdown): string {
  const tokens = exportTokens(model)
  if (!tokens.length) return ':root {\n}\n'
  const lines = tokens.map((token) => `  --${token.name}: ${token.value};`)
  return `:root {\n${lines.join('\n')}\n}\n`
}

export function designMarkdownToTailwindTheme(model: EditableDesignMarkdown): string {
  const tokens = exportTokens(model)
  if (!tokens.length) return '@theme {\n}\n'
  const colors = tokens.filter((token) => token.kind === 'color')
  const others = tokens.filter((token) => token.kind !== 'color')
  const lines: string[] = []
  if (colors.length) {
    lines.push('  /* Colors */')
    for (const token of colors) {
      const name = token.name.startsWith('color-') ? token.name : `color-${token.name}`
      lines.push(`  --${name}: ${token.value};`)
    }
  }
  if (others.length) {
    if (lines.length) lines.push('')
    lines.push('  /* Scale */')
    for (const token of others) lines.push(`  --${token.name}: ${token.value};`)
  }
  return `@theme {\n${lines.join('\n')}\n}\n`
}

export function designMarkdownToTokensJson(model: EditableDesignMarkdown): string {
  const tokens = exportTokens(model)
  const json: Record<string, { readonly $type: string; readonly $value: string }> = {}
  for (const token of tokens) {
    json[token.name] = {
      $type: token.kind === 'color' ? 'color' : 'dimension',
      $value: token.value,
    }
  }
  return `${JSON.stringify(json, null, 2)}\n`
}

export function renderDesignSource(
  format: DesignSourceFormat,
  content: string,
  model: EditableDesignMarkdown,
): string {
  switch (format) {
    case 'design-md':
      return content
    case 'tailwind':
      return designMarkdownToTailwindTheme(model)
    case 'css-variables':
      return designMarkdownToCssVariables(model)
    case 'design-tokens':
      return designMarkdownToTokensJson(model)
  }
}
