import { createHash } from 'node:crypto'

export function normalizeText(source) {
  return `${normalizeLineEndings(source).replace(/[ \t]+$/gm, '').trimEnd()}\n`
}

export function sha256NormalizedText(source) {
  return createHash('sha256').update(normalizeLineEndings(source)).digest('hex')
}

function normalizeLineEndings(source) {
  return source.replace(/\r\n?/g, '\n')
}
