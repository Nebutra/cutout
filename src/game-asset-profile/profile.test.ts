import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { SchemaRegistry } from '@/design-os-kernel/registry'
import { createCommerceProfileAdapterPackage } from '@/design-profile-platform/commerce-adapter'
import {
  assertProfileLifecycleChangeSet,
  previewProfileLifecycle,
} from '@/design-profile-platform/lifecycle'
import { createProfileBindingRegistries } from '@/design-profile-platform/registries'
import { inspectUnknownArtifact } from '@/design-profile-platform/registries'
import { resolveProfileClosure } from '@/design-profile-platform/closure'
import {
  GAME_ASSET_PROFILE_ID,
  gameAssetPlanSchema,
  layeredGameMapManifestSchema,
  observedGameAssetFrameSchema,
  type GameAssetPlan,
  type ObservedGameAssetFrame,
} from './contracts'
import { evaluateGameAssetFrames } from './evaluation'
import { createGameAssetProfilePackage } from './profile'

const identityHash = 'a'.repeat(64)
const scaleHash = 'b'.repeat(64)
const anchorHash = 'c'.repeat(64)
const frameHash = 'd'.repeat(64)

function plan(): GameAssetPlan {
  return gameAssetPlanSchema.parse({
    version: 'game-asset.plan.v1',
    id: 'plan:hero-run',
    assetId: 'asset:hero',
    kind: 'player',
    view: 'side',
    artDirectionEvidenceIds: ['evidence:art-direction'],
    referenceArtifactIds: ['artifact:master-frame'],
    roles: [0, 1, 2, 3].map((frameIndex) => ({
      id: `role:run:right:${frameIndex}`,
      assetId: 'asset:hero',
      action: 'run',
      direction: 'right',
      frameIndex,
      outputSchema: { id: 'game-asset.frame', version: 1 },
      identityLockId: 'lock:hero-identity',
      scaleLockId: 'lock:hero-scale',
      expectedAlphaSize: { width: 80, height: 104 },
      anchorLockId: 'lock:hero-feet',
      anchor: 'feet',
      expectedAnchor: { x: 64, y: 116 },
    })),
    delivery: { formatId: 'game-asset.atlas-manifest.v1', frameWidth: 128, frameHeight: 128, columns: 2, rows: 2 },
  })
}

function frame(frameIndex: number, overrides: Partial<ObservedGameAssetFrame> = {}): ObservedGameAssetFrame {
  return {
    roleId: `role:run:right:${frameIndex}`,
    artifactId: `artifact:run:right:${frameIndex}`,
    artifactRevision: `artifact:run:right:${frameIndex}:1`,
    contentHash: (frameIndex + 4).toString(16).repeat(64),
    decodedWidth: 128,
    decodedHeight: 128,
    alphaBounds: { x: 24, y: 16, width: 80, height: 104 },
    edgeContact: false,
    anchor: { x: 64, y: 116 },
    identityLockHash: identityHash,
    scaleLockHash: scaleHash,
    anchorLockHash: anchorHash,
    sourceArtifactIds: ['artifact:master-frame'],
    ...overrides,
  }
}

