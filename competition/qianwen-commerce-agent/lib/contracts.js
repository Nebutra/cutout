import { createHash } from 'node:crypto'

export const VERSION = '1.0.6'
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
  Object.freeze({
    id: 'main', basename: 'main_image', label: 'Pure-white marketplace hero', size: '1024*1024',
    purpose: 'Establish an inspectable whole-product identity and a compliant marketplace first impression.',
  }),
  Object.freeze({
    id: 'detail-1', basename: 'detail_image_1', label: 'Source-supported alternate angle or reverse construction', size: '1024*1024',
    purpose: 'Resolve product shape or reverse construction that the hero cannot show.',
  }),
  Object.freeze({
    id: 'detail-2', basename: 'detail_image_2', label: 'Material and texture macro', size: '1024*1024',
    purpose: 'Make source-visible material character and surface texture inspectable.',
  }),
  Object.freeze({
    id: 'detail-3', basename: 'detail_image_3', label: 'Hardware, seam, and finish close-up', size: '1024*1024',
    purpose: 'Expose source-visible construction, hardware, seams, edges, and finish quality.',
  }),
  Object.freeze({
    id: 'detail-4', basename: 'detail_image_4', label: 'Silhouette, length, and proportion view', size: '1024*1024',
    purpose: 'Clarify the whole-product silhouette, relative length, and proportions.',
  }),
  Object.freeze({
    id: 'detail-5', basename: 'detail_image_5', label: 'Source-supported styling and merchandising context', size: '1024*1024',
    purpose: 'Close the set with source-supported usage or merchandising context without inventing accessories or claims.',
  }),
])

export const VIDEO_STORYBOARD = Object.freeze([
  Object.freeze({ range: '0.0-1.2s', purpose: 'Identity', direction: 'Hold the complete product clearly and preserve the accepted hero framing.' }),
  Object.freeze({ range: '1.2-3.4s', purpose: 'Evidence', direction: 'Use one controlled shallow move to reveal only source-visible material or construction.' }),
  Object.freeze({ range: '3.4-5.0s', purpose: 'Commerce close', direction: 'Return to a stable whole-product catalog hold with no captions or scene cut.' }),
])

export const MEDIA_INVENTORY_ROLES = Object.freeze({
  en: Object.freeze({
    prefix: 'Planned and QA-validated role',
    imageRoles: Object.freeze(IMAGE_ROLES.map((role) => role.label)),
    videoRole: 'Five-second product story with whole-product and construction holds',
  }),
  ko: Object.freeze({
    prefix: '계획 및 QA 검증 역할',
    imageRoles: Object.freeze(['순백 배경 마켓플레이스 메인 이미지', '원본 근거 기반의 다른 각도 또는 뒷면 구조', '소재 및 질감 매크로', '하드웨어, 봉제선 및 마감 클로즈업', '실루엣, 길이 및 비율 뷰', '원본 근거 기반 스타일링 및 판매 맥락']),
    videoRole: '전체 상품과 구조를 보여 주는 5초 상품 스토리',
  }),
  pt: Object.freeze({
    prefix: 'Funcao planejada e validada por QA',
    imageRoles: Object.freeze(['Imagem principal em fundo branco puro', 'Angulo alternativo ou construcao traseira com base na fonte', 'Macro de material e textura', 'Close de aviamentos, costuras e acabamento', 'Vista de silhueta, comprimento e proporcao', 'Contexto de styling e venda com base na fonte']),
    videoRole: 'Historia de produto de cinco segundos com vistas geral e construtiva',
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
