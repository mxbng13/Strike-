import Foundation

/// Requête de recherche analysée à partir du texte libre (français, avec synonymes anglais).
public struct SearchQuery: Sendable, Equatable {
    public var years: Set<Int> = []
    public var months: Set<Int> = []
    public var day: Int?
    public var dateRange: ClosedRange<Date>?
    public var kinds: Set<MediaKind> = []
    public var formats: Set<String> = []
    public var colors: Set<NamedColor> = []
    public var favoritesOnly = false
    public var screenshots = false
    public var panoramas = false
    public var edited = false
    public var large = false
    public var located = false
    public var seasons: Set<Season> = []
    /// Termes libres : albums, noms de fichiers, légendes, étiquettes visuelles.
    public var terms: [String] = []
    public var near: (GeoPoint, Double)?

    public static func == (a: SearchQuery, b: SearchQuery) -> Bool {
        a.years == b.years && a.months == b.months && a.day == b.day && a.dateRange == b.dateRange && a.kinds == b.kinds
            && a.formats == b.formats && a.colors == b.colors && a.favoritesOnly == b.favoritesOnly && a.screenshots == b.screenshots
            && a.panoramas == b.panoramas && a.edited == b.edited && a.large == b.large && a.located == b.located
            && a.seasons == b.seasons && a.terms == b.terms
    }

    public var isEmpty: Bool {
        years.isEmpty && months.isEmpty && day == nil && dateRange == nil && kinds.isEmpty && formats.isEmpty && colors.isEmpty
            && !favoritesOnly && !screenshots && !panoramas && !edited && !large && !located && seasons.isEmpty && terms.isEmpty && near == nil
    }

    /// Jetons reconnus, pour afficher des « pastilles » dans l'interface.
    public var chips: [String] {
        var c: [String] = []
        c += kinds.map { $0 == .photo ? "Photos" : "Vidéos" }
        c += years.sorted().map(String.init)
        c += months.sorted().map { FrenchDates.months[$0 - 1].capitalized }
        c += seasons.map(\.label)
        c += formats.sorted().map { $0.uppercased() }
        c += colors.map { $0.frenchName.capitalized }
        if favoritesOnly { c.append("Favoris") }
        if screenshots { c.append("Captures") }
        if panoramas { c.append("Panoramas") }
        if edited { c.append("Modifiés") }
        if large { c.append("Volumineux") }
        if located { c.append("Localisés") }
        if dateRange != nil { c.append("Période") }
        return c
    }
}

public enum Season: String, Sendable, CaseIterable {
    case spring, summer, autumn, winter
    public var label: String {
        switch self { case .spring: return "Printemps"; case .summer: return "Été"; case .autumn: return "Automne"; case .winter: return "Hiver" }
    }
    /// Mois de la saison (hémisphère nord). L'hiver chevauche deux années : décembre compte pour l'année suivante.
    public var months: Set<Int> {
        switch self { case .spring: return [3, 4, 5]; case .summer: return [6, 7, 8]; case .autumn: return [9, 10, 11]; case .winter: return [12, 1, 2] }
    }
    public static func of(month: Int) -> Season {
        allCases.first { $0.months.contains(month) }!
    }
}

public enum TextFolding {
    public static func fold(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive, .widthInsensitive], locale: Locale(identifier: "fr_FR"))
            .lowercased()
    }

    public static func tokens(_ s: String) -> [String] {
        fold(s).split { !$0.isLetter && !$0.isNumber && $0 != "'" && $0 != "-" }.map(String.init).filter { !$0.isEmpty }
    }
}

public enum SearchParser {
    static let monthNames: [String: Int] = {
        var m: [String: Int] = [:]
        let fr = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"]
        let en = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
        for i in 0..<12 { m[fr[i]] = i + 1; m[en[i]] = i + 1; m[String(fr[i].prefix(4))] = i + 1 }
        m["fev"] = 2; m["dec"] = 12; m["sept"] = 9
        return m
    }()

    static let kindWords: [String: MediaKind] = [
        "photo": .photo, "photos": .photo, "image": .photo, "images": .photo, "picture": .photo, "pictures": .photo,
        "video": .video, "videos": .video, "film": .video, "films": .video, "clip": .video, "clips": .video, "movie": .video,
    ]

    static let formatWords: [String: String] = [
        "jpg": "jpg", "jpeg": "jpg", "png": "png", "heic": "heic", "heif": "heic", "webp": "webp", "gif": "gif", "dng": "dng", "raw": "dng",
        "tiff": "tiff", "mov": "mov", "mp4": "mp4", "m4v": "m4v", "hevc": "hevc", "h265": "hevc", "h264": "h264",
    ]

