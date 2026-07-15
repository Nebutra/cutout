#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(resolve(root, path), 'utf8')
const parse = async (path) => JSON.parse(await read(path))

const manifest = await parse('cutout.agent-capabilities.json')
const schema = await parse('schemas/cutout.agent-capabilities.schema.json')
const packageJson = await parse('package.json')
const [headlessSchema, mcpSource, cliSource, designSchema] = await Promise.all([
  read('src/headless/schema.ts'), read('scripts/cutout-mcp.mjs'),
  read('scripts/cutout.mjs'), read('src/design-ir/schema.ts'),
])

const failures = []
const assert = (condition, message) => { if (!condition) failures.push(message) }
const unique = (values) => Array.isArray(values) && new Set(values).size === values.length

validateJsonSchema(schema, manifest, '$', failures)
assert(schema?.properties?.version?.const === manifest.version, 'Manifest version must match the JSON Schema const.')
assert(manifest.$schema === './schemas/cutout.agent-capabilities.schema.json', 'Manifest must point to the repository JSON Schema.')
assert(manifest.product?.packageVersion === packageJson.version, 'Manifest packageVersion must match package.json.')
assert(packageJson.scripts?.['agent:validate'] === 'node scripts/validate-agent-capabilities.mjs && node scripts/validate-product-skills.mjs', 'package.json must expose both Agent and product Skill validation.')
assert(manifest.protocol?.control === 'cutout.control.v1', 'Unexpected control protocol version.')
assert(designSchema.includes(`z.literal('${manifest.protocol?.designIr}')`), 'Design IR version drifted.')
assert(headlessSchema.includes(`HEADLESS_MANIFEST_VERSION = '${manifest.protocol?.manifest}'`), 'Headless manifest version drifted.')
assert(headlessSchema.includes(`HEADLESS_POLICY_VERSION = '${manifest.protocol?.policy}'`), 'Headless policy version drifted.')
assert(headlessSchema.includes(`ARTIFACT_INDEX_VERSION = '${manifest.protocol?.artifactIndex}'`), 'Artifact index version drifted.')

const enumMatch = headlessSchema.match(/const headlessOperationSchema = z\.enum\(\[([\s\S]*?)\]\)/)
const sourceOperations = enumMatch ? [...enumMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1]) : []
const manifestOperations = manifest.operations?.map((operation) => operation.type) ?? []
assert(sourceOperations.length > 0, 'Could not discover the headless operation enum.')
assert(unique(manifestOperations), 'Manifest operations must be unique.')
assert(equalSets(sourceOperations, manifestOperations), `Operation drift: source=[${sourceOperations}] manifest=[${manifestOperations}].`)

const sourceMcpTools = [...mcpSource.matchAll(/\bname: '(cutout_[a-z0-9_]+)',/g)].map((match) => match[1])
const manifestMcpTools = manifest.mcp?.tools ?? []
assert(sourceMcpTools.length > 0, 'Could not discover MCP tools.')
assert(unique(manifestMcpTools), 'Manifest MCP tools must be unique.')
assert(equalSets(sourceMcpTools, manifestMcpTools), `MCP tool drift: source=[${sourceMcpTools}] manifest=[${manifestMcpTools}].`)

for (const command of ['context', 'materials', 'validate', 'governance', 'patch', 'ingest', 'run', 'export-kit', 'export-brand-kit', 'export-starter', 'coding', 'registry']) {
  assert(cliSource.includes(`case '${command}':`), `Manifest depends on missing CLI command: ${command}.`)
}
assert(manifest.policy?.defaultMode === 'dry-run', 'The discovery contract must keep dry-run as the default.')
assert(manifest.limitations?.some((value) => value.includes('No live Figma sync')), 'Limitations must state that live Figma sync is absent.')
assert(manifest.limitations?.some((value) => value.includes('No web crawl or web search')), 'Limitations must state that web fetching/search is absent.')
assert(manifest.limitations?.some((value) => value.includes('No provider')), 'Limitations must state that the headless provider executor is absent.')
assert(unique(manifest.limitations), 'Manifest limitations must be unique.')
assert(manifest.externalControllers?.protocol === 'cutout.external-controller.v1', 'External controller protocol drifted.')
assert(manifest.externalControllers?.sandboxOwnership?.includes('external Agent owns'), 'External controller sandbox ownership must remain explicit.')
assert(manifest.integrations?.role?.includes('not external controllers'), 'Integrations must remain distinct from external controllers.')
for (const tool of manifest.externalControllers?.progressiveDisclosure ?? []) assert(manifestMcpTools.includes(tool), `External controller discovery tool is missing: ${tool}.`)

if (failures.length > 0) {
  process.stderr.write(`Cutout Agent capability validation failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`Cutout Agent capability contract valid: ${manifestOperations.length} operations, ${manifestMcpTools.length} MCP tools.\n`)
}

function equalSets(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value))
}

// Deliberately small Draft 2020-12 validator for the keywords used by this
// repository-owned schema. Source-surface checks below add semantic drift gates.
function validateJsonSchema(definition, value, path, errors) {
  if (definition.const !== undefined && value !== definition.const) errors.push(`${path} must equal ${JSON.stringify(definition.const)}.`)
  if (definition.enum && !definition.enum.includes(value)) errors.push(`${path} is not in the allowed enum.`)
  if (definition.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return errors.push(`${path} must be an object.`)
    for (const required of definition.required ?? []) if (!(required in value)) errors.push(`${path}.${required} is required.`)
    const properties = definition.properties ?? {}
    for (const [key, child] of Object.entries(value)) {
      if (properties[key]) validateJsonSchema(properties[key], child, `${path}.${key}`, errors)
      else if (definition.additionalProperties === false) errors.push(`${path}.${key} is not allowed.`)
      else if (definition.additionalProperties && typeof definition.additionalProperties === 'object') validateJsonSchema(definition.additionalProperties, child, `${path}.${key}`, errors)
    }
  } else if (definition.type === 'array') {
    if (!Array.isArray(value)) return errors.push(`${path} must be an array.`)
    if (definition.minItems !== undefined && value.length < definition.minItems) errors.push(`${path} has too few items.`)
    if (definition.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${path} items must be unique.`)
    if (definition.items) value.forEach((item, index) => validateJsonSchema(definition.items, item, `${path}[${index}]`, errors))
  } else if (definition.type === 'string') {
    if (typeof value !== 'string') return errors.push(`${path} must be a string.`)
    if (definition.minLength !== undefined && value.length < definition.minLength) errors.push(`${path} is too short.`)
    if (definition.pattern && !new RegExp(definition.pattern).test(value)) errors.push(`${path} does not match ${definition.pattern}.`)
  }
}
