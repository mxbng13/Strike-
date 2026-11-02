import Foundation
import XCTest
@testable import VaultCore

final class FeatureTests: XCTestCase {
    func testSearchParser() {
        let now = date(2026, 11, 2)
        var q = SearchParser.parse("Vidéos de juin 2024", now: now, calendar: utcCalendar)
        XCTAssertEqual(q.kinds, [.video]); XCTAssertEqual(q.months, [6]); XCTAssertEqual(q.years, [2024]); XCTAssertTrue(q.terms.isEmpty)
        q = SearchParser.parse("photos HEIC rouges favoris", now: now, calendar: utcCalendar)
        XCTAssertEqual(q.formats, ["heic"]); XCTAssertEqual(q.colors, [.red]); XCTAssertTrue(q.favoritesOnly)
        q = SearchParser.parse("été 2025 plage", now: now, calendar: utcCalendar)
        XCTAssertEqual(q.seasons, [.summer]); XCTAssertEqual(q.terms, ["plage"])
        q = SearchParser.parse("hier", now: now, calendar: utcCalendar)
        XCTAssertNotNil(q.dateRange)
        XCTAssertTrue(q.dateRange!.contains(date(2026, 11, 1, 15)))
        XCTAssertFalse(q.dateRange!.contains(date(2026, 11, 2, 1)))
        q = SearchParser.parse("il y a 2 ans", now: now, calendar: utcCalendar)
        XCTAssertEqual(q.years, [2024])
        q = SearchParser.parse("14 juillet", now: now, calendar: utcCalendar)
        XCTAssertEqual(q.day, 14); XCTAssertEqual(q.months, [7])
        q = SearchParser.parse("captures d'écran", now: now, calendar: utcCalendar)
        XCTAssertTrue(q.screenshots); XCTAssertTrue(q.terms.isEmpty)
    }

    func testSearchEngineMatching() {
        var s = LibraryState()
        var dog = makeItem(at: date(2024, 6, 10)); dog.labels = ["dog", "grass"]; dog.dominantColor = .green
        var beach = makeItem(at: date(2025, 7, 20), format: "jpg"); beach.labels = ["beach", "sea"]; beach.dominantColor = .blue
        let vid = makeItem(.video, at: date(2024, 6, 11), format: "mov")
        var winter = makeItem(at: date(2024, 12, 24)); winter.dominantColor = .white
        [dog, beach, vid, winter].forEach { s.insert($0) }
        let album = s.createAlbum(name: "Bretagne")
        s.add([beach.id], to: album.id)
        func ids(_ t: String) -> Set<UUID> { Set(SearchEngine.search(t, state: s, scope: .locked, calendar: utcCalendar).results.map(\.id)) }
        XCTAssertEqual(ids("chien"), [dog.id])
        XCTAssertEqual(ids("plage"), [beach.id])
        XCTAssertEqual(ids("bretagne"), [beach.id])
        XCTAssertEqual(ids("juin 2024"), [dog.id, vid.id])
        XCTAssertEqual(ids("vidéo"), [vid.id])
        XCTAssertEqual(ids("mov"), [vid.id])
        XCTAssertEqual(ids("bleu"), [beach.id])
        XCTAssertEqual(ids("hiver 2025"), [winter.id], "décembre 2024 appartient à l'hiver 2024–2025")
        XCTAssertEqual(ids("paysage chien"), [], "tous les termes doivent correspondre")
        XCTAssertEqual(SearchEngine.albums(matching: "bret", state: s, scope: .locked).map(\.name), ["Bretagne"])
        var q = SearchQuery(); q.near = (GeoPoint(latitude: 0, longitude: 0), 10)
        XCTAssertTrue(SearchEngine.search(q, state: s, scope: .locked).isEmpty)
    }

