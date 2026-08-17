import { z } from 'zod'
import {
  commerceHeldOutEvaluatorAttestationSchema,
  commerceHeldOutEvaluatorPackageSchema,
} from './held-out'

export const COMMERCE_OPERATOR_PROTOCOL = 'cutout.commerce-operator.v1' as const
export const COMMERCE_OPERATOR_NATIVE_PROTOCOL = 'cutout.commerce-operator-native.v1' as const
export const COMMERCE_OPERATOR_MAXIMUM_REQUEST_BYTES = 32 * 1024 * 1024

export const commerceOperatorJobIdSchema = z.string()
  .regex(/^[A-Za-z0-9_-]{16,80}$/)

const providerIdSchema = z.string().min(1).max(240)
const baseRequestShape = {
  protocol: z.literal(COMMERCE_OPERATOR_PROTOCOL),
  jobId: commerceOperatorJobIdSchema,
}

const packageRequestShape = {
  ...baseRequestShape,
  providerId: providerIdSchema,
  evaluatorPackage: commerceHeldOutEvaluatorPackageSchema,
}

export const commerceOperatorRequestSchema = z.discriminatedUnion('command', [
  z.object({ ...packageRequestShape, command: z.literal('preflight') }).strict(),
  z.object({ ...packageRequestShape, command: z.literal('run') }).strict(),
  z.object({ ...packageRequestShape, command: z.literal('recover') }).strict(),
  z.object({
    ...baseRequestShape,
    command: z.literal('admit'),
    evaluatorAttestation: commerceHeldOutEvaluatorAttestationSchema,
  }).strict(),
  z.object({ ...baseRequestShape, command: z.literal('status') }).strict(),
  z.object({ ...baseRequestShape, command: z.literal('cancel') }).strict(),
])
export type CommerceOperatorRequest = z.infer<typeof commerceOperatorRequestSchema>

export const commerceOperatorStatusSchema = z.enum([
  'created',
  'preflighted',
  'running',
  'pending-evaluator',
  'admitted',
  'cancelled',
  'failed',
])
export type CommerceOperatorStatus = z.infer<typeof commerceOperatorStatusSchema>

export const COMMERCE_OPERATOR_RESULT_FILES = Object.freeze({
  preflight: 'preflight.json',
  run: 'pending.json',
  recover: 'pending.json',
  admit: 'admitted.json',
  status: 'status.json',
  cancel: 'status.json',
} as const)

export const commerceOperatorResultSchema = z.object({
  protocol: z.literal(COMMERCE_OPERATOR_PROTOCOL),
  jobId: commerceOperatorJobIdSchema,
  command: z.enum(['preflight', 'run', 'recover', 'admit', 'status', 'cancel']),
  status: commerceOperatorStatusSchema,
  resultFile: z.enum(['preflight.json', 'pending.json', 'admitted.json', 'status.json']),
}).strict()
export type CommerceOperatorResult = z.infer<typeof commerceOperatorResultSchema>

export const commerceOperatorNativeCommandSchema = z.enum([
  'provider-preflight',
  'commitment-create',
  'source-ingest',
  'source-receipt-verify',
  'structured-text',
  'vision-json',
  'image-edit',
  'image-to-video',
  'receipt-verify',
  'playback-promote',
  'admission-verify',
])
export type CommerceOperatorNativeCommand = z.infer<typeof commerceOperatorNativeCommandSchema>

export const commerceOperatorNativeRequestSchema = z.object({
  protocol: z.literal(COMMERCE_OPERATOR_NATIVE_PROTOCOL),
  jobId: commerceOperatorJobIdSchema,
  cancellationId: z.string().uuid().optional(),
  command: commerceOperatorNativeCommandSchema,
  payload: z.record(z.string(), z.unknown()),
}).strict()
export type CommerceOperatorNativeRequest = z.infer<typeof commerceOperatorNativeRequestSchema>

export function decodeCommerceOperatorRequestBytes(bytes: Uint8Array): CommerceOperatorRequest {
  if (bytes.byteLength === 0 || bytes.byteLength > COMMERCE_OPERATOR_MAXIMUM_REQUEST_BYTES) {
    throw new Error('Commerce operator request exceeds the bounded standard-input contract.')
  }
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new Error('Commerce operator request must be one UTF-8 JSON document.')
  }
  return commerceOperatorRequestSchema.parse(value)
}
