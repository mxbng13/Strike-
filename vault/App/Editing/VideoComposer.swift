import AVFoundation
import CoreImage
import CoreImage.CIFilterBuiltins
import UIKit
import VaultCore

/// Paramètres immuables transmis au compositeur (une instance par construction de la timeline).
final class CompositionConfig: @unchecked Sendable {
    struct Layer {
        var trackID: CMPersistentTrackID
        var orientation: CGImagePropertyOrientation
        var clip: VideoClip
    }
    let layers: [Int: Layer]
    let texts: [TextOverlay]
    let renderSize: CGSize
    private var textCache: [UUID: CIImage] = [:]
    private let lock = NSLock()

    init(layers: [Int: Layer], texts: [TextOverlay], renderSize: CGSize) {
        self.layers = layers; self.texts = texts; self.renderSize = renderSize
    }

    func textImage(_ t: TextOverlay) -> CIImage? {
        lock.lock(); defer { lock.unlock() }
        if let c = textCache[t.id] { return c }
        let img = TextRenderer.image(for: t, renderWidth: renderSize.width)
        textCache[t.id] = img
        return img
    }
}

final class VaultCompositionInstruction: NSObject, AVVideoCompositionInstructionProtocol {
    let timeRange: CMTimeRange
    let enablePostProcessing = false
    let containsTweening = true
    let requiredSourceTrackIDs: [NSValue]?
    let passthroughTrackID = kCMPersistentTrackID_Invalid
    let primary: Int
    let secondary: Int?
    let transition: TimelineLayout.TransitionSegment?
    let config: CompositionConfig

    init(timeRange: CMTimeRange, primary: Int, secondary: Int?, transition: TimelineLayout.TransitionSegment?, config: CompositionConfig) {
        self.timeRange = timeRange
        self.primary = primary
        self.secondary = secondary
        self.transition = transition
        self.config = config
        var ids: [NSValue] = []
        if let l = config.layers[primary] { ids.append(NSNumber(value: l.trackID)) }
        if let s = secondary, let l = config.layers[s], !ids.contains(NSNumber(value: l.trackID)) { ids.append(NSNumber(value: l.trackID)) }
        requiredSourceTrackIDs = ids
    }
}

/// Compositeur vidéo personnalisé : orientation, cadrage au format choisi, couleurs, filtres,
/// transitions et textes, rendus image par image sur le GPU via Core Image.
final class VaultVideoCompositor: NSObject, AVVideoCompositing {
    private let queue = DispatchQueue(label: "vault.compositor", qos: .userInteractive)
    private let ciContext = CIContext(options: [.cacheIntermediates: false])
    private let renderer = PhotoRenderer()

    var sourcePixelBufferAttributes: [String: any Sendable]? {
        [kCVPixelBufferPixelFormatTypeKey as String: [kCVPixelFormatType_32BGRA],
         kCVPixelBufferMetalCompatibilityKey as String: true]
    }

    var requiredPixelBufferAttributesForRenderContext: [String: any Sendable] {
        [kCVPixelBufferPixelFormatTypeKey as String: [kCVPixelFormatType_32BGRA],
         kCVPixelBufferMetalCompatibilityKey as String: true]
    }

    func renderContextChanged(_ newRenderContext: AVVideoCompositionRenderContext) {}

    func startRequest(_ request: AVAsynchronousVideoCompositionRequest) {
        queue.async { [self] in
            guard let ins = request.videoCompositionInstruction as? VaultCompositionInstruction,
                  let out = request.renderContext.newPixelBuffer() else {
                request.finish(with: NSError(domain: "VAULT", code: 1))
                return
            }
            let size = request.renderContext.size
            let rect = CGRect(origin: .zero, size: size)
            let t = request.compositionTime.seconds
            var frame = CIImage(color: .black).cropped(to: rect)
            let a = layerImage(ins.primary, ins: ins, request: request, size: size)
            if let s = ins.secondary, let tr = ins.transition, let b = layerImage(s, ins: ins, request: request, size: size), let a {
                let p = CGFloat(min(max((t - tr.start) / max(tr.duration, 0.001), 0), 1))
                frame = transition(tr.kind, a, b, p, rect).composited(over: frame)
            } else if let a {
                frame = a.composited(over: frame)
            }
            for text in ins.config.texts where t >= text.start && t < text.end {
                guard var img = ins.config.textImage(text) else { continue }
                let fade = 0.35
                let alpha = CGFloat(min(1, min(t - text.start, text.end - t) / fade))
                img = scaleAlpha(img, alpha)
                let pos = CGPoint(x: CGFloat(text.x) * size.width - img.extent.width / 2,
                                  y: CGFloat(1 - text.y) * size.height - img.extent.height / 2)
                frame = img.transformed(by: CGAffineTransform(translationX: pos.x, y: pos.y)).composited(over: frame)
            }
            ciContext.render(frame.cropped(to: rect), to: out)
            request.finish(withComposedVideoFrame: out)
        }
    }