    static let colorWords: [String: NamedColor] = {
        var m: [String: NamedColor] = [:]
        for c in NamedColor.allCases { m[TextFolding.fold(c.frenchName)] = c; m[c.rawValue] = c }
        m["rouges"] = .red; m["bleus"] = .blue; m["verts"] = .green; m["jaunes"] = .yellow; m["roses"] = .pink
        m["violets"] = .purple; m["noirs"] = .black; m["blancs"] = .white; m["oranges"] = .orange; m["bleue"] = .blue
        m["verte"] = .green; m["noire"] = .black; m["blanche"] = .white; m["grise"] = .gray; m["mauve"] = .purple
        return m
    }()

    static let seasonWords: [String: Season] = [
        "printemps": .spring, "spring": .spring, "ete": .summer, "summer": .summer, "estival": .summer,
        "automne": .autumn, "autumn": .autumn, "fall": .autumn, "hiver": .winter, "winter": .winter,
    ]

    static let stopWords: Set<String> = ["de", "du", "des", "la", "le", "les", "en", "a", "au", "aux", "et", "avec", "dans", "sur", "un", "une",
                                         "mes", "mon", "ma", "the", "of", "in", "on", "with", "pris", "prises", "prise", "contenant", "ou"]

    public static func parse(_ text: String, now: Date = Date(), calendar: Calendar = .vault) -> SearchQuery {
        var q = SearchQuery()
        let folded = TextFolding.fold(text)
        // Expressions relatives (avant découpage).
        let relative: [(String, () -> ClosedRange<Date>?)] = [
            ("aujourd'hui", { dayRange(now, calendar) }),
            ("aujourdhui", { dayRange(now, calendar) }),
            ("hier", { dayRange(calendar.date(byAdding: .day, value: -1, to: now)!, calendar) }),
            ("cette semaine", { calendar.dateInterval(of: .weekOfYear, for: now).map { $0.start...$0.end } }),
            ("semaine derniere", { calendar.dateInterval(of: .weekOfYear, for: calendar.date(byAdding: .day, value: -7, to: now)!).map { $0.start...$0.end } }),
            ("ce mois", { calendar.dateInterval(of: .month, for: now).map { $0.start...$0.end } }),
            ("mois dernier", { calendar.dateInterval(of: .month, for: calendar.date(byAdding: .month, value: -1, to: now)!).map { $0.start...$0.end } }),
            ("cette annee", { calendar.dateInterval(of: .year, for: now).map { $0.start...$0.end } }),
            ("l'an dernier", { calendar.dateInterval(of: .year, for: calendar.date(byAdding: .year, value: -1, to: now)!).map { $0.start...$0.end } }),
            ("annee derniere", { calendar.dateInterval(of: .year, for: calendar.date(byAdding: .year, value: -1, to: now)!).map { $0.start...$0.end } }),
        ]
        var remaining = folded
        for (phrase, range) in relative where remaining.contains(phrase) {
            q.dateRange = range()
            remaining = remaining.replacingOccurrences(of: phrase, with: " ")
        }
        // « il y a 2 ans »
        if let r = remaining.range(of: #"il y a (\d+) ans?"#, options: .regularExpression) {
            let n = Int(remaining[r].filter(\.isNumber)) ?? 1
            let y = calendar.component(.year, from: now) - n
            q.years.insert(y)
            remaining.removeSubrange(r)
        }

        let tokens = TextFolding.tokens(remaining)
        var i = 0
        while i < tokens.count {
            let t = tokens[i]
            defer { i += 1 }
            if let y = Int(t), (1900...2100).contains(y) { q.years.insert(y); continue }
            if let d = Int(t), (1...31).contains(d), i + 1 < tokens.count, monthNames[tokens[i + 1]] != nil { q.day = d; continue }
            if let m = monthNames[t] { q.months.insert(m); continue }
            if let k = kindWords[t] { q.kinds.insert(k); continue }
            if let f = formatWords[t] { q.formats.insert(f); continue }
            if let c = colorWords[t] { q.colors.insert(c); continue }
            if let s = seasonWords[t] { q.seasons.insert(s); continue }
            switch t {
            case "favori", "favoris", "favorite", "favorites", "coeur", "aime": q.favoritesOnly = true; continue
            case "capture", "captures", "screenshot", "screenshots": q.screenshots = true; continue
            case "panorama", "panoramas", "pano": q.panoramas = true; continue
            case "modifie", "modifies", "modifiee", "modifiees", "retouche", "retouches", "retouchee", "retouchees", "edited": q.edited = true; continue
            case "volumineux", "volumineuses", "lourd", "lourds", "gros", "large": q.large = true; continue
            case "localise", "localises", "localisees", "gps", "lieu", "lieux": q.located = true; continue
            default: break
            }
            if t == "d'ecran" || t == "ecran" { if q.screenshots { continue } }
            if stopWords.contains(t) || t.count < 2 { continue }
            q.terms.append(t)
        }
        return q
    }

