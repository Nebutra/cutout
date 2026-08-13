import { AgentError, LIMITS, invariant, sha256 } from './contracts.js'
import { inflateSync } from 'node:zlib'

function png(bytes) {
  invariant(bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'invalid-image', 'PNG signature is invalid.')
  let offset = 8
  let width
  let height
  let sawData = false
  let sawEnd = false
  const dataChunks = []
  let bitDepth
  let colorType
  let interlace
  let chunks = 0
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    invariant(length <= bytes.length - offset - 12, 'invalid-image', 'PNG chunk length is invalid.')
    if (chunks === 0) {
      invariant(type === 'IHDR' && length === 13, 'invalid-image', 'PNG must start with IHDR.')
      width = bytes.readUInt32BE(offset + 8); height = bytes.readUInt32BE(offset + 12)
      bitDepth = bytes[offset + 16]; colorType = bytes[offset + 17]; interlace = bytes[offset + 20]
      invariant([1, 2, 4, 8, 16].includes(bitDepth), 'invalid-image', 'PNG bit depth is invalid.')
    }
    if (type === 'IDAT') { sawData = true; dataChunks.push(bytes.subarray(offset + 8, offset + 8 + length)) }
    if (type === 'IEND') { invariant(length === 0, 'invalid-image', 'PNG IEND is invalid.'); sawEnd = true; offset += 12; break }
    offset += 12 + length
    chunks += 1
    invariant(chunks <= 100_000, 'invalid-image', 'PNG has too many chunks.')
  }
  invariant(sawData && sawEnd && offset === bytes.length && width > 0 && height > 0,
    'invalid-image', 'PNG structure is incomplete.')
  const channels = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]).get(colorType)
  invariant(channels && interlace === 0, 'invalid-image', 'PNG color/interlace format is unsupported.')
  const rowBytes = Math.ceil(width * channels * bitDepth / 8)
  const expectedBytes = (rowBytes + 1) * height
  invariant(expectedBytes > 0 && expectedBytes <= 64 * 1024 * 1024, 'invalid-image', 'PNG decoded size exceeds the limit.')
  let decoded
  try { decoded = inflateSync(Buffer.concat(dataChunks), { maxOutputLength: expectedBytes + 1 }) }
  catch { throw new AgentError('invalid-image', 'PNG pixel data could not be decompressed.') }
  invariant(decoded.length === expectedBytes, 'invalid-image', 'PNG decoded scanline length is invalid.')
  for (let row = 0; row < height; row += 1) {
    invariant(decoded[row * (rowBytes + 1)] <= 4, 'invalid-image', 'PNG scanline filter is invalid.')
  }
  return { mediaType: 'image/png', extension: 'png', width, height }
}

function jpeg(bytes) {
  invariant(bytes.length >= 32 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9,
    'invalid-image', 'JPEG signature is invalid.')
  let offset = 2
  let width
  let height
  let sawScan = false
  while (offset + 1 < bytes.length - 2) {
    if (bytes[offset] !== 0xff) {
      invariant(sawScan, 'invalid-image', 'JPEG marker stream is invalid.')
      offset += 1; continue
    }
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset++]
    if (marker === 0xd9) break
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    invariant(offset + 2 <= bytes.length, 'invalid-image', 'JPEG segment is truncated.')
    const length = bytes.readUInt16BE(offset)
    invariant(length >= 2 && offset + length <= bytes.length, 'invalid-image', 'JPEG segment length is invalid.')
    const isStartOfFrame = (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
    if (isStartOfFrame) {
      invariant(length >= 8, 'invalid-image', 'JPEG frame is invalid.')
      height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5)
    }
    if (marker === 0xda) sawScan = true
    offset += length
  }
  invariant(width > 0 && height > 0 && sawScan, 'invalid-image', 'JPEG has no decodable image frame.')
  return { mediaType: 'image/jpeg', extension: 'jpeg', width, height }
}

