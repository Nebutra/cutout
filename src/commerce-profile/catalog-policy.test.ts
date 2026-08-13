import { describe, expect, it } from 'vitest'
import { buildAttributeIndex, buildCategoryIndex, validateCatalogSelection } from './catalog'
import { normalizeProductRecord } from './normalizer'
import {
  ALIEXPRESS_POLICY_PACKS,
  compileGenerationPolicy,
  validateLocalizedDescription,
} from './policies'
import {
  fixtureAttributeCatalog,
  fixtureCategoryCatalog,
  fixtureLocalizedDescription,
  fixtureProductRecord,
} from './commerce-profile.test-fixture'

describe('Commerce catalog closure and offline policies (P2-P4)', () => {
  const facts = normalizeProductRecord({ file: 'product.json', contents: JSON.stringify(fixtureProductRecord) })
  const categories = buildCategoryIndex(fixtureCategoryCatalog)
  const attributes = buildAttributeIndex(fixtureAttributeCatalog, categories)

  it('builds deterministic indexes and accepts only exact leaf/category enum closure', () => {
    expect(buildCategoryIndex(fixtureCategoryCatalog)).toEqual(categories)
    expect(categories.leafIds).toEqual(['bottoms', 'tops'])
    expect(() => validateCatalogSelection({
      categoryId: 'tops',
      attributes: { Material: 'Cotton', Color: 'Red' },
      categoryIndex: categories,
      attributeIndex: attributes,
    })).not.toThrow()
    expect(() => validateCatalogSelection({
      categoryId: 'apparel', attributes: {}, categoryIndex: categories, attributeIndex: attributes,
    })).toThrow(/not an exact catalog leaf/)
    expect(() => validateCatalogSelection({
      categoryId: 'tops', attributes: { Color: 'red' }, categoryIndex: categories, attributeIndex: attributes,
    })).toThrow(/value is not permitted/)
    expect(() => validateCatalogSelection({
      categoryId: 'tops', attributes: { Pattern: 'Solid' }, categoryIndex: categories, attributeIndex: attributes,
    })).toThrow(/key is not permitted/)
  })

  it('fails closed on duplicate categories, invalid references and duplicate enum values', () => {
    expect(() => buildCategoryIndex(JSON.stringify([
      { id: 'tops', name: 'Tops' },
      { id: 'tops', name: 'Duplicate' },
    ]))).toThrow(/unique/)
    expect(() => buildAttributeIndex(JSON.stringify([
      { categoryId: 'missing', key: 'Color', values: ['Red'] },
    ]), categories)).toThrow(/unknown category/)
    expect(() => buildAttributeIndex(JSON.stringify([
      { categoryId: 'tops', key: 'Color', values: ['Red', 'Red'] },
    ]), categories)).toThrow(/duplicate enum values/)
    expect(() => buildCategoryIndex(JSON.stringify([{
      id: 'declared-leaf',
      name: 'Declared leaf with hidden child',
      leaf: true,
      children: [{ id: 'child', name: 'Child' }],
    }]))).toThrow(/leaf flag conflicts/)
    expect(buildCategoryIndex(JSON.stringify([{
      id: 'stale-parent',
      name: 'Declared parent with no supplied children',
      leaf: false,
    }])).leafIds).toEqual(['stale-parent'])
  })

  it('parses official catId metadata and projects parent attributes onto descendant leaves', () => {
    const officialCategories = buildCategoryIndex(JSON.stringify({
      categories: [{
        catId: 29072,
        name: 'Women shirts and chiffon blouses',
        isLeaf: false,
        children: [
          { catId: 29073, name: 'Shirts', isLeaf: true },
          { catId: 29074, name: 'Button collar shirts', isLeaf: true },
        ],
      }],
    }))
    const officialAttributes = buildAttributeIndex(JSON.stringify({
      categories: [{
        categoryId: 29072,
        categoryMetadata: {
          categorySaleAttrList: [{
            attrId: '100000',
            attributeNameAlias: 'Color',
            isCustomized: true,
            values: [],
          }],
          categoryProductAttrList: [{
            attrId: '100157',
            attributeNameAlias: 'Material',
            isCustomized: false,
            values: [
              { id: '1000011', name: 'Polyester', valueNameAlias: 'Polyester fibre' },
              { id: '1001120', name: 'Chiffon', valueNameAlias: 'Chiffon' },
              { id: '1001121', name: 'Chiffon duplicate translation', valueNameAlias: 'Chiffon' },
            ],
          }],
        },
      }],
    }), officialCategories)

    expect(officialCategories.leafIds).toEqual(['29073', '29074'])
    expect(officialAttributes.definitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ categoryId: '29073', key: '100157', label: 'Material', values: ['Polyester fibre', 'Chiffon'] }),
      expect.objectContaining({ categoryId: '29074', key: '100000', label: 'Color', customizable: true }),
    ]))
    expect(() => validateCatalogSelection({
      categoryId: '29073',
      attributes: { '100157': 'Chiffon', '100000': 'Lavender' },
      categoryIndex: officialCategories,
      attributeIndex: officialAttributes,
    })).not.toThrow()
    expect(() => validateCatalogSelection({
      categoryId: '29073',
      attributes: { '100157': 'Cotton' },
      categoryIndex: officialCategories,
      attributeIndex: officialAttributes,
    })).toThrow(/value is not permitted/)

    const withUnmappedSourceCategory = buildAttributeIndex(JSON.stringify({
      categories: [
        {
          cid: 'source-only-category',
          categoryId: null,
          categoryMetadata: {
            categoryProductAttrList: [{
              attributeNameAlias: 'Unsafe unmapped attribute',
              values: [{ valueNameAlias: 'Must not be projected' }],
            }],
          },
        },
        {
          categoryId: 29073,
          categoryMetadata: {
            categoryProductAttrList: [{
              attrId: '100157',
              attributeNameAlias: 'Material',
              values: [{ valueNameAlias: 'Chiffon' }],
            }],
          },
        },
      ],
    }), officialCategories)
    expect(withUnmappedSourceCategory.definitions).toEqual([
      expect.objectContaining({ categoryId: '29073', key: '100157', label: 'Material' }),
    ])
  })

  it('keeps machine attribute ids distinct from colliding human-readable labels', () => {
    const collidingLabels = buildAttributeIndex(JSON.stringify({
      categories: [{
        categoryId: 'tops',
        categoryMetadata: {
          categoryProductAttrList: [
            { attrId: 'design-a', attributeNameAlias: 'Design', values: [{ id: 'a', valueNameAlias: 'Pleated' }] },
            { attrId: 'design-b', attributeNameAlias: 'Design', values: [{ id: 'b', valueNameAlias: 'Embroidered' }] },
          ],
        },
      }],
    }), categories)
    expect(collidingLabels.definitions.filter((entry) => entry.categoryId === 'tops'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ key: 'design-a', label: 'Design' }),
        expect.objectContaining({ key: 'design-b', label: 'Design' }),
      ]))
    expect(() => buildAttributeIndex(JSON.stringify({
      categories: [{
        categoryId: 'tops',
        categoryMetadata: {
          categoryProductAttrList: [
            { attrId: 'design-a', attributeNameAlias: 'Design', values: [{ id: 'a', valueNameAlias: 'Pleated' }] },
            { attrId: 'design-a', attributeNameAlias: 'Conflicting label', values: [{ id: 'b', valueNameAlias: 'Embroidered' }] },
          ],
        },
      }],
    }), categories)).toThrow(/unique within a source category/)
  })

  it('does not confuse a source-platform category id with the selected target catalog leaf', () => {
    const sourceCategoryFacts = normalizeProductRecord({
      file: 'product.json',
      contents: JSON.stringify({
        ...fixtureProductRecord,
        categoryId: 'source-category',
        leafCategoryId: undefined,
      }),
    })
    const description = fixtureLocalizedDescription(sourceCategoryFacts, 'en-US')
    const codes = validateLocalizedDescription({
      outcomeNodeId: 'outcome:en-US',
      description,
      facts: sourceCategoryFacts,
      policy: ALIEXPRESS_POLICY_PACKS['en-US'],
      categoryIndex: categories,
      attributeIndex: attributes,
    }).map((finding) => finding.code)
    expect(codes).not.toContain('category-fact-mismatch')
  })

  it('compiles all locale packs into model constraints and validates localized units and spelling', () => {
    for (const locale of ['en-US', 'ko-KR', 'pt-BR'] as const) {
      const compiled = compileGenerationPolicy(ALIEXPRESS_POLICY_PACKS[locale])
      expect(compiled.locale).toBe(locale)
      expect(compiled.constraints).toEqual(expect.arrayContaining([
        expect.stringContaining('Every factual claim'),
        expect.stringContaining('Video must be playable'),
      ]))
      expect(validateLocalizedDescription({
        outcomeNodeId: `outcome:${locale}`,
        description: fixtureLocalizedDescription(facts, locale),
        facts,
        policy: ALIEXPRESS_POLICY_PACKS[locale],
        categoryIndex: categories,
        attributeIndex: attributes,
      })).toEqual([])
    }

    const english = fixtureLocalizedDescription(facts, 'en-US')
    const invalid = {
      ...english,
      summary: [{ ...english.summary[0]!, text: 'Favourite size 60 cm with guaranteed results.' }],
    }
    expect(validateLocalizedDescription({
      outcomeNodeId: 'outcome:en-US',
      description: invalid,
      facts,
      policy: ALIEXPRESS_POLICY_PACKS['en-US'],
      categoryIndex: categories,
      attributeIndex: attributes,
    }).map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'locale-spelling', 'unit-not-localized', 'prohibited-claim', 'claim-dimensions-unsupported',
    ]))
  })

  it('rejects unresolved, unknown and semantically unsupported claim citations', () => {
    const english = fixtureLocalizedDescription(facts, 'en-US')
    const unknownFactId = facts.requiredUnknownFactIds.find((id) => facts.facts.find((fact) => fact.id === id)?.field === 'claim.certification')!
    const invalid = {
      ...english,
      summary: [
        { text: 'Officially certified.', citations: [{ factId: unknownFactId }] },
        { text: 'Waterproof performance.', citations: english.title.citations },
        { text: 'Unresolved claim.', citations: [{ factId: 'fact:missing' }] },
      ],
    }
    const codes = validateLocalizedDescription({
      outcomeNodeId: 'outcome:en-US',
      description: invalid,
      facts,
      policy: ALIEXPRESS_POLICY_PACKS['en-US'],
      categoryIndex: categories,
      attributeIndex: attributes,
    }).map((finding) => finding.code)
    expect(codes).toEqual(expect.arrayContaining([
      'citation-unknown',
      'claim-certification-unsupported',
      'claim-performance-unsupported',
      'citation-unresolved',
    ]))
  })

  it('rejects catalog and localized measurement values that conflict with normalized facts', () => {
    const english = fixtureLocalizedDescription(facts, 'en-US')
    const invalid = {
      ...english,
      attributes: english.attributes.map((claim, index) => index === 1
        ? { ...claim, text: 'Length: 99 inches' }
        : claim),
      catalogAttributes: { ...english.catalogAttributes, Material: 'Polyester' },
    }
    expect(validateLocalizedDescription({
      outcomeNodeId: 'outcome:en-US',
      description: invalid,
      facts,
      policy: ALIEXPRESS_POLICY_PACKS['en-US'],
      categoryIndex: categories,
      attributeIndex: attributes,
    }).map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'attribute-fact-mismatch',
      'measurement-fact-mismatch',
    ]))
  })

  it('rejects a catalog-valid attribute that has no normalized product evidence', () => {
    const extendedAttributes = buildAttributeIndex(JSON.stringify({
      tops: [
        { key: 'Material', values: ['Cotton'] },
        { key: 'Color', values: ['Red'] },
        { key: 'Size', values: ['M'] },
        { key: 'Pattern', values: ['Solid'] },
      ],
      bottoms: [{ key: 'Color', values: ['Black'] }],
    }), categories)
    const english = fixtureLocalizedDescription(facts, 'en-US')
    expect(validateLocalizedDescription({
      outcomeNodeId: 'outcome:en-US',
      description: { ...english, catalogAttributes: { ...english.catalogAttributes, Pattern: 'Solid' } },
      facts,
      policy: ALIEXPRESS_POLICY_PACKS['en-US'],
      categoryIndex: categories,
      attributeIndex: extendedAttributes,
    }).map((finding) => finding.code)).toContain('attribute-fact-unresolved')
  })
})
