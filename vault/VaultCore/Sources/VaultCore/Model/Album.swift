import Foundation

public enum AlbumProtection: String, Codable, Sendable, CaseIterable {
    /// Visible partout.
    case normal
    /// Visible dans la liste des albums, mais contenu verrouillé : authentification supplémentaire requise.
    case protected
    /// Absent de la liste des albums, de la galerie, de la recherche et des souvenirs tant qu'il n'est pas révélé.
    case hidden

    public var label: String {
        switch self {
        case .normal: return "Album normal"
        case .protected: return "Album protégé"
        case .hidden: return "Album masqué"
        }
    }
}

public enum AlbumKind: String, Codable, Sendable {
    /// Contient des médias.
    case album
    /// Collection : contient d'autres albums (sous-collections).
    case folder
}

public enum AlbumSort: String, Codable, Sendable, CaseIterable {
    case custom, newestFirst, oldestFirst, recentlyAdded, largestFirst
    public var label: String {
        switch self {
        case .custom: return "Ordre personnalisé"
        case .newestFirst: return "Plus récents d'abord"
        case .oldestFirst: return "Plus anciens d'abord"
        case .recentlyAdded: return "Ajoutés récemment"
        case .largestFirst: return "Plus volumineux"
        }
    }
}

public struct Album: Codable, Sendable, Identifiable, Hashable {
    public var id: UUID
    public var kind: AlbumKind
    public var name: String
    public var details: String
    public var coverItemID: UUID?
    /// Couleur hexadécimale (#RRGGBB).
    public var colorHex: String
    /// Nom de symbole SF Symbols.
    public var symbol: String
    public var createdAt: Date
    public var modifiedAt: Date
    public var sortIndex: Int
    public var sort: AlbumSort
    public var protection: AlbumProtection
    public var parentID: UUID?
    /// Médias dans l'ordre personnalisé.
    public var itemIDs: [UUID]
    /// Date d'ajout de chaque média (tri « ajoutés récemment »).
    public var addedAt: [UUID: Date]

    public init(id: UUID = UUID(), kind: AlbumKind = .album, name: String, details: String = "", colorHex: String = "#8E8E93",
                symbol: String = "photo.on.rectangle", createdAt: Date = Date(), sortIndex: Int = 0,
                protection: AlbumProtection = .normal, parentID: UUID? = nil) {
        self.id = id
        self.kind = kind
        self.name = name
        self.details = details
        self.colorHex = colorHex
        self.symbol = symbol
        self.createdAt = createdAt
        self.modifiedAt = createdAt
        self.sortIndex = sortIndex
        self.sort = .custom
        self.protection = protection
        self.parentID = parentID
        self.itemIDs = []
        self.addedAt = [:]
    }

    public static let palette = ["#FF453A", "#FF9F0A", "#FFD60A", "#32D74B", "#64D2FF", "#0A84FF", "#5E5CE6", "#BF5AF2", "#FF375F", "#AC8E68", "#8E8E93", "#F2F2F7"]
    public static let symbols = ["photo.on.rectangle", "heart", "star", "airplane", "beach.umbrella", "mountain.2", "house",
                                 "person.2", "pawprint", "fork.knife", "gift", "graduationcap", "sparkles", "camera",
                                 "film", "music.note", "leaf", "sun.max", "moon.stars", "lock", "briefcase", "car", "figure.run", "book"]
}

// Encodage explicite de addedAt (clé UUID → chaîne).
extension Album {
    enum CodingKeys: String, CodingKey {
        case id, kind, name, details, coverItemID, colorHex, symbol, createdAt, modifiedAt, sortIndex, sort, protection, parentID, itemIDs, addedAt
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        kind = try c.decodeIfPresent(AlbumKind.self, forKey: .kind) ?? .album
        name = try c.decode(String.self, forKey: .name)
        details = try c.decodeIfPresent(String.self, forKey: .details) ?? ""
        coverItemID = try c.decodeIfPresent(UUID.self, forKey: .coverItemID)
        colorHex = try c.decodeIfPresent(String.self, forKey: .colorHex) ?? "#8E8E93"
        symbol = try c.decodeIfPresent(String.self, forKey: .symbol) ?? "photo.on.rectangle"
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        modifiedAt = try c.decodeIfPresent(Date.self, forKey: .modifiedAt) ?? createdAt
        sortIndex = try c.decodeIfPresent(Int.self, forKey: .sortIndex) ?? 0
        sort = try c.decodeIfPresent(AlbumSort.self, forKey: .sort) ?? .custom
        protection = try c.decodeIfPresent(AlbumProtection.self, forKey: .protection) ?? .normal
        parentID = try c.decodeIfPresent(UUID.self, forKey: .parentID)
        itemIDs = try c.decodeIfPresent([UUID].self, forKey: .itemIDs) ?? []
        let raw = try c.decodeIfPresent([String: Date].self, forKey: .addedAt) ?? [:]
        addedAt = Dictionary(uniqueKeysWithValues: raw.compactMap { k, v in UUID(uuidString: k).map { ($0, v) } })
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(kind, forKey: .kind)
        try c.encode(name, forKey: .name)
        try c.encode(details, forKey: .details)
        try c.encodeIfPresent(coverItemID, forKey: .coverItemID)
        try c.encode(colorHex, forKey: .colorHex)
        try c.encode(symbol, forKey: .symbol)
        try c.encode(createdAt, forKey: .createdAt)
        try c.encode(modifiedAt, forKey: .modifiedAt)
        try c.encode(sortIndex, forKey: .sortIndex)
        try c.encode(sort, forKey: .sort)
        try c.encode(protection, forKey: .protection)
        try c.encodeIfPresent(parentID, forKey: .parentID)
        try c.encode(itemIDs, forKey: .itemIDs)
        try c.encode(Dictionary(uniqueKeysWithValues: addedAt.map { ($0.key.uuidString, $0.value) }), forKey: .addedAt)
    }
}

/// Albums intelligents : calculés dynamiquement.
public enum SmartAlbum: String, CaseIterable, Sendable, Identifiable {
    case allPhotos, videos, photos, favorites, recentlyEdited, recentlyAdded, large, panoramas, screenshots, located
    public var id: String { rawValue }
    public var name: String {
        switch self {
        case .allPhotos: return "Tous les médias"
        case .videos: return "Vidéos"
        case .photos: return "Photos"
        case .favorites: return "Favoris"
        case .recentlyEdited: return "Modifiés récemment"
        case .recentlyAdded: return "Ajoutés récemment"
        case .large: return "Médias volumineux"
        case .panoramas: return "Panoramas"
        case .screenshots: return "Captures d'écran"
        case .located: return "Avec localisation"
        }
    }
    public var symbol: String {
        switch self {
        case .allPhotos: return "photo.stack"
        case .videos: return "video"
        case .photos: return "photo"
        case .favorites: return "heart"
        case .recentlyEdited: return "slider.horizontal.3"
        case .recentlyAdded: return "clock.arrow.circlepath"
        case .large: return "externaldrive"
        case .panoramas: return "pano"
        case .screenshots: return "camera.viewfinder"
        case .located: return "mappin.and.ellipse"
        }
    }
}
