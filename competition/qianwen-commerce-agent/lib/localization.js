import { invariant, sha256 } from './contracts.js'

const LOCALE_IDS = Object.freeze(['en', 'ko', 'pt'])
const MAXIMUM_MODEL_LOCALIZATION_FACTS = 80
const CREDENTIAL_SHAPED_TEXT = /(?:\bBearer\s+[A-Za-z0-9._~+/-]{12,}|\bsk-[A-Za-z0-9_-]{16,})/iu
const HAN = /\p{Script=Han}/u
const NON_LATIN_MARKET_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const NON_KOREAN_MARKET_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u

const KEY_LABELS = Object.freeze({
  en: Object.freeze({ color: 'Color', size: 'Size', material: 'Material', pattern: 'Pattern', 'sleeve-length': 'Sleeve length', 'sleeve-type': 'Sleeve and cuff', 'garment-length': 'Garment length', fit: 'Fit', waist: 'Waist', collar: 'Collar', closure: 'Closure', season: 'Season', style: 'Style' }),
  ko: Object.freeze({ color: '색상', size: '사이즈', material: '소재', pattern: '패턴', 'sleeve-length': '소매 길이', 'sleeve-type': '소매 및 커프스', 'garment-length': '총장', fit: '핏', waist: '허리', collar: '칼라', closure: '여밈', season: '계절', style: '스타일' }),
  pt: Object.freeze({ color: 'Cor', size: 'Tamanho', material: 'Material', pattern: 'Estampa', 'sleeve-length': 'Comprimento da manga', 'sleeve-type': 'Manga e punho', 'garment-length': 'Comprimento da peca', fit: 'Caimento', waist: 'Cintura', collar: 'Gola', closure: 'Fechamento', season: 'Estacao', style: 'Estilo' }),
})

const KEY_CONCEPTS = Object.freeze([
  Object.freeze({ id: 'color', pattern: /^(?:颜色|色彩|色号|color|colour)$/iu }),
  Object.freeze({ id: 'size', pattern: /^(?:尺码|尺寸|号型|适合身高|size|sizing|height)$/iu }),
  Object.freeze({ id: 'material', pattern: /^(?:材质|材质名称|面料|面料名称|(?:主|次|辅|里)?面料成分\d*|(?:主|次|辅|里)料成分|material|fabric|composition)$/iu }),
  Object.freeze({ id: 'pattern', pattern: /^(?:图案(?:花纹)?|花型|印花|pattern|print)$/iu }),
  Object.freeze({ id: 'sleeve-length', pattern: /^(?:袖长|sleeve\s*length)$/iu }),
  Object.freeze({ id: 'sleeve-type', pattern: /^(?:袖型|袖口|cuff|sleeve\s*type)$/iu }),
  Object.freeze({ id: 'garment-length', pattern: /^(?:衣长|裙长|半裙长|裤长|garment\s*length|top\s*length|skirt\s*length|pants?\s*length|shorts?\s*length)$/iu }),
  Object.freeze({ id: 'fit', pattern: /^(?:版型|廓形|fit)$/iu }),
  Object.freeze({ id: 'waist', pattern: /^(?:腰型|腰围|腰带|waist)$/iu }),
  Object.freeze({ id: 'collar', pattern: /^(?:领型|领口|衣领(?:类型)?|collar|neckline)$/iu }),
  Object.freeze({ id: 'closure', pattern: /^(?:门襟|闭合方式|closure|fastening)$/iu }),
  Object.freeze({ id: 'season', pattern: /^(?:季节|适用季节|适合季节|season)$/iu }),
  Object.freeze({ id: 'style', pattern: /^(?:风格|风格类型|款式|style)$/iu }),
])

