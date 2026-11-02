import Foundation

/// Organisation des fichiers du coffre (dans Application Support, exclu des sauvegardes iCloud
/// de l'appareil et protégé par NSFileProtectionComplete côté iOS).
///
///   vault/
///     index.vlt              bibliothèque (LibraryState) chiffrée
///     originals/<id>.vlt     médias originaux, jamais modifiés
///     thumbs/<id>.vlt        miniatures (≈ 400 px)
///     renders/<id>.vlt       rendu de la version retouchée (affichage plein écran)
///     audio/<id>.vlt         musiques importées pour le montage
///     sync/base.vlt          état de référence de la synchronisation
///     inbox.key.vlt          clé privée de la boîte de dépôt (emballée par la clé maîtresse)
public struct VaultLayout: Sendable {
    public let root: URL
    public init(root: URL) { self.root = root }

    public var index: URL { root.appendingPathComponent("index.vlt") }
    public var originals: URL { root.appendingPathComponent("originals", isDirectory: true) }
    public var thumbnails: URL { root.appendingPathComponent("thumbs", isDirectory: true) }
    public var renders: URL { root.appendingPathComponent("renders", isDirectory: true) }
    public var audio: URL { root.appendingPathComponent("audio", isDirectory: true) }
    public var sync: URL { root.appendingPathComponent("sync", isDirectory: true) }
    public var inboxKey: URL { root.appendingPathComponent("inbox.key.vlt") }

    public func original(_ id: UUID) -> URL { originals.appendingPathComponent(id.uuidString + ".vlt") }
    public func thumbnail(_ id: UUID) -> URL { thumbnails.appendingPathComponent(id.uuidString + ".vlt") }
    public func render(_ id: UUID) -> URL { renders.appendingPathComponent(id.uuidString + ".vlt") }
    public func audioFile(_ id: UUID) -> URL { audio.appendingPathComponent(id.uuidString + ".vlt") }

    public func prepare() throws {
        for d in [root, originals, thumbnails, renders, audio, sync] {
            try FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        }
    }

    /// Supprime tous les fichiers d'un média (effacement cryptographique : la clé du fichier est dans son en-tête).
    public func deleteFiles(for id: UUID) {
        for u in [original(id), thumbnail(id), render(id)] { try? FileManager.default.removeItem(at: u) }
    }

    public func wipeEverything() {
        try? FileManager.default.removeItem(at: root)
    }

    /// Espace disque réellement occupé par le coffre.
    public func diskUsage() -> Int64 {
        guard let e = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.fileSizeKey]) else { return 0 }
        var total: Int64 = 0
        for case let u as URL in e {
            total += Int64((try? u.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
        }
        return total
    }
}

/// Persistance de l'index : JSON → chiffré (VLT1) → écriture atomique.
public enum LibraryStore {
    public static func save(_ state: LibraryState, layout: VaultLayout, key: SymmetricKey) throws {
        let data = try VaultJSON.encoder().encode(state)
        try EncryptedFile.encrypt(data, to: layout.index, kind: .index, wrappingKey: key)
    }

    public static func load(layout: VaultLayout, key: SymmetricKey) throws -> LibraryState {
        guard FileManager.default.fileExists(atPath: layout.index.path) else { return LibraryState() }
        let data = try EncryptedFile.decrypt(layout.index, wrappingKey: key)
        return try VaultJSON.decoder().decode(LibraryState.self, from: data)
    }
}

/// Résultat de l'import d'un fichier dans le coffre.
public enum ImportOutcome: Sendable, Equatable {
    case imported(fileID: UUID, sha256: String, size: Int64)
    case duplicate(existing: UUID)
}

public enum VaultImporter {
    /// Chiffre un fichier source dans originals/ en flux et détecte les doublons exacts (SHA-256).
    public static func importOriginal(from source: URL, layout: VaultLayout, key: SymmetricKey, state: LibraryState,
                                      skipDuplicates: Bool, progress: ((Int64) -> Void)? = nil) throws -> ImportOutcome {
        let id = UUID()
        let dest = layout.original(id)
        let r = try EncryptedFile.encryptFile(from: source, to: dest, kind: .original, fileID: id, wrappingKey: key, progress: progress)
        if skipDuplicates, let existing = state.item(withHash: r.sha256Hex) {
            try? FileManager.default.removeItem(at: dest)
            return .duplicate(existing: existing.id)
        }
        return .imported(fileID: id, sha256: r.sha256Hex, size: r.plaintextSize)
    }
}

/// Encodage JSON commun : dates en millisecondes entières (aller-retour exact et stable,
/// indispensable pour comparer les instantanés de synchronisation).
public enum VaultJSON {
    public static func encoder(sorted: Bool = false) -> JSONEncoder {
        let e = JSONEncoder()
        if sorted { e.outputFormatting = [.sortedKeys] }
        e.dateEncodingStrategy = .custom { date, enc in
            var c = enc.singleValueContainer()
            try c.encode(Int64((date.timeIntervalSince1970 * 1000).rounded()))
        }
        return e
    }

    public static func decoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { dec in
            let c = try dec.singleValueContainer()
            return Date(timeIntervalSince1970: Double(try c.decode(Int64.self)) / 1000)
        }
        return d
    }
}
