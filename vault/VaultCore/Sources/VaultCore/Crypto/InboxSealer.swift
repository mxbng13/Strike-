import Foundation

/// Boîte de dépôt chiffrée pour l'extension de partage iOS.
///
/// L'extension n'a jamais accès à la clé maîtresse : elle ne connaît que la clé
/// publique X25519 de la boîte de dépôt. Chaque fichier partagé est chiffré avec
/// une clé éphémère (ECDH + HKDF), puis l'application l'importe après déverrouillage.
/// Seule l'application (clé privée emballée par la clé maîtresse) peut l'ouvrir.
public enum InboxSealer {
    public static let info = Data("vault.inbox.v1".utf8)

    public struct Metadata: Codable, Sendable, Equatable {
        public var originalFilename: String
        public var typeIdentifier: String
        public var sharedAt: Date
        public init(originalFilename: String, typeIdentifier: String, sharedAt: Date = Date()) {
            self.originalFilename = originalFilename
            self.typeIdentifier = typeIdentifier
            self.sharedAt = sharedAt
        }
    }

    public struct Paths: Sendable {
        public let payload: URL
        public let ephemeralKey: URL
        public let metadata: URL
        public init(directory: URL, id: UUID) {
            payload = directory.appendingPathComponent(id.uuidString + ".vlt")
            ephemeralKey = directory.appendingPathComponent(id.uuidString + ".epk")
            metadata = directory.appendingPathComponent(id.uuidString + ".meta")
        }
    }

    static func derive(shared: SharedSecret, ephemeral: Data, recipient: Data) -> SymmetricKey {
        shared.hkdfDerivedSymmetricKey(using: SHA256.self, salt: ephemeral + recipient, sharedInfo: info, outputByteCount: 32)
    }

    /// Côté extension : dépose un fichier dans la boîte.
    @discardableResult
    public static func seal(file: URL, metadata: Metadata, recipient: Curve25519.KeyAgreement.PublicKey,
                            inboxDirectory: URL) throws -> UUID {
        let id = UUID()
        let paths = Paths(directory: inboxDirectory, id: id)
        let eph = Curve25519.KeyAgreement.PrivateKey()
        let shared = try eph.sharedSecretFromKeyAgreement(with: recipient)
        let key = derive(shared: shared, ephemeral: eph.publicKey.rawRepresentation, recipient: recipient.rawRepresentation)
        try FileManager.default.createDirectory(at: inboxDirectory, withIntermediateDirectories: true)
        _ = try EncryptedFile.encryptFile(from: file, to: paths.payload, kind: .inbox, fileID: id, wrappingKey: key)
        let meta = try KeyWrap.seal(JSONEncoder().encode(metadata), with: key, context: "vault.inbox.meta." + id.uuidString)
        try meta.write(to: paths.metadata, options: .atomic)
        // Écrit en dernier : sa présence signale un dépôt complet.
        try eph.publicKey.rawRepresentation.write(to: paths.ephemeralKey, options: .atomic)
        return id
    }

    public struct Pending: Sendable {
        public let id: UUID
        public let paths: Paths
    }

    public static func pending(in directory: URL) -> [Pending] {
        let files = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        return files.filter { $0.hasSuffix(".epk") }.compactMap { name in
            guard let id = UUID(uuidString: String(name.dropLast(4))) else { return nil }
            return Pending(id: id, paths: Paths(directory: directory, id: id))
        }
    }

    /// Côté application : ouvre un dépôt. Renvoie la clé d'enveloppe (pour lire le contenu en flux) et les métadonnées.
    public static func open(_ item: Pending, privateKey: Curve25519.KeyAgreement.PrivateKey) throws -> (SymmetricKey, Metadata) {
        let epkData = try Data(contentsOf: item.paths.ephemeralKey)
        let epk = try Curve25519.KeyAgreement.PublicKey(rawRepresentation: epkData)
        let shared = try privateKey.sharedSecretFromKeyAgreement(with: epk)
        let key = derive(shared: shared, ephemeral: epkData, recipient: privateKey.publicKey.rawRepresentation)
        let metaData = try KeyWrap.open(Data(contentsOf: item.paths.metadata), with: key, context: "vault.inbox.meta." + item.id.uuidString)
        return (key, try JSONDecoder().decode(Metadata.self, from: metaData))
    }

    public static func remove(_ item: Pending) {
        for u in [item.paths.ephemeralKey, item.paths.metadata, item.paths.payload] {
            try? FileManager.default.removeItem(at: u)
        }
    }
}

/// Clé de récupération : 120 bits aléatoires présentés en Base32 Crockford,
/// par groupes de 4 (ex. « 7K2M-…»). Affichée une seule fois à la création.
public enum RecoveryKey {
    static let alphabet = Array("0123456789ABCDEFGHJKMNPQRSTVWXYZ")

    public static func generate() -> String {
        format(SecureRandom.bytes(15))
    }

    public static func format(_ bytes: Data) -> String {
        var bits = 0, value = 0
        var chars: [Character] = []
        for b in bytes {
            value = (value << 8) | Int(b)
            bits += 8
            while bits >= 5 {
                chars.append(alphabet[(value >> (bits - 5)) & 31])
                bits -= 5
            }
        }
        if bits > 0 { chars.append(alphabet[(value << (5 - bits)) & 31]) }
        return stride(from: 0, to: chars.count, by: 4)
            .map { String(chars[$0..<min($0 + 4, chars.count)]) }
            .joined(separator: "-")
    }

    /// Normalise une saisie (minuscules, espaces, confusions O/0, I/L/1).
    public static func normalize(_ input: String) -> String? {
        var out: [Character] = []
        for c in input.uppercased() {
            switch c {
            case "-", " ", "\n", "\t": continue
            case "O": out.append("0")
            case "I", "L": out.append("1")
            default:
                guard alphabet.contains(c) else { return nil }
                out.append(c)
            }
        }
        guard out.count == 24 else { return nil }
        return stride(from: 0, to: 24, by: 4).map { String(out[$0..<$0 + 4]) }.joined(separator: "-")
    }
}
