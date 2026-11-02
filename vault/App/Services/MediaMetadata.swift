import Foundation
import ImageIO
import AVFoundation
import UniformTypeIdentifiers
import CoreGraphics
import Vision
import VaultCore

/// Informations extraites d'un fichier en clair au moment de l'import (avant chiffrement).
struct ExtractedMetadata: Sendable {
    var kind: MediaKind
    var typeIdentifier: String
    var format: String
    var width = 0
    var height = 0
    var duration: Double?
    var codec: String?
    var frameRate: Double?
    var captureDate: Date?
    var location: GeoPoint?
    var cameraModel: String?
    var isScreenshot = false
    var thumbnailJPEG: Data?
    var perceptualHash: UInt64?
    var blurScore: Double?
    var dominantColor: NamedColor?
    var labels: [String] = []
}

enum MediaMetadataExtractor {
    static func kind(for url: URL, typeHint: String?) -> (MediaKind, UTType)? {
        let ut = typeHint.flatMap(UTType.init) ?? UTType(filenameExtension: url.pathExtension) ?? .data
        if ut.conforms(to: .movie) || ut.conforms(to: .video) { return (.video, ut) }
        if ut.conforms(to: .image) { return (.photo, ut) }
        if let k = Formats.kind(forExtension: url.pathExtension) { return (k, ut) }
        // Dernier recours : inspection du contenu.
        if CGImageSourceCreateWithURL(url as CFURL, nil).map({ CGImageSourceGetCount($0) > 0 }) == true { return (.photo, .image) }
        return nil
    }

