import Foundation
import XCTest
@testable import VaultCore

final class LibraryTests: XCTestCase {
    func testAlbumsAddMoveRemoveReorder() {
        var s = LibraryState()
        let items = (0..<5).map { makeItem(at: date(2025, 6, $0 + 1)) }
        items.forEach { s.insert($0) }
        let a = s.createAlbum(name: "Vacances")
        let b = s.createAlbum(name: "Famille")
        s.add(items.map(\.id), to: a.id)
        s.add([items[0].id], to: a.id) // pas de doublon
        XCTAssertEqual(s.albums[a.id]!.itemIDs.count, 5)
        XCTAssertEqual(s.albums[a.id]!.coverItemID, items[0].id)
        s.move([items[0].id, items[1].id], from: a.id, to: b.id)
        XCTAssertEqual(s.albums[a.id]!.itemIDs, items[2...].map(\.id))
        XCTAssertEqual(s.albums[b.id]!.itemIDs, [items[0].id, items[1].id])
        XCTAssertEqual(s.albums[a.id]!.coverItemID, items[2].id)
        s.reorder(albumID: a.id, from: [2], to: 0)
        XCTAssertEqual(s.albums[a.id]!.itemIDs, [items[4].id, items[2].id, items[3].id])
        s.albums[a.id]!.sort = .oldestFirst
        XCTAssertEqual(s.albumItems(a.id).map(\.id), [items[2].id, items[3].id, items[4].id])
        s.remove([items[3].id], from: a.id)
        XCTAssertEqual(s.albums[a.id]!.itemIDs.count, 2)
        XCTAssertNotNil(s.items[items[3].id], "retirer d'un album ne supprime pas le média")
    }

    func testFoldersAndCycles() {
        var s = LibraryState()
        let f = s.createAlbum(name: "Voyages", kind: .folder)
        let sub = s.createAlbum(name: "Italie", parent: f.id)
        let sub2 = s.createAlbum(name: "Japon", parent: f.id)
        let i = makeItem(at: Date())
        s.insert(i)
        s.add([i.id], to: sub.id)
        s.add([i.id], to: f.id) // un dossier ne contient pas de médias
        XCTAssertTrue(s.albums[f.id]!.itemIDs.isEmpty)
        XCTAssertEqual(s.recursiveCount(f.id), 1)
        XCTAssertEqual(s.listedAlbums(parent: f.id, scope: .locked).map(\.name), ["Italie", "Japon"])
        XCTAssertFalse(s.canMove(album: f.id, under: f.id))
        XCTAssertFalse(s.canMove(album: f.id, under: sub.id), "Italie n'est pas un dossier")
        let inner = s.createAlbum(name: "Inner", kind: .folder, parent: f.id)
        XCTAssertFalse(s.canMove(album: f.id, under: inner.id), "cycle")
        s.deleteAlbum(f.id)
        XCTAssertNil(s.albums[sub2.id]!.parentID)
    }

    func testProtectedAndHiddenAlbumsHideContent() {
        var s = LibraryState()
        let pub = makeItem(at: date(2025, 1, 1)), secret = makeItem(at: date(2025, 1, 2)), hidden = makeItem(at: date(2025, 1, 3))
        [pub, secret, hidden].forEach { s.insert($0) }
        s.items[secret.id]!.labels = ["dog"]
        let p = s.createAlbum(name: "Privé", protection: .protected)
        let h = s.createAlbum(name: "Caché", protection: .hidden)
        s.add([secret.id], to: p.id)
        s.add([hidden.id], to: h.id)
        let locked = AccessScope.locked
        XCTAssertEqual(Set(s.visibleItems(scope: locked).map(\.id)), [pub.id])
        XCTAssertEqual(s.listedAlbums(parent: nil, scope: locked).map(\.name), ["Privé"])
        XCTAssertTrue(SearchEngine.search("chien", state: s, scope: locked).results.isEmpty)
        XCTAssertTrue(SearchEngine.albums(matching: "cach", state: s, scope: locked).isEmpty)
        XCTAssertEqual(LibraryStatistics(state: s, scope: locked).photoCount, 1)

        let unlocked = AccessScope(unlockedAlbums: [p.id])
        XCTAssertEqual(Set(s.visibleItems(scope: unlocked).map(\.id)), [pub.id, secret.id])
        XCTAssertEqual(SearchEngine.search("chien", state: s, scope: unlocked).results.map(\.id), [secret.id])
        // Masqué : il faut le révéler ET le déverrouiller.
        XCTAssertFalse(s.isItemVisible(hidden.id, scope: AccessScope(unlockedAlbums: [h.id], revealHidden: false)))
        XCTAssertTrue(s.isItemVisible(hidden.id, scope: AccessScope(unlockedAlbums: [h.id], revealHidden: true)))
        // Un média aussi présent dans un album normal reste protégé.
        let n = s.createAlbum(name: "Normal")
        s.add([secret.id], to: n.id)
        XCTAssertFalse(s.isItemVisible(secret.id, scope: locked))
    }

