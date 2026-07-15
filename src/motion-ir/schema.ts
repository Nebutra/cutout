import { z } from 'zod'

const id = z.string().min(1).max(200)
const assetRef = z.object({ id, uri: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/i), mediaType: z.string().min(1) }).strict()
const easing = z.discriminatedUnion('type', [z.object({ type: z.literal('linear') }).strict(), z.object({ type: z.literal('cubic-bezier'), x1: z.number().min(0).max(1), y1: z.number(), x2: z.number().min(0).max(1), y2: z.number() }).strict()])
const keyframe = z.object({ id, timeMs: z.number().nonnegative(), value: z.union([z.number(), z.array(z.number()).min(2).max(4)]), easing }).strict()
const track = z.object({ property: z.enum(['position', 'scale', 'rotation', 'opacity']), keyframes: z.array(keyframe).min(1) }).strict()
const layer = z.object({ id, name: z.string().min(1), kind: z.enum(['shape', 'image', 'precomp', 'null']), assetRefId: id.optional(), tracks: z.array(track), inMs: z.number().nonnegative(), outMs: z.number().positive() }).strict()

export const motionDocumentSchema = z.object({
  version: z.literal('motion-ir.v1'), id, title: z.string().min(1),
  source: z.object({ designDocumentId: id, designRevisionId: id, materialRefs: z.array(id), componentRefs: z.array(id) }).strict(),
  viewport: z.object({ width: z.number().positive(), height: z.number().positive(), pixelRatio: z.number().positive().default(1) }).strict(),
  timeline: z.object({ durationMs: z.number().positive(), frameRate: z.number().positive().max(240), loop: z.boolean(), layers: z.array(layer), markers: z.array(z.object({ id, name: z.string().min(1), timeMs: z.number().nonnegative(), durationMs: z.number().nonnegative().default(0) }).strict()) }).strict(),
  triggers: z.array(z.object({ id, type: z.enum(['load', 'hover', 'press', 'focus', 'scroll', 'manual']), markerId: id.optional() }).strict()),
  reducedMotion: z.object({ strategy: z.enum(['freeze-first', 'freeze-last', 'alternate']), alternateAssetRefId: id.optional() }).strict(),
  assets: z.array(assetRef),
}).strict().superRefine((motion, ctx) => {
  const assets = new Set(motion.assets.map((asset) => asset.id)), markers = new Set(motion.timeline.markers.map((marker) => marker.id))
  for (const layer of motion.timeline.layers) { if (layer.outMs > motion.timeline.durationMs || layer.outMs <= layer.inMs) ctx.addIssue({ code: 'custom', path: ['timeline', 'layers'], message: `Layer ${layer.id} has invalid bounds.` }); if (layer.assetRefId && !assets.has(layer.assetRefId)) ctx.addIssue({ code: 'custom', path: ['timeline', 'layers'], message: `Layer ${layer.id} references an unknown asset.` }) }
  for (const trigger of motion.triggers) if (trigger.markerId && !markers.has(trigger.markerId)) ctx.addIssue({ code: 'custom', path: ['triggers'], message: `Trigger ${trigger.id} references an unknown marker.` })
})
export type MotionDocument = z.infer<typeof motionDocumentSchema>
