#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { parseSkillFrontmatter } from './lib/skill-frontmatter.mjs'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFile(resolve(root, path), 'utf8')
const json = async (path) => JSON.parse(await read(path))
const [catalog, manifest] = await Promise.all([
  json('skills/index.json'),
  json('cutout.agent-capabilities.json'),
])
const failures = []
const assert = (condition, message) => { if (!condition) failures.push(message) }
const operationByType = new Map(manifest.operations.map((item) => [item.type, item]))
const mcpTools = new Set(manifest.mcp.tools)
const ids = new Set()

assert(catalog.version === 'cutout.product-skills.v1', 'Unexpected skills catalog version.')
assert(catalog.skills.length === 20, 'Catalog must contain exactly 20 product skills.')

for (const skill of catalog.skills) {
  assert(!ids.has(skill.id), `Duplicate skill id: ${skill.id}.`)
  ids.add(skill.id)
  assert(skill.path === `skills/${skill.id}`, `${skill.id}: path must match id.`)
  assert(skill.reference.startsWith(`${skill.path}/references/`), `${skill.id}: reference must be one level below the skill.`)

  const skillFile = `${skill.path}/SKILL.md`
  const agentFile = `${skill.path}/agents/openai.yaml`
  const [source, agent] = await Promise.all([read(skillFile), read(agentFile)])
  await stat(resolve(root, skill.reference)).catch(() => failures.push(`${skill.id}: missing ${skill.reference}.`))
  const lines = source.split(/\r?\n/).length
  assert(lines >= 80 && lines <= 150, `${skill.id}: SKILL.md must be 80-150 lines; received ${lines}.`)
  assert(!source.includes('TODO'), `${skill.id}: SKILL.md contains TODO content.`)
  const frontmatter = parseSkillFrontmatter(source)
  assert(frontmatter, `${skill.id}: invalid YAML frontmatter.`)
  if (frontmatter) {
    const keys = [...frontmatter.matchAll(/^([a-zA-Z0-9_-]+):/gm)].map((match) => match[1])
    assert(keys.join(',') === 'name,description', `${skill.id}: frontmatter may contain only name and description.`)
    assert(frontmatter.includes(`name: ${skill.id}`), `${skill.id}: frontmatter name drift.`)
  }
  assert(agent.includes('interface:'), `${skill.id}: agents/openai.yaml lacks interface metadata.`)
  assert(agent.includes('display_name: "'), `${skill.id}: display_name must be quoted.`)
  assert(agent.includes('short_description: "'), `${skill.id}: short_description must be quoted.`)
  assert(agent.includes(`$${skill.id}`), `${skill.id}: default_prompt must mention $${skill.id}.`)
  assert(!/^dependencies:/m.test(agent), `${skill.id}: do not invent MCP dependencies.`)

  for (const operation of skill.operations) {
    assert(operationByType.has(operation), `${skill.id}: unknown operation ${operation}.`)
  }
  for (const tool of skill.mcpTools) {
    assert(mcpTools.has(tool), `${skill.id}: unknown MCP tool ${tool}.`)
  }
  const providerOperation = skill.operations.some((type) => operationByType.get(type)?.effect === 'provider-required')
  if (skill.status === 'provider-required') assert(providerOperation, `${skill.id}: provider-required status lacks provider operation.`)
  if (skill.status === 'available') assert(!providerOperation, `${skill.id}: available skill declares provider-required work.`)
  if (skill.status === 'internal-only') {
    assert(skill.operations.every((type) => type === 'validate'), `${skill.id}: internal-only skill exposes an executable operation.`)
  }
}

assert(manifest.discovery.skillsCatalog === 'skills/index.json', 'Capability manifest skillsCatalog drift.')
assert(manifest.discovery.skillsSchema === 'skills/schema.json', 'Capability manifest skillsSchema drift.')
assert(manifest.discovery.skillsValidationCommand === 'node scripts/validate-product-skills.mjs', 'Capability manifest skills validator drift.')

if (failures.length) {
  process.stderr.write(`Cutout product skill validation failed:\n${failures.map((value) => `- ${value}`).join('\n')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`Cutout product skills valid: ${catalog.skills.length} skills.\n`)
}
