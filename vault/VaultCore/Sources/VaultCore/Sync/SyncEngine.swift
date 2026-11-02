import Foundation

/// Horloge logique hybride : ordonne les modifications entre appareils malgré des horloges imparfaites.
public struct HybridLogicalClock: Codable, Comparable, Sendable, Hashable {
    public var wall: Int64
    public var counter: Int
    public var node: String
    public init(wall: Int64, counter: Int, node: String) { self.wall = wall; self.counter = counter; self.node = node }

    public static func < (a: HybridLogicalClock, b: HybridLogicalClock) -> Bool {
        (a.wall, a.counter, a.node) < (b.wall, b.counter, b.node)
    }

    public mutating func tick(now: Date) -> HybridLogicalClock {
        let ms = Int64(now.timeIntervalSince1970 * 1000)
        if ms > wall { wall = ms; counter = 0 } else { counter += 1 }
        return self
    }

    public mutating func receive(_ other: HybridLogicalClock, now: Date) {
        let ms = Int64(now.timeIntervalSince1970 * 1000)
        let maxWall = max(ms, wall, other.wall)
        if maxWall == wall && maxWall == other.wall { counter = max(counter, other.counter) + 1 }
        else if maxWall == wall { counter += 1 }
        else if maxWall == other.wall { counter = other.counter + 1 }
        else { counter = 0 }
        wall = maxWall
    }
}

/// Enregistrement échangé avec le serveur. Le contenu est TOUJOURS chiffré de bout en bout
/// (AES-GCM avec la clé maîtresse) : le fournisseur ne voit que des identifiants et des blocs opaques.
public struct SyncRecord: Codable, Sendable, Equatable {
    public var name: String
    public var clock: HybridLogicalClock
    public var deleted: Bool
    public var payload: Data?
    public init(name: String, clock: HybridLogicalClock, deleted: Bool, payload: Data?) {
        self.name = name; self.clock = clock; self.deleted = deleted; self.payload = payload
    }
}

public protocol SyncTransport: Sendable {
    func fetchChanges(since token: Data?) async throws -> (records: [SyncRecord], token: Data?)
    func push(_ records: [SyncRecord]) async throws
    func uploadBlob(name: String, from file: URL) async throws
    func downloadBlob(name: String, to file: URL) async throws
    func deleteBlob(name: String) async throws
}

/// Transport en mémoire : simule un serveur partagé entre plusieurs appareils (tests).
public actor InMemorySyncServer: SyncTransport {
    private var log: [(Int, SyncRecord)] = []
    private var seq = 0
    private var blobs: [String: Data] = [:]
    public init() {}

    public func fetchChanges(since token: Data?) async throws -> (records: [SyncRecord], token: Data?) {
        let from = token.flatMap { Int(String(decoding: $0, as: UTF8.self)) } ?? 0
        var latest: [String: SyncRecord] = [:]
        for (s, r) in log where s > from { latest[r.name] = r }
        return (Array(latest.values).sorted { $0.name < $1.name }, Data(String(seq).utf8))
    }

    public func push(_ records: [SyncRecord]) async throws {
        for r in records { seq += 1; log.append((seq, r)) }
    }

    public func uploadBlob(name: String, from file: URL) async throws { blobs[name] = try Data(contentsOf: file) }
    public func downloadBlob(name: String, to file: URL) async throws {
        guard let d = blobs[name] else { throw VaultCryptoError.io("blob absent: \(name)") }
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try d.write(to: file)
    }
    public func deleteBlob(name: String) async throws { blobs[name] = nil }
    public var blobCount: Int { blobs.count }
    public var recordCount: Int { log.count }
    /// Les données stockées côté serveur (pour vérifier qu'elles sont opaques).
    public var allPayloads: [Data] { log.compactMap { $0.1.payload } }
    public var allBlobs: [Data] { Array(blobs.values) }
}

/// Base de référence : dernière version synchronisée de chaque enregistrement.
public struct SyncBase: Codable, Sendable, Equatable {
    public var token: Data?
    public var entries: [String: Data] = [:]
    public var clock: HybridLogicalClock
    public init(deviceID: String) { clock = HybridLogicalClock(wall: 0, counter: 0, node: deviceID) }
}

public struct SyncConflict: Sendable, Equatable {
    public enum Resolution: String, Sendable { case merged, keptLocalOverRemoteDeletion, restoredRemoteOverLocalDeletion }
    public var name: String
    public var resolution: Resolution
}

public struct SyncReport: Sendable {
    public var pushed = 0
    public var pulled = 0
    public var uploadedBlobs = 0
    public var downloadedBlobs = 0
    public var conflicts: [SyncConflict] = []
    /// Changements distants à appliquer à la bibliothèque locale (nil = suppression).
    public var applied: [String: Data?] = [:]
}

