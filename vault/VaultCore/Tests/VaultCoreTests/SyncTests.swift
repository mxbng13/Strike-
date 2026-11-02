import Foundation
import XCTest
@testable import VaultCore

final class SyncTests: XCTestCase {
    struct Device {
        var state = LibraryState()
        var base: SyncBase
        let layout: VaultLayout
        init(_ name: String) {
            base = SyncBase(deviceID: name)
            layout = VaultLayout(root: tempDir(name + UUID().uuidString))
            try! layout.prepare()
        }
        mutating func sync(_ server: InMemorySyncServer, key: SymmetricKey) async throws -> SyncReport {
            let engine = SyncEngine(transport: server, key: key, layout: layout)
            let (report, newBase) = try await engine.sync(state: state, base: base)
            for (name, data) in report.applied { try state.applySync(name: name, data: data) }
            base = newBase
            return report
        }
        mutating func importMedia(_ key: SymmetricKey, at d: Date) throws -> UUID {
            let id = UUID()
            let content = SecureRandom.bytes(50_000)
            try EncryptedFile.encrypt(content, to: layout.original(id), kind: .original, fileID: id, wrappingKey: key)
            try EncryptedFile.encrypt(Data("thumb".utf8), to: layout.thumbnail(id), kind: .thumbnail, fileID: id, wrappingKey: key)
            var it = makeItem(at: d); it.id = id
            state.insert(it)
            return id
        }
    }

    func testTwoDevicesConvergeWithMediaAlbumsAndDeletions() async throws {
        let server = InMemorySyncServer()
        let key = SymmetricKey(size: .bits256)
        var phone = Device("phone"), pad = Device("ipad")

        let m1 = try phone.importMedia(key, at: date(2026, 1, 1))
        let m2 = try phone.importMedia(key, at: date(2026, 1, 2))
        let album = phone.state.createAlbum(name: "Ski")
        phone.state.add([m1], to: album.id)
        let r1 = try await phone.sync(server, key: key)
        XCTAssertEqual(r1.uploadedBlobs, 4)

        let r2 = try await pad.sync(server, key: key)
        XCTAssertEqual(r2.downloadedBlobs, 4)
        XCTAssertEqual(pad.state.items.count, 2)
        XCTAssertEqual(pad.state.albums[album.id]?.itemIDs, [m1])
        XCTAssertNoThrow(try EncryptedFile.Reader(url: pad.layout.original(m1), wrappingKey: key).verifyAll())

        // Modifications concurrentes du même album : les deux ajouts sont conservés, le renommage le plus récent gagne.
        phone.state.add([m2], to: album.id, at: date(2026, 2, 1))
        let m3 = try pad.importMedia(key, at: date(2026, 2, 2))
        pad.state.add([m3], to: album.id, at: date(2026, 2, 2))
        pad.state.albums[album.id]!.name = "Ski 2026"
        pad.state.albums[album.id]!.modifiedAt = date(2026, 2, 3)
        _ = try await phone.sync(server, key: key)
        let r3 = try await pad.sync(server, key: key)
        XCTAssertEqual(r3.conflicts.map(\.resolution), [.merged])
        _ = try await phone.sync(server, key: key)
        XCTAssertEqual(Set(phone.state.albums[album.id]!.itemIDs), [m1, m2, m3])
        XCTAssertEqual(phone.state.albums[album.id]!.name, "Ski 2026")
        XCTAssertEqual(phone.state.albums, pad.state.albums)
        XCTAssertEqual(phone.state.items.count, 3)

        // Suppression propagée.
        phone.state.purge([m2]); phone.layout.deleteFiles(for: m2)
        _ = try await phone.sync(server, key: key)
        _ = try await pad.sync(server, key: key)
        XCTAssertNil(pad.state.items[m2])
        XCTAssertFalse(pad.state.albums[album.id]!.itemIDs.contains(m2))
        XCTAssertFalse(FileManager.default.fileExists(atPath: pad.layout.original(m2).path))

        // Modification ici + suppression ailleurs : la modification l'emporte.
        pad.state.setFavorite([m1], true)
        pad.state.items[m1]!.modifiedDate = date(2026, 3, 1)
        phone.state.purge([m1])
        _ = try await phone.sync(server, key: key)
        let r4 = try await pad.sync(server, key: key)
        XCTAssertEqual(r4.conflicts.first?.resolution, .keptLocalOverRemoteDeletion)
        _ = try await phone.sync(server, key: key)
        XCTAssertEqual(phone.state.items[m1]?.isFavorite, true)

        // Le serveur ne voit que des données chiffrées.
        for payload in await server.allPayloads {
            XCTAssertNil(payload.range(of: Data("Ski".utf8)))
            XCTAssertNil(payload.range(of: Data("heic".utf8)))
        }
        // Rien de neuf : cycle vide.
        let idle = try await pad.sync(server, key: key)
        XCTAssertEqual(idle.pushed, 0)
    }

    func testThreeWayJSONMerge() {
        let base: JSONValue = .object(["a": .number(1), "b": .string("x"), "list": .array([.string("1"), .string("2")])])
        let local: JSONValue = .object(["a": .number(2), "b": .string("x"), "list": .array([.string("1"), .string("2"), .string("3")])])
        let remote: JSONValue = .object(["a": .number(1), "b": .string("y"), "list": .array([.string("2"), .string("4")])])
        let m = JSONValue.merge(base: base, local: local, remote: remote, preferRemote: false)
        XCTAssertEqual(m["a"], .number(2))
        XCTAssertEqual(m["b"], .string("y"))
        XCTAssertEqual(m["list"], .array([.string("2"), .string("3"), .string("4")]))
    }

    func testHLCOrdering() {
        var a = HybridLogicalClock(wall: 0, counter: 0, node: "a")
        let t = Date(timeIntervalSince1970: 100)
        let x = a.tick(now: t), y = a.tick(now: t)
        XCTAssertLessThan(x, y)
        var b = HybridLogicalClock(wall: 0, counter: 0, node: "b")
        b.receive(y, now: Date(timeIntervalSince1970: 50)) // horloge en retard
        XCTAssertGreaterThan(b.tick(now: Date(timeIntervalSince1970: 50)), y)
    }
}