    func testImageAnalysis() {
        // Dégradé horizontal : dHash déterministe ; image inversée : distance maximale.
        let grad = (0..<72).map { UInt8(($0 % 9) * 28) }
        let inv = grad.map { 255 - $0 }
        let h1 = ImageAnalysis.differenceHash(gray9x8: grad)
        let h2 = ImageAnalysis.differenceHash(gray9x8: inv)
        XCTAssertEqual(h1, 0)
        XCTAssertEqual(ImageAnalysis.hammingDistance(h1, h2), 64)
        // Netteté : damier net vs image uniforme.
        let w = 64
        let sharp = (0..<(w * w)).map { UInt8((($0 % w) / 2 + ($0 / w) / 2) % 2 == 0 ? 0 : 255) }
        let flat = [UInt8](repeating: 128, count: w * w)
        XCTAssertGreaterThan(ImageAnalysis.laplacianVariance(gray: sharp, width: w, height: w), 1000)
        XCTAssertEqual(ImageAnalysis.laplacianVariance(gray: flat, width: w, height: w), 0, accuracy: 1e-9)
        // Couleurs dominantes.
        func solid(_ r: UInt8, _ g: UInt8, _ b: UInt8) -> [UInt8] { Array([[r, g, b, 255]].joined()) + Array(repeating: [r, g, b, 255], count: 99).flatMap { $0 } }
        XCTAssertEqual(ImageAnalysis.dominantColor(rgba: solid(220, 30, 30)), .red)
        XCTAssertEqual(ImageAnalysis.dominantColor(rgba: solid(30, 90, 220)), .blue)
        XCTAssertEqual(ImageAnalysis.dominantColor(rgba: solid(40, 180, 60)), .green)
        XCTAssertEqual(ImageAnalysis.dominantColor(rgba: solid(250, 250, 250)), .white)
        XCTAssertEqual(ImageAnalysis.dominantColor(rgba: solid(10, 10, 10)), .black)
        XCTAssertEqual(ImageAnalysis.dominantColor(rgba: solid(120, 70, 30)), .brown)
        // Regroupement des quasi-doublons.
        let a = UUID(), b = UUID(), c = UUID()
        let groups = ImageAnalysis.similarGroups([(a, 0b1111), (b, 0b1110), (c, ~UInt64(0))], maxDistance: 3)
        XCTAssertEqual(groups.count, 1)
        XCTAssertEqual(Set(groups[0]), [a, b])
    }

    func testMemories() {
        let paris = GeoPoint(latitude: 48.8566, longitude: 2.3522)
        let rome = GeoPoint(latitude: 41.9028, longitude: 12.4964)
        var items: [MediaItem] = []
        // Vie quotidienne à Paris.
        for d in 1...25 { items.append(makeItem(at: date(2026, 3, d, 9), location: paris)) }
        // Voyage à Rome sur 3 jours.
        for d in 10...12 { for h in [9, 11, 14, 17] { items.append(makeItem(at: date(2026, 7, d, h), location: rome)) } }
        // Grande journée.
        for m in 0..<20 { items.append(makeItem(at: date(2026, 5, 16, 10, m * 2), location: paris)) }
        // Il y a un an jour pour jour.
        for h in [10, 12, 15] { items.append(makeItem(at: date(2025, 11, 2, h))) }
        // Anniversaire.
        for h in [18, 19, 20] { items.append(makeItem(at: date(2024, 9, 8, h))) }
        let gen = MemoryGenerator(calendar: utcCalendar, now: date(2026, 11, 2), birthdays: [Birthday(name: "Léa", month: 9, day: 8)])
        let mem = gen.generate(items)
        let kinds = Set(mem.map(\.kind))
        XCTAssertTrue(kinds.contains(.trip), "\(mem.map(\.title))")
        XCTAssertTrue(kinds.contains(.bigDay))
        XCTAssertTrue(kinds.contains(.onThisDay))
        XCTAssertTrue(kinds.contains(.birthday))
        XCTAssertTrue(kinds.contains(.season))
        let trip = mem.first { $0.kind == .trip }!
        XCTAssertEqual(trip.itemIDs.count, 12)
        XCTAssertEqual(trip.subtitle, "10 – 12 juillet 2026")
        XCTAssertTrue(mem.contains { $0.title == "Printemps 2026" })
        XCTAssertEqual(mem.first { $0.kind == .onThisDay }!.subtitle, "Il y a 1 an")
        // Stabilité des identifiants et modifications de l'utilisateur.
        XCTAssertEqual(gen.generate(items).map(\.id), mem.map(\.id))
        var o = MemoryOverride(); o.title = "Roma !"; o.removedItemIDs = [trip.itemIDs[0]]
        var o2 = MemoryOverride(); o2.dismissed = true
        let bigDay = mem.first { $0.kind == .bigDay }!
        let edited = gen.generate(items, overrides: [trip.id: o, bigDay.id: o2])
        let t2 = edited.first { $0.id == trip.id }!
        XCTAssertEqual(t2.title, "Roma !")
        XCTAssertEqual(t2.itemIDs.count, 11)
        XCTAssertFalse(edited.contains { $0.id == bigDay.id })
    }