const VALUE_LABELS = Object.freeze({
  en: Object.freeze({
    红色: 'red', 酒红色: 'burgundy', 紫色: 'purple', 白色: 'white', 黑色: 'black', 绿色: 'green', 军绿色: 'army green', 蓝色: 'blue', 深灰色: 'dark gray', 灰色: 'gray', 黄色: 'yellow', 杏色: 'apricot', 米色: 'beige', 燕麦色: 'oatmeal', 粉色: 'pink', 紫罗兰: 'violet', 雾霾蓝: 'dusty blue', 薄荷绿: 'mint green', 卡其色: 'khaki', 焦糖色: 'caramel', 花色: 'multicolor',
    棉: 'cotton', 涤纶: 'polyester', 冰丝: 'ice silk', 羊毛: 'wool', 雪纺: 'chiffon', 针织: 'knit', 长袖: 'long sleeve', 短袖: 'short sleeve', 常规袖: 'regular sleeve', 常规: 'regular', 纯色: 'solid color', 中长款: 'midi length', 长裙: 'maxi length', 中腰: 'mid rise', 高腰: 'high rise', 宽松腰: 'relaxed waist', 无腰带: 'no belt', 有腰带: 'with belt', 无: 'none', 否: 'no', 是: 'yes', 均码: 'one size', 尺码可定制: 'custom sizing', 颜色可定制: 'custom color',
  }),
  ko: Object.freeze({
    红色: '레드', 酒红色: '버건디', 紫色: '퍼플', 白色: '화이트', 黑色: '블랙', 绿色: '그린', 军绿色: '아미 그린', 蓝色: '블루', 深灰色: '다크 그레이', 灰色: '그레이', 黄色: '옐로', 杏色: '애프리콧', 米色: '베이지', 燕麦色: '오트밀', 粉色: '핑크', 紫罗兰: '바이올렛', 雾霾蓝: '더스티 블루', 薄荷绿: '민트 그린', 卡其色: '카키', 焦糖色: '캐러멜', 花色: '멀티컬러',
    棉: '면', 涤纶: '폴리에스터', 冰丝: '아이스 실크', 羊毛: '울', 雪纺: '시폰', 针织: '니트', 长袖: '긴소매', 短袖: '반소매', 常规袖: '기본 소매', 常规: '기본형', 纯色: '무지', 中长款: '미디 길이', 长裙: '맥시 길이', 中腰: '미드라이즈', 高腰: '하이라이즈', 宽松腰: '여유로운 허리', 无腰带: '벨트 없음', 有腰带: '벨트 포함', 无: '없음', 否: '아니요', 是: '예', 均码: '원사이즈', 尺码可定制: '맞춤 사이즈', 颜色可定制: '맞춤 색상',
  }),
  pt: Object.freeze({
    红色: 'vermelho', 酒红色: 'bordo', 紫色: 'roxo', 白色: 'branco', 黑色: 'preto', 绿色: 'verde', 军绿色: 'verde militar', 蓝色: 'azul', 深灰色: 'cinza-escuro', 灰色: 'cinza', 黄色: 'amarelo', 杏色: 'damasco', 米色: 'bege', 燕麦色: 'aveia', 粉色: 'rosa', 紫罗兰: 'violeta', 雾霾蓝: 'azul acinzentado', 薄荷绿: 'verde-menta', 卡其色: 'caqui', 焦糖色: 'caramelo', 花色: 'multicolorido',
    棉: 'algodao', 涤纶: 'poliester', 冰丝: 'seda gelada', 羊毛: 'la', 雪纺: 'chiffon', 针织: 'malha', 长袖: 'manga longa', 短袖: 'manga curta', 常规袖: 'manga regular', 常规: 'regular', 纯色: 'cor lisa', 中长款: 'comprimento midi', 长裙: 'comprimento longo', 中腰: 'cintura media', 高腰: 'cintura alta', 宽松腰: 'cintura solta', 无腰带: 'sem cinto', 有腰带: 'com cinto', 无: 'nenhum', 否: 'nao', 是: 'sim', 均码: 'tamanho unico', 尺码可定制: 'tamanho personalizavel', 颜色可定制: 'cor personalizavel',
  }),
})

const SOURCE_LABEL = Object.freeze({ en: 'source value', ko: '원문 값', pt: 'valor original' })

function normalized(value) { return String(value).normalize('NFKC').trim().replace(/\s+/g, ' ') }
function decimal(value) { return Number(value.toFixed(1)).toString() }
function keyConcept(key) { return KEY_CONCEPTS.find(({ pattern }) => pattern.test(normalized(key)))?.id }
function exactObjectKeys(value, expected, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value),
    'invalid-model-output', `${label} must be an object.`)
  const actual = Object.keys(value).sort()
  const keys = [...expected].sort()
  invariant(actual.length === keys.length && actual.every((key, index) => key === keys[index]),
    'invalid-model-output', `${label} fields do not match the exact contract.`)
}
function numericTokens(value) { return value.match(/\d+(?:\.\d+)?/gu) ?? [] }
function protectedTokens(value) {
  return value.match(/(?:[A-Za-z][A-Za-z0-9._/-]*\d[A-Za-z0-9._/-]*|\d+[A-Z][A-Z0-9._/-]*)/giu) ?? []
}
function factId(key, value) { return `fact:${sha256(JSON.stringify([normalized(key), normalized(value)])).slice(0, 20)}` }

