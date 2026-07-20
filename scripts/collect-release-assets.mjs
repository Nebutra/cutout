#!/usr/bin/env node
import { collectReleaseAssets, writeReleaseChecksums } from './lib/collect-release-assets.mjs'

const [command, ...values] = process.argv.slice(2)
const args = Object.fromEntries(values.map((value, index) => value.startsWith('--') ? [value.slice(2), values[index + 1]] : null).filter(Boolean))

if (command === 'collect') {
  if (!args.input || !args.output) throw new Error('Usage: collect-release-assets.mjs collect --input <dir> --output <dir>')
  const assets = await collectReleaseAssets({ inputDir: args.input, outputDir: args.output })
  process.stdout.write(`Collected ${assets.length} release assets.\n`)
} else if (command === 'checksums') {
  if (!args.directory) throw new Error('Usage: collect-release-assets.mjs checksums --directory <dir>')
  const path = await writeReleaseChecksums(args.directory)
  process.stdout.write(`Wrote release checksums to ${path}.\n`)
} else {
  throw new Error('Usage: collect-release-assets.mjs collect|checksums [options]')
}
