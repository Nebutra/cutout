import { parseDocument, stringify } from 'yaml'

export interface ParsedDesignMarkdown {
  readonly frontmatter: string | null
  readonly body: string
}

export type EditableDesignControlKind = 'color' | 'number' | 'text'

export interface EditableDesignValueMeta {
  readonly kind: EditableDesignControlKind
  readonly unit: string | null
  readonly min: number
  readonly max: number
}

export interface EditableDesignControl {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly kind: EditableDesignControlKind
  readonly unit: string | null
  readonly min: number
  readonly max: number
  readonly source:
    | { readonly type: 'frontmatter'; readonly path: readonly string[] }
    | { readonly type: 'body-line'; readonly lineIndex: number }
}

export interface EditableDesignSection {
  readonly id: string
  readonly title: string
  readonly level: number
  readonly body: string
  readonly startLine: number
  readonly contentStartLine: number
  readonly endLine: number
}

export interface EditableDesignTable {
  readonly id: string
  readonly startLine: number
  readonly endLine: number
  readonly headers: readonly string[]
  readonly rows: readonly (readonly string[])[]
}

export interface EditableDesignMarkdown {
  readonly frontmatter: Record<string, unknown> | null
  readonly frontmatterError: string | null
  readonly body: string
  readonly sections: readonly EditableDesignSection[]
  readonly tables: readonly EditableDesignTable[]
  readonly controls: readonly EditableDesignControl[]
}

export function parseEditableDesignValue(value: string): EditableDesignValueMeta {
  return controlValueMeta(value)
}

export function editableDesignValueLiteral(value: string): string {
  return unwrapInlineCode(value.trim()).inner
}

export function formatEditedDesignValue(previousValue: string, nextValue: string): string {
  const previous = previousValue.trim()
  const wrapped = unwrapInlineCode(previous)
  if (!wrapped.marker) return nextValue
  const next = unwrapInlineCode(nextValue.trim()).inner
  return `${wrapped.marker}${next}${wrapped.marker}`
}

export function isDesignMarkdownFileName(name: string): boolean {
  const lower = name.trim().toLowerCase()
  return (
    lower === 'design.md' ||
    lower.endsWith('/design.md') ||
    lower.endsWith('.design.md') ||
    lower.endsWith('.md') ||
    lower.endsWith('.markdown')
  )
}

export function parseDesignMarkdown(content: string): ParsedDesignMarkdown {
  const text = content.replace(/^\uFEFF/, '')
  if (!text.startsWith('---\n')) return { frontmatter: null, body: text }

  const end = text.indexOf('\n---', 4)
  if (end < 0) return { frontmatter: null, body: text }

  const afterFence = text.slice(end + 4)
  const body = afterFence.startsWith('\n') ? afterFence.slice(1) : afterFence
  return {
    frontmatter: text.slice(4, end).trim(),
    body,
  }
}

export function normalizedDesignMarkdown(content: string): string {
  return content.replace(/^\uFEFF/, '').trim()
}

export function parseEditableDesignMarkdown(content: string): EditableDesignMarkdown {
  const parsed = parseDesignMarkdown(content)
  const frontmatterResult = parseFrontmatter(parsed.frontmatter)
  const sections = parseSections(parsed.body)
  const tables = parseTables(parsed.body)
  const ignoredLines = ignoredBodyLineIndexes(parsed.body, tables)
  return {
    frontmatter: frontmatterResult.value,
    frontmatterError: frontmatterResult.error,
    body: parsed.body,
    sections,
    tables,
    controls: [
      ...frontmatterControls(frontmatterResult.value),
      ...bodyControls(parsed.body, ignoredLines),
    ],
  }
}

export function updateDesignMarkdownControl(
  content: string,
  control: EditableDesignControl,
  nextValue: string,
): string {
  if (control.source.type === 'frontmatter') {
    return updateFrontmatterValue(content, control.source.path, nextValue)
  }
  return updateBodyLineValue(content, control.source.lineIndex, nextValue)
}

export function updateDesignMarkdownSection(
  content: string,
  section: EditableDesignSection,
  nextBody: string,
): string {
  const parsed = parseDesignMarkdown(content)
  const bodyLines = parsed.body.split('\n')
  const normalizedBody = nextBody.replace(/\r\n?/g, '\n')
  const replacement = normalizedBody.length > 0 ? normalizedBody.split('\n') : []
  bodyLines.splice(
    section.contentStartLine,
    Math.max(0, section.endLine - section.contentStartLine),
    ...replacement,
  )
  return composeDesignMarkdown(parsed.frontmatter, bodyLines.join('\n'))
}

