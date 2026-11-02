import Foundation

/// Préférences synchronisables / persistées avec la bibliothèque (chiffrées avec elle).
public struct VaultPreferences: Codable, Sendable, Hashable {
    public var gridColumns: Int = 4
    public var gridStyle: GridStyle = .square
    public var theme: ThemePreference = .system
    public var accentHex: String = "#0A84FF"
    public var tabOrder: [AppTab] = AppTab.allCases
    public var discreetMode = false
    public var hideNotificationPreviews = true
    public var keepLocation = true
    public var visualAnalysisEnabled = false
    public var skipDuplicatesOnImport = true
    public var deleteFromLibraryAfterImport = false
    public var birthdays: [Birthday] = []
    public var largeFileThreshold: Int64 = 200_000_000
    public init() {}

    public enum GridStyle: String, Codable, CaseIterable, Sendable {
        case square, aspect, compact
        public var label: String {
            switch self { case .square: return "Carrés"; case .aspect: return "Proportions réelles"; case .compact: return "Compacte" }
        }
    }
    public enum ThemePreference: String, Codable, CaseIterable, Sendable {
        case system, light, dark
        public var label: String { switch self { case .system: return "Automatique"; case .light: return "Clair"; case .dark: return "Sombre" } }
    }
}

public enum AppTab: String, Codable, CaseIterable, Sendable, Identifiable {
    case photos, albums, memories, search, settings
    public var id: String { rawValue }
    public var title: String {
        switch self {
        case .photos: return "Photos"
        case .albums: return "Albums"
        case .memories: return "Souvenirs"
        case .search: return "Recherche"
        case .settings: return "Réglages"
        }
    }
    public var symbol: String {
        switch self {
        case .photos: return "photo.on.rectangle.angled"
        case .albums: return "rectangle.stack"
        case .memories: return "sparkles.rectangle.stack"
        case .search: return "magnifyingglass"
        case .settings: return "gearshape"
        }
    }
}

/// Accès de la session aux albums protégés / masqués.
public struct AccessScope: Sendable, Equatable {
    public var unlockedAlbums: Set<UUID> = []
    public var revealHidden = false
    public init(unlockedAlbums: Set<UUID> = [], revealHidden: Bool = false) {
        self.unlockedAlbums = unlockedAlbums; self.revealHidden = revealHidden
    }
    public static let locked = AccessScope()
}

/// État complet de la bibliothèque (index chiffré). Type valeur : facile à tester et à synchroniser.
public struct LibraryState: Codable, Sendable, Equatable {
    public var formatVersion = 1
    public var items: [UUID: MediaItem] = [:]
    public var albums: [UUID: Album] = [:]
    public var projects: [UUID: VideoProject] = [:]
    public var memoryOverrides: [UUID: MemoryOverride] = [:]
    public var savedMemories: [UUID: Memory] = [:]
    public var preferences = VaultPreferences()
    /// Corbeille : id → date de suppression (purge après 30 jours).
    public var trash: [UUID: Date] = [:]

    public init() {}

    // MARK: Visibilité (albums protégés / masqués)

    /// Médias appartenant à au moins un album protégé ou masqué.
    public func restrictedItems() -> [UUID: Set<UUID>] {
        var out: [UUID: Set<UUID>] = [:]
        for a in albums.values where a.protection != .normal {
            for i in a.itemIDs { out[i, default: []].insert(a.id) }
        }
        return out
    }

    public func isAlbumAccessible(_ album: Album, scope: AccessScope) -> Bool {
        switch album.protection {
        case .normal: return isAncestryAccessible(album, scope: scope)
        case .protected: return scope.unlockedAlbums.contains(album.id) && isAncestryAccessible(album, scope: scope)
        case .hidden: return scope.revealHidden && scope.unlockedAlbums.contains(album.id) && isAncestryAccessible(album, scope: scope)
        }
    }

    private func isAncestryAccessible(_ album: Album, scope: AccessScope) -> Bool {
        var seen: Set<UUID> = [album.id]
        var p = album.parentID
        while let pid = p, let parent = albums[pid], !seen.contains(pid) {
            seen.insert(pid)
            if parent.protection == .protected && !scope.unlockedAlbums.contains(pid) { return false }
            if parent.protection == .hidden && !(scope.revealHidden && scope.unlockedAlbums.contains(pid)) { return false }
            p = parent.parentID
        }
        return true
    }

