/** Minimal PNG-like bytes for contracts that inspect the signature and IHDR dimensions. */
export function pngDimensionFixture(
  width: number,
  height: number,
  marker = 0,
): Uint8Array {
  const bytes = new Uint8Array(25)
  bytes.set([0x89, 0x50, 0x4e, 0x47], 0)
  new DataView(bytes.buffer).setUint32(16, width, false)
  new DataView(bytes.buffer).setUint32(20, height, false)
  bytes[24] = marker
  return bytes
}