export function appendDesignMarkdownSection(content: string): string {
  const parsed = parseDesignMarkdown(content)
  const body = parsed.body.trimEnd()
  const nextBody = `${body}${body ? '\n\n' : ''}## New section\nDescribe the design rule.`
  return composeDesignMarkdown(parsed.frontmatter, nextBody)
}

export function removeDesignMarkdownSection(
  content: string,
  section: EditableDesignSection,
): string {
  const parsed = parseDesignMarkdown(content)
  const bodyLines = parsed.body.split('\n')
  bodyLines.splice(section.startLine, Math.max(1, section.endLine - section.startLine))
  return composeDesignMarkdown(parsed.frontmatter, bodyLines.join('\n').replace(/^\n+/, '').trimEnd())
}

export function updateDesignMarkdownTableCell(
  content: string,
  table: EditableDesignTable,
  row: 'header' | number,
  cellIndex: number,
  nextValue: string,
): string {
  const parsed = parseDesignMarkdown(content)
  const bodyLines = parsed.body.split('\n')
  const targetLine = row === 'header' ? table.startLine : table.startLine + 2 + row
  if (targetLine < table.startLine || targetLine >= table.endLine) return content
  const cells = splitTableRow(bodyLines[targetLine] ?? '')
  if (cellIndex < 0 || cellIndex >= cells.length) return content
  cells[cellIndex] = nextValue
  bodyLines[targetLine] = formatTableRow(cells)
  return composeDesignMarkdown(parsed.frontmatter, bodyLines.join('\n'))
}

export function appendDesignMarkdownTableRow(
  content: string,
  table: EditableDesignTable,
): string {
  const parsed = parseDesignMarkdown(content)
  const bodyLines = parsed.body.split('\n')
  const row = table.headers.map(() => 'New value')
  bodyLines.splice(table.endLine, 0, formatTableRow(row))
  return composeDesignMarkdown(parsed.frontmatter, bodyLines.join('\n'))
}

export function removeDesignMarkdownTableRow(
  content: string,
  table: EditableDesignTable,
  rowIndex: number,
): string {
  const parsed = parseDesignMarkdown(content)
  const bodyLines = parsed.body.split('\n')
  const targetLine = table.startLine + 2 + rowIndex
  if (targetLine < table.startLine + 2 || targetLine >= table.endLine) return content
  bodyLines.splice(targetLine, 1)
  return composeDesignMarkdown(parsed.frontmatter, bodyLines.join('\n'))
}

function parseFrontmatter(
  frontmatter: string | null,
): { readonly value: Record<string, unknown> | null; readonly error: string | null } {
  if (!frontmatter) return { value: null, error: null }
  try {
    const parsed = parseDocument(frontmatter).toJSON()
    if (!isRecord(parsed)) {
      return { value: null, error: 'Frontmatter is not an object.' }
    }
    return { value: parsed, error: null }
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function frontmatterControls(
  frontmatter: Record<string, unknown> | null,
): EditableDesignControl[] {
  if (!frontmatter) return []
  const controls: EditableDesignControl[] = []

  function visit(value: unknown, path: readonly string[]): void {
    if (path.length > 3) return
    if (isRecord(value)) {
      for (const [key, nested] of Object.entries(value)) {
        visit(nested, [...path, key])
      }
      return
    }
    if (Array.isArray(value)) return
    if (typeof value !== 'string' && typeof value !== 'number') return

    const rawValue = String(value)
    const meta = controlValueMeta(rawValue)
    if (!isUsefulFrontmatterControl(path, rawValue, meta)) return

    controls.push({
      id: `frontmatter:${path.join('.')}`,
      label: path.join('.'),
      value: rawValue,
      ...meta,
      source: { type: 'frontmatter', path },
    })
  }

  visit(frontmatter, [])
  return controls
}

function parseSections(body: string): EditableDesignSection[] {
  const lines = body.split('\n')
  const ignored = ignoredBodyLineIndexes(body, parseTables(body))
  const headings: Array<{ title: string; level: number; line: number }> = []
  lines.forEach((line, index) => {
    if (ignored.has(index)) return
    const match = /^(#{1,4})\s+(.+?)\s*$/.exec(line)
    if (!match) return
    headings.push({
      level: match[1].length,
      title: match[2].trim(),
      line: index,
    })
  })

  return headings.map((heading, index) => {
    const next = headings[index + 1]
    const endLine = next?.line ?? lines.length
    return {
      id: `section:${heading.line}:${slugify(heading.title)}`,
      title: heading.title,
      level: heading.level,
      startLine: heading.line,
      contentStartLine: heading.line + 1,
      endLine,
      body: lines.slice(heading.line + 1, endLine).join('\n').trim(),
    }
  })
}

function parseTables(body: string): EditableDesignTable[] {
  const lines = body.split('\n')
  const tables: EditableDesignTable[] = []
  let index = 0
  let inFence = false

  while (index < lines.length - 1) {
    if (/^\s*```/.test(lines[index] ?? '')) {
      inFence = !inFence
      index += 1
      continue
    }
    if (inFence) {
      index += 1
      continue
    }

    if (!isMarkdownTableRow(lines[index]) || !isMarkdownTableSeparator(lines[index + 1] ?? '')) {
      index += 1
      continue
    }

    const startLine = index
    const headers = splitTableRow(lines[index])
    let endLine = index + 2
    const rows: string[][] = []
    while (
      endLine < lines.length &&
      !/^\s*```/.test(lines[endLine] ?? '') &&
      isMarkdownTableRow(lines[endLine] ?? '')
    ) {
      rows.push(splitTableRow(lines[endLine] ?? ''))
      endLine += 1
    }

    tables.push({
      id: `table:${startLine}:${headers.join('-').slice(0, 48)}`,
      startLine,
      endLine,
      headers,
      rows,
    })
    index = endLine
  }

  return tables
}

function ignoredBodyLineIndexes(
  body: string,
  tables: readonly EditableDesignTable[],
): Set<number> {
  const ignored = new Set<number>()
  for (const table of tables) {
    for (let index = table.startLine; index < table.endLine; index += 1) {
      ignored.add(index)
    }
  }

  let inFence = false
  body.split('\n').forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      ignored.add(index)
      return
    }
    if (inFence) ignored.add(index)
  })

  return ignored
}

