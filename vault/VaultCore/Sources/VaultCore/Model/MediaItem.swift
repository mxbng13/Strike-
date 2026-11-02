import Foundation

public enum MediaKind: String, Codable, Sendable, CaseIterable {
    case photo, video
}

public struct GeoPoint: Codable, Sendable, Hashable {
    public var latitude: Double
    public var longitude: Double
    public init(latitude: Double, longitude: Double) { self.latitude = latitude; self.longitude = longitude }

    /// Distance orthodromique (km).
    public func distanceKm(to o: GeoPoint) -> Double {
        let r = 6371.0
        let dLat = (o.latitude - latitude) * .pi / 180
        let dLon = (o.longitude - longitude) * .pi / 180
        let a = sin(dLat / 2) * sin(dLat / 2) + cos(latitude * .pi / 180) * cos(o.latitude * .pi / 180) * sin(dLon / 2) * sin(dLon / 2)
        return 2 * r * atan2(sqrt(a), sqrt(1 - a))
    }

    /// Geohash (précision 5 ≈ 5 km) pour regrouper les lieux.
    public func geohash(precision: Int = 5) -> String {
        let base32 = Array("0123456789bcdefghjkmnpqrstuvwxyz")
        var latR = (-90.0, 90.0), lonR = (-180.0, 180.0)
        var hash = "", bit = 0, ch = 0, even = true
        while hash.count < precision {
            if even {
                let mid = (lonR.0 + lonR.1) / 2
                if longitude >= mid { ch |= (1 << (4 - bit)); lonR.0 = mid } else { lonR.1 = mid }
            } else {
                let mid = (latR.0 + latR.1) / 2
                if latitude >= mid { ch |= (1 << (4 - bit)); latR.0 = mid } else { latR.1 = mid }
            }
            even.toggle()
            if bit < 4 { bit += 1 } else { hash.append(base32[ch]); bit = 0; ch = 0 }
        }
        return hash
    }
}

public enum NamedColor: String, Codable, Sendable, CaseIterable {
    case red, orange, yellow, green, teal, blue, purple, pink, brown, black, white, gray

    public var frenchName: String {
        switch self {
        case .red: return "rouge"
        case .orange: return "orange"
        case .yellow: return "jaune"
        case .green: return "vert"
        case .teal: return "turquoise"
        case .blue: return "bleu"
        case .purple: return "violet"
        case .pink: return "rose"
        case .brown: return "marron"
        case .black: return "noir"
        case .white: return "blanc"
        case .gray: return "gris"
        }
    }
}

/// Un média du coffre. Le fichier original chiffré est `originals/<id>.vlt` ; il n'est jamais modifié.
public struct MediaItem: Codable, Sendable, Identifiable, Hashable {
    public var id: UUID
    public var kind: MediaKind
    public var originalFilename: String
    /// Identifiant de type (public.jpeg, public.heic, com.apple.quicktime-movie…).
    public var typeIdentifier: String
    /// Extension normalisée en minuscules (jpg, heic, png, webp, mov, mp4…).
    public var format: String
    public var fileSize: Int64
    public var pixelWidth: Int
    public var pixelHeight: Int
    public var duration: Double?
    public var videoCodec: String?
    public var frameRate: Double?
    public var captureDate: Date
    public var importDate: Date
    public var modifiedDate: Date
    public var location: GeoPoint?
    public var cameraModel: String?
    public var isFavorite: Bool = false
    public var isScreenshot: Bool = false
    public var isPanorama: Bool = false
    public var sha256: String
    public var perceptualHash: UInt64?
    public var blurScore: Double?
    public var dominantColor: NamedColor?
    /// Étiquettes de l'analyse visuelle locale (Vision), seulement si l'utilisateur l'a activée.
    public var labels: [String] = []
    public var edit: EditRecipe?
    public var editHistory: [EditVersion] = []
    public var lastViewed: Date?
    public var caption: String = ""