    func testTrashPurgeAndSmartAlbums() {
        var s = LibraryState()
        let now = date(2026, 7, 1)
        var big = makeItem(.video, at: date(2026, 6, 20), size: 900_000_000, format: "mov")
        big.importDate = date(2026, 6, 25)
        var shot = makeItem(at: date(2026, 1, 1), format: "png")
        shot.isScreenshot = true
        let pano = makeItem(at: date(2025, 1, 1), w: 12000, h: 3000)
        var fav = makeItem(at: date(2024, 5, 5))
        fav.isFavorite = true
        fav.applyEdit({ var r = EditRecipe(); r.set(.exposure, 20); return r }(), label: "Exposition", at: date(2026, 6, 30))
        [big, shot, pano, fav].forEach { s.insert($0) }
        XCTAssertTrue(pano.isPanorama)
        XCTAssertEqual(s.smartAlbum(.videos, scope: .locked, now: now).map(\.id), [big.id])
        XCTAssertEqual(s.smartAlbum(.large, scope: .locked, now: now).map(\.id), [big.id])
        XCTAssertEqual(s.smartAlbum(.screenshots, scope: .locked, now: now).map(\.id), [shot.id])
        XCTAssertEqual(s.smartAlbum(.panoramas, scope: .locked, now: now).map(\.id), [pano.id])
        XCTAssertEqual(s.smartAlbum(.favorites, scope: .locked, now: now).map(\.id), [fav.id])
        XCTAssertEqual(s.smartAlbum(.recentlyEdited, scope: .locked, now: now).map(\.id), [fav.id])
        XCTAssertEqual(s.smartAlbum(.recentlyAdded, scope: .locked, now: now).map(\.id), [big.id])

        let a = s.createAlbum(name: "A")
        s.add([big.id, shot.id], to: a.id)
        s.moveToTrash([big.id], at: date(2026, 6, 1))
        XCTAssertFalse(s.visibleItems(scope: .locked).contains { $0.id == big.id })
        XCTAssertEqual(s.albumItems(a.id).map(\.id), [shot.id])
        XCTAssertEqual(s.expiredTrash(now: date(2026, 7, 2)), [big.id])
        s.purge([big.id])
        XCTAssertNil(s.items[big.id])
        XCTAssertEqual(s.albums[a.id]!.itemIDs, [shot.id])
    }

    func testEditHistoryAndRecipe() throws {
        var i = makeItem(at: Date())
        var r = EditRecipe()
        r.set(.contrast, 150)
        XCTAssertEqual(r.value(.contrast), 100, "borné")
        r.filter = FilterSelection(presetID: "vintage", intensity: 0.5)
        let eff = r.effectiveAdjustments()
        XCTAssertEqual(eff[.temperature]!, 14, accuracy: 0.001)
        XCTAssertEqual(eff[.contrast]!, 95, accuracy: 0.001)
        i.applyEdit(r, label: "Vintage")
        var r2 = r; r2.crop.quarterTurns = 1
        i.applyEdit(r2, label: "Rotation")
        XCTAssertEqual(i.editHistory.count, 1)
        XCTAssertEqual(i.editHistory[0].recipe, r)
        XCTAssertTrue(i.isEdited)
        let data = try JSONEncoder().encode(i)
        XCTAssertEqual(try JSONDecoder().decode(MediaItem.self, from: data), i)
        XCTAssertTrue(EditRecipe().isIdentity)
        let crop = NormalizedRect.full.fitted(toPixelRatio: 1, imageAspect: 4.0 / 3)
        XCTAssertEqual(crop.width * 4 / 3, crop.height, accuracy: 1e-9)
        XCTAssertEqual(crop.x, (1 - crop.width) / 2, accuracy: 1e-9)
    }

    func testTimelineSections() {
        let items = [makeItem(at: date(2026, 3, 1, 10)), makeItem(at: date(2026, 3, 1, 18)), makeItem(.video, at: date(2026, 3, 5)),
                     makeItem(at: date(2025, 12, 31))]
        let days = LibraryState.timeline(items, granularity: .days, calendar: utcCalendar)
        XCTAssertEqual(days.map(\.items.count), [1, 2, 1])
        XCTAssertEqual(days[1].title, "Dimanche 1 mars 2026")
        XCTAssertEqual(days[1].subtitle, "2 photos")
        let months = LibraryState.timeline(items, granularity: .months, calendar: utcCalendar)
        XCTAssertEqual(months.map(\.title), ["Mars 2026", "Décembre 2025"])
        XCTAssertEqual(months[0].subtitle, "2 photos, 1 vidéo")
        let years = LibraryState.timeline(items, granularity: .years, calendar: utcCalendar)
        XCTAssertEqual(years.map(\.title), ["2026", "2025"])
    }