function bodyControls(
  body: string,
  ignoredLines: ReadonlySet<number>,
): EditableDesignControl[] {
  return body
    .split('\n')
    .map((line, index): EditableDesignControl | null => {
      if (ignoredLines.has(index)) return null
      const match = /^(\s*[-*]\s+)([^:\n|]{2,48}):\s*(.+?)\s*$/.exec(line)
      if (!match) return null
      const label = match[2].trim()
      const value = match[3].trim()
      const meta = controlValueMeta(value)
      if (
        label.startsWith('http') ||
        label.includes('|') ||
        value.includes('|') ||
        value.length > 120 ||
        !isDesignControlLabel(label) ||
        !isDesignControlValue(label, value, meta)
      ) {
        return null
      }
      return {
        id: `body-line:${index}:${slugify(label)}`,
        label,
        value,
        ...meta,
        source: { type: 'body-line', lineIndex: index },
      }
    })
    .filter((control): control is EditableDesignControl => Boolean(control))
}

function isDesignControlLabel(label: string): boolean {
  return /color|colour|radius|rounded|spacing|gap|padding|margin|size|width|height|opacity|shadow|font|type|line|letter|token|primary|secondary|accent|surface|background|foreground|border|颜色|圆角|间距|字号|字体|行高|透明|阴影|宽|高|主色|背景|前景|边框/i.test(label)
}

function isDesignControlValue(
  label: string,
  value: string,
  meta: EditableDesignValueMeta,
): boolean {
  if (meta.kind !== 'text') return true
  if (value.length > 64 || looksLikeParagraph(value) || looksLikeMarkdownJunk(value)) return false
  return /font|type|weight|family|style|mode|tone|language|字体|字重|风格|模式|语言|状态/i.test(label)
}

function controlValueMeta(value: string): EditableDesignValueMeta {
  const literal = editableDesignValueLiteral(value)
  const color = /#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?/i.exec(literal)
  if (color) {
    return { kind: 'color', unit: null, min: 0, max: 100 }
  }

  const numeric = /^-?\d+(?:\.\d+)?\s*(px|%|rem|em|vh|vw|s|ms)?$/i.exec(literal.trim())
  if (numeric) {
    const amount = Number.parseFloat(literal)
    const unit = numeric[1] ?? null
    const max = unit === '%' ? 100 : Math.max(100, Math.ceil(Math.abs(amount) * 2 || 100))
    return {
      kind: 'number',
      unit,
      min: unit === '%' || amount >= 0 ? 0 : Math.floor(amount * 2),
      max,
    }
  }

  return { kind: 'text', unit: null, min: 0, max: 100 }
}

