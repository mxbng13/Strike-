import Foundation
import CloudKit
import VaultCore

/// Synchronisation via la base PRIVÉE CloudKit de l'utilisateur (son propre stockage iCloud).
/// Tout est chiffré de bout en bout avant l'envoi : Apple ne stocke que des blocs opaques.
/// Activation : ajouter la capacité iCloud/CloudKit au projet et renseigner VaultCloudKitContainer (voir docs/SYNC.md).
enum CloudConfig {
    static var containerIdentifier: String? {
        let id = Bundle.main.object(forInfoDictionaryKey: "VaultCloudKitContainer") as? String
        return (id?.isEmpty == false) ? id : nil
    }
    static var isAvailable: Bool { containerIdentifier != nil }
}

final class CloudKitTransport: SyncTransport, @unchecked Sendable {
    let database: CKDatabase
    let zoneID = CKRecordZone.ID(zoneName: "VaultZone", ownerName: CKCurrentUserDefaultName)
    private var zoneReady = false

    init(containerIdentifier: String) {
        database = CKContainer(identifier: containerIdentifier).privateCloudDatabase
    }

    func ensureZone() async throws {
        guard !zoneReady else { return }
        _ = try await database.modifyRecordZones(saving: [CKRecordZone(zoneID: zoneID)], deleting: [])
        zoneReady = true
    }

    func fetchChanges(since token: Data?) async throws -> (records: [SyncRecord], token: Data?) {
        try await ensureZone()
        var serverToken = token.flatMap { try? NSKeyedUnarchiver.unarchivedObject(ofClass: CKServerChangeToken.self, from: $0) }
        var out: [SyncRecord] = []
        var more = true
        while more {
            let changes = try await database.recordZoneChanges(inZoneWith: zoneID, since: serverToken,
                                                               desiredKeys: ["wall", "counter", "node", "deleted", "payload", "payloadAsset"],
                                                               resultsLimit: 400)
            for (_, result) in changes.modificationResultsByID {
                guard case .success(let mod) = result, mod.record.recordType == "VaultRecord" else { continue }
                if let r = Self.decode(mod.record) { out.append(r) }
            }
            serverToken = changes.changeToken
            more = changes.moreComing
        }
        let data = serverToken.flatMap { try? NSKeyedArchiver.archivedData(withRootObject: $0, requiringSecureCoding: true) }
        return (out, data)
    }

    static func decode(_ rec: CKRecord) -> SyncRecord? {
        guard let wall = rec["wall"] as? Int64, let counter = rec["counter"] as? Int, let node = rec["node"] as? String else { return nil }
        var payload = rec["payload"] as? Data
        if payload == nil, let asset = rec["payloadAsset"] as? CKAsset, let u = asset.fileURL { payload = try? Data(contentsOf: u) }
        return SyncRecord(name: rec.recordID.recordName, clock: HybridLogicalClock(wall: wall, counter: counter, node: node),
                          deleted: (rec["deleted"] as? Int ?? 0) == 1, payload: payload)
    }

    func push(_ records: [SyncRecord]) async throws {
        try await ensureZone()
        var temps: [URL] = []
        defer { temps.forEach { try? FileManager.default.removeItem(at: $0) } }
        let ck: [CKRecord] = records.map { r in
            let rec = CKRecord(recordType: "VaultRecord", recordID: CKRecord.ID(recordName: r.name, zoneID: zoneID))
            rec["wall"] = r.clock.wall
            rec["counter"] = r.clock.counter
            rec["node"] = r.clock.node
            rec["deleted"] = r.deleted ? 1 : 0
            if let p = r.payload {
                if p.count > 700_000 {
                    let u = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
                    try? p.write(to: u)
                    temps.append(u)
                    rec["payloadAsset"] = CKAsset(fileURL: u)
                } else {
                    rec["payload"] = p
                }
            }
            return rec
        }
        for batch in stride(from: 0, to: ck.count, by: 200).map({ Array(ck[$0..<min($0 + 200, ck.count)]) }) {
            let result = try await database.modifyRecords(saving: batch, deleting: [], savePolicy: .allKeys, atomically: false)
            for (_, r) in result.saveResults { if case .failure(let e) = r { throw e } }
        }
    }

    func uploadBlob(name: String, from file: URL) async throws {
        try await ensureZone()
        let rec = CKRecord(recordType: "VaultBlob", recordID: CKRecord.ID(recordName: name, zoneID: zoneID))
        rec["file"] = CKAsset(fileURL: file)
        let result = try await database.modifyRecords(saving: [rec], deleting: [], savePolicy: .allKeys)
        for (_, r) in result.saveResults { if case .failure(let e) = r { throw e } }
    }

    func downloadBlob(name: String, to file: URL) async throws {
        let rec = try await database.record(for: CKRecord.ID(recordName: name, zoneID: zoneID))
        guard let asset = rec["file"] as? CKAsset, let u = asset.fileURL else { throw CKError(.unknownItem) }
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? FileManager.default.removeItem(at: file)
        try FileManager.default.copyItem(at: u, to: file)
    }

