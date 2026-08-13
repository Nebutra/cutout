import assert from 'node:assert/strict'
import { mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { inspectImage, inspectVideo } from '../lib/media.js'
import { MEDIA_INVENTORY_ROLES } from '../lib/contracts.js'
import { validateRehearsal, writeEvidenceReport } from '../scripts/validate-rehearsal.js'
import { mp4Fixture, pngFixture } from './helpers.js'

const cleanup = []
after(async () => { await Promise.all(cleanup.map((path) => rm(path, { recursive: true, force: true }))) })

const imageNames = ['main_image.png', 'detail_image_1.png', 'detail_image_2.png', 'detail_image_3.png', 'detail_image_4.png', 'detail_image_5.png']
const videoName = 'product_video.mp4'
const sourceLines = `- Product ID: OFFICIAL-100 \`offer.json/ret/result/result/offerId\`
- Source platform: 1688 \`offer.json/ret/result/result/sourceType\`
- Product URL: https://detail.example.test/offer/OFFICIAL-100 \`offer.json/ret/result/result/productUrl\``

function description({ locale, title, category, skus, attributes, identity, media, fidelity }) {
  const contract = MEDIA_INVENTORY_ROLES[locale]
  const localizedRoles = [...contract.imageRoles, contract.videoRole]
  const mediaLines = [...imageNames, videoName]
    .map((name, index) => `- ${name}: ${contract.prefix}: ${localizedRoles[index]}`).join('\n')
  return `# ${title}

**${category}:** Womens tops (29073)

## ${skus}

- **RED-M** - Color: red; Size: M \`offer.json/ret/result/result/productSkuInfos/0/skuId\`

## ${attributes}

- Material: cotton \`offer.json/ret/result/result/productAttribute/0/attrValue\`

## ${identity}

${sourceLines}

## ${media}

${mediaLines}

## ${fidelity}

Claims are limited to the supplied record and retain source annotations.
`
}

async function validOutput() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'qianwen-rehearsal-validator-')))
  cleanup.push(root)
  const imageArtifacts = []
  for (let index = 0; index < imageNames.length; index += 1) {
    const bytes = pngFixture(1024, 1024, index + 1)
    await writeFile(join(root, imageNames[index]), bytes)
    imageArtifacts.push({ name: imageNames[index], ...inspectImage(bytes, index === 0 ? 'main' : `detail-${index}`) })
  }
  const videoBytes = mp4Fixture()
  await writeFile(join(root, videoName), videoBytes)
  const video = { name: videoName, ...inspectVideo(videoBytes) }
  await Promise.all([
    writeFile(join(root, 'product_description_en.md'), description({
      locale: 'en',
      title: 'Red cotton everyday top', category: 'Exact leaf category', skus: 'SKU Breakdown', attributes: 'Product Attributes',
      identity: 'Source and Product Identity', media: 'Image and Video Assets', fidelity: 'Source Fidelity',
    })),
    writeFile(join(root, 'product_description_ko.md'), description({
      locale: 'ko',
      title: '레드 코튼 데일리 상의', category: '정확한 최하위 카테고리', skus: 'SKU 구성', attributes: '상품 속성',
      identity: '출처 및 상품 식별 정보', media: '이미지 및 영상 에셋', fidelity: '출처 일치성',
    })),
    writeFile(join(root, 'product_description_pt.md'), description({
      locale: 'pt',
      title: 'Blusa vermelha de algodao', category: 'Categoria final exata', skus: 'Detalhamento de SKUs', attributes: 'Atributos do produto',
      identity: 'Origem e identificacao do produto', media: 'Imagens e video', fidelity: 'Fidelidade a fonte',
    })),
  ])
  const mediaEvidence = [...imageArtifacts, video].map((artifact) =>
    `- ${artifact.name}: ${artifact.width} x ${artifact.height}px; SHA-256 \`${artifact.sha256}\``).join('\n')
  await writeFile(join(root, 'strategy_document.md'), `# Cross-Border Material Strategy

## Product and Evidence Lock

The exact catalog leaf and source facts are locked before generation.

## Localization Strategy

English, Korean, and Brazilian Portuguese copy retain source annotations.

## Image Strategy

${mediaEvidence}

## Video Strategy

${video.durationMs}ms ${video.codec} stable product presentation.

## Execution and Validation

Decoded pixels, physical constraints, hashes, and MP4 sample tables were validated.

## Source References

${sourceLines}
`)
  return root
}