    func cancelAllPendingVideoCompositionRequests() {}

    private func layerImage(_ index: Int, ins: VaultCompositionInstruction, request: AVAsynchronousVideoCompositionRequest, size: CGSize) -> CIImage? {
        guard let layer = ins.config.layers[index], let buf = request.sourceFrame(byTrackID: layer.trackID) else { return nil }
        var img = CIImage(cvPixelBuffer: buf).oriented(layer.orientation)
        img = img.transformed(by: CGAffineTransform(translationX: -img.extent.minX, y: -img.extent.minY))
        // Remplissage du cadre (le format d'image choisi recadre au centre).
        let s = max(size.width / img.extent.width, size.height / img.extent.height)
        img = img.transformed(by: CGAffineTransform(scaleX: s, y: s))
        img = img.transformed(by: CGAffineTransform(translationX: (size.width - img.extent.width) / 2 - img.extent.minX,
                                                    y: (size.height - img.extent.height) / 2 - img.extent.minY))
        img = img.cropped(to: CGRect(origin: .zero, size: size))
        let c = layer.clip.color
        if !c.isNeutral {
            img = renderer.applyAdjustments(img, [.brightness: c.brightness, .contrast: c.contrast, .saturation: c.saturation, .temperature: c.temperature])
        }
        if let fid = layer.clip.filterID, let p = FilterPreset.byID(fid) {
            var adj: [Adjustment: Double] = [:]
            for (k, v) in p.adjustments where k != .definition && k != .noiseReduction { adj[k] = v * layer.clip.filterIntensity }
            img = renderer.applyAdjustments(img, adj)
            img = renderer.applyLook(img, preset: p, intensity: layer.clip.filterIntensity)
        }
        return img
    }

    private func scaleAlpha(_ img: CIImage, _ a: CGFloat) -> CIImage {
        guard a < 0.999 else { return img }
        let f = CIFilter.colorMatrix()
        f.inputImage = img
        f.aVector = CIVector(x: 0, y: 0, z: 0, w: a)
        f.rVector = CIVector(x: a, y: 0, z: 0, w: 0)
        f.gVector = CIVector(x: 0, y: a, z: 0, w: 0)
        f.bVector = CIVector(x: 0, y: 0, z: a, w: 0)
        return f.outputImage ?? img
    }

    private func transition(_ kind: TransitionKind, _ a: CIImage, _ b: CIImage, _ p: CGFloat, _ rect: CGRect) -> CIImage {
        switch kind {
        case .none:
            return p < 0.5 ? a : b
        case .crossfade:
            let f = CIFilter.dissolveTransition(); f.inputImage = a; f.targetImage = b; f.time = Float(p)
            return f.outputImage?.cropped(to: rect) ?? b
        case .fadeToBlack:
            return p < 0.5 ? scaleAlpha(a, 1 - 2 * p) : scaleAlpha(b, 2 * p - 1)
        case .slideLeft:
            let e = easeInOut(p)
            let A = a.transformed(by: CGAffineTransform(translationX: -e * rect.width, y: 0))
            let B = b.transformed(by: CGAffineTransform(translationX: (1 - e) * rect.width, y: 0))
            return B.composited(over: A).cropped(to: rect)
        case .zoom:
            let s = 1 + 0.25 * p
            let A = a.transformed(by: CGAffineTransform(translationX: rect.midX, y: rect.midY).scaledBy(x: s, y: s).translatedBy(x: -rect.midX, y: -rect.midY))
            let f = CIFilter.dissolveTransition(); f.inputImage = A.cropped(to: rect); f.targetImage = b; f.time = Float(p)
            return f.outputImage?.cropped(to: rect) ?? b
        }
    }