    public init(id: UUID = UUID(), kind: MediaKind, originalFilename: String, typeIdentifier: String, format: String,
                fileSize: Int64, pixelWidth: Int, pixelHeight: Int, duration: Double? = nil,
                captureDate: Date, importDate: Date = Date(), location: GeoPoint? = nil, sha256: String) {
        self.id = id
        self.kind = kind
        self.originalFilename = originalFilename
        self.typeIdentifier = typeIdentifier
        self.format = format.lowercased()
        self.fileSize = fileSize
        self.pixelWidth = pixelWidth
        self.pixelHeight = pixelHeight
        self.duration = duration
        self.captureDate = captureDate
        self.importDate = importDate
        self.modifiedDate = importDate
        self.location = location
        self.sha256 = sha256
        self.isPanorama = MediaItem.looksLikePanorama(width: pixelWidth, height: pixelHeight)
    }

    public var isEdited: Bool { edit.map { !$0.isIdentity } ?? false }
    public var megapixels: Double { Double(pixelWidth * pixelHeight) / 1_000_000 }
    public var aspectRatio: Double { pixelHeight > 0 ? Double(pixelWidth) / Double(pixelHeight) : 1 }

    public var resolutionLabel: String {
        let short = min(pixelWidth, pixelHeight), long = max(pixelWidth, pixelHeight)
        if kind == .video {
            if long >= 3840 || short >= 2160 { return "4K" }
            if short >= 1080 { return "1080p" }
            if short >= 720 { return "720p" }
            return "\(short)p"
        }
        return String(format: "%.1f Mpx", megapixels)
    }

    public static func looksLikePanorama(width: Int, height: Int) -> Bool {
        guard width > 0, height > 0 else { return false }
        let r = Double(max(width, height)) / Double(min(width, height))
        return r >= 2.2
    }

    /// Ajoute une version à l'historique (on conserve les 30 dernières).
    public mutating func applyEdit(_ recipe: EditRecipe?, label: String, at date: Date = Date()) {
        if let current = edit { editHistory.append(EditVersion(date: modifiedDate, recipe: current, label: label)) }
        if editHistory.count > 30 { editHistory.removeFirst(editHistory.count - 30) }
        edit = recipe
        modifiedDate = date
    }
}

public struct EditVersion: Codable, Sendable, Hashable, Identifiable {
    public var id: UUID = UUID()
    public var date: Date
    public var recipe: EditRecipe
    public var label: String
    public init(date: Date, recipe: EditRecipe, label: String) { self.date = date; self.recipe = recipe; self.label = label }
}

public enum Formats {
    public static let photoExtensions: Set<String> = ["jpg", "jpeg", "png", "heic", "heif", "webp", "gif", "tiff", "tif", "dng", "bmp"]
    public static let videoExtensions: Set<String> = ["mov", "mp4", "m4v", "3gp", "avi", "mkv"]
    public static let audioExtensions: Set<String> = ["mp3", "m4a", "aac", "wav", "aif", "aiff", "caf"]

    public static func normalizedExtension(_ filename: String) -> String {
        let ext = (filename as NSString).pathExtension.lowercased()
        switch ext {
        case "jpeg": return "jpg"
        case "heif": return "heic"
        case "tif": return "tiff"
        default: return ext
        }
    }

    public static func kind(forExtension ext: String) -> MediaKind? {
        let e = ext.lowercased()
        if photoExtensions.contains(e) { return .photo }
        if videoExtensions.contains(e) { return .video }
        return nil
    }

    public static func displayName(_ format: String) -> String {
        switch format.lowercased() {
        case "jpg", "jpeg": return "JPEG"
        case "heic": return "HEIC"
        case "mov": return "MOV (QuickTime)"
        case "mp4": return "MP4"
        default: return format.uppercased()
        }
    }
}

public enum ByteFormat {
    public static func string(_ bytes: Int64) -> String {
        let units = ["octets", "Ko", "Mo", "Go", "To"]
        var v = Double(bytes), i = 0
        while v >= 1000 && i < units.count - 1 { v /= 1000; i += 1 }
        if i == 0 { return "\(bytes) octets" }
        let num = String(format: v >= 100 ? "%.0f" : "%.1f", v).replacingOccurrences(of: ".", with: ",")
        return num + " " + units[i]
    }
}
