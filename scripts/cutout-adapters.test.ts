import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { createNodeFsRuntimeStore, type HeadlessProjectState } from '@/headless'
import type { BrandKitInput } from '@/brand-kit'
import { compileHeadlessDesignKit } from '@/design-kit'
import { compileComponentCandidates } from '@/components-compiler'
import { compileStarter } from '@/starter-compiler'
import { createHeadlessRuntime } from '@/headless'
import { redactControlValue } from '@/control-protocol'
import { githubIntegrationManifest } from '@/integration-sdk/github'
import { notionIntegrationManifest } from '@/integration-sdk/notion'

function state(): HeadlessProjectState {
  return {
    manifest: {
      version: 'cutout.manifest.v1',
      project: { id: 'adapter-project', name: 'Adapter Project' },
      files: {
        designIr: 'design-ir.json', designMarkdown: 'DESIGN.md', artifactIndex: 'artifacts.json',
        policy: 'policy.json', controlLedger: 'control-ledger.json',
      },
    },
    design: {
      version: 'design-ir.v1',
      meta: { id: 'adapter-project', title: 'Adapter Project', createdAt: '2026-07-10T00:00:00.000Z', updatedAt: '2026-07-10T00:00:00.000Z' },
      revision: { id: 'adapter-r1', number: 1, createdAt: '2026-07-10T00:00:00.000Z', author: { kind: 'human', id: 'tester' } },
      needs: [],
      sources: [
        { id: 'logo-source', kind: 'document', role: 'brand-asset', title: 'Approved logo', license: { kind: 'proprietary', holder: 'Adapter Co' }, content: [{ id: 'logo-content', uri: `sha256:${'c'.repeat(64)}`, sha256: 'c'.repeat(64), mediaType: 'image/svg+xml' }] },
        { id: 'guide-source', kind: 'document', role: 'evidence', title: 'Approved guide', license: { kind: 'proprietary', holder: 'Adapter Co' }, content: [{ id: 'guide-content', uri: `sha256:${'c'.repeat(64)}`, sha256: 'c'.repeat(64), mediaType: 'text/markdown' }] },
      ],
      brands: [{ id: 'brand:adapter', name: 'Adapter Co', status: 'active', provenanceId: 'logo-import' }],
      tokens: [{ id: 'color-primary', name: 'color.primary', kind: 'color', value: '#111111' }],
      components: [],
      materials: [{
        id: 'page-home', kind: 'prototype-page', name: 'Home', currentRevisionId: 'page-home-r1',
        revisions: [{ id: 'page-home-r1', ordinal: 1, createdAt: '2026-07-10T00:00:00.000Z', content: { id: 'page-content', uri: `sha256:${'c'.repeat(64)}`, sha256: 'c'.repeat(64), mediaType: 'image/png' } }],
      }],
      provenance: [
        { id: 'logo-import', operation: 'import', sourceIds: ['logo-source'], actor: { kind: 'human', id: 'tester' }, recordedAt: '2026-07-10T00:00:00.000Z' },
        { id: 'guide-import', operation: 'import', sourceIds: ['guide-source'], actor: { kind: 'human', id: 'tester' }, recordedAt: '2026-07-10T00:00:00.000Z' },
      ], relations: [],
    },
    designMarkdown: '# Adapter Project',
    artifactIndex: { version: 'cutout.artifacts.v1', artifacts: [{ sha256: 'c'.repeat(64), mediaType: 'image/png', byteLength: 12 }] },
    policy: {
      version: 'cutout.policy.v1', allowApply: true,
      allowedOperations: ['project.context', 'material.list', 'validate', 'design.patch', 'tokens.patch', 'source.ingest', 'run.start', 'run.get', 'run.events', 'run.cancel', 'export.design-kit', 'export.brand-kit', 'export.starter'],
      requireApprovalForExternal: true,
    },
  }
}

function brandInput(): BrandKitInput {
  const logo = { sourceId: 'logo-source', contentId: 'logo-content', provenanceId: 'logo-import' }
  const guide = { sourceId: 'guide-source', contentId: 'guide-content', provenanceId: 'guide-import' }
  return {
    document: state().design,
    brand: {
      brandId: 'brand:adapter', logo: { variants: [{ id: 'logo-primary', label: 'Primary logo', kind: 'primary', evidence: logo }] },
      clearspace: { rule: 'One cap height.', evidence: guide }, minSize: [{ logoId: 'logo-primary', width: 24, unit: 'px', evidence: guide }],
      colors: [{ id: 'color-primary', name: 'Primary', cssName: 'primary', value: '#0EA5E9', evidence: guide }],
      type: [{ id: 'type-body', role: 'body', family: 'Adapter Sans', evidence: logo }],
      icon: { guidance: 'Use round strokes.', evidence: guide }, photo: { guidance: 'Use approved photography.', evidence: guide }, voice: { guidance: 'Be concise.', evidence: guide },
      assetRecipes: [{ id: 'og-image', name: 'Open Graph', kind: 'social-image', instructions: 'Use the approved logo.', evidence: guide }],
    },
  }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'cutout-adapter-'))
  await createNodeFsRuntimeStore(root).save(state())
  return root
}