    private func easeInOut(_ t: CGFloat) -> CGFloat { t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2 }
}

/// Rendu des textes / titres en images (thread-safe).
enum TextRenderer {
    static func image(for t: TextOverlay, renderWidth: CGFloat) -> CIImage? {
        let base = renderWidth / 1080
        let font: UIFont
        switch t.style {
        case .title: font = UIFont.systemFont(ofSize: 92 * base, weight: .bold).withDesign(.serif)
        case .subtitle: font = UIFont.systemFont(ofSize: 58 * base, weight: .semibold)
        case .caption: font = UIFont.systemFont(ofSize: 40 * base, weight: .medium)
        case .minimal: font = UIFont.systemFont(ofSize: 44 * base, weight: .light).withTraits(.traitCondensed)
        }
        let color = UIColor(hex: t.colorHex) ?? .white
        let shadow = NSShadow()
        shadow.shadowColor = UIColor.black.withAlphaComponent(t.withBackground ? 0 : 0.55)
        shadow.shadowBlurRadius = 12 * base
        shadow.shadowOffset = CGSize(width: 0, height: 2 * base)
        let para = NSMutableParagraphStyle(); para.alignment = .center
        let kern: CGFloat = t.style == .minimal ? 6 * base : 0
        let text = t.style == .minimal ? t.text.uppercased() : t.text
        let attr = NSAttributedString(string: text, attributes: [.font: font, .foregroundColor: color, .shadow: shadow,
                                                                 .paragraphStyle: para, .kern: kern])
        let maxW = renderWidth * 0.88
        let bounds = attr.boundingRect(with: CGSize(width: maxW, height: .greatestFiniteMagnitude),
                                       options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil).integral
        let pad: CGFloat = t.withBackground ? 28 * base : 16 * base
        let size = CGSize(width: bounds.width + pad * 2, height: bounds.height + pad * 2)
        let fmt = UIGraphicsImageRendererFormat()
        fmt.scale = 1
        fmt.opaque = false
        let img = UIGraphicsImageRenderer(size: size, format: fmt).image { ctx in
            if t.withBackground {
                UIColor.black.withAlphaComponent(0.55).setFill()
                UIBezierPath(roundedRect: CGRect(origin: .zero, size: size), cornerRadius: 18 * base).fill()
            }
            attr.draw(with: CGRect(x: pad, y: pad, width: bounds.width, height: bounds.height),
                      options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
        }
        return img.cgImage.map { CIImage(cgImage: $0) }
    }
}

extension UIFont {
    func withDesign(_ d: UIFontDescriptor.SystemDesign) -> UIFont {
        fontDescriptor.withDesign(d).map { UIFont(descriptor: $0, size: pointSize) } ?? self
    }
    func withTraits(_ t: UIFontDescriptor.SymbolicTraits) -> UIFont {
        fontDescriptor.withSymbolicTraits(t).map { UIFont(descriptor: $0, size: pointSize) } ?? self
    }
}

extension UIColor {
    convenience init?(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        self.init(red: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255, blue: CGFloat(v & 255) / 255, alpha: 1)
    }
}

/// Construction de la composition AVFoundation à partir d'un VideoProject.
enum VideoComposer {
    struct Built {
        let composition: AVMutableComposition
        let videoComposition: AVMutableVideoComposition
        let audioMix: AVMutableAudioMix
        let renderSize: CGSize
        let duration: Double
    }

    static func time(_ s: Double) -> CMTime { CMTime(seconds: s, preferredTimescale: 600) }

    static func orientation(_ t: CGAffineTransform) -> CGImagePropertyOrientation {
        if t.a == 0 && t.b == 1 && t.c == -1 && t.d == 0 { return .right }
        if t.a == 0 && t.b == -1 && t.c == 1 && t.d == 0 { return .left }
        if t.a == -1 && t.b == 0 && t.c == 0 && t.d == -1 { return .down }
        return .up
    }

