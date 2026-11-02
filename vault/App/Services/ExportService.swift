import Foundation
import AVFoundation
import ImageIO
import UniformTypeIdentifiers
import VaultCore

struct ExportOptions: Equatable {
    enum PhotoFormat: String, CaseIterable, Identifiable {
        case original, jpeg, heic
        var id: String { rawValue }
        var label: String { switch self { case .original: return "Format d'origine"; case .jpeg: return "JPEG (compatible)"; case .heic: return "HEIC (compact)" } }
    }
    /// true : version retouchée si elle existe ; false : original intact.
    var useEdited = true
    var photoFormat: PhotoFormat = .original
    var stripLocation = false
}

/// Prépare des copies en clair, dans l'espace de travail protégé, pour la feuille de partage.
/// Les fichiers sont supprimés dès la fermeture de la feuille (et au verrouillage).
@MainActor
enum ExportService {
    static func prepare(_ ids: [UUID], library: MediaLibrary, options: ExportOptions,
                        progress: @escaping (Double) -> Void) async throws -> [URL] {
        var urls: [URL] = []
        for (i, id) in ids.enumerated() {
            guard let item = library.state.items[id] else { continue }
            var url = try await library.decryptToWorkspace(id, edited: options.useEdited, dir: "export")
            if item.kind == .photo {
                if options.photoFormat != .original || options.stripLocation {
                    url = try await Task.detached { try transcodePhoto(url, format: options.photoFormat, stripLocation: options.stripLocation) }.value
                }
            } else if options.stripLocation {
                url = try await stripVideoMetadata(url)
            }
            urls.append(url)
            progress(Double(i + 1) / Double(max(ids.count, 1)))
        }
        return urls
    }

    static func cleanup(_ urls: [URL]) {
        for u in urls { SecureWorkspace.shared.remove(u.deletingLastPathComponent()) }
    }

    nonisolated static func transcodePhoto(_ url: URL, format: ExportOptions.PhotoFormat, stripLocation: Bool) throws -> URL {
        guard let src = CGImageSourceCreateWithURL(url as CFURL, nil), let srcType = CGImageSourceGetType(src) else { return url }
        let targetType: CFString
        let ext: String
        switch format {
        case .original: targetType = srcType; ext = url.pathExtension
        case .jpeg: targetType = UTType.jpeg.identifier as CFString; ext = "jpg"
        case .heic: targetType = UTType.heic.identifier as CFString; ext = "heic"
        }
        let out = url.deletingPathExtension().appendingPathExtension(ext == url.pathExtension ? "x." + ext : ext)
        let final = url.deletingPathExtension().appendingPathExtension(ext)
        guard let dest = CGImageDestinationCreateWithURL(out as CFURL, targetType, 1, nil) else { return url }
        if format == .original {
            // Copie sans ré-encodage, en retirant seulement la position GPS.
            var err: Unmanaged<CFError>?
            let opts: [CFString: Any] = [kCGImageMetadataShouldExcludeGPS: stripLocation]
            if !CGImageDestinationCopyImageSource(dest, src, opts as CFDictionary, &err) { return url }
        } else {
            var props: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: 0.95]
            if stripLocation { props[kCGImagePropertyGPSDictionary] = kCFNull }
            CGImageDestinationAddImageFromSource(dest, src, 0, props as CFDictionary)
            guard CGImageDestinationFinalize(dest) else { return url }
        }
        try? FileManager.default.removeItem(at: url)
        if out != final {
            try? FileManager.default.removeItem(at: final)
            try FileManager.default.moveItem(at: out, to: final)
        }
        return final
    }

    /// Supprime localisation et informations personnelles d'une vidéo (sans ré-encodage).
    static func stripVideoMetadata(_ url: URL) async throws -> URL {
        let asset = AVURLAsset(url: url)
        guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetPassthrough) else { return url }
        let out = url.deletingLastPathComponent().appendingPathComponent("clean-" + url.lastPathComponent)
        session.outputURL = out
        session.outputFileType = url.pathExtension.lowercased() == "mp4" ? .mp4 : .mov
        session.metadataItemFilter = .forSharing()
        await session.export()
        guard session.status == .completed else { return url }
        try? FileManager.default.removeItem(at: url)
        return out
    }
}
