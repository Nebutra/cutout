export interface PngDimensions { readonly width: number; readonly height: number }

export function pngDimensions(bytes: Uint8Array): PngDimensions {
  if (bytes.byteLength < 24 || !hasPngMagic(bytes)) throw new Error('Expected a valid PNG signature and IHDR.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  if (width < 1 || height < 1) throw new Error('PNG dimensions must be positive.')
  return { width, height }
}

export function hasPngMagic(bytes: Uint8Array): boolean {
  const magic = [137, 80, 78, 71, 13, 10, 26, 10]
  return magic.every((value, index) => bytes[index] === value)
}

export function assertNormalizedPng(bytes: Uint8Array, size = 1024): void {
  const dimensions = pngDimensions(bytes)
  if (dimensions.width !== size || dimensions.height !== size) throw new Error(`Expected normalized ${size}x${size} PNG, received ${dimensions.width}x${dimensions.height}.`)
}
