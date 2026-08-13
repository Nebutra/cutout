import { createHash } from 'node:crypto'

export const VERSION = '1.0.1'
export const MODELS = Object.freeze({
  text: 'qwen3.8-max',
  qa: 'qwen3-vl-plus',
  image: 'qwen-image-3.0-pro',
  video: 'wan2.7-i2v-2026-04-25',
})

export const DASHSCOPE_ORIGIN = 'https://dashscope.aliyuncs.com'
export const ENDPOINT_PATHS = Object.freeze({
  text: '/compatible-mode/v1/chat/completions',
  image: '/api/v1/services/aigc/multimodal-generation/generation',
  video: '/api/v1/services/aigc/video-generation/video-synthesis',
  tasks: '/api/v1/tasks',
})

export const LIMITS = Object.freeze({
  runMs: 30 * 60 * 1000,
  finalizationMs: 60 * 1000,
  requestMs: 120 * 1000,
  qaRequestMs: 5 * 60 * 1000,
  imageRequestMs: 6 * 60 * 1000,
  pollRequestMs: 45 * 1000,
  maximumJsonResponseBytes: 2 * 1024 * 1024,
  maximumInputFileBytes: 8 * 1024 * 1024,
  maximumInputBytes: 24 * 1024 * 1024,
  maximumInputFiles: 3,
  maximumImageBytes: 10 * 1024 * 1024,
  maximumDetailImageBytes: 5 * 1024 * 1024,
  maximumVideoBytes: 199 * 1024 * 1024,
  maximumDocumentBytes: 512 * 1024,
  maximumPolls: 180,
  maximumGetAttempts: 4,
  pollIntervalMs: 5_000,
  maximumPromptBytes: 32 * 1024,
  maximumPathBytes: 4 * 1024,
})

export const DOCUMENT_NAMES = Object.freeze([
  'product_description_en.md',
  'product_description_ko.md',
  'product_description_pt.md',
  'strategy_document.md',
])
export const IMAGE_BASENAMES = Object.freeze([
  'main_image',
  'detail_image_1',
  'detail_image_2',
  'detail_image_3',
  'detail_image_4',
  'detail_image_5',
])
export const VIDEO_BASENAME = 'product_video'

export const IMAGE_ROLES = Object.freeze([
  Object.freeze({ id: 'main', basename: 'main_image', label: 'Main catalog image', size: '1024*1024' }),
  Object.freeze({ id: 'detail-1', basename: 'detail_image_1', label: 'Front and silhouette detail', size: '1024*1024' }),
  Object.freeze({ id: 'detail-2', basename: 'detail_image_2', label: 'Material and texture detail', size: '1024*1024' }),
  Object.freeze({ id: 'detail-3', basename: 'detail_image_3', label: 'Construction and finish detail', size: '1024*1024' }),
  Object.freeze({ id: 'detail-4', basename: 'detail_image_4', label: 'Fit and proportion detail', size: '1024*1024' }),
  Object.freeze({ id: 'detail-5', basename: 'detail_image_5', label: 'Supplementary product presentation', size: '1024*1024' }),
])

export const MEDIA_INVENTORY_ROLES = Object.freeze({
  en: Object.freeze({
    prefix: 'Planned and QA-validated role',
    imageRoles: Object.freeze(IMAGE_ROLES.map((role) => role.label)),
    videoRole: 'Stable five-second product presentation',
  }),
  ko: Object.freeze({
    prefix: '계획 및 QA 검증 역할',
    imageRoles: Object.freeze(['메인 카탈로그 이미지', '정면 및 실루엣 디테일', '소재 및 질감 디테일', '구조 및 마감 디테일', '핏 및 비율 디테일', '보조 상품 프레젠테이션']),
    videoRole: '안정적인 5초 상품 프레젠테이션',
  }),
  pt: Object.freeze({
    prefix: 'Funcao planejada e validada por QA',
    imageRoles: Object.freeze(['Imagem principal de catalogo', 'Detalhe frontal e da silhueta', 'Detalhe do material e da textura', 'Detalhe da construcao e do acabamento', 'Detalhe do caimento e da proporcao', 'Apresentacao complementar do produto']),
    videoRole: 'Apresentacao estavel do produto por cinco segundos',
  }),
})

export class AgentError extends Error {
  constructor(code, message, options = undefined) {
    super(message, options)
    this.name = 'AgentError'
    this.code = code
  }
}

export function invariant(condition, code, message) {
  if (!condition) throw new AgentError(code, message)
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function deterministicSeed(...parts) {
  const value = createHash('sha256').update(parts.join('\0')).digest().readUInt32BE(0)
  return Math.min(2_147_483_647, value)
}

export function exactOutputName(name) {
  return DOCUMENT_NAMES.includes(name)
    || IMAGE_BASENAMES.some((basename) => name === `${basename}.png` || name === `${basename}.jpeg`)
    || name === `${VIDEO_BASENAME}.mp4`
}