    /// Un média est visible dans la galerie générale, la recherche et les souvenirs
    /// seulement si tous les albums restreints qui le contiennent sont déverrouillés.
    public func isItemVisible(_ id: UUID, scope: AccessScope, restricted: [UUID: Set<UUID>]? = nil) -> Bool {
        guard trash[id] == nil else { return false }
        let r = restricted ?? restrictedItems()
        guard let owners = r[id] else { return true }
        return owners.allSatisfy { aid in albums[aid].map { isAlbumAccessible($0, scope: scope) } ?? true }
    }

    public func visibleItems(scope: AccessScope) -> [MediaItem] {
        let r = restrictedItems()
        return items.values.filter { isItemVisible($0.id, scope: scope, restricted: r) }
    }

    /// Albums affichés dans la liste (les masqués n'apparaissent pas sans révélation).
    public func listedAlbums(parent: UUID?, scope: AccessScope) -> [Album] {
        albums.values
            .filter { $0.parentID == parent }
            .filter { $0.protection != .hidden || scope.revealHidden }
            .sorted { ($0.sortIndex, $0.createdAt) < ($1.sortIndex, $1.createdAt) }
    }

    // MARK: Médias

    public mutating func insert(_ item: MediaItem) { items[item.id] = item }

    public func item(withHash sha: String) -> MediaItem? { items.values.first { $0.sha256 == sha } }

    public mutating func moveToTrash(_ ids: [UUID], at date: Date = Date()) {
        for id in ids where items[id] != nil { trash[id] = date }
    }

    public mutating func restoreFromTrash(_ ids: [UUID]) { for id in ids { trash[id] = nil } }

    /// Suppression définitive (le fichier chiffré et sa clé doivent être effacés par l'appelant).
    public mutating func purge(_ ids: [UUID]) {
        let set = Set(ids)
        for id in ids { items[id] = nil; trash[id] = nil }
        for (aid, var a) in albums {
            let before = a.itemIDs.count
            a.itemIDs.removeAll { set.contains($0) }
            for id in ids { a.addedAt[id] = nil }
            if let c = a.coverItemID, set.contains(c) { a.coverItemID = nil }
            if a.itemIDs.count != before { albums[aid] = a }
        }
        for (pid, var p) in projects {
            let before = p.clips.count
            p.clips.removeAll { set.contains($0.mediaID) }
            if p.clips.count != before { projects[pid] = p }
        }
    }

    public func expiredTrash(now: Date, retention: TimeInterval = 30 * 86400) -> [UUID] {
        trash.filter { now.timeIntervalSince($0.value) >= retention }.map(\.key)
    }

    public mutating func setFavorite(_ ids: [UUID], _ value: Bool) {
        for id in ids { items[id]?.isFavorite = value }
    }

    // MARK: Albums

    @discardableResult
    public mutating func createAlbum(name: String, kind: AlbumKind = .album, protection: AlbumProtection = .normal,
                                     parent: UUID? = nil, colorHex: String = "#0A84FF", symbol: String = "photo.on.rectangle",
                                     at date: Date = Date()) -> Album {
        let nextIndex = (albums.values.filter { $0.parentID == parent }.map(\.sortIndex).max() ?? -1) + 1
        let a = Album(kind: kind, name: name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Sans titre" : name,
                      colorHex: colorHex, symbol: symbol, createdAt: date, sortIndex: nextIndex, protection: protection, parentID: parent)
        albums[a.id] = a
        return a
    }

    public mutating func deleteAlbum(_ id: UUID) {
        // Les sous-collections remontent d'un niveau ; les médias restent dans la bibliothèque.
        let parent = albums[id]?.parentID
        for (cid, var c) in albums where c.parentID == id { c.parentID = parent; albums[cid] = c }
        albums[id] = nil
    }

    public mutating func add(_ ids: [UUID], to albumID: UUID, at date: Date = Date()) {
        guard var a = albums[albumID], a.kind == .album else { return }
        let existing = Set(a.itemIDs)
        for id in ids where items[id] != nil && !existing.contains(id) {
            a.itemIDs.append(id)
            a.addedAt[id] = date
        }
        if a.coverItemID == nil { a.coverItemID = a.itemIDs.first }
        a.modifiedAt = date
        albums[albumID] = a
    }

