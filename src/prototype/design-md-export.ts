/**
 * Derived read-only views of an editable DESIGN.md: Tailwind v4 `@theme`,
 * plain CSS variables, and W3C-style design-tokens JSON.
 *
 * These are previews computed from the parsed token controls (color/number),
 * not a second source of truth — DESIGN.md stays canonical and edits happen
 * there; the exports re-derive on every change.
 */
import type { EditableDesignControl, EditableDesignMarkdown } from './design-md'

export type DesignSourceFormat = 'design-md' | 'tailwind' | 'css-variables' | 'design-tokens'

interface ExportToken {
  readonly name: string
  readonly value: string
  readonly kind: 'color' | 'number'
}

export function cssName(label: string): string {
  const name = label
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return name || 'token'
}

function exportTokens(model: EditableDesignMarkdown): readonly ExportToken[] {
  const seen = new Set<string>()
  const tokens: ExportToken[] = []
  for (const control of model.controls) {
    if (control.kind === 'text') continue
    let name = cssName(control.label)
    while (seen.has(name)) name = `${name}-2`
    seen.add(name)
    tokens.push({ name, value: tokenValue(control), kind: control.kind })
  }
  return tokens
}

function tokenValue(control: EditableDesignControl): string {
  const value = control.value.trim()
  if (control.kind === 'number' && control.unit && !value.endsWith(control.unit)) {
    return `${value}${control.unit}`
  }
  return value
}

export function hasExportableTokens(model: EditableDesignMarkdown): boolean {
  return model.controls.some((control) => control.kind !== 'text')
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
