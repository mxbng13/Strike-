import Foundation

public struct LibraryStatistics: Sendable, Equatable {
    public var photoCount = 0
    public var videoCount = 0
    public var totalBytes: Int64 = 0
    public var photoBytes: Int64 = 0
    public var videoBytes: Int64 = 0
    public var totalVideoDuration: Double = 0
    public var byYear: [(year: Int, count: Int)] = []
    public var byFormat: [(format: String, count: Int)] = []
    public var topAlbums: [(name: String, count: Int)] = []
    public var favorites = 0
    public var edited = 0
    public var located = 0
    public var albumCount = 0
    public var oldest: Date?
    public var newest: Date?

    public static func == (a: LibraryStatistics, b: LibraryStatistics) -> Bool {
        a.photoCount == b.photoCount && a.videoCount == b.videoCount && a.totalBytes == b.totalBytes
            && a.byYear.map(\.year) == b.byYear.map(\.year) && a.byYear.map(\.count) == b.byYear.map(\.count)
    }

    public init() {}

    public init(state: LibraryState, scope: AccessScope, calendar: Calendar = .vault) {
        let items = state.visibleItems(scope: scope)
        for i in items {
            totalBytes += i.fileSize
            if i.kind == .photo { photoCount += 1; photoBytes += i.fileSize } else {
                videoCount += 1; videoBytes += i.fileSize; totalVideoDuration += i.duration ?? 0
            }
            if i.isFavorite { favorites += 1 }
            if i.isEdited { edited += 1 }
            if i.location != nil { located += 1 }
        }
        byYear = Dictionary(grouping: items) { calendar.component(.year, from: $0.captureDate) }
            .map { ($0.key, $0.value.count) }.sorted { $0.0 < $1.0 }.map { (year: $0.0, count: $0.1) }
        byFormat = Dictionary(grouping: items, by: \.format).map { (format: $0.key, count: $0.value.count) }
            .sorted { $0.count > $1.count || ($0.count == $1.count && $0.format < $1.format) }
        let accessible = state.albums.values.filter { $0.kind == .album && state.isAlbumAccessible($0, scope: scope) }
        albumCount = accessible.count
        topAlbums = accessible.map { (name: $0.name, count: $0.itemIDs.filter { state.trash[$0] == nil }.count) }
            .sorted { $0.count > $1.count }.prefix(5).map { $0 }
        oldest = items.map(\.captureDate).min()
        newest = items.map(\.captureDate).max()
    }
}

/// Suggestions de nettoyage. Rien n'est jamais supprimé sans validation explicite de l'utilisateur.
public struct CleanupReport: Sendable {
    public var exactDuplicates: [[UUID]] = []
    public var similarPhotos: [[UUID]] = []
    public var largeFiles: [UUID] = []
    public var blurry: [UUID] = []
    public var longVideos: [UUID] = []
    public var unused: [UUID] = []
    public var screenshots: [UUID] = []


    public init() {}

    public static func analyze(_ state: LibraryState, scope: AccessScope, now: Date = Date(),
                               longVideoSeconds: Double = 180, unusedDays: Double = 180) -> CleanupReport {
        var r = CleanupReport()
        let items = state.visibleItems(scope: scope)
        r.exactDuplicates = Dictionary(grouping: items, by: \.sha256).values.filter { $0.count > 1 }
            .map { $0.sorted { $0.importDate < $1.importDate }.map(\.id) }
        let hashed = items.filter { $0.kind == .photo }.compactMap { i in i.perceptualHash.map { (i.id, $0) } }
        let exactSets = Set(r.exactDuplicates.flatMap { $0 })
        r.similarPhotos = ImageAnalysis.similarGroups(hashed.filter { !exactSets.contains($0.0) }, maxDistance: 5)
        r.largeFiles = items.filter { $0.fileSize >= state.preferences.largeFileThreshold }.sorted { $0.fileSize > $1.fileSize }.map(\.id)
        r.blurry = items.filter { $0.kind == .photo && ($0.blurScore ?? .infinity) < ImageAnalysis.blurThreshold && !$0.isFavorite }.map(\.id)
        r.longVideos = items.filter { $0.kind == .video && ($0.duration ?? 0) >= longVideoSeconds }.sorted { ($0.duration ?? 0) > ($1.duration ?? 0) }.map(\.id)
        let inAlbum = Set(state.albums.values.flatMap(\.itemIDs))
        r.unused = items.filter {
            !inAlbum.contains($0.id) && !$0.isFavorite && !$0.isEdited
                && now.timeIntervalSince($0.lastViewed ?? $0.importDate) > unusedDays * 86400
        }.map(\.id)
        r.screenshots = items.filter(\.isScreenshot).map(\.id)
        return r
    }

    /// Octets récupérables en supprimant toutes les copies sauf la première de chaque groupe.
    public static func duplicateSavings(_ groups: [[UUID]], state: LibraryState) -> Int64 {
        groups.reduce(0) { acc, g in acc + g.dropFirst().reduce(0) { $0 + (state.items[$1]?.fileSize ?? 0) } }
    }
}