// MARK: - Projection de la bibliothèque en enregistrements

public struct MediaSyncPayload: Codable, Sendable {
    public var item: MediaItem
    public var trashedAt: Date?
}

extension LibraryState {
    static var syncEncoder: JSONEncoder { VaultJSON.encoder(sorted: true) }
    static var syncDecoder: JSONDecoder { VaultJSON.decoder() }

    /// Instantané canonique (JSON trié) de chaque enregistrement synchronisable.
    public func syncSnapshot() -> [String: Data] {
        var out: [String: Data] = [:]
        let e = LibraryState.syncEncoder
        for (id, item) in items { out["media:" + id.uuidString] = try? e.encode(MediaSyncPayload(item: item, trashedAt: trash[id])) }
        for (id, a) in albums { out["album:" + id.uuidString] = try? e.encode(a) }
        for (id, p) in projects { out["project:" + id.uuidString] = try? e.encode(p) }
        for (id, o) in memoryOverrides { out["memo:" + id.uuidString] = try? e.encode(o) }
        for (id, m) in savedMemories { out["memory:" + id.uuidString] = try? e.encode(m) }
        out["prefs:main"] = try? e.encode(preferences)
        return out
    }

    public mutating func applySync(name: String, data: Data?) throws {
        let parts = name.split(separator: ":", maxSplits: 1).map(String.init)
        guard parts.count == 2 else { return }
        let d = LibraryState.syncDecoder
        if parts[0] == "prefs" {
            if let data { preferences = try d.decode(VaultPreferences.self, from: data) }
            return
        }
        guard let id = UUID(uuidString: parts[1]) else { return }
        switch parts[0] {
        case "media":
            if let data {
                let p = try d.decode(MediaSyncPayload.self, from: data)
                items[id] = p.item
                trash[id] = p.trashedAt
            } else { purge([id]) }
        case "album": albums[id] = try data.map { try d.decode(Album.self, from: $0) }
        case "project": projects[id] = try data.map { try d.decode(VideoProject.self, from: $0) }
        case "memo": memoryOverrides[id] = try data.map { try d.decode(MemoryOverride.self, from: $0) }
        case "memory": savedMemories[id] = try data.map { try d.decode(Memory.self, from: $0) }
        default: break
        }
    }
}

/// Moteur de synchronisation chiffré de bout en bout, indépendant du fournisseur (CloudKit, serveur WebDAV, …).
public struct SyncEngine: @unchecked Sendable {
    public let transport: SyncTransport
    public let key: SymmetricKey
    public let layout: VaultLayout
    public var now: @Sendable () -> Date = { Date() }

    public init(transport: SyncTransport, key: SymmetricKey, layout: VaultLayout) {
        self.transport = transport; self.key = key; self.layout = layout
    }

    func seal(_ name: String, _ data: Data) throws -> Data { try KeyWrap.seal(data, with: key, context: "vault.sync." + name) }
    func open(_ name: String, _ data: Data) throws -> Data { try KeyWrap.open(data, with: key, context: "vault.sync." + name) }

    static func blobNames(_ id: UUID) -> [(String, (VaultLayout) -> URL)] {
        [("o-" + id.uuidString, { $0.original(id) }), ("t-" + id.uuidString, { $0.thumbnail(id) })]
    }

    static func stamp(_ data: Data?) -> Double? {
        guard let data, let v = try? JSONDecoder().decode(JSONValue.self, from: data) else { return nil }
        let obj = v["item"] ?? v
        return (obj["modifiedDate"]?.number ?? obj["modifiedAt"]?.number).map { $0 / 1000 }
    }