    public mutating func remove(_ ids: [UUID], from albumID: UUID, at date: Date = Date()) {
        guard var a = albums[albumID] else { return }
        let set = Set(ids)
        a.itemIDs.removeAll { set.contains($0) }
        for id in ids { a.addedAt[id] = nil }
        if let c = a.coverItemID, set.contains(c) { a.coverItemID = a.itemIDs.first }
        a.modifiedAt = date
        albums[albumID] = a
    }

    public mutating func move(_ ids: [UUID], from source: UUID, to destination: UUID, at date: Date = Date()) {
        guard source != destination, albums[destination]?.kind == .album else { return }
        add(ids, to: destination, at: date)
        remove(ids, from: source, at: date)
    }

    public mutating func reorder(albumID: UUID, from offsets: [Int], to destination: Int) {
        guard var a = albums[albumID] else { return }
        let moving = offsets.sorted().compactMap { a.itemIDs.indices.contains($0) ? a.itemIDs[$0] : nil }
        let movingSet = Set(moving)
        let before = a.itemIDs.prefix(destination).filter { !movingSet.contains($0) }.count
        a.itemIDs.removeAll { movingSet.contains($0) }
        a.itemIDs.insert(contentsOf: moving, at: min(before, a.itemIDs.count))
        a.sort = .custom
        albums[albumID] = a
    }

    public mutating func reorderAlbums(_ orderedIDs: [UUID]) {
        for (i, id) in orderedIDs.enumerated() { albums[id]?.sortIndex = i }
    }

    /// Empêche les cycles dans les sous-collections.
    public func canMove(album id: UUID, under parent: UUID?) -> Bool {
        guard let parent else { return true }
        if parent == id { return false }
        guard albums[parent]?.kind == .folder else { return false }
        var p: UUID? = parent
        var guardCount = 0
        while let cur = p, guardCount < 1000 {
            if cur == id { return false }
            p = albums[cur]?.parentID
            guardCount += 1
        }
        return true
    }

    public func albumItems(_ albumID: UUID) -> [MediaItem] {
        guard let a = albums[albumID] else { return [] }
        let list = a.itemIDs.compactMap { id -> MediaItem? in trash[id] == nil ? items[id] : nil }
        switch a.sort {
        case .custom: return list
        case .newestFirst: return list.sorted { $0.captureDate > $1.captureDate }
        case .oldestFirst: return list.sorted { $0.captureDate < $1.captureDate }
        case .recentlyAdded: return list.sorted { (a.addedAt[$0.id] ?? .distantPast) > (a.addedAt[$1.id] ?? .distantPast) }
        case .largestFirst: return list.sorted { $0.fileSize > $1.fileSize }
        }
    }

    public func albums(containing itemID: UUID) -> [Album] {
        albums.values.filter { $0.itemIDs.contains(itemID) }.sorted { $0.name < $1.name }
    }

    /// Nombre total de médias d'une collection (récursif).
    public func recursiveCount(_ albumID: UUID) -> Int {
        guard let a = albums[albumID] else { return 0 }
        if a.kind == .album { return a.itemIDs.filter { trash[$0] == nil }.count }
        return albums.values.filter { $0.parentID == albumID }.reduce(0) { $0 + recursiveCount($1.id) }
    }

    // MARK: Albums intelligents

    public func smartAlbum(_ s: SmartAlbum, scope: AccessScope, now: Date = Date()) -> [MediaItem] {
        let visible = visibleItems(scope: scope)
        let byDate: ([MediaItem]) -> [MediaItem] = { $0.sorted { $0.captureDate > $1.captureDate } }
        switch s {
        case .allPhotos: return byDate(visible)
        case .videos: return byDate(visible.filter { $0.kind == .video })
        case .photos: return byDate(visible.filter { $0.kind == .photo })
        case .favorites: return byDate(visible.filter(\.isFavorite))
        case .recentlyEdited:
            return visible.filter { $0.isEdited && now.timeIntervalSince($0.modifiedDate) < 30 * 86400 }
                .sorted { $0.modifiedDate > $1.modifiedDate }
        case .recentlyAdded:
            return visible.filter { now.timeIntervalSince($0.importDate) < 30 * 86400 }.sorted { $0.importDate > $1.importDate }
        case .large:
            return visible.filter { $0.fileSize >= preferences.largeFileThreshold }.sorted { $0.fileSize > $1.fileSize }
        case .panoramas: return byDate(visible.filter(\.isPanorama))
        case .screenshots: return byDate(visible.filter(\.isScreenshot))
        case .located: return byDate(visible.filter { $0.location != nil })
        }
    }