    /// Taille de rendu : format choisi × résolution d'export (ou d'aperçu).
    static func renderSize(project: VideoProject, firstNaturalAspect: Double, resolution: ExportResolution) -> CGSize {
        let aspect = project.aspect.ratio(original: firstNaturalAspect)
        let s = resolution.renderSize(aspect: aspect)
        return CGSize(width: s.width, height: s.height)
    }

    static func build(project: VideoProject, sources: [UUID: URL], music: URL?, resolution: ExportResolution) async throws -> Built {
        let layout = TimelineLayout(project: project)
        guard !layout.clips.isEmpty else { throw NSError(domain: "VAULT", code: 2, userInfo: [NSLocalizedDescriptionKey: "Ajoutez au moins une vidéo."]) }
        let comp = AVMutableComposition()
        let vTracks = [comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!,
                       comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!]
        let aTracks = [comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!,
                       comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!]
        var layers: [Int: CompositionConfig.Layer] = [:]
        var firstAspect = 16.0 / 9
        var audioSegments: [(track: Int, start: Double, duration: Double, volume: Double, inFade: Double, outFade: Double)] = []
        let musicDuck = music != nil ? (project.music?.clipVolumeWhenMusic ?? 0.5) : 1

        for seg in layout.clips {
            let clip = project.clips[seg.index]
            guard let url = sources[clip.mediaID] else { continue }
            let asset = AVURLAsset(url: url, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
            guard let src = try await asset.loadTracks(withMediaType: .video).first else { continue }
            let (natural, transform) = try await src.load(.naturalSize, .preferredTransform)
            if seg.index == 0 {
                let r = CGRect(origin: .zero, size: natural).applying(transform)
                firstAspect = abs(r.width) / max(abs(r.height), 1)
            }
            let range = CMTimeRange(start: time(clip.sourceStart), duration: time(clip.trimmedDuration))
            let track = vTracks[seg.track]
            let incoming = layout.transitions.contains { $0.toIndex == seg.index }
            var at = time(seg.start)
            if !incoming, seg.index > 0, track.timeRange.duration > .zero { at = track.timeRange.end }
            try track.insertTimeRange(range, of: src, at: at)
            if abs(clip.speed - 1) > 0.001 {
                track.scaleTimeRange(CMTimeRange(start: at, duration: range.duration), toDuration: time(seg.duration))
            }
            if let srcA = try await asset.loadTracks(withMediaType: .audio).first {
                let aTrack = aTracks[seg.track]
                var aAt = time(seg.start)
                if !incoming, seg.index > 0, aTrack.timeRange.duration > .zero { aAt = aTrack.timeRange.end }
                try aTrack.insertTimeRange(range, of: srcA, at: aAt)
                if abs(clip.speed - 1) > 0.001 {
                    aTrack.scaleTimeRange(CMTimeRange(start: aAt, duration: range.duration), toDuration: time(seg.duration))
                }
                let inFade = layout.transitions.first { $0.toIndex == seg.index }?.duration ?? 0
                let outFade = layout.transitions.first { $0.fromIndex == seg.index }?.duration ?? 0
                audioSegments.append((seg.track, seg.start, seg.duration, clip.volume * musicDuck, inFade, outFade))
            }
            layers[seg.index] = .init(trackID: track.trackID, orientation: orientation(transform), clip: clip)
        }
        if vTracks[1].segments.isEmpty { comp.removeTrack(vTracks[1]) }

        let size = renderSize(project: project, firstNaturalAspect: firstAspect, resolution: resolution)
        let config = CompositionConfig(layers: layers, texts: project.texts, renderSize: size)
        let total = comp.duration
        var instructions: [VaultCompositionInstruction] = []
        var cursor = CMTime.zero
        let intervals = layout.intervals()
        for (i, iv) in intervals.enumerated() {
            let end = i == intervals.count - 1 ? total : min(time(iv.end), total)
            guard end > cursor else { continue }
            instructions.append(VaultCompositionInstruction(timeRange: CMTimeRange(start: cursor, end: end), primary: iv.primary,
                                                            secondary: iv.secondary, transition: iv.transition, config: config))
            cursor = end
        }
        let vc = AVMutableVideoComposition()
        vc.customVideoCompositorClass = VaultVideoCompositor.self
        vc.renderSize = size
        vc.frameDuration = CMTime(value: 1, timescale: 30)
        vc.instructions = instructions

        // Mixage audio : volumes par clip, fondus pendant les transitions, musique avec fondus.
        let mix = AVMutableAudioMix()
        var params: [AVMutableAudioMixInputParameters] = []
        for (i, t) in aTracks.enumerated() where !t.segments.isEmpty {
            let p = AVMutableAudioMixInputParameters(track: t)
            p.audioTimePitchAlgorithm = .spectral
            for s in audioSegments.filter({ $0.track == i }).sorted(by: { $0.start < $1.start }) {
                let v = Float(s.volume)
                if s.inFade > 0 {
                    p.setVolumeRamp(fromStartVolume: 0, toEndVolume: v, timeRange: CMTimeRange(start: time(s.start), duration: time(s.inFade)))
                } else {
                    p.setVolume(v, at: time(s.start))
                }
                if s.outFade > 0 {
                    p.setVolumeRamp(fromStartVolume: v, toEndVolume: 0,
                                    timeRange: CMTimeRange(start: time(s.start + s.duration - s.outFade), duration: time(s.outFade)))
                }
            }
            params.append(p)
        }
        if let music, let m = project.music {
            let masset = AVURLAsset(url: music)
            if let src = try await masset.loadTracks(withMediaType: .audio).first,
               let mt = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
                let mdur = try await masset.load(.duration)
                var t = CMTime.zero
                while t < total && mdur > .zero {
                    let len = min(mdur, total - t)
                    try mt.insertTimeRange(CMTimeRange(start: .zero, duration: len), of: src, at: t)
                    t = t + len
                }
                let p = AVMutableAudioMixInputParameters(track: mt)
                let v = Float(m.volume)
                let totalS = total.seconds
                let fi = min(m.fadeIn, totalS / 2), fo = min(m.fadeOut, totalS / 2)
                if fi > 0 { p.setVolumeRamp(fromStartVolume: 0, toEndVolume: v, timeRange: CMTimeRange(start: .zero, duration: time(fi))) }
                else { p.setVolume(v, at: .zero) }
                if fo > 0 { p.setVolumeRamp(fromStartVolume: v, toEndVolume: 0, timeRange: CMTimeRange(start: time(totalS - fo), duration: time(fo))) }
                params.append(p)
            }
        }
        mix.inputParameters = params
        return Built(composition: comp, videoComposition: vc, audioMix: mix, renderSize: size, duration: total.seconds)
    }