    /// Un cycle complet : récupère, fusionne, envoie. Renvoie le rapport et la nouvelle base.
    public func sync(state: LibraryState, base inputBase: SyncBase) async throws -> (SyncReport, SyncBase) {
        var base = inputBase
        var report = SyncReport()
        let local = state.syncSnapshot()
        let (remoteRecords, newToken) = try await transport.fetchChanges(since: base.token)
        var remote: [String: SyncRecord] = [:]
        for r in remoteRecords where r.clock.node != base.clock.node || base.entries[r.name] == nil {
            remote[r.name] = r
            base.clock.receive(r.clock, now: now())
        }

        var toPush: [SyncRecord] = []
        let names = Set(local.keys).union(base.entries.keys).union(remote.keys)
        for name in names.sorted() {
            let baseData = base.entries[name]
            let localData = local[name]
            let localChanged = localData != baseData
            let r = remote[name]
            let remoteData: Data? = try r.flatMap { rec in try rec.payload.map { try open(name, $0) } }

            if r == nil {
                guard localChanged else { continue }
                if let localData {
                    if name.hasPrefix("media:"), baseData == nil, let id = UUID(uuidString: String(name.dropFirst(6))) {
                        for (blob, url) in Self.blobNames(id) where FileManager.default.fileExists(atPath: url(layout).path) {
                            try await transport.uploadBlob(name: blob, from: url(layout))
                            report.uploadedBlobs += 1
                        }
                    }
                    toPush.append(SyncRecord(name: name, clock: base.clock.tick(now: now()), deleted: false, payload: try seal(name, localData)))
                    base.entries[name] = localData
                } else {
                    toPush.append(SyncRecord(name: name, clock: base.clock.tick(now: now()), deleted: true, payload: nil))
                    base.entries[name] = nil
                    if name.hasPrefix("media:"), let id = UUID(uuidString: String(name.dropFirst(6))) {
                        for (blob, _) in Self.blobNames(id) { try? await transport.deleteBlob(name: blob) }
                    }
                }
                continue
            }

            let rec = r!
            if !localChanged {
                // Changement distant seul : on l'applique.
                if rec.deleted {
                    if localData != nil { report.applied[name] = .some(nil) }
                    base.entries[name] = nil
                    if name.hasPrefix("media:"), let id = UUID(uuidString: String(name.dropFirst(6))) { layout.deleteFiles(for: id) }
                } else if let remoteData {
                    if name.hasPrefix("media:"), let id = UUID(uuidString: String(name.dropFirst(6))) {
                        report.downloadedBlobs += try await downloadBlobs(id)
                    }
                    report.applied[name] = remoteData
                    base.entries[name] = remoteData
                }
                report.pulled += 1
                continue
            }

            // Conflit : modifié des deux côtés depuis la dernière synchronisation.
            switch (localData, rec.deleted ? nil : remoteData) {
            case (let l?, nil):
                toPush.append(SyncRecord(name: name, clock: base.clock.tick(now: now()), deleted: false, payload: try seal(name, l)))
                base.entries[name] = l
                report.conflicts.append(SyncConflict(name: name, resolution: .keptLocalOverRemoteDeletion))
            case (nil, let rd?):
                if name.hasPrefix("media:"), let id = UUID(uuidString: String(name.dropFirst(6))) {
                    report.downloadedBlobs += try await downloadBlobs(id)
                }
                report.applied[name] = rd
                base.entries[name] = rd
                report.conflicts.append(SyncConflict(name: name, resolution: .restoredRemoteOverLocalDeletion))
            case (let l?, let rd?):
                let dec = JSONDecoder()
                let lv = try dec.decode(JSONValue.self, from: l)
                let rv = try dec.decode(JSONValue.self, from: rd)
                let bv = try baseData.map { try dec.decode(JSONValue.self, from: $0) }
                let ls = Self.stamp(l) ?? 0
                let rs = Self.stamp(rd) ?? Double(rec.clock.wall) / 1000
                let preferRemote = rs > ls || (rs == ls && rec.clock.node > base.clock.node)
                let merged = JSONValue.merge(base: bv, local: lv, remote: rv, preferRemote: preferRemote)
                let enc = JSONEncoder(); enc.outputFormatting = [.sortedKeys]
                let mergedData = try enc.encode(merged)
                var check = LibraryState()
                try check.applySync(name: name, data: mergedData) // valide le résultat
                let canonical = check.syncSnapshot()[name] ?? mergedData
                report.applied[name] = canonical
                toPush.append(SyncRecord(name: name, clock: base.clock.tick(now: now()), deleted: false, payload: try seal(name, canonical)))
                base.entries[name] = canonical
                report.conflicts.append(SyncConflict(name: name, resolution: .merged))
            case (nil, nil):
                base.entries[name] = nil
            }
            report.pulled += 1
        }

        if !toPush.isEmpty { try await transport.push(toPush) }
        report.pushed = toPush.count
        // Nos propres envois reviendront au prochain cycle et seront ignorés (même nœud, base identique).
        base.token = newToken
        return (report, base)
    }

    private func downloadBlobs(_ id: UUID) async throws -> Int {
        var n = 0
        for (blob, url) in Self.blobNames(id) where !FileManager.default.fileExists(atPath: url(layout).path) {
            do {
                try await transport.downloadBlob(name: blob, to: url(layout))
                n += 1
            } catch where blob.hasPrefix("t-") {
                continue // miniature régénérable
            }
        }
        return n
    }
}