    static func extract(url: URL, typeHint: String?, analyzeVisually: Bool) async throws -> ExtractedMetadata {
        guard let (kind, ut) = kind(for: url, typeHint: typeHint) else { throw ImportError.unsupported(url.lastPathComponent) }
        var ext = Formats.normalizedExtension(url.lastPathComponent)
        if ext.isEmpty { ext = ut.preferredFilenameExtension ?? (kind == .photo ? "jpg" : "mov") }
        var m = ExtractedMetadata(kind: kind, typeIdentifier: ut.identifier, format: ext)
        var thumb: CGImage?
        if kind == .photo {
            guard let src = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary) else {
                throw ImportError.unreadable(url.lastPathComponent)
            }
            let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any] ?? [:]
            var w = props[kCGImagePropertyPixelWidth] as? Int ?? 0
            var h = props[kCGImagePropertyPixelHeight] as? Int ?? 0
            if let o = props[kCGImagePropertyOrientation] as? Int, (5...8).contains(o) { swap(&w, &h) }
            m.width = w; m.height = h
            let exif = props[kCGImagePropertyExifDictionary] as? [CFString: Any] ?? [:]
            let tiff = props[kCGImagePropertyTIFFDictionary] as? [CFString: Any] ?? [:]
            if let s = exif[kCGImagePropertyExifDateTimeOriginal] as? String ?? tiff[kCGImagePropertyTIFFDateTime] as? String {
                m.captureDate = parseExifDate(s, offset: exif["OffsetTimeOriginal" as CFString] as? String)
            }
            if let model = tiff[kCGImagePropertyTIFFModel] as? String { m.cameraModel = model }
            if let gps = props[kCGImagePropertyGPSDictionary] as? [CFString: Any],
               var lat = gps[kCGImagePropertyGPSLatitude] as? Double, var lon = gps[kCGImagePropertyGPSLongitude] as? Double {
                if (gps[kCGImagePropertyGPSLatitudeRef] as? String) == "S" { lat = -lat }
                if (gps[kCGImagePropertyGPSLongitudeRef] as? String) == "W" { lon = -lon }
                m.location = GeoPoint(latitude: lat, longitude: lon)
            }
            let comment = (exif[kCGImagePropertyExifUserComment] as? String) ?? ""
            m.isScreenshot = comment.localizedCaseInsensitiveContains("screenshot") || isScreenSized(w, h, ext: ext, hasExif: !exif.isEmpty)
            thumb = CGImageSourceCreateThumbnailAtIndex(src, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 480,
            ] as CFDictionary)
        } else {
            let asset = AVURLAsset(url: url)
            let duration = try await asset.load(.duration)
            m.duration = duration.seconds.isFinite ? duration.seconds : nil
            if let track = try await asset.loadTracks(withMediaType: .video).first {
                let (size, transform, fps, formats) = try await track.load(.naturalSize, .preferredTransform, .nominalFrameRate, .formatDescriptions)
                let r = CGRect(origin: .zero, size: size).applying(transform)
                m.width = Int(abs(r.width).rounded()); m.height = Int(abs(r.height).rounded())
                m.frameRate = Double(fps)
                if let f = formats.first {
                    let code = CMFormatDescriptionGetMediaSubType(f)
                    m.codec = fourCC(code)
                }
            }
            if let date = try? await asset.load(.creationDate), let d = try? await date.load(.dateValue) { m.captureDate = d }
            let meta = (try? await asset.load(.metadata)) ?? []
            for item in meta {
                if item.identifier == .quickTimeMetadataLocationISO6709 || item.commonKey == .commonKeyLocation,
                   let s = try? await item.load(.stringValue), let g = parseISO6709(s) { m.location = g }
                if item.identifier == .quickTimeMetadataModel || item.commonKey == .commonKeyModel,
                   let s = try? await item.load(.stringValue) { m.cameraModel = s }
            }
            let gen = AVAssetImageGenerator(asset: asset)
            gen.appliesPreferredTrackTransform = true
            gen.maximumSize = CGSize(width: 480, height: 480)
            let t = CMTime(seconds: min(0.5, (m.duration ?? 0) / 2), preferredTimescale: 600)
            thumb = try? await gen.image(at: t).image
        }
        if let thumb {
            m.thumbnailJPEG = jpegData(thumb, quality: 0.82)
            let a = analyze(thumb)
            m.perceptualHash = a.hash; m.blurScore = a.blur; m.dominantColor = a.color
            if analyzeVisually { m.labels = VisualClassifier.labels(for: thumb) }
        }
        return m
    }

    static func fourCC(_ code: FourCharCode) -> String {
        let s = String(bytes: [UInt8((code >> 24) & 255), UInt8((code >> 16) & 255), UInt8((code >> 8) & 255), UInt8(code & 255)], encoding: .ascii) ?? "?"
        switch s {
        case "hvc1", "hev1": return "hevc"
        case "avc1", "avc3": return "h264"
        case "ap4h", "apcn", "apch", "apcs", "apco", "ap4x": return "prores"
        default: return s.trimmingCharacters(in: .whitespaces)
        }
    }

    static func isScreenSized(_ w: Int, _ h: Int, ext: String, hasExif: Bool) -> Bool {
        guard ext == "png" && !hasExif else { return false }
        // PNG sans EXIF aux proportions d'un écran de téléphone ou de tablette.
        let lo = Double(min(w, h)), hi = Double(max(w, h))
        guard lo >= 640 else { return false }
        let r = hi / lo
        return (2.05...2.24).contains(r) || abs(r - 16.0 / 9) < 0.01 || abs(r - 4.0 / 3) < 0.01 || abs(r - 1.43) < 0.02
    }

    static func parseExifDate(_ s: String, offset: String?) -> Date? {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = offset != nil ? "yyyy:MM:dd HH:mm:ssZZZZZ" : "yyyy:MM:dd HH:mm:ss"
        return f.date(from: s + (offset ?? ""))
    }

    static func parseISO6709(_ s: String) -> GeoPoint? {
        // ex. "+48.8577+002.2950+035.000/"
        let scanner = Scanner(string: s)
        guard let lat = scanner.scanDouble(), let lon = scanner.scanDouble() else { return nil }
        return GeoPoint(latitude: lat, longitude: lon)
    }

    static func jpegData(_ img: CGImage, quality: Double) -> Data? {
        let data = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(dest, img, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        guard CGImageDestinationFinalize(dest) else { return nil }
        return data as Data
    }

    /// Réduction en pixels bruts puis calculs portables de VaultCore.
    static func analyze(_ img: CGImage) -> (hash: UInt64?, blur: Double?, color: NamedColor?) {
        let gray9 = pixels(img, width: 9, height: 8, gray: true)
        let gray128 = pixels(img, width: 128, height: 128, gray: true)
        let rgba = pixels(img, width: 32, height: 32, gray: false)
        return (gray9.map(ImageAnalysis.differenceHash),
                gray128.map { ImageAnalysis.laplacianVariance(gray: $0, width: 128, height: 128) },
                rgba.flatMap(ImageAnalysis.dominantColor))
    }

    static func pixels(_ img: CGImage, width: Int, height: Int, gray: Bool) -> [UInt8]? {
        let bpp = gray ? 1 : 4
        var buf = [UInt8](repeating: 0, count: width * height * bpp)
        let space = gray ? CGColorSpaceCreateDeviceGray() : CGColorSpaceCreateDeviceRGB()
        let info = gray ? CGImageAlphaInfo.none.rawValue : CGImageAlphaInfo.premultipliedLast.rawValue
        let ok: Bool = buf.withUnsafeMutableBytes { p in
            guard let ctx = CGContext(data: p.baseAddress, width: width, height: height, bitsPerComponent: 8,
                                      bytesPerRow: width * bpp, space: space, bitmapInfo: info) else { return false }
            ctx.interpolationQuality = .medium
            ctx.draw(img, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        return ok ? buf : nil
    }
}

/// Classification visuelle 100 % locale (Vision). Rien n'est envoyé hors de l'appareil.
enum VisualClassifier {
    static func labels(for image: CGImage) -> [String] {
        let request = VNClassifyImageRequest()
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        do {
            try handler.perform([request])
            let obs = request.results ?? []
            return obs.filter { $0.confidence > 0.35 && $0.hasMinimumPrecision(0.1, forRecall: 0.8) }
                .prefix(10).map(\.identifier)
        } catch {
            return []
        }
    }
}

enum ImportError: LocalizedError {
    case unsupported(String), unreadable(String), locked, cancelled
    var errorDescription: String? {
        switch self {
        case .unsupported(let n): return "Format non pris en charge : \(n)"
        case .unreadable(let n): return "Fichier illisible : \(n)"
        case .locked: return "Le coffre est verrouillé."
        case .cancelled: return "Import annulé."
        }
    }
}
