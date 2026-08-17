import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalJson } from '@/design-ir/fingerprint'
import type { NativeBridge, SaveBundleInput, SaveBundleResult } from '@/platform/native'
import { createLocalBundleRepository } from '@/services/local/bundle-repository.local'
import { z } from 'zod'
import {
  applyPreparedGameMapManagedBundle,
  prepareGameMapManagedBundle,
} from './map-bundle'
import {
  gameMapLiveArtifactSchema,
  gameMapSemanticAcceptanceSchema,
  type GameMapLiveNativeRunner,
  type GameMapSemanticAcceptance,
  type GameMapSemanticAcceptanceInput,
} from './map-live-production'
import {
  gameMapRuntimeProcessingInputSchema,
  nativeGameMapPreviewSchema,
} from './map-production'

const rehearsalRoot = process.env.CUTOUT_REAL_GAME_MAP_OUTPUT_DIR
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const rustRoot = join(repositoryRoot, 'src-tauri')

const retainedClosureSchema = z.object({
  mode: z.enum(['scene', 'tile']),
  runtime: gameMapRuntimeProcessingInputSchema,
  preview: nativeGameMapPreviewSchema,
  artifacts: z.array(gameMapLiveArtifactSchema).min(2).max(2_000),
}).strict()

async function runNativeCargoTest(
  testName: string,
  environment: Readonly<Record<string, string>>,
): Promise<void> {
  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn('cargo', [
      'test',
      '--locked',
      '--lib',
      testName,
      '--',
      '--ignored',
      '--exact',
      '--nocapture',
    ], {
      cwd: rustRoot,
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const retainOutput = (chunk: Buffer) => {
      output = `${output}${chunk.toString('utf8')}`.slice(-32_000)
    }
    child.stdout.on('data', retainOutput)
    child.stderr.on('data', retainOutput)
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      rejectRun(new Error(`Native Game Map bridge timed out:\n${output}`))
    }, 180_000)
    child.once('error', (error) => {
      clearTimeout(timeout)
      rejectRun(error)
    })
    child.once('close', (code) => {
      clearTimeout(timeout)
      if (code === 0) resolveRun()
      else rejectRun(new Error(`Native Game Map bridge exited with ${code ?? 'no status'}:\n${output}`))
    })
  })
}

async function verifyAcceptanceNatively(
  acceptance: GameMapSemanticAcceptance,
  input: GameMapSemanticAcceptanceInput,
): Promise<GameMapSemanticAcceptance> {
  const temporary = await mkdtemp(join(tmpdir(), 'cutout-game-map-acceptance-'))
  const requestPath = join(temporary, 'request.json')
  const resultPath = join(temporary, 'result.json')
  try {
    await writeFile(requestPath, JSON.stringify({ acceptance, input }))
    await runNativeCargoTest(
      'commands::ai::game_map_processing::tests::verifies_external_game_map_semantic_acceptance_request',
      {
        CUTOUT_REAL_GAME_MAP_ACCEPTANCE_REQUEST: requestPath,
        CUTOUT_REAL_GAME_MAP_ACCEPTANCE_RESULT: resultPath,
      },
    )
    return gameMapSemanticAcceptanceSchema.parse(JSON.parse(await readFile(resultPath, 'utf8')))
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

function nativeAcceptanceRunner(): GameMapLiveNativeRunner {
  return {
    async admit() {
      throw new Error('Accepted-bundle rehearsal does not admit new artifacts.')
    },
    async verifyArtifact() {
      throw new Error('Accepted-bundle rehearsal verifies the complete signed acceptance closure.')
    },
    async accept() {
      throw new Error('Accepted-bundle rehearsal consumes an existing visually reviewed acceptance.')
    },
    verifyAcceptance: verifyAcceptanceNatively,
  }
}

async function exportBundleNatively(
  modeRoot: string,
  bundle: SaveBundleInput,
): Promise<SaveBundleResult> {
  const temporary = await mkdtemp(join(tmpdir(), 'cutout-game-map-bundle-'))
  const requestPath = join(temporary, 'request.json')
  const resultPath = join(temporary, 'result.json')
  const exportRoot = join(modeRoot, 'accepted-exports')
  await mkdir(exportRoot, { recursive: true })
  try {
    await writeFile(requestPath, JSON.stringify({
      name: bundle.name,
      files: bundle.files.map(({ path, bytes }) => ({ path, bytes: Array.from(bytes) })),
    }))
    await runNativeCargoTest(
      'commands::save_bundle::tests::writes_external_bundle_request_through_native_atomic_export',
      {
        CUTOUT_REAL_GAME_MAP_BUNDLE_REQUEST: requestPath,
        CUTOUT_REAL_GAME_MAP_BUNDLE_ROOT: exportRoot,
        CUTOUT_REAL_GAME_MAP_BUNDLE_RESULT: resultPath,
      },
    )
    return JSON.parse(await readFile(resultPath, 'utf8')) as SaveBundleResult
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

describe.skipIf(!rehearsalRoot)('real accepted Game Map neutral bundles', () => {
  for (const mode of ['scene', 'tile'] as const) {
    it(`natively reverifies and atomically exports the retained ${mode} closure`, async () => {
      const modeRoot = join(rehearsalRoot!, mode)
      const closure = retainedClosureSchema.parse(JSON.parse(
        await readFile(join(modeRoot, 'closure.json'), 'utf8'),
      ))
      expect(closure.mode).toBe(mode)
      const acceptance = gameMapSemanticAcceptanceSchema.parse(JSON.parse(
        await readFile(join(modeRoot, 'semantic-acceptance.json'), 'utf8'),
      ))
      const runner = nativeAcceptanceRunner()

      const prepared = await prepareGameMapManagedBundle({
        runtime: closure.runtime,
        preview: closure.preview,
        semanticAcceptance: { receipt: acceptance, artifacts: closure.artifacts },
      }, runner)
      expect(prepared.bundle.deliveryStatus).toBe('accepted')
      expect(prepared.files.map(({ logicalPath }) => logicalPath)).toEqual(expect.arrayContaining([
        'manifests/map.json',
        'manifests/objects.json',
        'manifests/bundle.json',
        'previews/map.png',
        'previews/debug.png',
        'evidence/semantic-acceptance.json',
      ]))

      const nativeSaveBridge = {
        saveBundle: (bundle: SaveBundleInput) => exportBundleNatively(modeRoot, bundle),
      } as Pick<NativeBridge, 'saveBundle'> as NativeBridge
      const applied = await applyPreparedGameMapManagedBundle(
        prepared,
        createLocalBundleRepository(nativeSaveBridge),
        runner,
      )
      expect(applied.deliveryStatus).toBe('accepted')
      expect(applied.status).toBe('accepted-exported')
      expect(applied.receipt.fileCount).toBe(prepared.files.length)
      expect(applied.receipt.files.map(({ path }) => path)).toEqual(prepared.files.map(({ logicalPath }) => logicalPath))

      const retainedManifest = JSON.parse(await readFile(
        join(applied.receipt.bundleDir!, 'manifests/bundle.json'),
        'utf8',
      ))
      expect(canonicalJson(retainedManifest)).toBe(canonicalJson(prepared.bundle))
      await writeFile(join(modeRoot, 'accepted-bundle-receipt.json'), JSON.stringify({
        mode,
        previewId: prepared.previewId,
        previewHash: prepared.previewHash,
        bundleHash: prepared.bundleHash,
        deliveryStatus: applied.deliveryStatus,
        status: applied.status,
        receipt: applied.receipt,
      }, null, 2))
    }, 300_000)
  }
})