function isUsefulFrontmatterControl(
  path: readonly string[],
  value: string,
  meta: EditableDesignValueMeta,
): boolean {
  if (path.length === 0 || path.length > 4) return false
  if (looksLikeMarkdownJunk(value)) return false
  if (meta.kind !== 'text') return true

  const root = path[0].toLowerCase()
  const leaf = path.at(-1)?.toLowerCase() ?? ''
  if (value.length > 96 || looksLikeParagraph(value)) return false

  if (
    ['version', 'name', 'product', 'platform', 'orientation', 'style', 'language', 'source']
      .includes(root)
  ) {
    return path.length === 1
  }

  if (
    ['colors', 'color', 'typography', 'spacing', 'rounded', 'radius', 'radii', 'components']
      .includes(root)
  ) {
    return /name|family|weight|style|token|size|line|letter|radius|spacing|gap|padding|margin|color|state|variant|名称|字体|字重|字号|行高|圆角|间距|颜色|状态|样式/i
      .test(leaf)
  }

  return false
}

function updateFrontmatterValue(
  content: string,
  path: readonly string[],
  nextValue: string,
): string {
  const parsed = parseDesignMarkdown(content)
  const current = parseFrontmatter(parsed.frontmatter).value ?? {}
  const next = cloneRecord(current)
  setAtPath(next, path, coerceValue(nextValue, getAtPath(current, path)))
  return composeDesignMarkdown(stringify(next).trimEnd(), parsed.body)
}

function updateBodyLineValue(
  content: string,
  lineIndex: number,
  nextValue: string,
): string {
  const parsed = parseDesignMarkdown(content)
  const bodyLines = parsed.body.split('\n')
  const line = bodyLines[lineIndex]
  if (!line) return content
  const match = /^(\s*(?:[-*]\s*)?[^:\n]{2,48}:\s*)(.+?)\s*$/.exec(line)
  if (!match) return content
  bodyLines[lineIndex] = `${match[1]}${nextValue}`
  return composeDesignMarkdown(parsed.frontmatter, bodyLines.join('\n'))
}

function isMarkdownTableRow(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed.includes('|')) return false
  if (/^```/.test(trimmed)) return false
  return splitTableRow(trimmed).length >= 2
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = splitTableRow(line)
  if (cells.length < 2) return false
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim()
  const withoutOuter = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let cell = ''
  let escaped = false

  for (const char of withoutOuter) {
    if (char === '|' && !escaped) {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += char
    }
    escaped = !escaped && char === '\\'
  }

  cells.push(cell.trim())
  return cells
}

function formatTableRow(cells: readonly string[]): string {
  return `| ${cells.map((cell) => cell.trim()).join(' | ')} |`
}

function unwrapInlineCode(value: string): { readonly inner: string; readonly marker: string | null } {
  const match = /^(`+)([\s\S]*?)\1$/.exec(value)
  if (!match) return { inner: value, marker: null }
  return { inner: match[2], marker: match[1] }
}

function composeDesignMarkdown(frontmatter: string | null, body: string): string {
  const normalizedBody = body.replace(/^\n+/, '')
  if (!frontmatter) return normalizedBody
  return `---\n${frontmatter.trim()}\n---\n${normalizedBody}`
}

function getAtPath(record: Record<string, unknown>, path: readonly string[]): unknown {
  let current: unknown = record
  for (const key of path) {
    if (!isRecord(current)) return undefined
    current = current[key]
  }
  return current
}

function setAtPath(record: Record<string, unknown>, path: readonly string[], value: unknown): void {
  let current: Record<string, unknown> = record
  path.slice(0, -1).forEach((key) => {
    if (!isRecord(current[key])) current[key] = {}
    current = current[key] as Record<string, unknown>
  })
  const key = path.at(-1)
  if (key) current[key] = value
}

function coerceValue(value: string, previous: unknown): unknown {
  if (typeof previous === 'number') {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : previous
  }
  return value
}

function cloneRecord(record: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(record) as Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function looksLikeParagraph(value: string): boolean {
  const text = unwrapInlineCode(value.trim()).inner
  if (text.length > 72) return true
  const punctuationCount = (text.match(/[，。,.；;:：]/g) ?? []).length
  const wordCount = text.split(/\s+/).filter(Boolean).length
  return punctuationCount >= 2 || wordCount >= 10
}

function looksLikeMarkdownJunk(value: string): boolean {
  const text = unwrapInlineCode(value.trim()).inner
  if (!text) return true
  if (/^[|\-:—_\s`]+$/.test(text)) return true
  const signal = text.match(/[a-z0-9\u4e00-\u9fa5#%]/gi)?.length ?? 0
  return signal === 0
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}
