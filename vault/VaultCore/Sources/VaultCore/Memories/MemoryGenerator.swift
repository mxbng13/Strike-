import Foundation

/// Génère les « Souvenirs » localement, uniquement à partir des dates, lieux et favoris.
public struct MemoryGenerator: Sendable {
    public var calendar: Calendar
    public var now: Date
    public var birthdays: [Birthday]
    public var minEventSize = 6
    public var eventGap: TimeInterval = 6 * 3600
    public var tripDistanceKm = 80.0

    public init(calendar: Calendar = .vault, now: Date = Date(), birthdays: [Birthday] = []) {
        self.calendar = calendar
        self.now = now
        self.birthdays = birthdays
    }

    public func generate(_ items: [MediaItem], overrides: [UUID: MemoryOverride] = [:]) -> [Memory] {
        let sorted = items.sorted { $0.captureDate < $1.captureDate }
        guard !sorted.isEmpty else { return [] }
        var out: [Memory] = []
        let home = homeLocation(sorted)
        out += events(sorted, home: home)
        out += weekends(sorted)
        out += seasons(sorted)
        out += onThisDay(sorted)
        out += birthdayMemories(sorted)

        // Applique les modifications de l'utilisateur et retire les souvenirs écartés.
        out = out.compactMap { m in
            var m = m
            if let o = overrides[m.id] {
                if o.dismissed { return nil }
                if let t = o.title, !t.isEmpty { m.title = t }
                m.itemIDs.removeAll { o.removedItemIDs.contains($0) }
                if let k = o.keyItemID, m.itemIDs.contains(k) { m.keyItemID = k }
                if o.favorite { m.score += 100 }
            }
            if let k = m.keyItemID, !m.itemIDs.contains(k) { m.keyItemID = m.itemIDs.first }
            return m.itemIDs.count >= 3 ? m : nil
        }
        // Dédoublonnage : un week-end identique à un événement n'est gardé qu'une fois.
        var seen: Set<Set<UUID>> = []
        out = out.filter { seen.insert(Set($0.itemIDs)).inserted }
        return out.sorted { $0.score > $1.score || ($0.score == $1.score && $0.start > $1.start) }
    }

    /// Lieu le plus fréquent (geohash ≈ 5 km), considéré comme « domicile ».
    func homeLocation(_ items: [MediaItem]) -> GeoPoint? {
        let located = items.compactMap(\.location)
        guard located.count >= 5 else { return nil }
        let groups = Dictionary(grouping: located) { $0.geohash(precision: 4) }
        guard let best = groups.max(by: { $0.value.count < $1.value.count })?.value else { return nil }
        let lat = best.map(\.latitude).reduce(0, +) / Double(best.count)
        let lon = best.map(\.longitude).reduce(0, +) / Double(best.count)
        return GeoPoint(latitude: lat, longitude: lon)
    }

    func keyItem(_ items: [MediaItem]) -> UUID? {
        // Privilégie les favoris, puis les photos nettes, puis les plus grandes.
        items.max { a, b in
            func score(_ m: MediaItem) -> Double {
                (m.isFavorite ? 1000 : 0) + (m.kind == .photo ? 50 : 0) + min(m.blurScore ?? 100, 500) / 10 + m.megapixels
                    - (m.isScreenshot ? 500 : 0)
            }
            return score(a) < score(b)
        }?.id
    }

    func make(_ kind: MemoryKind, key: String, title: String, subtitle: String, items: [MediaItem], bonus: Double = 0) -> Memory {
        let fav = items.filter(\.isFavorite).count
        let ageDays = now.timeIntervalSince(items.last!.captureDate) / 86400
        let recency = max(0, 30 - ageDays / 30)
        let score = Double(min(items.count, 200)) / 4 + Double(fav) * 3 + recency + bonus
        return Memory(id: UUID.stable(kind.rawValue + ":" + key), kind: kind, title: title, subtitle: subtitle,
                      itemIDs: items.map(\.id), keyItemID: keyItem(items), start: items.first!.captureDate,
                      end: items.last!.captureDate, score: score)
    }

    func rangeLabel(_ a: Date, _ b: Date) -> String {
        let ca = calendar.dateComponents([.year, .month, .day], from: a)
        let cb = calendar.dateComponents([.year, .month, .day], from: b)
        if ca == cb { return FrenchDates.dayTitle(a, calendar: calendar) }
        if ca.year == cb.year && ca.month == cb.month {
            return "\(ca.day!) – \(cb.day!) " + FrenchDates.months[ca.month! - 1] + " \(ca.year!)"
        }
        if ca.year == cb.year {
            return FrenchDates.shortDay(a, calendar: calendar) + " – " + FrenchDates.shortDay(b, calendar: calendar) + " \(ca.year!)"
        }
        return FrenchDates.shortDay(a, calendar: calendar) + " \(ca.year!) – " + FrenchDates.shortDay(b, calendar: calendar) + " \(cb.year!)"
    }

