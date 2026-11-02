import Foundation

/// Archive de sauvegarde « .vaultbackup » : un seul fichier, exportable vers Fichiers / iCloud Drive /
/// un disque externe. Les médias y restent chiffrés tels quels ; la clé maîtresse y est emballée par une
/// phrase secrète de sauvegarde (PBKDF2). Sans cette phrase, l'archive est inexploitable.
///
///   "VBK1" | version u8 | iterations u32 | salt 16 | wrappedLen u16 | wrappedMK | keyCheck 32
///   puis entrées : nameLen u16 | name UTF-8 | size u64 | octets (fichiers .vlt déjà chiffrés)
///   fin : nameLen = 0
public enum BackupArchive {
    public static let magic = Data("VBK1".utf8)

    public struct Summary: Sendable, Equatable {
        public var files: Int
        public var bytes: Int64
    }

    public static func create(at destination: URL, layout: VaultLayout, masterKey: SymmetricKey, passphrase: String,
                              iterations: Int = 600_000, progress: ((Double) -> Void)? = nil) throws -> Summary {
        let salt = SecureRandom.bytes(16)
        let kek = SymmetricKey(data: PBKDF2.sha256(password: Data(passphrase.utf8), salt: salt, iterations: iterations))
        let wrapped = try KeyWrap.wrap(masterKey, with: kek, context: "vault.backup.mk")
        var header = magic
        header.append(1)
        header.appendBigEndian(UInt32(iterations))
        header.append(salt)
        header.appendBigEndian(UInt16(wrapped.count))
        header.append(wrapped)
        header.append(VaultKeyManager.keyCheck(masterKey))

        let files = collect(layout)
        let totalBytes = files.reduce(Int64(0)) { $0 + $1.1 }
        let tmp = destination.deletingLastPathComponent().appendingPathComponent("." + destination.lastPathComponent + ".partial")
        _ = FileManager.default.createFile(atPath: tmp.path, contents: nil)
        guard let out = try? FileHandle(forWritingTo: tmp) else { throw VaultCryptoError.io("création de la sauvegarde impossible") }
        var done: Int64 = 0
        do {
            try out.write(contentsOf: header)
            for (rel, size) in files {
                let nameData = Data(rel.utf8)
                var entry = Data()
                entry.appendBigEndian(UInt16(nameData.count))
                entry.append(nameData)
                entry.appendBigEndian(UInt64(size))
                try out.write(contentsOf: entry)
                let input = try FileHandle(forReadingFrom: layout.root.appendingPathComponent(rel))
                var copied: Int64 = 0
                while copied < size {
                    guard let chunk = try autoreleasepoolCompat({ try input.read(upToCount: 1 << 20) }), !chunk.isEmpty else { break }
                    try out.write(contentsOf: chunk)
                    copied += Int64(chunk.count)
                    done += Int64(chunk.count)
                    progress?(totalBytes > 0 ? Double(done) / Double(totalBytes) : 1)
                }
                try input.close()
                guard copied == size else { throw VaultCryptoError.io("fichier modifié pendant la sauvegarde: \(rel)") }
            }
            var end = Data(); end.appendBigEndian(UInt16(0))
            try out.write(contentsOf: end)
            try out.close()
        } catch {
            try? out.close()
            try? FileManager.default.removeItem(at: tmp)
            throw error
        }
        if FileManager.default.fileExists(atPath: destination.path) { try FileManager.default.removeItem(at: destination) }
        try FileManager.default.moveItem(at: tmp, to: destination)
        return Summary(files: files.count, bytes: totalBytes)
    }

    static func collect(_ layout: VaultLayout) -> [(String, Int64)] {
        var out: [(String, Int64)] = []
        for dir in ["originals", "thumbs", "renders", "audio"] {
            let d = layout.root.appendingPathComponent(dir)
            for name in ((try? FileManager.default.contentsOfDirectory(atPath: d.path)) ?? []).sorted() where name.hasSuffix(".vlt") && !name.hasPrefix(".") {
                let size = (try? FileManager.default.attributesOfItem(atPath: d.appendingPathComponent(name).path)[.size] as? NSNumber)?.int64Value ?? 0
                out.append((dir + "/" + name, size))
            }
        }
        if FileManager.default.fileExists(atPath: layout.index.path) {
            let size = (try? FileManager.default.attributesOfItem(atPath: layout.index.path)[.size] as? NSNumber)?.int64Value ?? 0
            out.append(("index.vlt", size))
        }
        return out
    }

