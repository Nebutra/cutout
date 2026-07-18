import { parseEditableDesignMarkdown } from './design-md'
import { hasExportableTokens } from './design-md-export'

export interface DesignSystemValidationInput {
  readonly width: number
  readonly height: number
  readonly designMarkdown: string
}

export function designSystemMarkdownValidationError(designMarkdown: string): string | null {
  const markdown = designMarkdown.trim()
  if (!markdown.startsWith('---')) {
    return 'Design system documentation is missing YAML frontmatter.'
  }

  const model = parseEditableDesignMarkdown(markdown)
  if (model.frontmatterError) {
    return 'Design system documentation has invalid YAML frontmatter.'
  }
  if (!hasExportableTokens(model)) {
    return 'Design system documentation has no exportable design tokens.'
  }
  if (!model.controls.some((control) => control.kind === 'color')) {
    return 'Design system documentation has no color tokens.'
  }
  return null
}

export function designSystemValidationError(
  input: DesignSystemValidationInput,
): string | null {
  if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 1 || input.height < 1) {
    return 'Design system image has invalid dimensions.'
  }
  return designSystemMarkdownValidationError(input.designMarkdown)
}
