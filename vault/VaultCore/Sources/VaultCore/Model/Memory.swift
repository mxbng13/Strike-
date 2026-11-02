import Foundation

public enum MemoryKind: String, Codable, Sendable {
    case trip, event, weekend, season, onThisDay, bigDay, birthday, custom
    public var label: String {
        switch self {
        case .trip: return "Voyage"
        case .event: return "Moment"
        case .weekend: return "Week-end"
        case .season: return "Saison"
        case .onThisDay: return "Ce jour-là"
        case .bigDay: return "Grand jour"
        case .birthday: return "Anniversaire"
        case .custom: return "Collection"
        }
    }
}

public struct Memory: Codable, Sendable, Identifiable, Hashable {
    public var id: UUID
    public var kind: MemoryKind
    public var title: String
    public var subtitle: String
    public var itemIDs: [UUID]
    public var keyItemID: UUID?
    public var start: Date
    public var end: Date
    public var score: Double
    public init(id: UUID, kind: MemoryKind, title: String, subtitle: String, itemIDs: [UUID], keyItemID: UUID?, start: Date, end: Date, score: Double) {
        self.id = id; self.kind = kind; self.title = title; self.subtitle = subtitle; self.itemIDs = itemIDs
        self.keyItemID = keyItemID; self.start = start; self.end = end; self.score = score
    }
}

/// Modifications de l'utilisateur sur un souvenir généré (persistées, appliquées à chaque génération).
public struct MemoryOverride: Codable, Sendable, Hashable {
    public var title: String?
    public var removedItemIDs: Set<UUID> = []
    public var keyItemID: UUID?
    public var saved = false
    public var dismissed = false
    public var favorite = false
    public init() {}
}

public struct Birthday: Codable, Sendable, Hashable, Identifiable {
    public var id: UUID = UUID()
    public var name: String
    public var month: Int
    public var day: Int
    public init(name: String, month: Int, day: Int) { self.name = name; self.month = month; self.day = day }
}
