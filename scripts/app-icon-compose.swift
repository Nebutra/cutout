import CoreGraphics
import Foundation
import ImageIO

struct Layout: Decodable {
  let canvasPx: Int
  let tileInsetPx: CGFloat
  let tileCornerRadiusPx: CGFloat
  let symbolBoundsPx: [CGFloat]
}

func image(at path: String) -> CGImage {
  let url = URL(fileURLWithPath: path) as CFURL
  guard let source = CGImageSourceCreateWithURL(url, nil),
        let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    fatalError("Unable to read image at \(path)")
  }
  return image
}

func glow(_ context: CGContext, center: CGPoint, radius: CGFloat, color: CGColor) {
  let space = CGColorSpaceCreateDeviceRGB()
  let transparent = color.copy(alpha: 0)!
  let gradient = CGGradient(colorsSpace: space, colors: [color, transparent] as CFArray, locations: [0, 1])!
  context.drawRadialGradient(gradient, startCenter: center, startRadius: 0, endCenter: center, endRadius: radius, options: .drawsAfterEndLocation)
}

func blackMask(from source: CGImage) -> CGImage {
  let width = source.width
  let height = source.height
  let space = CGColorSpaceCreateDeviceRGB()
  let bitmap = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  bitmap.setFillColor(CGColor(gray: 1, alpha: 1))
  bitmap.fill(CGRect(x: 0, y: 0, width: width, height: height))
  bitmap.draw(source, in: CGRect(x: 0, y: 0, width: width, height: height))
  let pixels = bitmap.data!.assumingMemoryBound(to: UInt8.self)
  for index in 0..<(width * height) {
    let offset = index * 4
    let luminance = (Int(pixels[offset]) * 54 + Int(pixels[offset + 1]) * 183 + Int(pixels[offset + 2]) * 19) / 256
    pixels[offset] = 0
    pixels[offset + 1] = 0
    pixels[offset + 2] = 0
    pixels[offset + 3] = UInt8(255 - luminance)
  }
  return bitmap.makeImage()!
}

func foregroundMetrics(_ image: CGImage) -> (CGRect, Double) {
  let width = image.width
  let height = image.height
  let space = CGColorSpaceCreateDeviceRGB()
  let bitmap = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  bitmap.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
  let pixels = bitmap.data!.assumingMemoryBound(to: UInt8.self)
  var minX = width, minY = height, maxX = -1, maxY = -1, count = 0
  for y in 0..<height {
    for x in 0..<width {
      let offset = (y * width + x) * 4
      if pixels[offset] < 48 && pixels[offset + 1] < 48 && pixels[offset + 2] < 48 && pixels[offset + 3] > 240 {
        minX = min(minX, x); minY = min(minY, y); maxX = max(maxX, x); maxY = max(maxY, y); count += 1
      }
    }
  }
  guard maxX >= minX, maxY >= minY else { fatalError("Rendered app icon contains no black foreground") }
  return (CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1), Double(count) / Double(width * height))
}

guard CommandLine.arguments.count == 4 else {
  fatalError("Usage: app-icon-compose.swift <symbol.png> <layout.json> <output.png>")
}

let layout = try! JSONDecoder().decode(Layout.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[2])))
let size = layout.canvasPx
let space = CGColorSpaceCreateDeviceRGB()
let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
let canvas = CGRect(x: 0, y: 0, width: size, height: size)
let tile = canvas.insetBy(dx: layout.tileInsetPx, dy: layout.tileInsetPx)
let tilePath = CGPath(roundedRect: tile, cornerWidth: layout.tileCornerRadiusPx, cornerHeight: layout.tileCornerRadiusPx, transform: nil)

context.saveGState()
context.addPath(tilePath)
context.clip()
context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
context.fill(tile)
glow(context, center: CGPoint(x: 760, y: 720), radius: 690, color: CGColor(red: 0.10, green: 0.86, blue: 0.65, alpha: 0.13))
glow(context, center: CGPoint(x: 300, y: 300), radius: 660, color: CGColor(red: 0.12, green: 0.78, blue: 0.91, alpha: 0.10))
glow(context, center: CGPoint(x: 830, y: 250), radius: 500, color: CGColor(red: 0.96, green: 0.46, blue: 0.68, alpha: 0.045))
glow(context, center: CGPoint(x: 210, y: 820), radius: 520, color: CGColor(red: 0.43, green: 0.38, blue: 0.96, alpha: 0.055))
context.restoreGState()

let bounds = layout.symbolBoundsPx
context.interpolationQuality = .high
let symbolRect = CGRect(x: bounds[0], y: CGFloat(size) - bounds[1] - bounds[3], width: bounds[2], height: bounds[3])
context.draw(blackMask(from: image(at: CommandLine.arguments[1])), in: symbolRect)

let output = URL(fileURLWithPath: CommandLine.arguments[3]) as CFURL
let destination = CGImageDestinationCreateWithURL(output, "public.png" as CFString, 1, nil)!
let rendered = context.makeImage()!
let (foregroundBounds, coverage) = foregroundMetrics(rendered)
let expected = CGRect(x: bounds[0], y: bounds[1], width: bounds[2], height: bounds[3])
let tolerance: CGFloat = 4
guard abs(foregroundBounds.minX - expected.minX) <= tolerance,
      abs(foregroundBounds.minY - expected.minY) <= tolerance,
      abs(foregroundBounds.maxX - expected.maxX) <= tolerance,
      abs(foregroundBounds.maxY - expected.maxY) <= tolerance else {
  fatalError("Foreground bbox \(foregroundBounds) differs from expected \(expected)")
}
guard coverage > 0.16 && coverage < 0.31 else { fatalError("Foreground coverage \(coverage) is outside the expected range") }

let alphaContext = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
alphaContext.draw(rendered, in: canvas)
let alphaPixels = alphaContext.data!.assumingMemoryBound(to: UInt8.self)
func alphaAt(_ x: Int, _ y: Int) -> UInt8 { alphaPixels[(y * size + x) * 4 + 3] }
guard alphaAt(0, 0) == 0,
      alphaAt(size - 1, 0) == 0,
      alphaAt(0, size - 1) == 0,
      alphaAt(size - 1, size - 1) == 0 else {
  fatalError("Rendered app icon corners must remain transparent")
}
guard alphaAt(size / 2, size / 2) == 255 else {
  fatalError("Rendered app icon tile center must remain opaque")
}
CGImageDestinationAddImage(destination, rendered, nil)
guard CGImageDestinationFinalize(destination) else { fatalError("Unable to write app icon") }
let formattedCoverage = String(format: "%.4f", coverage)
print("foreground bbox=\(Int(foregroundBounds.minX)),\(Int(foregroundBounds.minY)),\(Int(foregroundBounds.width)),\(Int(foregroundBounds.height)) coverage=\(formattedCoverage)")