    // MARK: Chronologie

    public enum TimelineGranularity: String, CaseIterable, Sendable {
        case years, months, days, all
        public var label: String {
            switch self { case .years: return "Années"; case .months: return "Mois"; case .days: return "Jours"; case .all: return "Tout" }
        }
    }

    public struct TimelineSection: Sendable, Identifiable, Equatable {
        public var id: String
        public var title: String
        public var subtitle: String
        public var start: Date
        public var items: [MediaItem]
    }

    public static func timeline(_ items: [MediaItem], granularity: TimelineGranularity, calendar: Calendar = .vault) -> [TimelineSection] {
        let sorted = items.sorted { $0.captureDate > $1.captureDate }
        if granularity == .all {
            return [TimelineSection(id: "all", title: "Toutes les photos", subtitle: "\(sorted.count) éléments",
                                    start: sorted.last?.captureDate ?? Date(), items: sorted)]
        }
        var sections: [TimelineSection] = []
        var currentKey: String?
        for item in sorted {
            let c = calendar.dateComponents([.year, .month, .day], from: item.captureDate)
            let key: String
            switch granularity {
            case .years: key = "\(c.year!)"
            case .months: key = "\(c.year!)-\(c.month!)"
            default: key = "\(c.year!)-\(c.month!)-\(c.day!)"
            }
            if key != currentKey {
                currentKey = key
                let start: Date
                let title: String
                switch granularity {
                case .years:
                    start = calendar.date(from: DateComponents(year: c.year))!
                    title = "\(c.year!)"
                case .months:
                    start = calendar.date(from: DateComponents(year: c.year, month: c.month))!
                    title = FrenchDates.monthYear(start, calendar: calendar)
                default:
                    start = calendar.startOfDay(for: item.captureDate)
                    title = FrenchDates.dayTitle(start, calendar: calendar)
                }
                sections.append(TimelineSection(id: key, title: title, subtitle: "", start: start, items: []))
            }
            sections[sections.count - 1].items.append(item)
        }
        for i in sections.indices {
            let p = sections[i].items.filter { $0.kind == .photo }.count
            let v = sections[i].items.count - p
            sections[i].subtitle = FrenchDates.countLabel(photos: p, videos: v)
        }
        return sections
    }
}

public extension Calendar {
    static var vault: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.locale = Locale(identifier: "fr_FR")
        c.firstWeekday = 2
        return c
    }
}

public enum FrenchDates {
    public static let months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
    public static let weekdays = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"]

    public static func monthYear(_ d: Date, calendar: Calendar = .vault) -> String {
        let c = calendar.dateComponents([.year, .month], from: d)
        return months[c.month! - 1].capitalized + " " + String(c.year!)
    }

    public static func dayTitle(_ d: Date, calendar: Calendar = .vault) -> String {
        let c = calendar.dateComponents([.year, .month, .day, .weekday], from: d)
        return weekdays[c.weekday! - 1].capitalized + " \(c.day!) " + months[c.month! - 1] + " \(c.year!)"
    }

    public static func shortDay(_ d: Date, calendar: Calendar = .vault) -> String {
        let c = calendar.dateComponents([.month, .day], from: d)
        return "\(c.day!) " + months[c.month! - 1]
    }

    public static func full(_ d: Date, calendar: Calendar = .vault) -> String {
        let c = calendar.dateComponents([.hour, .minute], from: d)
        return dayTitle(d, calendar: calendar) + String(format: " à %02d:%02d", c.hour!, c.minute!)
    }

    public static func countLabel(photos: Int, videos: Int) -> String {
        var parts: [String] = []
        if photos > 0 { parts.append("\(photos) photo" + (photos > 1 ? "s" : "")) }
        if videos > 0 { parts.append("\(videos) vidéo" + (videos > 1 ? "s" : "")) }
        return parts.joined(separator: ", ")
    }

    public static func duration(_ seconds: Double) -> String {
        let s = Int(seconds.rounded())
        if s >= 3600 { return String(format: "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60) }
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}
