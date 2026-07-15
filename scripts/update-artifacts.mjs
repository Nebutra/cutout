#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { buildReleaseDocuments, readSignedArtifact, sha256, validateUpdateManifest } from './lib/update-artifacts.mjs'

const [command, ...argv] = process.argv.slice(2)
const args = Object.fromEntries(argv.map((value, index) => value.startsWith('--') ? [value.slice(2), argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : 'true'] : null).filter(Boolean))
const json = (value) => `${JSON.stringify(value, null, 2)}\n`

if (command === 'validate') {
  const manifest = JSON.parse(await readFile(resolve(required('manifest')), 'utf8'))
  const signature = args.signature ? await readFile(resolve(args.signature), 'utf8') : undefined
  validateUpdateManifest(manifest, { expectedSignature: signature, allowedHosts: list(args['allowed-hosts']) })
  process.stdout.write(`Valid updater manifest ${manifest.version}.\n`)
} else if (command === 'generate') {
  const artifactPath = resolve(required('artifact')), signaturePath = resolve(args.signature ?? `${artifactPath}.sig`)
  const signed = await readSignedArtifact(artifactPath, signaturePath)
  const channel = args.channel ?? 'stable', output = resolve(args.output ?? 'dist/update')
  const documents = buildReleaseDocuments({ channel, version: required('version'), notes: args.notes, publishedAt: args['pub-date'] ?? new Date().toISOString(), artifactUrl: required('artifact-url'), signature: signed.signature, signatureFile: basename(signaturePath), artifactDigest: signed.digest, rolloutPercentage: Number(args.rollout ?? (channel === 'stable' ? 100 : 10)), previousVersion: args['previous-version'], previousManifestUrl: args['previous-manifest-url'], sourceRevision: args.revision ?? process.env.GITHUB_SHA ?? 'local', allowedHosts: list(args['allowed-hosts']), signingKeyPresent: Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY) })
  const directory = join(output, channel); await mkdir(directory, { recursive: true })
  const rendered = { 'latest.json': json(documents.manifest), 'rollout.json': json(documents.rollout), 'rollback.json': json(documents.rollback), 'sbom.spdx.json': json(documents.sbom), 'provenance.json': json(documents.provenance) }
  documents.metadata.sbom.sha256 = sha256(rendered['sbom.spdx.json'])
  documents.metadata.provenance.sha256 = sha256(rendered['provenance.json'])
  rendered['release-metadata.json'] = json(documents.metadata)
  await Promise.all(Object.entries(rendered).map(([name, value]) => writeFile(join(directory, name), value, { flag: 'wx' })))
  process.stdout.write(`Generated signed ${channel} updater metadata in ${directory}.\n`)
} else throw new Error('Usage: update-artifacts.mjs generate|validate [options]')

function required(name) { const value = args[name]; if (!value || value === 'true') throw new Error(`--${name} is required.`); return value }
function list(value) { return value ? value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean) : undefined }