test('emits deterministic path-free evidence for exact decoded output closure', async () => {
  const root = await validOutput()
  const report = await validateRehearsal(root)
  assert.equal(report.status, 'passed')
  assert.deepEqual(report.output, {
    expectedFileCount: 11, actualFileCount: 11, exactClosure: true, sha256: report.output.sha256,
  })
  assert.equal(report.artifacts.length, 11)
  assert.equal(report.checks.A6.decodedPhysicalEligibilityRatio, 1)
  assert.equal(report.artifacts.find((artifact) => artifact.name === videoName).sampleCount, 120)
  assert.ok(report.artifacts.every((artifact) => /^[a-f0-9]{64}$/.test(artifact.sha256)))
  const serialized = JSON.stringify(report)
  assert.doesNotMatch(serialized, /https?:\/\/|OFFICIAL-100|remote|task[_-]?id|checkpoint|signature|secret|api[_-]?key/i)
  assert.doesNotMatch(serialized, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('fails closed on partial, unexpected, and symlinked output entries', async () => {
  const partial = await validOutput()
  await rm(join(partial, 'detail_image_5.png'))
  await assert.rejects(validateRehearsal(partial), /exactly 11/)

  const extra = await validOutput()
  await writeFile(join(extra, 'provider-response.json'), '{}')
  await assert.rejects(validateRehearsal(extra), /exactly 11/)

  const linked = await validOutput()
  await rm(join(linked, 'detail_image_5.png'))
  await symlink(join(linked, 'detail_image_4.png'), join(linked, 'detail_image_5.png'))
  await assert.rejects(validateRehearsal(linked), /regular files only/)
})

test('fails closed on malformed media and unsafe document contents', async () => {
  const image = await validOutput()
  await writeFile(join(image, 'detail_image_3.png'), pngFixture(1024, 1024).subarray(0, 50))
  await assert.rejects(validateRehearsal(image), /PNG/)

  const video = await validOutput()
  const bytes = await readFile(join(video, videoName))
  await writeFile(join(video, videoName), bytes.subarray(0, bytes.length - 20))
  await assert.rejects(validateRehearsal(video), /MP4/)

  const mismatch = await validOutput()
  await writeFile(join(mismatch, 'detail_image_3.jpeg'), await readFile(join(mismatch, 'detail_image_3.png')))
  await rm(join(mismatch, 'detail_image_3.png'))
  await assert.rejects(validateRehearsal(mismatch), /extension does not match/)

  const unsafe = await validOutput()
  await writeFile(join(unsafe, 'product_description_en.md'), `${await readFile(join(unsafe, 'product_description_en.md'), 'utf8')}\nAPI key: sk-${'a'.repeat(24)}\n`)
  await assert.rejects(validateRehearsal(unsafe), /Credential-shaped content/)
})

test('rejects model-authored media descriptions that are not bound to the QA-validated role inventory', async () => {
  const root = await validOutput()
  const path = join(root, 'product_description_en.md')
  const text = await readFile(path, 'utf8')
  await writeFile(path, text.replace(
    '- product_video.mp4: Planned and QA-validated role: Stable five-second product presentation',
    '- product_video.mp4: Lifestyle context with a model in a city scene',
  ))
  await assert.rejects(validateRehearsal(root), /Deterministic media role closure/)

  const extra = await validOutput()
  const extraPath = join(extra, 'product_description_en.md')
  const extraText = await readFile(extraPath, 'utf8')
  await writeFile(extraPath, extraText.replace(
    '\n## Source Fidelity',
    '\n- Lifestyle scene: model-authored but not tied to a physical role\n\n## Source Fidelity',
  ))
  await assert.rejects(validateRehearsal(extra), /free-form entries/)
})

test('rejects non-canonical roots and writes a new sanitized report outside output closure', async () => {
  const root = await validOutput()
  await assert.rejects(validateRehearsal(`${root}/../${root.split('/').at(-1)}`), /normalized absolute path/)

  const alias = join(dirname(root), `${root.split('/').at(-1)}-alias`)
  await symlink(root, alias)
  await assert.rejects(validateRehearsal(alias), /symlinked path component/)

  const report = await validateRehearsal(root)
  const reportPath = join(dirname(root), `${root.split('/').at(-1)}-evidence.json`)
  cleanup.push(reportPath)
  await writeEvidenceReport(reportPath, report, root)
  assert.deepEqual(JSON.parse(await readFile(reportPath, 'utf8')), report)
  await assert.rejects(writeEvidenceReport(reportPath, report, root), /EEXIST/)
  await assert.rejects(writeEvidenceReport(join(root, 'evidence.json'), report, root), /outside/)

  const leakedPath = join(dirname(root), `${root.split('/').at(-1)}-leaked.json`)
  await assert.rejects(writeEvidenceReport(leakedPath, { ...report,
    sourceUrl: 'https://example.test/result.png?signature=private', remoteTaskId: 'remote-task-secret-1234' }, root), /disallowed runtime or remote data/)
})
