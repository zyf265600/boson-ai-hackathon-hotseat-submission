// idle-mouth <video.mp4>: per frame, whether the mouth shows teeth and where the face is, via
// macOS Vision face landmarks (built into macOS, nothing to install). Used by
// scripts/avatar-idle.ts, which compiles it with swiftc into .cache/idle/.
// Prints CSV: frame,time,gap,width,leftEye,rightEye,teeth,cx,cy,size
// gap: inner-lip opening / face-box height; width: outer-lip width / face-box width;
// leftEye/rightEye: eye height / width; teeth: bright, unsaturated pixels inside the inner
// lips per 1000 face-box pixels (0 with the mouth closed, about 2–11 in a smile with teeth).
// cx, cy, size: the face box's center and height, as fractions of the frame (head motion).
// -1 everywhere: no face found.
import AVFoundation
import Vision

let url = URL(fileURLWithPath: CommandLine.arguments[1])
let asset = AVURLAsset(url: url)
let track = try await asset.loadTracks(withMediaType: .video)[0]
let reader = try AVAssetReader(asset: asset)
let output = AVAssetReaderTrackOutput(
  track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
reader.add(output)
reader.startReading()

func ys(_ r: VNFaceLandmarkRegion2D?) -> [CGPoint] { r?.normalizedPoints ?? [] }

func eyeOpen(_ r: VNFaceLandmarkRegion2D?) -> Double {
  let p = ys(r)
  guard p.count > 2 else { return -1 }
  let xs = p.map(\.x), y = p.map(\.y)
  let w = (xs.max()! - xs.min()!)
  return w > 0 ? Double((y.max()! - y.min()!) / w) : -1
}

print("frame,time,gap,width,leftEye,rightEye,teeth,cx,cy,size")
var frame = 0
while let sample = output.copyNextSampleBuffer() {
  defer { frame += 1 }
  guard let pixels = CMSampleBufferGetImageBuffer(sample) else { continue }
  let t = CMSampleBufferGetPresentationTimeStamp(sample).seconds
  let request = VNDetectFaceLandmarksRequest()
  try VNImageRequestHandler(cvPixelBuffer: pixels).perform([request])
  guard let face = request.results?.first, let lm = face.landmarks else {
    print("\(frame),\(t),-1,-1,-1,-1,-1,-1,-1,-1")
    continue
  }
  // Landmark points are normalized to the face box, so these are face-relative.
  let inner = ys(lm.innerLips)
  let outer = ys(lm.outerLips)
  var gap = -1.0
  if inner.count >= 6 {
    // Inner-lip contour: the vertical extent between its upper and lower halves at the middle.
    let cx = inner.map(\.x).reduce(0, +) / CGFloat(inner.count)
    let mid = inner.filter { abs($0.x - cx) < 0.06 }
    if let top = mid.map(\.y).max(), let bottom = mid.map(\.y).min() { gap = Double(top - bottom) }
  }
  // Teeth: bright, unsaturated pixels inside the inner-lip contour, per 1000 face-box pixels.
  var teeth = 0.0
  if let innerRegion = lm.innerLips, innerRegion.pointCount >= 3 {
    let w = CVPixelBufferGetWidth(pixels), h = CVPixelBufferGetHeight(pixels)
    let poly = innerRegion.pointsInImage(imageSize: CGSize(width: w, height: h)).map { CGPoint(x: $0.x, y: CGFloat(h) - $0.y) }
    let path = CGMutablePath()
    path.addLines(between: poly)
    path.closeSubpath()
    let box = path.boundingBox.integral
    CVPixelBufferLockBaseAddress(pixels, .readOnly)
    let base = CVPixelBufferGetBaseAddress(pixels)!.assumingMemoryBound(to: UInt8.self)
    let row = CVPixelBufferGetBytesPerRow(pixels)
    var count = 0
    for y in max(0, Int(box.minY))..<min(h, Int(box.maxY) + 1) {
      for x in max(0, Int(box.minX))..<min(w, Int(box.maxX) + 1) where path.contains(CGPoint(x: CGFloat(x) + 0.5, y: CGFloat(y) + 0.5)) {
        let p = base + y * row + x * 4
        let b = Int(p[0]), g = Int(p[1]), r = Int(p[2])
        let lum = (r * 77 + g * 150 + b * 29) >> 8
        if lum > 140 && max(r, g, b) - min(r, g, b) < 70 { count += 1 }
      }
    }
    CVPixelBufferUnlockBaseAddress(pixels, .readOnly)
    let faceArea = face.boundingBox.width * CGFloat(w) * face.boundingBox.height * CGFloat(h)
    teeth = Double(count) / Double(faceArea) * 1000
  }
  let width = outer.isEmpty ? -1 : Double(outer.map(\.x).max()! - outer.map(\.x).min()!)
  let box = face.boundingBox
  print(
    String(
      format: "%d,%.3f,%.4f,%.4f,%.3f,%.3f,%.2f,%.5f,%.5f,%.5f", frame, t, gap, width, eyeOpen(lm.leftEye),
      eyeOpen(lm.rightEye), teeth, box.midX, box.midY, box.height))
}