    /// Événements : séquences de médias séparées par des pauses de plus de 6 h.
    /// Loin du domicile ⇒ voyage ; un seul jour très chargé ⇒ grand jour.
    func events(_ items: [MediaItem], home: GeoPoint?) -> [Memory] {
        var clusters: [[MediaItem]] = []
        var cur: [MediaItem] = []
        for it in items {
            if let last = cur.last, it.captureDate.timeIntervalSince(last.captureDate) > eventGap {
                clusters.append(cur); cur = []
            }
            cur.append(it)
        }
        if !cur.isEmpty { clusters.append(cur) }

        // Fusionne les jours consécutifs loin du domicile en un seul voyage.
        var merged: [[MediaItem]] = []
        for c in clusters {
            if let prev = merged.last, let home,
               isAway(prev, home: home), isAway(c, home: home),
               c.first!.captureDate.timeIntervalSince(prev.last!.captureDate) < 36 * 3600 {
                merged[merged.count - 1] += c
            } else {
                merged.append(c)
            }
        }

        var out: [Memory] = []
        for c in merged where c.count >= minEventSize {
            let first = c.first!.captureDate, last = c.last!.captureDate
            let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: first), to: calendar.startOfDay(for: last)).day! + 1
            let key = "\(Int(first.timeIntervalSince1970))"
            if let home, isAway(c, home: home) {
                let season = Season.of(month: calendar.component(.month, from: first))
                let title = days >= 2 ? "Voyage – \(season.label.lowercased()) \(calendar.component(.year, from: first))" : "Escapade"
                out.append(make(.trip, key: key, title: title, subtitle: rangeLabel(first, last), items: c, bonus: 20))
            } else if days == 1 && c.count >= 15 {
                out.append(make(.bigDay, key: key, title: "Une journée particulière", subtitle: rangeLabel(first, last), items: c, bonus: 10))
            } else {
                let wd = calendar.component(.weekday, from: first)
                let part: String
                let h = calendar.component(.hour, from: first)
                switch h { case 5..<12: part = "matin"; case 12..<18: part = "après-midi"; default: part = "soirée" }
                let title = days == 1 ? FrenchDates.weekdays[wd - 1].capitalized + " " + part : "Quelques jours ensemble"
                out.append(make(.event, key: key, title: title, subtitle: rangeLabel(first, last), items: c))
            }
        }
        return out
    }

    func isAway(_ c: [MediaItem], home: GeoPoint) -> Bool {
        let located = c.compactMap(\.location)
        guard located.count * 3 >= c.count, !located.isEmpty else { return false }
        let far = located.filter { $0.distanceKm(to: home) > tripDistanceKm }.count
        return far * 2 > located.count
    }

    /// Week-ends (samedi + dimanche) avec au moins 8 médias.
    func weekends(_ items: [MediaItem]) -> [Memory] {
        var groups: [String: [MediaItem]] = [:]
        for it in items {
            let wd = calendar.component(.weekday, from: it.captureDate)
            guard wd == 7 || wd == 1 else { continue }
            let saturday = calendar.startOfDay(for: wd == 1 ? calendar.date(byAdding: .day, value: -1, to: it.captureDate)! : it.captureDate)
            groups["\(Int(saturday.timeIntervalSince1970))", default: []].append(it)
        }
        return groups.compactMap { key, g in
            guard g.count >= 8 else { return nil }
            let sat = Date(timeIntervalSince1970: TimeInterval(Int(key)!))
            return make(.weekend, key: key, title: "Week-end du " + FrenchDates.shortDay(sat, calendar: calendar),
                        subtitle: "\(calendar.component(.year, from: sat))", items: g.sorted { $0.captureDate < $1.captureDate })
        }
    }

    /// Saisons (« Été 2026 ») avec au moins 12 médias.
    func seasons(_ items: [MediaItem]) -> [Memory] {
        var groups: [String: (Season, Int, [MediaItem])] = [:]
        for it in items {
            let c = calendar.dateComponents([.year, .month], from: it.captureDate)
            let s = Season.of(month: c.month!)
            let y = (s == .winter && c.month == 12) ? c.year! + 1 : c.year!
            groups["\(s.rawValue)-\(y)", default: (s, y, [])].2.append(it)
        }
        return groups.compactMap { key, g in
            guard g.2.count >= 12 else { return nil }
            let title = g.0 == .winter ? "Hiver \(g.1 - 1)–\(g.1)" : "\(g.0.label) \(g.1)"
            return make(.season, key: key, title: title, subtitle: FrenchDates.countLabel(photos: g.2.filter { $0.kind == .photo }.count,
                                                                                         videos: g.2.filter { $0.kind == .video }.count),
                        items: g.2)
        }
    }

    /// « Ce jour-là » : même jour (± 0) les années précédentes.
    func onThisDay(_ items: [MediaItem]) -> [Memory] {
        let today = calendar.dateComponents([.year, .month, .day], from: now)
        let matches = items.filter {
            let c = calendar.dateComponents([.year, .month, .day], from: $0.captureDate)
            return c.month == today.month && c.day == today.day && c.year! < today.year!
        }
        guard matches.count >= 3 else { return [] }
        let years = Set(matches.map { calendar.component(.year, from: $0.captureDate) })
        let subtitle: String
        if years.count == 1, let y = years.first {
            let n = today.year! - y
            subtitle = "Il y a \(n) an" + (n > 1 ? "s" : "")
        } else {
            subtitle = "\(years.count) années"
        }
        return [make(.onThisDay, key: "\(today.month!)-\(today.day!)-\(today.year!)", title: "Ce jour-là, " + FrenchDates.shortDay(now, calendar: calendar),
                     subtitle: subtitle, items: matches, bonus: 40)]
    }

    func birthdayMemories(_ items: [MediaItem]) -> [Memory] {
        var out: [Memory] = []
        for b in birthdays {
            let byYear = Dictionary(grouping: items.filter {
                let c = calendar.dateComponents([.month, .day], from: $0.captureDate)
                return c.month == b.month && c.day == b.day
            }) { calendar.component(.year, from: $0.captureDate) }
            for (y, g) in byYear where g.count >= 3 {
                out.append(make(.birthday, key: "\(b.id)-\(y)", title: "Anniversaire de \(b.name)", subtitle: "\(y)", items: g, bonus: 30))
            }
        }
        return out
    }
}