function convertWeightRanges(value, locale) {
  return value.replace(/(\d+(?:\.\d+)?)\s*[-~至到]\s*(\d+(?:\.\d+)?)\s*斤/giu, (_, rawMinimum, rawMaximum) => {
    const minimum = Number(rawMinimum)
    const maximum = Number(rawMaximum)
    const kg = `${decimal(minimum / 2)}-${decimal(maximum / 2)} kg`
    return locale === 'en' ? `${decimal(minimum * 1.102311)}-${decimal(maximum * 1.102311)} lb (${kg})` : kg
  }).replace(/(\d+(?:\.\d+)?)\s*斤/giu, (_, raw) => {
    const jin = Number(raw)
    const kg = `${decimal(jin / 2)} kg`
    return locale === 'en' ? `${decimal(jin * 1.102311)} lb (${kg})` : kg
  })
}

function convertCentimeters(value, locale) {
  return value.replace(/(\d+(?:\.\d+)?)\s*cm\b/giu, (_, raw) => {
    const centimeters = Number(raw)
    return locale === 'en' ? `${decimal(centimeters / 2.54)} in (${decimal(centimeters)} cm)` : `${decimal(centimeters)} cm`
  })
}

function translatePhrases(value, locale) {
  let result = normalized(value)
  const labels = VALUE_LABELS[locale]
  if (Object.hasOwn(labels, result)) return labels[result]
  const phrases = Object.entries(labels).sort((left, right) => right[0].length - left[0].length)
  for (const [source, localized] of phrases) {
    if ([...source].length > 1) result = result.replaceAll(source, localized)
  }
  const structural = locale === 'en'
    ? [['误差范围', 'measurement tolerance'], ['适合身高', 'recommended height'], ['衣长', 'garment length'], ['裙长', 'skirt length'], ['裤长', 'shorts length'], ['码', ' CN']]
    : locale === 'ko'
      ? [['误差范围', '측정 오차'], ['适合身高', '권장 신장'], ['衣长', '총장'], ['裙长', '스커트 길이'], ['裤长', '바지 길이'], ['码', ' CN']]
      : [['误差范围', 'tolerancia de medida'], ['适合身高', 'altura recomendada'], ['衣长', 'comprimento da peca'], ['裙长', 'comprimento da saia'], ['裤长', 'comprimento do shorts'], ['码', ' CN']]
  for (const [source, localized] of structural) result = result.replaceAll(source, localized)
  return result
}

function deterministicFact(locale, key, value) {
  const sourceKey = normalized(key)
  const sourceValue = normalized(value)
  const concept = keyConcept(sourceKey)
  const localizedKey = KEY_LABELS[locale]?.[concept] ?? sourceKey
  let localizedValue = translatePhrases(sourceValue, locale)
  localizedValue = convertWeightRanges(localizedValue, locale)
  localizedValue = convertCentimeters(localizedValue, locale)
  return { key: localizedKey, value: localizedValue, sourceKey, sourceValue }
}