export function inspectImage(bytes, role) {
  invariant(Buffer.isBuffer(bytes) && bytes.length > 0, 'invalid-image', 'Image bytes are missing.')
  const info = bytes[0] === 0x89 ? png(bytes) : jpeg(bytes)
  if (role === 'main') {
    invariant(info.width >= 800 && info.height >= 800, 'invalid-image', 'Main image must be at least 800 x 800 pixels.')
    invariant(bytes.length <= LIMITS.maximumImageBytes, 'invalid-image', 'Main image exceeds the package byte limit.')
  } else {
    invariant(info.width > 260 && info.height > 260, 'invalid-image', 'Detail image dimensions must both exceed 260 pixels.')
    invariant(bytes.length <= LIMITS.maximumDetailImageBytes, 'invalid-image', 'Detail image exceeds 5 MB.')
  }
  return Object.freeze({ kind: 'image', ...info, bytes: bytes.length, sha256: sha256(bytes) })
}

function children(bytes, start, end, maximum = 200_000) {
  const result = []
  let offset = start
  while (offset + 8 <= end) {
    let size = bytes.readUInt32BE(offset)
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    let header = 8
    if (size === 1) {
      invariant(offset + 16 <= end, 'invalid-video', 'Extended MP4 box is truncated.')
      const large = bytes.readBigUInt64BE(offset + 8)
      invariant(large <= BigInt(Number.MAX_SAFE_INTEGER), 'invalid-video', 'MP4 box is too large.')
      size = Number(large); header = 16
    } else if (size === 0) size = end - offset
    invariant(size >= header && offset + size <= end, 'invalid-video', `MP4 box length is invalid: ${type}`)
    result.push({ type, start: offset, dataStart: offset + header, end: offset + size, size })
    invariant(result.length <= maximum, 'invalid-video', 'MP4 box count exceeds the limit.')
    offset += size
  }
  invariant(offset === end, 'invalid-video', 'MP4 box region has trailing bytes.')
  return result
}
function child(bytes, box, type, offset = 0) {
  return children(bytes, box.dataStart + offset, box.end).find((candidate) => candidate.type === type)
}
function u32(bytes, offset, end) {
  invariant(offset + 4 <= end, 'invalid-video', 'MP4 integer is truncated.')
  return bytes.readUInt32BE(offset)
}
function movieDuration(bytes, mvhd) {
  const version = bytes[mvhd.dataStart]
  const timescaleOffset = mvhd.dataStart + (version === 1 ? 20 : 12)
  const durationOffset = timescaleOffset + 4
  const timescale = u32(bytes, timescaleOffset, mvhd.end)
  let duration
  if (version === 1) {
    invariant(durationOffset + 8 <= mvhd.end, 'invalid-video', 'MP4 duration is truncated.')
    const raw = bytes.readBigUInt64BE(durationOffset)
    invariant(raw <= BigInt(Number.MAX_SAFE_INTEGER), 'invalid-video', 'MP4 duration is too large.')
    duration = Number(raw)
  } else duration = u32(bytes, durationOffset, mvhd.end)
  invariant(timescale > 0 && duration > 0, 'invalid-video', 'MP4 duration is invalid.')
  return Math.round(duration / timescale * 1_000)
}
function handlerType(bytes, hdlr) {
  invariant(hdlr.dataStart + 12 <= hdlr.end, 'invalid-video', 'MP4 handler is truncated.')
  return bytes.toString('ascii', hdlr.dataStart + 8, hdlr.dataStart + 12)
}
function videoTrack(bytes, trak) {
  const mdia = child(bytes, trak, 'mdia')
  if (!mdia) return undefined
  const hdlr = child(bytes, mdia, 'hdlr', 0)
  if (!hdlr || handlerType(bytes, hdlr) !== 'vide') return undefined
  const tkhd = child(bytes, trak, 'tkhd')
  invariant(tkhd, 'invalid-video', 'Video track header is missing.')
  const version = bytes[tkhd.dataStart]
  const widthOffset = tkhd.dataStart + (version === 1 ? 88 : 76)
  invariant(widthOffset + 8 <= tkhd.end, 'invalid-video', 'Video dimensions are truncated.')
  const width = bytes.readUInt32BE(widthOffset) >>> 16
  const height = bytes.readUInt32BE(widthOffset + 4) >>> 16
  const minf = child(bytes, mdia, 'minf')
  const stbl = minf && child(bytes, minf, 'stbl')
  const stsd = stbl && child(bytes, stbl, 'stsd', 0)
  const stsz = stbl && child(bytes, stbl, 'stsz', 0)
  invariant(stsd && stsz, 'invalid-video', 'Video sample table is incomplete.')
  const entryCount = u32(bytes, stsd.dataStart + 4, stsd.end)
  invariant(entryCount > 0 && stsd.dataStart + 16 <= stsd.end, 'invalid-video', 'Video codec description is missing.')
  const codec = bytes.toString('ascii', stsd.dataStart + 12, stsd.dataStart + 16)
  invariant(['avc1', 'avc3', 'hvc1', 'hev1', 'vp09', 'av01'].includes(codec), 'invalid-video', `Unsupported video codec: ${codec}`)
  const sampleCount = u32(bytes, stsz.dataStart + 8, stsz.end)
  invariant(sampleCount > 0, 'invalid-video', 'Video has no samples.')
  return { width, height, codec, sampleCount }
}

