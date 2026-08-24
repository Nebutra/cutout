import { readFile } from 'node:fs/promises'

const [path, identityHeading, mediaHeading, sourceValueLabel] = process.argv.slice(2)
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
let text = await readFile(path, 'utf8')
const identity = new RegExp(`(^## ${escapeRegExp(identityHeading)}\\s*$)[\\s\\S]*?(?=^## ${escapeRegExp(mediaHeading)}\\s*$)`, 'mu')
text = text.replace(identity, '$1\n').split(/\r?\n/u).map((line) => {
  if (!/^\s*- /u.test(line) || !/`[^`\r\n]+\/[^`\r\n]+`\s*$/u.test(line)) return line
  return line
    .replace(/^(\s*-\s+)\*\*`[^`\r\n]*`\*\*/u, '$1')
    .replace(new RegExp(`\\(${escapeRegExp(sourceValueLabel)}: \\x60[^\\x60\\r\\n]*\\x60\\)`, 'gu'), '')
    .replace(/\s+`[^`\r\n]+\/[^`\r\n]+`\s*$/u, '')
}).join('\n')

for (const [index, line] of text.split('\n').entries()) {
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(line)) {
    process.stdout.write(`${index + 1}: ${line}\n`)
  }
}