async function declaredMcpTools(): Promise<string[]> {
  const manifest = JSON.parse(await readFile(join(process.cwd(), 'cutout.agent-capabilities.json'), 'utf8')) as {
    mcp?: { tools?: unknown }
  }
  if (!Array.isArray(manifest.mcp?.tools) || !manifest.mcp.tools.every((tool): tool is string => typeof tool === 'string')) {
    throw new Error('cutout.agent-capabilities.json must declare a string MCP tool list.')
  }
  return manifest.mcp.tools
}

function journeyState(): HeadlessProjectState {
  const initial = state()
  return {
    ...initial,
    design: {
      ...initial.design,
      sources: [],
      brands: [],
      provenance: [],
      components: [{ id: 'component:button', name: 'Button', status: 'ready', tokenIds: ['color-primary'] }],
      prototype: {
        id: 'prototype:journey',
        plan: {
          version: 'prototype-plan.v0',
          product: { name: 'Journey', summary: 'Agent-native contract fixture.', audience: 'Designers', primaryGoal: 'Create a verified starter.', platform: 'web' },
          designSystem: {
            styleSummary: 'Quiet and direct', palette: ['#111111'], typography: 'System UI', spacing: '4px scale',
            componentPrinciples: ['Accessible'], assetDirection: 'Use only approved evidence.',
          },
          pages: [{
            id: 'page:home', name: 'Home', route: '/', purpose: 'Primary workspace',
            viewport: { platform: 'web', width: 1440, height: 900, scroll: 'single-screen' },
            regions: [{
              id: 'region:main', name: 'Main', role: 'content', summary: 'Primary content', complexity: 'low',
              decompositionStrategy: 'direct', assetRoute: 'board-cutout', assetOpportunities: [],
            }],
            interactions: [], overlays: [], states: [],
          }],
          flows: [{ id: 'flow:home', name: 'Home', goal: 'Create', startPageId: 'page:home', steps: [] }],
          humanLoop: { mode: 'continue', rationale: 'All fixture declarations are explicit.' },
        },
      },
      relations: [
        { id: 'relation:button:color', kind: 'component-uses-token', from: { kind: 'component', id: 'component:button' }, to: { kind: 'token', id: 'color-primary' } },
        { id: 'relation:prototype:button', kind: 'prototype-uses-component', from: { kind: 'prototype', id: 'prototype:journey' }, to: { kind: 'component', id: 'component:button' } },
      ],
    },
    artifactIndex: { version: 'cutout.artifacts.v1', artifacts: [] },
  }
}

async function journeyFixture() {
  const root = await mkdtemp(join(tmpdir(), 'cutout-contract-'))
  await createNodeFsRuntimeStore(root).save(journeyState())
  return root
}

function runCli(root: string, ...args: string[]) {
  return new Promise<{ readonly code: number | null; readonly value: unknown }>((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/cutout.mjs', '--project', root, ...args], { cwd: process.cwd() })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('error', reject)
    child.on('close', (code) => {
      try { resolve({ code, value: JSON.parse(stdout) }) } catch { reject(new Error(`CLI did not return JSON: ${stdout}\n${stderr}`)) }
    })
  })
}