export function inspectVideo(bytes) {
  invariant(Buffer.isBuffer(bytes) && bytes.length >= 256 && bytes.length < 200 * 1024 * 1024,
    'invalid-video', 'Video size must be greater than zero and below 200 MB.')
  const top = children(bytes, 0, bytes.length)
  const ftyp = top.find((box) => box.type === 'ftyp')
  const moov = top.find((box) => box.type === 'moov')
  const mdat = top.find((box) => box.type === 'mdat')
  invariant(ftyp && moov && mdat && mdat.size > 16, 'invalid-video', 'Video container requires ftyp, moov and non-empty mdat boxes.')
  invariant(ftyp.dataStart + 8 <= ftyp.end, 'invalid-video', 'Video ftyp box is invalid.')
  const majorBrand = bytes.toString('ascii', ftyp.dataStart, ftyp.dataStart + 4)
  const compatibleBrands = bytes.toString('ascii', ftyp.dataStart + 8, ftyp.end)
  invariant(/(?:isom|iso[23456]|mp4[12]|avc1|qt  )/.test(`${majorBrand}${compatibleBrands}`), 'invalid-video', 'Video container brand is unsupported.')
  const mvhd = child(bytes, moov, 'mvhd')
  invariant(mvhd, 'invalid-video', 'Video movie header is missing.')
  const durationMs = movieDuration(bytes, mvhd)
  const tracks = children(bytes, moov.dataStart, moov.end).filter((box) => box.type === 'trak')
  const video = tracks.map((track) => videoTrack(bytes, track)).find(Boolean)
  invariant(video && video.width > 0 && video.height > 0, 'invalid-video', 'Video has no valid playable video track.')
  return Object.freeze({
    kind: 'video', mediaType: 'video/mp4', extension: 'mp4', bytes: bytes.length, sha256: sha256(bytes),
    width: video.width, height: video.height, codec: video.codec, sampleCount: video.sampleCount, durationMs,
  })
}

export function inspectDocument(bytes, name) {
  invariant(Buffer.isBuffer(bytes) && bytes.length > 100 && bytes.length <= LIMITS.maximumDocumentBytes,
    'invalid-document', `Document byte size is invalid: ${name}`)
  const text = bytes.toString('utf8')
  invariant(!text.includes('\0') && Buffer.from(text, 'utf8').equals(bytes), 'invalid-document', `Document must be valid UTF-8: ${name}`)
  return Object.freeze({ kind: 'document', mediaType: 'text/markdown', bytes: bytes.length, sha256: sha256(bytes) })
}