    static func supports4K() -> Bool {
        AVOutputSettingsAssistant(preset: .hevc3840x2160) != nil
    }

    /// Export vers un fichier .mov (HEVC si disponible). Progression via le rappel.
    static func export(_ built: Built, to url: URL, progress: @escaping @Sendable (Double) -> Void) async throws {
        let presets = AVAssetExportSession.exportPresets(compatibleWith: built.composition)
        let preset = presets.contains(AVAssetExportPresetHEVCHighestQuality) ? AVAssetExportPresetHEVCHighestQuality : AVAssetExportPresetHighestQuality
        guard let session = AVAssetExportSession(asset: built.composition, presetName: preset) else {
            throw NSError(domain: "VAULT", code: 3, userInfo: [NSLocalizedDescriptionKey: "Export impossible sur cet appareil."])
        }
        session.videoComposition = built.videoComposition
        session.audioMix = built.audioMix
        session.outputURL = url
        session.outputFileType = .mov
        session.shouldOptimizeForNetworkUse = true
        let poll = Task {
            while !Task.isCancelled {
                progress(Double(session.progress))
                try? await Task.sleep(nanoseconds: 200_000_000)
            }
        }
        await session.export()
        poll.cancel()
        if session.status != .completed {
            throw session.error ?? NSError(domain: "VAULT", code: 4, userInfo: [NSLocalizedDescriptionKey: "L'export a échoué."])
        }
        progress(1)
    }
}