    func testStatisticsAndCleanup() {
        var s = LibraryState()
        let sha = "same"
        var a = makeItem(at: date(2024, 1, 1), size: 1000, sha: sha); a.importDate = date(2024, 1, 1)
        var b = makeItem(at: date(2024, 1, 1), size: 1000, sha: sha); b.importDate = date(2024, 2, 1)
        var blurry = makeItem(at: date(2025, 1, 1), format: "jpg"); blurry.blurScore = 10
        var long = makeItem(.video, at: date(2025, 1, 1), size: 2_000_000_000, format: "mov"); long.duration = 600
        var sim1 = makeItem(at: date(2025, 2, 1)); sim1.perceptualHash = 0xFF00
        var sim2 = makeItem(at: date(2025, 2, 1)); sim2.perceptualHash = 0xFF01
        [a, b, blurry, long, sim1, sim2].forEach { s.insert($0) }
        let album = s.createAlbum(name: "Gardé")
        s.add([sim1.id], to: album.id)
        let st = LibraryStatistics(state: s, scope: .locked, calendar: utcCalendar)
        XCTAssertEqual(st.photoCount, 5); XCTAssertEqual(st.videoCount, 1)
        XCTAssertEqual(st.byYear.map(\.year), [2024, 2025])
        XCTAssertEqual(st.byFormat.first?.format, "heic")
        XCTAssertEqual(st.topAlbums.first?.name, "Gardé")
        let r = CleanupReport.analyze(s, scope: .locked, now: date(2026, 11, 1))
        XCTAssertEqual(r.exactDuplicates, [[a.id, b.id]])
        XCTAssertEqual(CleanupReport.duplicateSavings(r.exactDuplicates, state: s), 1000)
        XCTAssertEqual(r.blurry, [blurry.id])
        XCTAssertEqual(r.longVideos, [long.id])
        XCTAssertEqual(r.largeFiles, [long.id])
        XCTAssertEqual(r.similarPhotos.map(Set.init), [[sim1.id, sim2.id]])
        XCTAssertFalse(r.unused.contains(sim1.id))
        XCTAssertTrue(r.unused.contains(blurry.id))
    }

