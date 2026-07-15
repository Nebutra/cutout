import type { SecretHandle } from '../contracts'

export type NotionObjectKind = 'page' | 'database'

export interface NotionRichText { readonly plainText: string; readonly href?: string }
export interface NotionBlock {
  readonly id: string
  readonly type: string
  readonly lastEditedTime: string
  readonly richText?: readonly NotionRichText[]
  readonly checked?: boolean
  readonly language?: string
  readonly url?: string
  readonly hasChildren?: boolean
}
export interface NotionObject {
  readonly id: string
  readonly kind: NotionObjectKind
  readonly title: string
  readonly url: string
  readonly lastEditedTime: string
  readonly parentId?: string
}
export interface NotionPage<T> { readonly items: readonly T[]; readonly nextCursor?: string }
export interface NotionPublishBlock { readonly type: 'heading_1' | 'heading_2' | 'paragraph' | 'bulleted_list_item' | 'code' | 'divider'; readonly text?: string; readonly language?: string }

export interface NotionHost {
  retrieve(locator: string, options: { readonly secretHandle: SecretHandle; readonly signal: AbortSignal }): Promise<NotionObject>
  listBlocks(objectId: string, options: { readonly cursor?: string; readonly pageSize: number; readonly secretHandle: SecretHandle; readonly signal: AbortSignal }): Promise<NotionPage<NotionBlock>>
  publishPage(input: { readonly parentPageId: string; readonly title: string; readonly blocks: readonly NotionPublishBlock[]; readonly idempotencyKey: string }, options: { readonly secretHandle: SecretHandle; readonly signal: AbortSignal }): Promise<{ readonly page: NotionObject }>
}

export class NotionRateLimitError extends Error {
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super(`Notion rate limited the request; retry after ${retryAfterSeconds} seconds.`)
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export interface NotionWebhookSignal { readonly deliveryId: string; readonly objectId: string; readonly eventType: string; readonly receivedAt: string; readonly signatureVerifiedByHost: true }

export class NotionWebhookDedupe {
  readonly #ids = new Set<string>()
  accept(signal: NotionWebhookSignal): { readonly duplicate: boolean; readonly staleObjectId: string } {
    if (this.#ids.has(signal.deliveryId)) return { duplicate: true, staleObjectId: signal.objectId }
    this.#ids.add(signal.deliveryId)
    return { duplicate: false, staleObjectId: signal.objectId }
  }
}
