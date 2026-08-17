import type {
  DesignScenarioIntentMatch,
  DesignScenarioIntentRecognizer,
} from '@/design-profile-platform/scenario-routing'
import { COMMERCE_PROFILE_ID } from './profile'

export interface CommerceMaterialIntent {
  readonly sourceText: string
}

const explicitDeliverable = /(?:跨境(?:电商)?(?:商品)?(?:本地化)?素材|商品(?:本地化|出海)素材(?:套装|整套)?|(?:localized|localised)\s+(?:e-?commerce|product)\s+(?:materials?|assets?|listing)|(?:e-?commerce|product)\s+(?:localization|localisation)\s+(?:materials?|assets?|listing))/iu
const commerceDomain = /(?:跨境|出海|电商|亚马逊|amazon|shopee|lazada|temu|e-?commerce|marketplace)/iu
const localization = /(?:本地化|多语言|目标市场|海外市场|localiz(?:e|ed|ation)|localis(?:e|ed|ation)|multi-?locale|market-?specific)/iu
const materialSet = /(?:商品素材|主图|详情图|商品视频|listing|materials?|assets?|product\s+(?:images?|video|copy))/iu

export function recognizeCommerceMaterialIntent(
  input: string,
): DesignScenarioIntentMatch<CommerceMaterialIntent> | undefined {
  const sourceText = input.trim()
  if (!sourceText || sourceText.length > 20_000) return undefined
  const explicit = explicitDeliverable.test(sourceText)
  const compound = commerceDomain.test(sourceText)
    && localization.test(sourceText)
    && materialSet.test(sourceText)
  if (!explicit && !compound) return undefined

  return {
    scenarioId: COMMERCE_PROFILE_ID,
    reason: explicit ? 'explicit-deliverable' : 'compound-domain-intent',
    intent: { sourceText },
  }
}

export const commerceMaterialIntentRecognizer: DesignScenarioIntentRecognizer<CommerceMaterialIntent> = {
  scenarioId: COMMERCE_PROFILE_ID,
  recognize: recognizeCommerceMaterialIntent,
}