    static func dayRange(_ d: Date, _ cal: Calendar) -> ClosedRange<Date> {
        let s = cal.startOfDay(for: d)
        return s...cal.date(byAdding: .day, value: 1, to: s)!.addingTimeInterval(-0.001)
    }
}

/// Traduction des termes français vers les étiquettes Vision (anglais), pour « chien », « plage », etc.
public enum VisualVocabulary {
    public static let synonyms: [String: [String]] = [
        "chien": ["dog", "canine", "puppy"], "chiens": ["dog", "canine"], "chiot": ["puppy", "dog"],
        "chat": ["cat", "feline", "kitten"], "chats": ["cat", "feline"], "chaton": ["kitten", "cat"],
        "plage": ["beach", "shore", "seashore", "coast", "sand"], "mer": ["sea", "ocean", "seascape", "water_body", "beach"],
        "ocean": ["ocean", "sea", "seascape"], "montagne": ["mountain", "hill", "alps", "peak"], "montagnes": ["mountain"],
        "paysage": ["landscape", "outdoor", "nature", "mountain", "field", "sky"], "paysages": ["landscape", "outdoor", "nature"],
        "ciel": ["sky", "cloud", "sunset", "sunrise"], "nuage": ["cloud"], "coucher": ["sunset", "sunset_sunrise"], "soleil": ["sun", "sunset", "sunny"],
        "neige": ["snow", "winter"], "foret": ["forest", "tree", "woodland"], "arbre": ["tree"], "fleur": ["flower", "blossom"], "fleurs": ["flower"],
        "nourriture": ["food", "meal", "dish"], "repas": ["food", "meal", "dish"], "gateau": ["cake", "dessert"], "pizza": ["pizza"],
        "voiture": ["car", "automobile", "vehicle"], "velo": ["bicycle", "bike"], "avion": ["airplane", "aircraft"], "bateau": ["boat", "ship"],
        "ville": ["city", "cityscape", "building", "street", "urban"], "batiment": ["building", "architecture"], "rue": ["street", "road"],
        "personne": ["people", "person", "adult", "child", "portrait"], "personnes": ["people", "crowd"], "enfant": ["child", "baby", "kid"],
        "bebe": ["baby", "infant"], "selfie": ["selfie", "portrait", "face"], "portrait": ["portrait", "face", "people"],
        "fete": ["party", "celebration", "birthday", "balloon"], "anniversaire": ["birthday", "cake", "party"], "mariage": ["wedding", "bride"],
        "nuit": ["night", "night_sky", "dark"], "lac": ["lake", "water_body"], "riviere": ["river", "stream"], "piscine": ["swimming_pool", "pool"],
        "sport": ["sport", "ball", "stadium"], "musique": ["concert", "musical_instrument", "guitar"], "livre": ["book", "document"],
        "document": ["document", "text", "paper", "receipt"], "texte": ["text", "document"], "oiseau": ["bird"], "cheval": ["horse"],
        "noel": ["christmas", "christmas_tree"], "jardin": ["garden", "plant", "grass"], "desert": ["desert", "sand", "dune"],
    ]

    public static func labels(for term: String) -> [String] {
        var out = [term]
        out += synonyms[term] ?? []
        if term.hasSuffix("s"), let s = synonyms[String(term.dropLast())] { out += s }
        return out
    }
}

public struct SearchContext: Sendable {
    public var albumNamesByItem: [UUID: [String]]
    public var memoryTitlesByItem: [UUID: [String]]
    public init(state: LibraryState, scope: AccessScope, memories: [Memory] = []) {
        var a: [UUID: [String]] = [:]
        for album in state.albums.values where state.isAlbumAccessible(album, scope: scope) {
            let n = TextFolding.fold(album.name)
            for id in album.itemIDs { a[id, default: []].append(n) }
        }
        albumNamesByItem = a
        var m: [UUID: [String]] = [:]
        for mem in memories {
            let t = TextFolding.fold(mem.title)
            for id in mem.itemIDs { m[id, default: []].append(t) }
        }
        memoryTitlesByItem = m
    }
}