    func deleteBlob(name: String) async throws {
        _ = try await database.modifyRecords(saving: [], deleting: [CKRecord.ID(recordName: name, zoneID: zoneID)])
    }

    // MARK: Séquestre de clé (restauration sur un nouvel appareil avec la clé de récupération)

    func saveEscrow(_ config: VaultConfig) async throws {
        try await ensureZone()
        let rec = CKRecord(recordType: "VaultEscrow", recordID: CKRecord.ID(recordName: "escrow", zoneID: zoneID))
        rec["salt"] = config.recoverySalt
        rec["iterations"] = config.recoveryIterations
        rec["wrapped"] = config.wrappedByRecovery
        rec["check"] = config.keyCheck
        _ = try await database.modifyRecords(saving: [rec], deleting: [], savePolicy: .allKeys)
    }

    func fetchEscrow() async throws -> (salt: Data, iterations: Int, wrapped: Data, check: Data)? {
        try await ensureZone()
        do {
            let rec = try await database.record(for: CKRecord.ID(recordName: "escrow", zoneID: zoneID))
            guard let s = rec["salt"] as? Data, let i = rec["iterations"] as? Int, let w = rec["wrapped"] as? Data,
                  let c = rec["check"] as? Data else { return nil }
            return (s, i, w, c)
        } catch let e as CKError where e.code == .unknownItem {
            return nil
        }
    }
}

/// Orchestration de la synchronisation dans l'application.
@MainActor
final class SyncService: ObservableObject {
    static let shared = SyncService()
    @Published var enabled = UserDefaults.standard.bool(forKey: "vault.sync.enabled") {
        didSet { UserDefaults.standard.set(enabled, forKey: "vault.sync.enabled") }
    }
    @Published private(set) var running = false
    @Published private(set) var lastSync: Date? = UserDefaults.standard.object(forKey: "vault.sync.last") as? Date
    @Published private(set) var lastReport: String?
    @Published private(set) var lastError: String?
    @Published private(set) var conflicts: [SyncConflict] = []

    private var transport: CloudKitTransport? {
        CloudConfig.containerIdentifier.map { CloudKitTransport(containerIdentifier: $0) }
    }

    var deviceID: String {
        if let id = UserDefaults.standard.string(forKey: "vault.device") { return id }
        let id = UUID().uuidString
        UserDefaults.standard.set(id, forKey: "vault.device")
        return id
    }

    func syncNow(library: MediaLibrary, keyManager: VaultKeyManager) async {
        guard enabled, !running, let transport else { return }
        running = true
        lastError = nil
        defer { running = false }
        library.saveNow()
        let layout = library.layout
        let key = library.masterKeyForServices
        let baseURL = layout.sync.appendingPathComponent("base.vlt")
        var base = (try? EncryptedFile.decrypt(baseURL, wrappingKey: key)).flatMap { try? VaultJSON.decoder().decode(SyncBase.self, from: $0) }
            ?? SyncBase(deviceID: deviceID)
        do {
            if let cfg = try? keyManager.config() { try? await transport.saveEscrow(cfg) }
            let engine = SyncEngine(transport: transport, key: key, layout: layout)
            let (report, newBase) = try await engine.sync(state: library.state, base: base)
            base = newBase
            library.mutate { s in for (name, data) in report.applied { try? s.applySync(name: name, data: data) } }
            for (name, _) in report.applied where name.hasPrefix("media:") {
                if let id = UUID(uuidString: String(name.dropFirst(6))) { library.thumbnails.remove(id) }
            }
            try EncryptedFile.encrypt(try VaultJSON.encoder().encode(base), to: baseURL, kind: .other, wrappingKey: key)
            conflicts = report.conflicts
            lastSync = Date()
            UserDefaults.standard.set(lastSync, forKey: "vault.sync.last")
            lastReport = "↑ \(report.pushed) · ↓ \(report.pulled) · fichiers ↑\(report.uploadedBlobs) ↓\(report.downloadedBlobs)"
                + (report.conflicts.isEmpty ? "" : " · \(report.conflicts.count) conflit(s) résolu(s)")
        } catch {
            lastError = error.localizedDescription
        }
    }

    /// Nouvel appareil : récupère la clé maîtresse via le séquestre chiffré et la clé de récupération.
    func fetchMasterKey(recoveryKey: String) async throws -> SymmetricKey {
        guard let transport else { throw VaultKeyError.notConfigured }
        guard let e = try await transport.fetchEscrow() else { throw VaultKeyError.notConfigured }
        guard let code = RecoveryKey.normalize(recoveryKey) else { throw VaultKeyError.wrongRecoveryKey }
        let kek = SymmetricKey(data: PBKDF2.sha256(password: Data(code.utf8), salt: e.salt, iterations: e.iterations))
        guard let mk = try? KeyWrap.unwrap(e.wrapped, with: kek, context: "vault.mk.recovery") else { throw VaultKeyError.wrongRecoveryKey }
        return mk
    }
}
