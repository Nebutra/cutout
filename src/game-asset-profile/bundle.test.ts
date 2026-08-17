import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { sha256Bytes } from '@/asset-production/hash'
import { canonicalJson } from '@/design-ir/fingerprint'
import {
  compiledGameAssetBundleSchema,
  gameAssetBundleManifestSchema,
  verifyCompiledGameAssetBundleBytes,
} from './bundle'

function base64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function candidateBundle() {
  const frameHash = 'a'.repeat(64)
  const atlasHash = 'b'.repeat(64)
  const bundleHash = 'c'.repeat(64)
  return {
    protocol: 'game-asset.bundle.v1',
    bundleId: `game-asset-bundle:sha256:${bundleHash}`,
    bundleHash,
    deliveryStatus: 'candidate',
    manifestLogicalPath: 'manifest.json',
    manifestMediaType: 'application/json',
    manifestByteLength: 128,
    manifestBytesBase64: 'e30=',
    atlasBytesBase64: 'iVBORw0KGgo=',
    manifest: {
      version: 'game-asset.bundle.v1',
      deliveryStatus: 'candidate',
      compilerImplementation: 'cutout-game-asset-atlas-rust-image-0.23-v1',
      timingPolicy: 'game-asset-action-timing.v1',
      assetId: 'asset:runner',
      planId: 'plan:runner',
      planHash: 'd'.repeat(64),
      generation: {
        receiptId: 'receipt:generation',
        receiptHash: 'e'.repeat(64),
        previewId: `game-asset-preview:sha256:${'f'.repeat(64)}`,
        runId: 'run:game:test',
      },
      atlas: {
        logicalPath: 'atlas.png',
        artifactId: `artifact:sha256:${atlasHash}`,
        sha256: atlasHash,
        mediaType: 'image/png',
        byteLength: 64,
        width: 128,
        height: 128,
        columns: 1,
        rows: 1,
      },
      frames: [{
        roleId: 'role:run:right:0',
        action: 'run',
        direction: 'right',
        frameIndex: 0,
        durationMs: 90,
        cell: { x: 0, y: 0, width: 128, height: 128 },
        anchor: { x: 64, y: 116 },
        artifactId: `artifact:sha256:${frameHash}`,
        artifactSha256: frameHash,
      }],
      animations: [{
        id: 'animation:asset:runner:run:right',
        action: 'run',
        direction: 'right',
        frameDurationMs: 90,
        looping: true,
        roleIds: ['role:run:right:0'],
      }],
    },
  }
}

describe('Game Asset runtime bundle contract', () => {
  it('exports the trusted manifest contract as strict JSON Schema', () => {
    expect(z.toJSONSchema(gameAssetBundleManifestSchema)).toEqual(expect.objectContaining({
      type: 'object',
      additionalProperties: false,
    }))
  })

  it('admits a candidate preview without representing it as accepted delivery', () => {
    const bundle = candidateBundle()
    expect(compiledGameAssetBundleSchema.parse(bundle)).toEqual(bundle)
  })

  it('requires exact semantic evidence and managed logical names for accepted delivery', () => {
    const bundle = candidateBundle()
    expect(() => compiledGameAssetBundleSchema.parse({
      ...bundle,
      deliveryStatus: 'accepted',
      manifest: { ...bundle.manifest, deliveryStatus: 'accepted' },
    })).toThrow()
    expect(() => compiledGameAssetBundleSchema.parse({
      ...bundle,
      manifestLogicalPath: '../manifest.json',
    })).toThrow()
  })

  it('round-trips the exact canonical manifest and atlas byte identities', async () => {
    const template = candidateBundle()
    const atlasBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4])
    const atlasHash = await sha256Bytes(atlasBytes)
    const manifest = gameAssetBundleManifestSchema.parse({
      ...template.manifest,
      atlas: {
        ...template.manifest.atlas,
        artifactId: `artifact:sha256:${atlasHash}`,
        sha256: atlasHash,
        byteLength: atlasBytes.byteLength,
      },
    })
    const manifestBytes = new TextEncoder().encode(canonicalJson(manifest))
    const bundleHash = await sha256Bytes(manifestBytes)
    const compiled = {
      ...template,
      bundleId: `game-asset-bundle:sha256:${bundleHash}`,
      bundleHash,
      manifestByteLength: manifestBytes.byteLength,
      manifestBytesBase64: base64(manifestBytes),
      atlasBytesBase64: base64(atlasBytes),
      manifest,
    }

    await expect(verifyCompiledGameAssetBundleBytes(compiled)).resolves.toEqual(compiled)
    await expect(verifyCompiledGameAssetBundleBytes({
      ...compiled,
      atlasBytesBase64: base64(new Uint8Array([137, 80, 78, 71, 9, 9, 9, 9])),
    })).rejects.toThrow('content identities')
  })
})