    func testVideoTimelineLayout() {
        var p = VideoProject(name: "Test")
        var c1 = VideoClip(mediaID: UUID(), sourceDuration: 10); c1.trim(start: 2, end: 8); c1.transitionOut = .crossfade; c1.transitionDuration = 1
        var c2 = VideoClip(mediaID: UUID(), sourceDuration: 4); c2.setSpeed(2); c2.transitionOut = .crossfade; c2.transitionDuration = 5
        let c3 = VideoClip(mediaID: UUID(), sourceDuration: 3)
        p.clips = [c1, c2, c3]
        let l = TimelineLayout(project: p)
        XCTAssertEqual(l.clips.map(\.start), [0, 5, 6])
        XCTAssertEqual(l.clips.map(\.track), [0, 1, 0])
        XCTAssertEqual(l.transitions.map(\.duration), [1, 1], "transition bornée à la moitié du clip le plus court")
        XCTAssertEqual(l.duration, 9, accuracy: 1e-9)
        let f = l.frame(at: 5.5)
        XCTAssertEqual(f.primary, 0); XCTAssertEqual(f.secondary, 1); XCTAssertEqual(f.progress, 0.5, accuracy: 1e-9)
        XCTAssertEqual(l.sourceTime(clip: 1, outputTime: 5.5, speed: 2), 1, accuracy: 1e-9)

        let iv = l.intervals()
        // Le clip 2 (2 s) est entièrement couvert par ses deux transitions d'1 s.
        XCTAssertEqual(iv.map(\.start), [0, 5, 6, 7])
        XCTAssertEqual(iv.map(\.end), [5, 6, 7, 9])
        XCTAssertEqual(iv.map(\.secondary), [nil, 1, 2, nil])
        XCTAssertEqual(iv.map(\.primary), [0, 0, 1, 2])

        XCTAssertTrue(p.split(at: 2.5))
        XCTAssertEqual(p.clips.count, 4)
        XCTAssertEqual(p.clips[0].sourceEnd, 4.5, accuracy: 1e-9)
        XCTAssertEqual(p.clips[1].sourceStart, 4.5, accuracy: 1e-9)
        XCTAssertEqual(TimelineLayout(project: p).duration, 9, accuracy: 1e-9)
        p.moveClip(from: 3, to: 0)
        XCTAssertEqual(p.clips[0].id, c3.id)
        XCTAssertEqual(ExportResolution.p1080.renderSize(aspect: 16.0 / 9).width, 1920)
        XCTAssertEqual(ExportResolution.k4.renderSize(aspect: 9.0 / 16).height, 3840)
        var bad = VideoClip(mediaID: UUID(), sourceDuration: 5); bad.trim(start: 4.99, end: 1)
        XCTAssertGreaterThan(bad.trimmedDuration, 0)
    }

    func testBackupRoundTrip() throws {
        let layout = VaultLayout(root: tempDir())
        try layout.prepare()
        let mk = SymmetricKey(size: .bits256)
        var s = LibraryState()
        var payloads: [UUID: Data] = [:]
        for _ in 0..<3 {
            let id = UUID()
            let d = SecureRandom.bytes(Int.random(in: 1000...400_000))
            try EncryptedFile.encrypt(d, to: layout.original(id), kind: .original, fileID: id, wrappingKey: mk)
            var it = makeItem(at: Date(timeIntervalSince1970: 1_790_000_000.123)); it.id = id
            s.insert(it); payloads[id] = d
        }
        try LibraryStore.save(s, layout: layout, key: mk)
        let archive = tempDir().appendingPathComponent("vault.vaultbackup")
        let summary = try BackupArchive.create(at: archive, layout: layout, masterKey: mk, passphrase: "correct horse battery", iterations: 1000)
        XCTAssertEqual(summary.files, 4)
        XCTAssertThrowsError(try BackupArchive.unlock(archive, passphrase: "mauvaise phrase"))
        let target = VaultLayout(root: tempDir())
        let (restoredKey, rs) = try BackupArchive.restore(archive, passphrase: "correct horse battery", into: target)
        XCTAssertEqual(rs.files, 4)
        XCTAssertEqual(restoredKey.rawData, mk.rawData)
        XCTAssertEqual(try LibraryStore.load(layout: target, key: restoredKey), s)
        for (id, d) in payloads { XCTAssertEqual(try EncryptedFile.decrypt(target.original(id), wrappingKey: restoredKey), d) }
        // Archive tronquée détectée.
        let raw = try Data(contentsOf: archive)
        let cut = tempDir().appendingPathComponent("cut.vaultbackup")
        try raw.prefix(raw.count - 5000).write(to: cut)
        XCTAssertThrowsError(try BackupArchive.restore(cut, passphrase: "correct horse battery", into: VaultLayout(root: tempDir())))
    }
}