public enum SearchEngine {
    public static func matches(_ item: MediaItem, _ q: SearchQuery, ctx: SearchContext, calendar: Calendar = .vault, largeThreshold: Int64 = 200_000_000) -> Bool {
        let c = calendar.dateComponents([.year, .month, .day], from: item.captureDate)
        if !q.years.isEmpty {
            // L'hiver 2025 inclut décembre 2024.
            var yearOK = q.years.contains(c.year!)
            if !yearOK, q.seasons.contains(.winter), c.month == 12 { yearOK = q.years.contains(c.year! + 1) }
            if !yearOK { return false }
        }
        if !q.months.isEmpty && !q.months.contains(c.month!) { return false }
        if let d = q.day, c.day != d { return false }
        if let r = q.dateRange, !r.contains(item.captureDate) { return false }
        if !q.seasons.isEmpty && !q.seasons.contains(Season.of(month: c.month!)) { return false }
        if !q.kinds.isEmpty && !q.kinds.contains(item.kind) { return false }
        if !q.formats.isEmpty {
            let codec = item.videoCodec.map(TextFolding.fold) ?? ""
            if !q.formats.contains(item.format) && !q.formats.contains(codec) { return false }
        }
        if !q.colors.isEmpty { guard let dc = item.dominantColor, q.colors.contains(dc) else { return false } }
        if q.favoritesOnly && !item.isFavorite { return false }
        if q.screenshots && !item.isScreenshot { return false }
        if q.panoramas && !item.isPanorama { return false }
        if q.edited && !item.isEdited { return false }
        if q.large && item.fileSize < largeThreshold { return false }
        if q.located && item.location == nil { return false }
        if let (p, km) = q.near { guard let l = item.location, l.distanceKm(to: p) <= km else { return false } }
        for term in q.terms where !termMatches(term, item, ctx) { return false }
        return true
    }

    static func termMatches(_ term: String, _ item: MediaItem, _ ctx: SearchContext) -> Bool {
        if TextFolding.fold(item.originalFilename).contains(term) { return true }
        if !item.caption.isEmpty && TextFolding.fold(item.caption).contains(term) { return true }
        if let names = ctx.albumNamesByItem[item.id], names.contains(where: { $0.contains(term) }) { return true }
        if let titles = ctx.memoryTitlesByItem[item.id], titles.contains(where: { $0.contains(term) }) { return true }
        if let cam = item.cameraModel, TextFolding.fold(cam).contains(term) { return true }
        if !item.labels.isEmpty {
            let wanted = VisualVocabulary.labels(for: term)
            for l in item.labels {
                let fl = TextFolding.fold(l)
                if wanted.contains(where: { fl == $0 || fl.hasPrefix($0 + "_") || fl.contains($0) }) { return true }
            }
        }
        return false
    }

    public static func search(_ text: String, state: LibraryState, scope: AccessScope, memories: [Memory] = [], now: Date = Date(),
                              calendar: Calendar = .vault) -> (query: SearchQuery, results: [MediaItem]) {
        let q = SearchParser.parse(text, now: now, calendar: calendar)
        return (q, search(q, state: state, scope: scope, memories: memories, calendar: calendar))
    }

    public static func search(_ q: SearchQuery, state: LibraryState, scope: AccessScope, memories: [Memory] = [], calendar: Calendar = .vault) -> [MediaItem] {
        guard !q.isEmpty else { return [] }
        let ctx = SearchContext(state: state, scope: scope, memories: memories)
        return state.visibleItems(scope: scope)
            .filter { matches($0, q, ctx: ctx, calendar: calendar, largeThreshold: state.preferences.largeFileThreshold) }
            .sorted { $0.captureDate > $1.captureDate }
    }

    /// Albums dont le nom correspond (résultats séparés dans l'interface).
    public static func albums(matching text: String, state: LibraryState, scope: AccessScope) -> [Album] {
        let f = TextFolding.fold(text).trimmingCharacters(in: .whitespaces)
        guard f.count >= 2 else { return [] }
        return state.albums.values
            .filter { $0.protection != .hidden || scope.revealHidden }
            .filter { TextFolding.fold($0.name).contains(f) }
            .sorted { $0.name < $1.name }
    }

    /// Suggestions affichées avant la saisie.
    public static func suggestions(state: LibraryState, scope: AccessScope, calendar: Calendar = .vault) -> [String] {
        let items = state.visibleItems(scope: scope)
        var s: [String] = []
        let years = Set(items.map { calendar.component(.year, from: $0.captureDate) }).sorted(by: >)
        s += years.prefix(3).map(String.init)
        if items.contains(where: { $0.kind == .video }) { s.append("Vidéos") }
        if items.contains(where: \.isFavorite) { s.append("Favoris") }
        let colors = Dictionary(grouping: items.compactMap(\.dominantColor), by: { $0 }).sorted { $0.value.count > $1.value.count }
        s += colors.prefix(2).map { $0.key.frenchName.capitalized }
        let labels = Dictionary(grouping: items.flatMap(\.labels), by: { $0 }).sorted { $0.value.count > $1.value.count }
        s += labels.prefix(4).map { $0.key.replacingOccurrences(of: "_", with: " ") }
        return s
    }
}