function safeModelText(value, label) {
  invariant(typeof value === 'string' && value.trim() && value.length <= 500
    && !/[\r\n`]/u.test(value) && !value.includes(String.fromCharCode(0)) && !CREDENTIAL_SHAPED_TEXT.test(value)
    && !/https?:\/\//iu.test(value),
  'invalid-model-output', `${label} is missing, unsafe, or exceeds its limit.`)
  return normalized(value)
}

function requiredFactLocalizationEntries(facts) {
  const unique = new Map()
  for (const fact of [...facts.attributes, ...facts.skus.flatMap((sku) => sku.attributes)]) {
    const sourceKey = normalized(fact.key)
    const sourceValue = normalized(fact.value)
    unique.set(`${sourceKey}\0${sourceValue}`, { sourceKey, sourceValue })
  }
  const required = []
  const ids = new Set()
  for (const fact of unique.values()) {
    const locales = Object.fromEntries(LOCALE_IDS.map((locale) => {
      const localized = deterministicFact(locale, fact.sourceKey, fact.sourceValue)
      return [locale, Object.freeze({ key: localized.key, value: localized.value })]
    }))
    if (!Object.values(locales).some(({ key, value }) => HAN.test(`${key} ${value}`))) continue
    invariant(fact.sourceKey.length <= 160 && fact.sourceValue.length <= 500,
      'invalid-product', 'A required fact localization exceeds the bounded model-translation contract.')
    const id = factId(fact.sourceKey, fact.sourceValue)
    invariant(!ids.has(id), 'invalid-product', 'Fact localization identity collision detected.')
    ids.add(id)
    required.push(Object.freeze({ id, ...fact, locales: Object.freeze(locales) }))
  }
  return Object.freeze({ uniqueFactCount: unique.size, required: Object.freeze(required) })
}

export function factLocalizationInventory(facts) {
  const { required } = requiredFactLocalizationEntries(facts)
  invariant(required.length <= MAXIMUM_MODEL_LOCALIZATION_FACTS,
    'invalid-product', `Required fact localization exceeds ${MAXIMUM_MODEL_LOCALIZATION_FACTS} entries.`)
  return required
}

export function factLocalizationInventoryCoverage(facts, inventory = factLocalizationInventory(facts)) {
  const { uniqueFactCount, required } = requiredFactLocalizationEntries(facts)
  const requestedIds = inventory.map(({ id }) => id)
  const requiredIds = required.map(({ id }) => id)
  const inventoryClosureComplete = requestedIds.length === requiredIds.length
    && requestedIds.every((id, index) => id === requiredIds[index])
  return Object.freeze({
    uniqueFactCount,
    requiredModelTranslations: requiredIds.length,
    requestedModelTranslations: requestedIds.length,
    inventoryClosureComplete,
  })
}

export function decodeFactTranslations(value, inventory) {
  invariant(Array.isArray(value) && value.length === inventory.length,
    'invalid-model-output', 'Fact translations must match the exact requested closure.')
  const translations = value.map((entry, index) => {
    const expected = inventory[index]
    exactObjectKeys(entry, ['id', ...LOCALE_IDS], `Fact translation ${index + 1}`)
    invariant(entry.id === expected.id, 'invalid-model-output', 'Fact translation identity or order changed.')
    const localized = { id: entry.id }
    for (const locale of LOCALE_IDS) {
      exactObjectKeys(entry[locale], ['key', 'value'], `Fact translation ${index + 1} ${locale}`)
      const key = safeModelText(entry[locale].key, `Fact translation ${index + 1} ${locale} key`)
      const translatedValue = safeModelText(entry[locale].value, `Fact translation ${index + 1} ${locale} value`)
      const combined = `${key} ${translatedValue}`
      invariant(locale === 'ko' ? !NON_KOREAN_MARKET_SCRIPT.test(combined) : !NON_LATIN_MARKET_SCRIPT.test(combined),
        'invalid-model-output', `Fact translation ${index + 1} contains target-locale script leakage.`)
      if (locale === 'ko') invariant(/\p{Script=Hangul}/u.test(combined),
        'invalid-model-output', `Fact translation ${index + 1} lacks Korean localization.`)
      invariant(JSON.stringify(numericTokens(translatedValue)) === JSON.stringify(numericTokens(expected.locales[locale].value)),
        'invalid-model-output', `Fact translation ${index + 1} changed numeric evidence.`)
      for (const token of protectedTokens(expected.locales[locale].value)) {
        invariant(translatedValue.includes(token), 'invalid-model-output', `Fact translation ${index + 1} changed a protected model or size token.`)
      }
      localized[locale] = Object.freeze({ key, value: translatedValue })
    }
    return Object.freeze(localized)
  })
  return Object.freeze(translations)
}

export function indexFactTranslations(translations) {
  return new Map(translations.map((translation) => [translation.id, translation]))
}

export function localizeFact(locale, key, value, translationIndex = undefined) {
  const deterministic = deterministicFact(locale, key, value)
  const translated = translationIndex?.get(factId(key, value))?.[locale]
  const localizedKey = translated?.key ?? deterministic.key
  const localizedValue = translated?.value ?? deterministic.value
  const changed = localizedKey !== deterministic.sourceKey || localizedValue !== deterministic.sourceValue
  return Object.freeze({
    key: localizedKey,
    value: localizedValue,
    sourceKey: deterministic.sourceKey,
    sourceValue: deterministic.sourceValue,
    changed,
    display: changed ? `${localizedKey}: ${localizedValue} (${SOURCE_LABEL[locale]}: \`${deterministic.sourceValue}\`)` : `${localizedKey}: ${localizedValue}`,
  })
}

export function localizationSummary(facts, translationIndex = undefined) {
  const unique = new Map()
  for (const fact of [...facts.attributes, ...facts.skus.flatMap((sku) => sku.attributes)]) {
    unique.set(`${fact.key}\0${fact.value}`, fact)
  }
  const values = [...unique.values()]
  const localized = Object.fromEntries(Object.keys(KEY_LABELS).map((locale) => [locale,
    values.filter(({ key, value }) => {
      const result = localizeFact(locale, key, value, translationIndex)
      return locale === 'ko' ? !NON_KOREAN_MARKET_SCRIPT.test(`${result.key} ${result.value}`)
        : !NON_LATIN_MARKET_SCRIPT.test(`${result.key} ${result.value}`)
    }).length]))
  return Object.freeze({ sourceFactCount: values.length, requestedModelTranslations: factLocalizationInventory(facts).length, localized })
}