    /// Lit l'en-tête et vérifie la phrase secrète. Renvoie la clé maîtresse.
    public static func unlock(_ archive: URL, passphrase: String) throws -> SymmetricKey {
        let h = try FileHandle(forReadingFrom: archive)
        defer { try? h.close() }
        let (mk, _) = try readHeader(h, passphrase: passphrase)
        return mk
    }

    static func readHeader(_ h: FileHandle, passphrase: String) throws -> (SymmetricKey, Int) {
        guard let fixed = try h.read(upToCount: 4 + 1 + 4 + 16 + 2), fixed.count == 27 else { throw VaultCryptoError.truncated }
        guard fixed.prefix(4) == magic else { throw VaultCryptoError.invalidFormat("pas une sauvegarde VAULT") }
        guard fixed[fixed.startIndex + 4] == 1 else { throw VaultCryptoError.unsupportedVersion(fixed[fixed.startIndex + 4]) }
        let iter = Int(fixed.readBigEndian(UInt32.self, at: 5)!)
        let salt = fixed.subdata(in: (fixed.startIndex + 9)..<(fixed.startIndex + 25))
        let wlen = Int(fixed.readBigEndian(UInt16.self, at: 25)!)
        guard let wrapped = try h.read(upToCount: wlen), wrapped.count == wlen,
              let check = try h.read(upToCount: 32), check.count == 32 else { throw VaultCryptoError.truncated }
        let kek = SymmetricKey(data: PBKDF2.sha256(password: Data(passphrase.utf8), salt: salt, iterations: iter))
        let mk = try KeyWrap.unwrap(wrapped, with: kek, context: "vault.backup.mk")
        guard ConstantTime.equals(VaultKeyManager.keyCheck(mk), check) else { throw VaultCryptoError.authenticationFailed }
        return (mk, 27 + wlen + 32)
    }

    /// Restaure l'archive dans un dossier de coffre vide. Vérifie l'intégrité de chaque fichier.
    public static func restore(_ archive: URL, passphrase: String, into layout: VaultLayout,
                               progress: ((Double) -> Void)? = nil) throws -> (SymmetricKey, Summary) {
        let h = try FileHandle(forReadingFrom: archive)
        defer { try? h.close() }
        let total = Double((try? FileManager.default.attributesOfItem(atPath: archive.path)[.size] as? NSNumber)?.int64Value ?? 1)
        let (mk, _) = try readHeader(h, passphrase: passphrase)
        try layout.prepare()
        var files = 0
        var bytes: Int64 = 0
        while true {
            guard let lenData = try h.read(upToCount: 2), lenData.count == 2 else { throw VaultCryptoError.truncated }
            let len = Int(lenData.readBigEndian(UInt16.self, at: 0)!)
            if len == 0 { break }
            guard let nameData = try h.read(upToCount: len), nameData.count == len,
                  let sizeData = try h.read(upToCount: 8), sizeData.count == 8 else { throw VaultCryptoError.truncated }
            let rel = String(decoding: nameData, as: UTF8.self)
            // Refuse les chemins hors du coffre.
            guard !rel.contains(".."), !rel.hasPrefix("/"), rel.hasSuffix(".vlt") else { throw VaultCryptoError.invalidFormat("chemin") }
            let size = Int64(sizeData.readBigEndian(UInt64.self, at: 0)!)
            let dest = layout.root.appendingPathComponent(rel)
            try FileManager.default.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
            _ = FileManager.default.createFile(atPath: dest.path, contents: nil)
            let out = try FileHandle(forWritingTo: dest)
            var remaining = size
            while remaining > 0 {
                let n = Int(min(remaining, 1 << 20))
                guard let chunk = try autoreleasepoolCompat({ try h.read(upToCount: n) }), chunk.count == n else { try? out.close(); throw VaultCryptoError.truncated }
                try out.write(contentsOf: chunk)
                remaining -= Int64(n)
                bytes += Int64(n)
                progress?(Double(bytes) / total)
            }
            try out.close()
            // Contrôle d'intégrité (authentification AES-GCM de l'en-tête et de la clé).
            _ = try EncryptedFile.Reader(url: dest, wrappingKey: mk)
            files += 1
        }
        return (mk, Summary(files: files, bytes: bytes))
    }
}