function startMcp(root: string) {
  const child = spawn(process.execPath, ['scripts/cutout-mcp.mjs'], {
    cwd: process.cwd(), env: { ...process.env, CUTOUT_PROJECT_ROOT: root },
  })
  let pending = ''
  const lines: Array<(value: Record<string, unknown>) => void> = []
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    pending += chunk
    let newline
    while ((newline = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, newline)
      pending = pending.slice(newline + 1)
      const next = lines.shift()
      if (next) next(JSON.parse(line) as Record<string, unknown>)
    }
  })
  return {
    call(id: number, method: string, params?: unknown) {
      return new Promise<Record<string, unknown>>((resolve) => {
        lines.push(resolve)
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) })}\n`)
      })
    },
    async close() {
      child.stdin.end()
      await new Promise<void>((resolve) => child.on('close', () => resolve()))
    },
  }
}

describe('headless CLI and MCP adapters', () => {
  it('exposes one durable run lifecycle through CLI and MCP', async () => {
    const root = await fixture()
    const mcp = startMcp(root)
    try {
      const started = await runCli(root, 'run', 'start', '--id', 'run-cli', 'Build', 'the', 'verified', 'result.')
      const fetched = await mcp.call(50, 'tools/call', { name: 'cutout_run_get', arguments: { runId: 'run-cli' } })
      const events = await mcp.call(51, 'tools/call', { name: 'cutout_run_events', arguments: { runId: 'run-cli', limit: 10 } })
      const cancelled = await mcp.call(52, 'tools/call', { name: 'cutout_run_cancel', arguments: { runId: 'run-cli', reason: 'Changed direction.' } })

      expect(started).toMatchObject({ code: 0, value: { ok: true, response: { revision: 1, result: { run: { status: 'running' } } } } })
      expect(fetched).toMatchObject({ result: { isError: false, structuredContent: { response: { result: { run: { intent: 'Build the verified result.' } } } } } })
      expect(events).toMatchObject({ result: { isError: false, structuredContent: { response: { result: { events: [{ type: 'run-started' }, { type: 'intent-recorded' }] } } } } })
      expect(cancelled).toMatchObject({ result: { isError: false, structuredContent: { response: { revision: 2, result: { run: { status: 'cancelled' } } } } } })
      expect((await createNodeFsRuntimeStore(root).load()).runEvents?.events).toHaveLength(3)
    } finally {
      await mcp.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 60_000)
  it('runs context, materials, validate, and dry-run patch through the actual runtime', async () => {
    const root = await fixture()
    try {
      const context = await runCli(root, 'context')
      const materials = await runCli(root, 'materials', '--kind', 'prototype-page')
      const validation = await runCli(root, 'validate', '--scope', 'design,materials')
      const patch = await runCli(root, 'patch', 'tokens', 'color.primary=#22c55e')

      expect(context).toMatchObject({ code: 0, value: { ok: true, response: { result: { project: { id: 'adapter-project' } } } } })
      expect(materials).toMatchObject({ code: 0, value: { ok: true, response: { result: { materials: [{ id: 'page-home' }] } } } })
      expect(validation).toMatchObject({ code: 0, value: { ok: true, response: { result: { valid: true } } } })
      expect(patch).toMatchObject({ code: 0, value: { ok: true, response: { dryRun: true, result: { changes: [{ after: '#22c55e' }] } } } })
      expect((await createNodeFsRuntimeStore(root).load()).design.tokens[0]?.value).toBe('#111111')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  // Four cold CLI processes each boot an isolated Vite SSR loader. Under the
  // full parallel suite that is legitimately slower than the protocol itself.
  }, 60_000)

  it('runs a complete dry-run/apply Design Kit export through the CLI without accepting a destination path', async () => {
    const root = await fixture()
    try {
      const dryRun = await runCli(root, 'export-kit')
      const plan = (dryRun.value as { response: { result: { directory: string; files: unknown[] } } }).response.result
      expect(dryRun).toMatchObject({ code: 0, value: { ok: true, response: { dryRun: true, result: { files: expect.any(Array) } } } })
      expect(await readdir(join(root, '.cutout', 'exports', 'design-kit'))).toEqual([])

      const applied = await runCli(root, 'export-kit', '--apply', '--approval', 'human-approved-export')
      expect(applied).toMatchObject({ code: 0, value: { ok: true, response: { revision: 1, result: { directory: plan.directory, idempotent: false } } } })
      const manifest = await readFile(join(root, plan.directory, 'manifest.json'), 'utf8')
      expect(JSON.parse(manifest)).toMatchObject({ version: 'design-kit.v1' })

      const second = await runCli(root, 'export-kit', '--apply', '--approval', 'human-approved-export-2')
      expect(second).toMatchObject({ code: 0, value: { ok: true, response: { revision: 2, result: { idempotent: true } } } })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 30_000)

  it('plans and applies safe Everything Inbox imports through CLI and MCP without accepting payload bytes or absolute paths', async () => {
    const root = await fixture()
    const mcp = startMcp(root)
    const input = {
      type: 'inline-text', sourceKind: 'idea', title: 'Calm dashboard', text: 'A calm B2B dashboard.',
      role: 'requirement', license: { kind: 'unknown', rationale: 'User supplied.' },
    }
    try {
      const preview = await runCli(root, 'ingest', '--idea', 'A calm B2B dashboard.')
      const applied = await runCli(root, 'ingest', '--idea', 'A calm B2B dashboard.', '--apply', '--approval', 'human-reviewed-import')
      const blockedPath = await runCli(root, 'ingest', '--file', '/tmp/secret.png')
      const planned = await mcp.call(30, 'tools/call', { name: 'cutout_plan_source_ingest', arguments: { input } })
      const rejectedPayload = await mcp.call(31, 'tools/call', {
        name: 'cutout_plan_source_ingest', arguments: { input: { ...input, bytes: [1, 2, 3] } },
      })

      expect(preview).toMatchObject({ code: 0, value: { ok: true, response: { dryRun: true, result: {
        operation: 'source.ingest', patch: { sources: [{ kind: 'idea' }] },
      } } } })
      expect(applied).toMatchObject({ code: 0, value: { ok: true, response: { revision: 1, result: { operation: 'source.ingest' } } } })
      expect(blockedPath).toMatchObject({ code: 1, value: { ok: false, response: { error: { code: 'invalid-request' } } } })
      expect(planned).toMatchObject({ result: { isError: false, structuredContent: { ok: true, response: { dryRun: true, result: { operation: 'source.ingest' } } } } })
      expect(rejectedPayload).toMatchObject({ error: { code: -32602 } })
      const state = await createNodeFsRuntimeStore(root).load()
      expect(state.design.sources.some((source) => source.kind === 'idea' && source.title === 'Idea')).toBe(true)
      expect(state.design.provenance.some((record) => record.operation === 'import' && record.tool === 'cutout.everything-inbox.v1')).toBe(true)
    } finally {
      await mcp.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 60_000)

  it('runs an explicit-evidence Brand Kit plan/apply through CLI and MCP without accepting a destination', async () => {
    const root = await fixture()
    const mcp = startMcp(root)
    const input = brandInput()
    try {
      const dryRun = await runCli(root, 'export-brand-kit', '--input', JSON.stringify(input))
      const plan = (dryRun.value as { response: { result: { directory: string; files: unknown[] } } }).response.result
      expect(dryRun).toMatchObject({ code: 0, value: { ok: true, response: { dryRun: true, result: {
        directory: expect.stringMatching(/^\.cutout\/exports\/brand-kit\//), files: expect.any(Array), apply: { requiresApproval: true },
      } } } })
      expect(await readdir(join(root, '.cutout', 'exports', 'brand-kit'))).toEqual([])

      const applied = await runCli(root, 'export-brand-kit', '--input', JSON.stringify(input), '--apply', '--approval', 'human-approved-brand')
      expect(applied).toMatchObject({ code: 0, value: { ok: true, response: { revision: 1, result: { directory: plan.directory, idempotent: false } } } })
      expect(await readFile(join(root, plan.directory, 'brand.manifest.json'), 'utf8')).toContain('cutout.brand-kit.v1')

      const mismatched = structuredClone(input)
      mismatched.document.meta.title = 'Untrusted copy'
      const rejected = await runCli(root, 'export-brand-kit', '--input', JSON.stringify(mismatched), '--apply', '--approval', 'second-human')
      expect(rejected).toMatchObject({ code: 1, value: { ok: false, response: { error: { code: 'invalid-request', message: expect.stringContaining('does not match') } } } })

      const planned = await mcp.call(21, 'tools/call', { name: 'cutout_plan_brand_kit_export', arguments: { input } })
      const mcpApplied = await mcp.call(22, 'tools/call', { name: 'cutout_export_brand_kit', arguments: { input, approvalId: 'mcp-approved-brand' } })
      expect(planned).toMatchObject({ result: { isError: false, structuredContent: { ok: true, response: { dryRun: true, result: { brandId: 'brand:adapter' } } } } })
      expect(mcpApplied).toMatchObject({ result: { isError: false, structuredContent: { ok: true, response: { result: { idempotent: true } } } } })
    } finally {
      await mcp.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 60_000)

  it('runs a dry-run/apply Starter export through CLI and MCP without a destination, command, or package execution surface', async () => {
    const root = await fixture()
    const mcp = startMcp(root)
    try {
      const dryRun = await runCli(root, 'export-starter', '--framework', 'vite-react')
      const plan = (dryRun.value as { response: { result: { directory: string } } }).response.result
      expect(dryRun).toMatchObject({ code: 0, value: { ok: true, response: { dryRun: true, result: {
        framework: 'vite-react', mergePolicy: 'fail', files: expect.any(Array), apply: { requiresApproval: true },
      } } } })
      expect(await readdir(join(root, '.cutout', 'exports', 'starter'))).toEqual([])

      const missingApproval = await runCli(root, 'export-starter', '--framework', 'vite-react', '--apply')
      expect(missingApproval).toMatchObject({ code: 1, value: { ok: false, error: { code: 'invalid-command' } } })

      const applied = await runCli(root, 'export-starter', '--framework', 'vite-react', '--apply', '--approval', 'human-approved-starter')
      expect(applied).toMatchObject({ code: 0, value: { ok: true, response: { revision: 1, result: {
        directory: plan.directory, idempotent: false, framework: 'vite-react',
      } } } })
      expect(await readFile(join(root, plan.directory, 'cutout.starter-export.json'), 'utf8')).toContain('cutout.starter-export.v1')

      const listed = await mcp.call(10, 'tools/list')
      expect(((listed.result as { tools: Array<{ name: string }> }).tools).map((tool) => tool.name)).toEqual(expect.arrayContaining([
        'cutout_plan_starter_export', 'cutout_export_starter',
      ]))
      const planned = await mcp.call(11, 'tools/call', { name: 'cutout_plan_starter_export', arguments: { framework: 'next-app-router' } })
      const mcpApplied = await mcp.call(12, 'tools/call', { name: 'cutout_export_starter', arguments: { framework: 'next-app-router', approvalId: 'mcp-approved-starter' } })
      expect(planned).toMatchObject({ result: { isError: false, structuredContent: { ok: true, response: { dryRun: true, result: { framework: 'next-app-router' } } } } })
      expect(mcpApplied).toMatchObject({ result: { isError: false, structuredContent: { ok: true, response: { result: { framework: 'next-app-router', idempotent: false } } } } })
    } finally {
      await mcp.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 60_000)

  it('exposes only stable safe MCP tools and maps failures into tool errors', async () => {
    const root = await fixture()
    const mcp = startMcp(root)
    try {
      const initialize = await mcp.call(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
      const listed = await mcp.call(2, 'tools/list')
      const called = await mcp.call(3, 'tools/call', { name: 'cutout_dry_run_patch', arguments: { operation: { type: 'tokens.patch', changes: [{ token: 'color.primary', value: '#22c55e' }] } } })
      const planned = await mcp.call(4, 'tools/call', { name: 'cutout_plan_design_kit_export', arguments: {} })
      const applied = await mcp.call(5, 'tools/call', { name: 'cutout_export_design_kit', arguments: { approvalId: 'mcp-approved-export' } })
      const missingApproval = await mcp.call(6, 'tools/call', { name: 'cutout_export_design_kit', arguments: {} })

      expect(initialize).toMatchObject({ result: { serverInfo: { name: 'cutout-headless' } } })
      const toolNames = ((listed.result as { tools: Array<{ name: string }> }).tools).map((tool) => tool.name)
      expect(toolNames).toEqual(await declaredMcpTools())
      expect(new Set(toolNames).size).toBe(toolNames.length)
      expect(called).toMatchObject({ result: { isError: false, structuredContent: { ok: true, response: { dryRun: true } } } })
      expect(planned).toMatchObject({
        result: { isError: false, structuredContent: { ok: true, response: { dryRun: true, result: { files: expect.any(Array) } } } },
      })
      expect(applied).toMatchObject({
        result: { isError: false, structuredContent: { ok: true, response: { result: { idempotent: false } } } },
      })
      expect(missingApproval).toMatchObject({ error: { code: -32602 } })
    } finally {
      await mcp.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 30_000)

  it('lets an external Coding Agent discover and control Cutout without surrendering its sandbox', async () => {
    const root = await fixture()
    const mcp = startMcp(root)
    try {
      const handshake = await mcp.call(70, 'tools/call', { name: 'cutout_controller_handshake', arguments: { clientName: 'Codex', clientVersion: 'test' } })
      const status = await mcp.call(71, 'tools/call', { name: 'cutout_capabilities_status', arguments: {} })
      const skills = await mcp.call(72, 'tools/call', { name: 'cutout_skills_list', arguments: {} })
      const skill = await mcp.call(73, 'tools/call', { name: 'cutout_skill_read', arguments: { skillId: 'design-system-kit', section: 'reference' } })
      const submitted = await mcp.call(74, 'tools/call', { name: 'cutout_outcome_submit', arguments: { runId: 'external-run', intent: 'Deliver the approved system.', materialRefs: ['page-home'], sourceRefs: ['guide-source'] } })
      const deliverables = await mcp.call(75, 'tools/call', { name: 'cutout_deliverables_read', arguments: { kind: 'prototype-page' } })

      const handshakeText = JSON.stringify(handshake)
      expect(handshakeText).not.toContain(root)
      expect(handshake).toMatchObject({ result: { isError: false, structuredContent: { response: {
        protocol: 'cutout.external-controller.v1', controller: { kind: 'external-coding-agent' },
        binding: { rootOwnedByHost: true }, boundaries: { controllerOwnsCodingSandbox: true, integrationsAreSeparate: true },
      } } } })
      expect(status).toMatchObject({ result: { structuredContent: { response: {
        externalControllers: { protocol: 'cutout.external-controller.v1' }, integrations: { liveSync: false },
      } } } })
      const declaredCapabilities = JSON.parse(await readFile(join(process.cwd(), 'cutout.agent-capabilities.json'), 'utf8')) as { integrations: { available: string[]; hostRequired:string[]; authorizationRequired:string[] } }
      const reportedIntegrations = (status.result as { structuredContent: { response: { integrations: { available: string[]; hostRequired:string[]; authorizationRequired:string[] } } } }).structuredContent.response.integrations
      expect(reportedIntegrations.available).toEqual(declaredCapabilities.integrations.available)
      expect(reportedIntegrations.hostRequired).toEqual(declaredCapabilities.integrations.hostRequired)
      expect(reportedIntegrations.authorizationRequired).toEqual(declaredCapabilities.integrations.authorizationRequired)
      expect(reportedIntegrations.available).toEqual(['figma-authorized-snapshot'])
      expect(reportedIntegrations.authorizationRequired).toEqual(expect.arrayContaining(['notion-p1-adapter','github-p1-adapter']))
      expect(reportedIntegrations.hostRequired).toEqual(expect.arrayContaining(['figma-foreground-plugin','obsidian-vault-plugin','pencil-mcp-cli','paper-desktop-mcp','framer-editor-plugin','canva-apps-sdk']))
      expect(githubIntegrationManifest.availability).toBe('authorization-required')
      expect(notionIntegrationManifest.availability).toBe('authorization-required')
      expect(skills).toMatchObject({ result: { structuredContent: { response: { version: 'cutout.product-skills.v1', skills: expect.any(Array) } } } })
      expect(skill).toMatchObject({ result: { isError: false, structuredContent: { skill: { id: 'design-system-kit', section: 'reference', content: expect.stringContaining('Design') } } } })
      expect(submitted).toMatchObject({ result: { isError: false, structuredContent: { response: { status: 'ok', result: { run: { runId: 'external-run' } } } } } })
      expect(deliverables).toMatchObject({ result: { isError: false, structuredContent: { response: { result: { materials: [expect.objectContaining({ id: 'page-home' })] } } } } })
    } finally {
      await mcp.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 30_000)

  it('replays controller state across MCP restarts and returns safe capability errors', async () => {
    const root = await fixture()
    let first = startMcp(root)
    try {
      const submitted = await first.call(80, 'tools/call', { name: 'cutout_outcome_submit', arguments: {
        runId: 'restart-run', intent: 'Produce the verified result.', materialRefs: ['page-home'],
      } })
      expect(submitted).toMatchObject({ result: { isError: false, structuredContent: { response: { status: 'ok' } } } })
      await first.close()

      const restarted = startMcp(root)
      first = restarted
      const replay = await restarted.call(81, 'tools/call', { name: 'cutout_run_get', arguments: { runId: 'restart-run' } })
      const events = await restarted.call(82, 'tools/call', { name: 'cutout_run_events', arguments: { runId: 'restart-run' } })
      const unknownSkill = await restarted.call(83, 'tools/call', { name: 'cutout_skill_read', arguments: { skillId: 'not-a-cutout-skill' } })
      const unavailable = await restarted.call(84, 'tools/call', { name: 'cutout_plan_coding_task', arguments: {
        operation: 'coding.execute', task: {
          version: 'cutout.coding-task.v1', id: 'task:missing-backend', kind: 'execute', intent: 'Implement approved output',
          expectedRevision: 1, workspace: { rootId: 'external-owned', allowedPaths: ['src/**'], deniedPaths: ['.env'] },
          inputs: [], acceptance: { commands: [], evidence: [] }, limits: { maxChangedFiles: 1, maxChangedBytes: 1024, timeoutMs: 1000 },
        },
      } })
      const hostileHandshake = await restarted.call(85, 'tools/call', { name: 'cutout_controller_handshake', arguments: {
        clientName: 'Bearer secret-value-123456789', clientVersion: root,
      } })

      expect(replay).toMatchObject({ result: { isError: false, structuredContent: { response: { result: { run: { runId: 'restart-run', status: 'running' } } } } } })
      expect(events).toMatchObject({ result: { isError: false, structuredContent: { response: { result: { events: [{ type: 'run-started' }, { type: 'intent-recorded' }] } } } } })
      expect(unknownSkill).toMatchObject({ result: { isError: true, structuredContent: { error: { code: 'capability-required' } } } })
      expect(unavailable).toMatchObject({ result: { isError: true, structuredContent: { ok: false } } })
      const hostileText = JSON.stringify(hostileHandshake)
      expect(hostileText).not.toContain(root)
      expect(hostileText).not.toContain('secret-value')
      expect(hostileHandshake).toMatchObject({ result: { structuredContent: { response: { controller: { clientName: 'unknown-client', clientVersion: 'unknown' } } } } })

      const [codexConfig, claudeConfig] = await Promise.all([
        readFile(join(process.cwd(), 'docs/examples/codex-mcp.json'), 'utf8'),
        readFile(join(process.cwd(), 'docs/examples/claude-code-mcp.json'), 'utf8'),
      ])
      for (const source of [codexConfig, claudeConfig]) {
        const config = JSON.parse(source) as { mcpServers: { cutout: { command: string; args: string[]; env: Record<string, string> } } }
        expect(config.mcpServers.cutout).toMatchObject({ command: 'pnpm', args: ['cutout:mcp'], env: { CUTOUT_PROJECT_ROOT: expect.any(String) } })
      }

      const cliDiscover = await runCli(root, 'discover')
      const cliSkills = await runCli(root, 'skills', 'list')
      const cliSkill = await runCli(root, 'skills', 'read', 'outcome-brief')
      const cliContext = await runCli(root, 'context')
      expect(JSON.stringify(cliDiscover)).not.toContain(root)
      expect(cliDiscover).toMatchObject({ code: 0, value: { ok: true, response: { protocol: 'cutout.external-controller.v1' } } })
      expect(cliSkills).toMatchObject({ code: 0, value: { ok: true, response: { version: 'cutout.product-skills.v1' } } })
      expect(cliSkill).toMatchObject({ code: 0, value: { ok: true, skill: { id: 'outcome-brief' } } })
      expect(cliContext).toMatchObject({ code: 0, value: { ok: true, response: { result: { project: { id: 'adapter-project' } } } } })
    } finally {
      await first.close().catch(() => undefined)
      await rm(root, { recursive: true, force: true })
    }
  }, 60_000)

  it('serializes concurrent writes from independent MCP controller processes', async () => {
    const root = await fixture()
    const first = startMcp(root)
    const second = startMcp(root)
    try {
      const [left, right] = await Promise.all([
        first.call(90, 'tools/call', { name: 'cutout_outcome_submit', arguments: { runId: 'parallel-left', intent: 'Produce left outcome.' } }),
        second.call(91, 'tools/call', { name: 'cutout_outcome_submit', arguments: { runId: 'parallel-right', intent: 'Produce right outcome.' } }),
      ])
      expect(left).toMatchObject({ result: { isError: false, structuredContent: { response: { status: 'ok' } } } })
      expect(right).toMatchObject({ result: { isError: false, structuredContent: { response: { status: 'ok' } } } })
      const stateAfter = await createNodeFsRuntimeStore(root).load()
      expect(stateAfter.ledger?.revision).toBe(2)
      expect(stateAfter.runEvents?.events.filter(({ type }) => type === 'run-started')).toHaveLength(2)
      const leftReplay = await first.call(92, 'tools/call', { name: 'cutout_run_get', arguments: { runId: 'parallel-left' } })
      const rightReplay = await second.call(93, 'tools/call', { name: 'cutout_run_get', arguments: { runId: 'parallel-right' } })
      expect(leftReplay).toMatchObject({ result: { isError: false, structuredContent: { response: { result: { run: { runId: 'parallel-left' } } } } } })
      expect(rightReplay).toMatchObject({ result: { isError: false, structuredContent: { response: { result: { run: { runId: 'parallel-right' } } } } } })
    } finally {
      await Promise.all([first.close(), second.close()])
      await rm(root, { recursive: true, force: true })
    }
  }, 60_000)

  it('proves the Agent-native journey from an empty inbox to hash-verified kits, components, and starter output', async () => {
    const root = await journeyFixture()
    const mcp = startMcp(root)
    try {
      const ideaPreview = await runCli(root, 'ingest', '--idea', 'A calm workspace for turning references into production UI.')
      expect(ideaPreview).toMatchObject({ code: 0, value: { ok: true, response: { revision: 0, dryRun: true } } })
      expect((await createNodeFsRuntimeStore(root).load()).design.sources).toEqual([])

      const missingApproval = await runCli(root, 'ingest', '--idea', 'A calm workspace.', '--apply')
      expect(missingApproval).toMatchObject({ code: 1, value: { ok: false, error: { code: 'invalid-command' } } })
      const ideaApplied = await runCli(
        root, 'ingest', '--idea', 'A calm workspace for turning references into production UI.',
        '--apply', '--approval', 'reviewed-idea',
      )
      expect(ideaApplied).toMatchObject({ code: 0, value: { ok: true, response: { revision: 1 } } })

      const urlInput = {
        type: 'url-descriptor', url: 'https://example.test/approved-brand-guide', role: 'reference',
        license: { kind: 'unknown', rationale: 'Descriptor only; review required.' },
      }
      const urlPreview = await mcp.call(40, 'tools/call', { name: 'cutout_plan_source_ingest', arguments: { input: urlInput } })
      const urlApplied = await mcp.call(41, 'tools/call', {
        name: 'cutout_apply_source_ingest', arguments: { input: urlInput, approvalId: 'reviewed-url' },
      })
      expect(urlPreview).toMatchObject({ result: { isError: false, structuredContent: { response: { revision: 1, dryRun: true } } } })
      expect(urlApplied).toMatchObject({ result: { isError: false, structuredContent: { response: { revision: 2 } } } })

      // This is explicit reviewed fixture data, not a claim inferred from the
      // URL descriptor or pixels. It models the trusted authoring boundary.
      const store = createNodeFsRuntimeStore(root)
      const reviewed = await store.load()
      const evidenceSource = reviewed.design.sources[0]
      const evidenceProvenance = reviewed.design.provenance.find((entry) => entry.sourceIds.includes(evidenceSource?.id ?? ''))
      const evidenceContent = evidenceSource?.content[0]
      if (!evidenceSource || !evidenceProvenance || !evidenceContent) throw new Error('Missing ingested evidence fixture.')
      const reviewedSource = {
        ...evidenceSource,
        role: 'brand-asset' as const,
        license: { kind: 'proprietary' as const, holder: 'Journey Co' },
      }
      const reviewedDocument = {
        ...reviewed.design,
        sources: reviewed.design.sources.map((source) => source.id === reviewedSource.id ? reviewedSource : source),
        brands: [{ id: 'brand:journey', name: 'Journey Co', status: 'active' as const, provenanceId: evidenceProvenance.id }],
      }
      await store.save({ ...reviewed, design: reviewedDocument })
      const evidence = { sourceId: reviewedSource.id, contentId: evidenceContent.id, provenanceId: evidenceProvenance.id }
      const brand: BrandKitInput = {
        document: reviewedDocument,
        brand: {
          brandId: 'brand:journey',
          logo: { variants: [{ id: 'logo:primary', label: 'Primary logo', kind: 'primary', evidence }] },
          clearspace: { rule: 'One cap height.', evidence },
          minSize: [{ logoId: 'logo:primary', width: 24, unit: 'px', evidence }],
          colors: [{ id: 'brand:primary', name: 'Primary', cssName: 'primary', value: '#111111', evidence }],
          type: [{ id: 'type:body', role: 'body', family: 'System UI', evidence }],
          icon: { guidance: 'Use simple outlined icons.', evidence },
          photo: { guidance: 'Use only approved product imagery.', evidence },
          voice: { guidance: 'Be direct and concise.', evidence },
          assetRecipes: [{ id: 'recipe:og', name: 'Open Graph', kind: 'social-image', instructions: 'Use approved brand assets.', evidence }],
        },
      }

      const designPreview = await runCli(root, 'export-kit')
      const designApplied = await runCli(root, 'export-kit', '--apply', '--approval', 'reviewed-design-kit')
      expect(designPreview).toMatchObject({ code: 0, value: { response: { revision: 2, dryRun: true, result: { files: expect.any(Array) } } } })
      expect(designApplied).toMatchObject({ code: 0, value: { response: { revision: 3, result: { idempotent: false } } } })

      const brandPreview = await runCli(root, 'export-brand-kit', '--input', JSON.stringify(brand))
      const brandApplied = await runCli(root, 'export-brand-kit', '--input', JSON.stringify(brand), '--apply', '--approval', 'reviewed-brand-kit')
      expect(brandPreview).toMatchObject({ code: 0, value: { response: { revision: 3, dryRun: true, result: { files: expect.any(Array) } } } })
      expect(brandApplied).toMatchObject({ code: 0, value: { response: { revision: 4, result: { idempotent: false } } } })

      const current = (await store.load()).design
      const components = await compileComponentCandidates({
        document: current,
        candidates: [{
          id: 'component:button', name: 'Button', kind: 'primitive', sourcePageIds: ['page:home'],
          tokenRefs: ['color-primary'], props: [{ name: 'disabled', type: 'boolean', required: false, defaultValue: false }],
          variants: [{ name: 'intent', values: ['primary', 'secondary'] }], slots: [{ name: 'children', required: true }], status: 'ready',
        }],
      })
      const manifestFile = components.files.find((file) => file.path === 'components.manifest.json')
      if (!manifestFile) throw new Error('Missing component manifest.')
      const kit = await compileHeadlessDesignKit(current)
      const starter = await compileStarter({
        framework: 'vite-react', document: current, kit,
        candidates: JSON.parse(manifestFile.content), assetBindings: [], mergePolicy: 'fail',
      })
      expect(starter.files.some((file) => file.path.includes('Button'))).toBe(true)
      expect(starter.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true)
      expect(components.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true)

      const starterPreview = await mcp.call(42, 'tools/call', { name: 'cutout_plan_starter_export', arguments: { framework: 'vite-react' } })
      const starterApplied = await mcp.call(43, 'tools/call', {
        name: 'cutout_export_starter', arguments: { framework: 'vite-react', approvalId: 'reviewed-starter' },
      })
      expect(starterPreview).toMatchObject({ result: { isError: false, structuredContent: { response: { revision: 4, dryRun: true } } } })
      expect(starterApplied).toMatchObject({ result: { isError: false, structuredContent: { response: { revision: 5 } } } })

      const runtime = createHeadlessRuntime(store)
      const stale = await runtime.execute({
        protocol: 'cutout.control.v1', requestId: 'stale-contract-check', expectedRevision: 0, mode: 'apply',
        operation: { type: 'material.list' },
      })
      expect(stale).toMatchObject({ status: 'conflict', revision: 5, error: { code: 'revision-conflict' } })
      const readRequest = {
        protocol: 'cutout.control.v1' as const, requestId: 'idempotency-contract-check', expectedRevision: 5, mode: 'apply' as const,
        operation: { type: 'project.context' as const, include: ['summary' as const] },
      }
      const firstRead = await runtime.execute(readRequest)
      const repeatedRead = await runtime.execute(readRequest)
      expect(repeatedRead).toEqual({ ...firstRead, idempotent: true })
      expect(redactControlValue({ authorization: 'Bearer live-secret', nested: { api_key: 'sk-live-secret-value' }, token: 'design-token' }))
        .toEqual({ authorization: '[REDACTED]', nested: { api_key: '[REDACTED]' }, token: 'design-token' })

      const finalState = await store.load()
      expect(finalState.design.sources).toHaveLength(2)
      expect(finalState.design.provenance).toHaveLength(2)
      expect(finalState.ledger?.revision).toBe(5)
      expect(finalState.artifactIndex.artifacts.every((artifact) => /^[a-f0-9]{64}$/.test(artifact.sha256))).toBe(true)
    } finally {
      await mcp.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 120_000)
})
