import AVFoundation
import CoreImage
import CoreImage.CIFilterBuiltins
import UIKit
import VaultCore

/// Génère une « vidéo souvenir » à partir de photos : effet Ken Burns, fondus enchaînés et carton-titre.
/// La vidéo produite est ensuite chiffrée dans le coffre et peut être retouchée dans l'éditeur (musique, textes…).
enum MemoryVideoRenderer {
    struct Options {
        var portrait = true
        var secondsPerPhoto = 3.0
        var crossfade = 0.7
        var fps: Int32 = 30
        var title: String
        var subtitle: String
    }

    static func render(images: [CIImage], options o: Options, to url: URL, progress: @escaping (Double) -> Void) async throws {
        guard !images.isEmpty else { return }
        let size = o.portrait ? CGSize(width: 1080, height: 1920) : CGSize(width: 1920, height: 1080)
        let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        let settings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.hevc,
            AVVideoWidthKey: size.width, AVVideoHeightKey: size.height,
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 12_000_000],
        ]
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
        input.expectsMediaDataInRealTime = false
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: size.width, kCVPixelBufferHeightKey as String: size.height,
        ])
        writer.add(input)
        guard writer.startWriting() else { throw writer.error ?? NSError(domain: "VAULT", code: 10) }
        writer.startSession(atSourceTime: .zero)

        let ctx = CIContext()
        let rect = CGRect(origin: .zero, size: size)
        let titleCard = TextRenderer.image(for: TextOverlay(text: o.title, start: 0, duration: 2.5, style: .title), renderWidth: size.width)
        let subCard = TextRenderer.image(for: TextOverlay(text: o.subtitle, start: 0, duration: 2.5, style: .minimal), renderWidth: size.width)
        let per = o.secondsPerPhoto
        let total = Double(images.count) * per + o.crossfade
        let frames = Int(total * Double(o.fps))
        let fitted = images.map { fill($0, size: size) }

        for f in 0..<frames {
            try Task.checkCancellation()
            while !input.isReadyForMoreMediaData { try await Task.sleep(nanoseconds: 5_000_000) }
            let t = Double(f) / Double(o.fps)
            let i = min(Int(t / per), images.count - 1)
            var frame = kenBurns(fitted[i], local: (t - Double(i) * per) / (per + o.crossfade), index: i, rect: rect)
            let intoNext = t - Double(i + 1) * per + o.crossfade
            if i + 1 < images.count, intoNext > 0 {
                let next = kenBurns(fitted[i + 1], local: intoNext / (per + o.crossfade), index: i + 1, rect: rect)
                let d = CIFilter.dissolveTransition(); d.inputImage = frame; d.targetImage = next; d.time = Float(intoNext / o.crossfade)
                frame = d.outputImage ?? frame
            }
            if t < 3 {
                let alpha = CGFloat(t < 0.4 ? t / 0.4 : (t > 2.4 ? max(0, (3 - t) / 0.6) : 1))
                let shade = CIImage(color: CIColor(red: 0, green: 0, blue: 0, alpha: 0.35 * alpha)).cropped(to: rect)
                frame = shade.composited(over: frame)
                if let tc = titleCard {
                    frame = alphaScaled(tc, alpha).transformed(by: CGAffineTransform(translationX: (size.width - tc.extent.width) / 2, y: size.height * 0.5)).composited(over: frame)
                }
                if let sc = subCard {
                    frame = alphaScaled(sc, alpha).transformed(by: CGAffineTransform(translationX: (size.width - sc.extent.width) / 2, y: size.height * 0.5 - sc.extent.height - 10)).composited(over: frame)
                }
            }
            guard let pool = adaptor.pixelBufferPool else { throw writer.error ?? NSError(domain: "VAULT", code: 11) }
            var pb: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pb)
            guard let pb else { continue }
            ctx.render(frame.cropped(to: rect), to: pb)
            adaptor.append(pb, withPresentationTime: CMTime(value: CMTimeValue(f), timescale: o.fps))
            if f % 15 == 0 { progress(Double(f) / Double(frames)) }
        }
        input.markAsFinished()
        await writer.finishWriting()
        if writer.status != .completed { throw writer.error ?? NSError(domain: "VAULT", code: 12) }
        progress(1)
    }

    static func fill(_ img: CIImage, size: CGSize) -> CIImage {
        let i = img.transformed(by: CGAffineTransform(translationX: -img.extent.minX, y: -img.extent.minY))
        let s = max(size.width / i.extent.width, size.height / i.extent.height) * 1.15
        let scaled = i.transformed(by: CGAffineTransform(scaleX: s, y: s))
        return scaled.transformed(by: CGAffineTransform(translationX: (size.width - scaled.extent.width) / 2, y: (size.height - scaled.extent.height) / 2))
    }

    /// Zoom lent + léger panoramique, direction alternée selon la photo.
    static func kenBurns(_ img: CIImage, local: Double, index: Int, rect: CGRect) -> CIImage {
        let p = CGFloat(min(max(local, 0), 1))
        let zoomIn = index % 2 == 0
        let s = zoomIn ? 1 + 0.08 * p : 1.08 - 0.08 * p
        let dx = (index % 3 == 0 ? 1 : -1) * 0.03 * rect.width * (p - 0.5)
        let t = CGAffineTransform(translationX: rect.midX + dx, y: rect.midY).scaledBy(x: s, y: s).translatedBy(x: -rect.midX, y: -rect.midY)
        return img.transformed(by: t).cropped(to: rect)
    }

    static func alphaScaled(_ img: CIImage, _ a: CGFloat) -> CIImage {
        let f = CIFilter.colorMatrix()
        f.inputImage = img
        f.rVector = CIVector(x: a, y: 0, z: 0, w: 0)
        f.gVector = CIVector(x: 0, y: a, z: 0, w: 0)
        f.bVector = CIVector(x: 0, y: 0, z: a, w: 0)
        f.aVector = CIVector(x: 0, y: 0, z: 0, w: a)
        return f.outputImage ?? img
    }
}