    func testEncryptedPersistenceAndImport() throws {
        let layout = VaultLayout(root: tempDir())
        try layout.prepare()
        let mk = SymmetricKey(size: .bits256)
        var s = LibraryState()
        let src = layout.root.appendingPathComponent("photo.jpg")
        try SecureRandom.bytes(500_000).write(to: src)
        guard case .imported(let id, let sha, let size) = try VaultImporter.importOriginal(from: src, layout: layout, key: mk, state: s, skipDuplicates: true) else {
            return XCTFail()
        }
        XCTAssertEqual(size, 500_000)
        var item = makeItem(at: Date(), sha: sha)
        item.id = id
        item.location = GeoPoint(latitude: 48.85, longitude: 2.35)
        s.insert(item)
        _ = s.createAlbum(name: "Secret de famille")
        // Doublon détecté par empreinte et fichier supprimé.
        let again = try VaultImporter.importOriginal(from: src, layout: layout, key: mk, state: s, skipDuplicates: true)
        XCTAssertEqual(again, .duplicate(existing: id))
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: layout.originals.path).filter { !$0.hasPrefix(".") }.count, 1)

        try LibraryStore.save(s, layout: layout, key: mk)
        let raw = try Data(contentsOf: layout.index)
        XCTAssertNil(raw.range(of: Data("Secret de famille".utf8)), "l'index est chiffré")
        XCTAssertNil(raw.range(of: Data("48.85".utf8)))
        let loaded = try LibraryStore.load(layout: layout, key: mk)
        // Les dates sont conservées à la milliseconde : on compare les représentations canoniques.
        XCTAssertEqual(try VaultJSON.encoder(sorted: true).encode(loaded), try VaultJSON.encoder(sorted: true).encode(s))
        XCTAssertEqual(loaded.items[id]?.captureDate.timeIntervalSince1970 ?? 0, item.captureDate.timeIntervalSince1970, accuracy: 0.001)
        XCTAssertThrowsError(try LibraryStore.load(layout: layout, key: SymmetricKey(size: .bits256)))
    }

    func testPerformanceWithTenThousandItems() throws {
        var s = LibraryState()
        let start = date(2018, 1, 1)
        for i in 0..<10_000 {
            var it = makeItem(i % 7 == 0 ? .video : .photo, at: start.addingTimeInterval(Double(i) * 9000),
                              location: i % 3 == 0 ? GeoPoint(latitude: 48.8 + Double(i % 50) / 10, longitude: 2.3) : nil)
            it.perceptualHash = UInt64.random(in: 0...UInt64.max)
            it.dominantColor = NamedColor.allCases[i % 12]
            s.insert(it)
        }
        let a = s.createAlbum(name: "Tout")
        s.add(Array(s.items.keys.prefix(3000)), to: a.id)
        let layout = VaultLayout(root: tempDir())
        try layout.prepare()
        let mk = SymmetricKey(size: .bits256)
        let t0 = Date()
        try LibraryStore.save(s, layout: layout, key: mk)
        let loaded = try LibraryStore.load(layout: layout, key: mk)
        let persist = Date().timeIntervalSince(t0)
        XCTAssertEqual(loaded.items.count, 10_000)
        let t1 = Date()
        let tl = LibraryState.timeline(s.visibleItems(scope: .locked), granularity: .days)
        let search = SearchEngine.search("vidéos bleu 2019", state: s, scope: .locked)
        let mem = MemoryGenerator(now: date(2026, 1, 1)).generate(Array(s.items.values))
        let clean = CleanupReport.analyze(s, scope: .locked)
        let compute = Date().timeIntervalSince(t1)
        XCTAssertFalse(tl.isEmpty)
        XCTAssertFalse(search.results.isEmpty)
        XCTAssertTrue(search.results.allSatisfy { $0.kind == .video && $0.dominantColor == .blue })
        print("PERF 10k: persistance \(String(format: "%.2f", persist)) s, calculs \(String(format: "%.2f", compute)) s, souvenirs \(mem.count), similaires \(clean.similarPhotos.count)")
        XCTAssertLessThan(persist, 10)
        XCTAssertLessThan(compute, 30)
    }
}