describe('Game Asset Profile', () => {
  it('installs through trusted registries and exact Profile closure without Kernel branches', async () => {
    const profile = await createGameAssetProfilePackage()
    const schemas = new SchemaRegistry()
    profile.registerTrustedSchemas(schemas)
    const registries = createProfileBindingRegistries()
    profile.registerTrustedBindings(registries)
    const closure = await resolveProfileClosure({
      kernelVersion: '1.2.0',
      rootProfiles: [{
        profileId: profile.manifest.id,
        version: profile.manifest.version,
        contentHash: profile.manifest.contentHash,
      }],
      availableManifests: [profile.manifest],
      registrations: profile.registrations,
      libraryLocks: [],
    })

    expect(closure.manifests[0]?.id).toBe(GAME_ASSET_PROFILE_ID)
    expect(schemas.parse({ id: 'game-asset.plan', version: 1 }, plan())).toEqual(plan())
    expect(registries.renderers.project(profile.manifest.renderers[0]!, plan())).toEqual(expect.objectContaining({
      title: 'asset:hero',
      actionIds: ['action:game-asset-repair'],
    }))
    expect(registries.delivery.require(profile.manifest.deliveries[0]!).implementation.formatId)
      .toBe('game-asset.atlas-manifest.v1')
    expect(registries.semanticActions.compile(profile.manifest.semanticActions[0]!, {
      subject: { kind: 'outcome', id: 'outcome:hero-run', revision: 'outcome:1' },
      parameters: { failedRoleIds: ['role:run:right:2'] },
    })).toEqual([expect.objectContaining({ kind: 'request-repair', effect: 'command-only' })])
  })

  it('removes Game Asset while preserving Commerce and historical game artifacts read-only', async () => {
    const game = await createGameAssetProfilePackage()
    const commerce = await createCommerceProfileAdapterPackage()
    const current = await resolveProfileClosure({
      kernelVersion: '1.2.0',
      rootProfiles: [game.manifest, commerce.manifest].map((manifest) => ({
        profileId: manifest.id,
        version: manifest.version,
        contentHash: manifest.contentHash,
      })),
      availableManifests: [game.manifest, commerce.manifest],
      registrations: [...game.registrations, ...commerce.registrations],
      libraryLocks: [],
    })
    const next = await resolveProfileClosure({
      kernelVersion: '1.2.0',
      rootProfiles: [{
        profileId: commerce.manifest.id,
        version: commerce.manifest.version,
        contentHash: commerce.manifest.contentHash,
      }],
      availableManifests: [commerce.manifest],
      registrations: commerce.registrations,
      libraryLocks: [],
    })
    const preview = await previewProfileLifecycle({
      operation: 'remove',
      projectId: 'project:commerce-and-game',
      expectedProjectRevision: 'project:revision:1',
      profileIds: [game.manifest.id],
      currentClosure: current,
      nextClosure: next,
    })

    await expect(assertProfileLifecycleChangeSet({
      preview,
      previewHash: preview.previewHash,
      projectRevision: 'project:revision:1',
      nextClosureHash: next.closureHash,
    })).resolves.toEqual(preview)
    expect(next.rootProfiles).toEqual([expect.objectContaining({
      profileId: commerce.manifest.id,
      contentHash: commerce.manifest.contentHash,
    })])
    expect(next.manifests.some(({ id }) => id === game.manifest.id)).toBe(false)

    const retained = inspectUnknownArtifact({
      identity: {
        id: 'artifact:run:right:accepted',
        revision: 'artifact:run:right:accepted:1',
        schema: { id: 'game-asset.frame', version: 1 },
        contentHash: frameHash,
      },
      provenance: [{
        sourceId: game.manifest.id,
        revision: game.manifest.version,
        relation: 'historical-profile-artifact',
        contentHash: game.manifest.contentHash,
      }],
      rawMetadata: { action: 'run', direction: 'right', frameIndex: 2 },
    })
    expect(retained).toEqual(expect.objectContaining({
      status: 'unknown-schema',
      readOnly: true,
      identity: expect.objectContaining({ contentHash: frameHash }),
    }))
  })

  it('repairs only failed frames and preserves accepted sibling artifact ids', () => {
    const frames = [0, 1, 2, 3].map((index) => frame(index))
    const passed = evaluateGameAssetFrames({
      plan: plan(), frames, identityLockHash: identityHash, scaleLockHash: scaleHash, anchorLockHash: anchorHash,
    })
    expect(passed.status).toBe('passed')

    const failed = evaluateGameAssetFrames({
      plan: plan(),
      frames: frames.map((candidate, index) => index === 2 ? { ...candidate, edgeContact: true } : candidate),
      identityLockHash: identityHash,
      scaleLockHash: scaleHash,
      anchorLockHash: anchorHash,
    })
    expect(failed.status).toBe('needs-repair')
    expect(failed.failedRoleIds).toEqual(['role:run:right:2'])
    expect(failed.acceptedArtifacts.map(({ roleId, artifactId, contentHash }) => ({ roleId, artifactId, contentHash }))).toEqual([
      { roleId: 'role:run:right:0', artifactId: 'artifact:run:right:0', contentHash: '4'.repeat(64) },
      { roleId: 'role:run:right:1', artifactId: 'artifact:run:right:1', contentHash: '5'.repeat(64) },
      { roleId: 'role:run:right:3', artifactId: 'artifact:run:right:3', contentHash: '7'.repeat(64) },
    ])
  })

  it('rejects stale identity/scale/anchor locks and missing visible reference lineage', () => {
    const result = evaluateGameAssetFrames({
      plan: plan(),
      frames: [
        frame(0, { identityLockHash: frameHash }),
        frame(1, { scaleLockHash: frameHash }),
        frame(2, { anchorLockHash: frameHash }),
        frame(3, { sourceArtifactIds: [] }),
      ],
      identityLockHash: identityHash,
      scaleLockHash: scaleHash,
      anchorLockHash: anchorHash,
    })
    expect(result.failedRoleIds).toEqual([
      'role:run:right:0', 'role:run:right:1', 'role:run:right:2', 'role:run:right:3',
    ])
    expect(result.findings.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'identity-lock-mismatch', 'scale-lock-mismatch', 'anchor-lock-mismatch', 'reference-lineage-mismatch',
    ]))
  })

  it('rejects undeclared roles, reused artifacts, invalid geometry, and duplicate reference lineage', () => {
    expect(() => gameAssetPlanSchema.parse({
      ...plan(),
      roles: plan().roles.map((role, index) => index === 1
        ? { ...role, action: plan().roles[0]!.action, direction: plan().roles[0]!.direction, frameIndex: plan().roles[0]!.frameIndex }
        : role),
    })).toThrow(/tuples must be unique/)
    expect(() => observedGameAssetFrameSchema.parse(frame(0, {
      alphaBounds: { x: 100, y: 0, width: 40, height: 40 },
    }))).toThrow(/alpha bounds exceed/)
    expect(() => observedGameAssetFrameSchema.parse(frame(0, {
      sourceArtifactIds: ['artifact:master-frame', 'artifact:master-frame'],
    }))).toThrow(/must be unique/)

    const result = evaluateGameAssetFrames({
      plan: plan(),
      frames: [
        frame(0), frame(1, { artifactId: 'artifact:run:right:0', artifactRevision: 'artifact:run:right:0:1', contentHash: '4'.repeat(64) }),
        frame(2), frame(3), frame(4),
      ],
      identityLockHash: identityHash,
      scaleLockHash: scaleHash,
      anchorLockHash: anchorHash,
    })
    expect(result.findings.map(({ code }) => code)).toEqual(expect.arrayContaining(['unknown-role', 'reused-artifact']))
    expect(result.status).toBe('needs-repair')
  })

  it('requires observed anchor coordinates to match the planned anchor binding', () => {
    const result = evaluateGameAssetFrames({
      plan: plan(),
      frames: [frame(0, { anchor: { x: 63, y: 116 } }), frame(1), frame(2), frame(3)],
      identityLockHash: identityHash,
      scaleLockHash: scaleHash,
      anchorLockHash: anchorHash,
    })
    expect(result.findings).toContainEqual(expect.objectContaining({
      code: 'anchor-position-mismatch', roleId: 'role:run:right:0',
    }))
  })

  it('requires observed alpha occupancy to match the planned scale binding', () => {
    const result = evaluateGameAssetFrames({
      plan: plan(),
      frames: [frame(0, { alphaBounds: { x: 24, y: 16, width: 79, height: 104 } }), frame(1), frame(2), frame(3)],
      identityLockHash: identityHash,
      scaleLockHash: scaleHash,
      anchorLockHash: anchorHash,
    })
    expect(result.findings).toContainEqual(expect.objectContaining({
      code: 'scale-geometry-mismatch', roleId: 'role:run:right:0',
    }))
  })

  it('keeps layered map preview non-authoritative and collision/zones structured', () => {
    const map = layeredGameMapManifestSchema.parse({
      version: 'game-asset.layered-map.v1',
      id: 'map:shrine',
      width: 1672,
      height: 941,
      layers: [
        { kind: 'base', artifactId: 'artifact:base', authoritative: true },
        { kind: 'props', artifactId: 'artifact:props', authoritative: true },
        { kind: 'collision', artifactId: 'artifact:collision-json', authoritative: true },
        { kind: 'zones', artifactId: 'artifact:zones-json', authoritative: true },
        { kind: 'preview', artifactId: 'artifact:flattened-preview', authoritative: false },
      ],
    })
    expect(map.layers.find(({ kind }) => kind === 'preview')?.authoritative).toBe(false)
    expect(() => layeredGameMapManifestSchema.parse({
      ...map,
      layers: map.layers.map((layer) => layer.kind === 'preview' ? { ...layer, authoritative: true } : layer),
    })).toThrow(/preview cannot be authoritative/)
    expect(() => layeredGameMapManifestSchema.parse({
      ...map,
      layers: map.layers.filter(({ kind }) => kind !== 'collision'),
    })).toThrow(/missing collision/)
  })

  it('keeps the Outcome scorecard separate from evidence maturity', async () => {
    const profile = await createGameAssetProfilePackage()
    const registries = createProfileBindingRegistries()
    profile.registerTrustedBindings(registries)
    const scorecard = registries.outcomeScorecardAdapters.project(
      profile.manifest.outcomeScorecardAdapters[0]!,
      {
        plan: plan(),
        frames: [frame(0), frame(1), frame(2, { edgeContact: true }), frame(3)],
        identityLockHash: identityHash,
        scaleLockHash: scaleHash,
        anchorLockHash: anchorHash,
      },
    )
    expect(scorecard.criteria[0]).toEqual(expect.objectContaining({ score: 3, maximumScore: 4 }))
    expect(z.object({ productionReady: z.boolean() }).safeParse(scorecard).success).toBe(false)

    const maturity = registries.evidenceBenchmarkAdapters.project(
      profile.manifest.evidenceBenchmarkAdapters[0]!,
      {
        version: 'game-asset.maturity-evidence.v1',
        profileId: GAME_ASSET_PROFILE_ID,
        reportId: 'report:game-asset-fixture',
      },
    )
    expect(maturity.metrics.every(({ status }) => status === 'blocked')).toBe(true)
    expect(maturity).not.toHaveProperty('criteria')
  })
})
