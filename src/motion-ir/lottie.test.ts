import { describe, expect, it } from 'vitest'
import { createWebMotionReceipt, exportLottie, importLottie } from './lottie'

const source = { designDocumentId: 'design:1', designRevisionId: 'revision:1', materialRefs: ['material:logo'], componentRefs: ['component:button'] }
const fixture = { v: '5.12.2', nm: 'Pulse', fr: 30, ip: 0, op: 60, w: 320, h: 180, ddd: 0, assets: [], layers: [{ ddd: 0, ind: 1, ty: 4, nm: 'Dot', ip: 0, op: 60, ks: { p: { a: 1, k: [{ t: 0, s: [40, 90, 0] }, { t: 30, s: [280, 90, 0] }] }, s: { a: 0, k: [100, 100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }, shapes: [] }], markers: [{ cm: 'middle', tm: 30, dr: 0 }] }

describe('Motion IR and Lottie adapter', () => {
  it('imports the supported subset with Design IR relations and deterministic preview gates', () => {
    const result = importLottie(fixture, source)
    expect(result).toMatchObject({ status: 'ready', inventory: { version: '5.12.2', frames: 60, layers: 1, unsupported: [] }, motion: { version: 'motion-ir.v1', source, timeline: { durationMs: 2000, layers: [{ kind: 'shape', tracks: expect.any(Array) }], markers: [{ name: 'middle', timeMs: 1000 }] }, reducedMotion: { strategy: 'freeze-first' } }, preview: { renderer: 'svg', autoplay: false, qualityGates: ['schema', 'duration', 'bounds', 'blank-frames', 'reduced-motion', 'web-render-screenshot'] } })
  })

  it('blocks unsafe paths, fonts, effects, masks, 3D and unsupported layers', () => {
    const result = importLottie({ ...fixture, fonts: { list: [{ fName: 'Remote' }] }, assets: [{ id: 'image', p: '../secret.png' }], layers: [{ ...fixture.layers[0], ty: 2, ddd: 1, ef: [{}], masksProperties: [{}] }] }, source)
    expect(result).toMatchObject({ status: 'blocked', inventory: { unsupported: expect.arrayContaining(['fonts', 'unsafe-external-asset-path', 'effects', 'masks', '3d', 'layer-type:2']) } })
  })

  it('round-trips supported transforms and emits a web consumer receipt', () => {
    const imported = importLottie(fixture, source)
    if (imported.status !== 'ready') throw new Error('fixture must import')
    const exported = exportLottie(imported.motion)
    expect(exported).toMatchObject({ fr: 30, op: 60, w: 320, h: 180, layers: [{ ty: 4, ks: { p: { a: 1 } } }] })
    expect(createWebMotionReceipt(imported.motion, 'a'.repeat(64))).toMatchObject({ renderer: 'lottie-web-svg', durationMs: 2000, gates: { webRenderScreenshot: true, reducedMotion: true } })
  })
})
