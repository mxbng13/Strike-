import Foundation

/// Format de fichier chiffré VAULT « VLT1 » (voir docs/FORMAT.md).
///
/// En-tête (authentifié comme AAD de chaque bloc) :
///   magic "VLT1" | version u8 | kind u8 | chunkSize u32 | fileID 16 o |
///   noncePrefix 8 o | wrappedKeyLen u16 | wrappedKey (clé de fichier emballée)
/// Puis N blocs : AES-256-GCM(chunk) || tag(16). Nonce = noncePrefix || index u32.
/// AAD d'un bloc = SHA256(en-tête) || index u64 || final u8, ce qui détecte
/// la réorganisation, la troncature et la substitution de blocs.
///
/// Chaque fichier a sa propre clé aléatoire, emballée par la clé maîtresse :
/// supprimer le fichier détruit sa clé (effacement cryptographique).
public enum EncryptedFile {
    public static let magic = Data("VLT1".utf8)
    public static let version: UInt8 = 1
    public static let defaultChunkSize = 256 * 1024
    public static let tagSize = 16

    public enum Kind: UInt8, Sendable, Codable {
        case original = 0, thumbnail = 1, render = 2, index = 3, project = 4, inbox = 5, audio = 6, other = 9
    }

    public struct Header: Sendable {
        public var kind: Kind
        public var chunkSize: Int
        public var fileID: UUID
        public var noncePrefix: Data
        public var wrappedKey: Data

        var encoded: Data {
            var d = EncryptedFile.magic
            d.append(EncryptedFile.version)
            d.append(kind.rawValue)
            d.appendBigEndian(UInt32(chunkSize))
            d.append(fileID.data)
            d.append(noncePrefix)
            d.appendBigEndian(UInt16(wrappedKey.count))
            d.append(wrappedKey)
            return d
        }

        static func parse(_ handle: FileHandle) throws -> (Header, Int) {
            let fixed = 4 + 1 + 1 + 4 + 16 + 8 + 2
            guard let head = try handle.read(upToCount: fixed), head.count == fixed else { throw VaultCryptoError.truncated }
            guard head.prefix(4) == EncryptedFile.magic else { throw VaultCryptoError.invalidFormat("magic") }
            let ver = head[head.startIndex + 4]
            guard ver == EncryptedFile.version else { throw VaultCryptoError.unsupportedVersion(ver) }
            guard let kind = Kind(rawValue: head[head.startIndex + 5]) else { throw VaultCryptoError.invalidFormat("kind") }
            let chunk = Int(head.readBigEndian(UInt32.self, at: 6)!)
            guard chunk >= 1024, chunk <= 16 * 1024 * 1024 else { throw VaultCryptoError.invalidFormat("chunk") }
            let id = UUID(data: head.subdata(in: (head.startIndex + 10)..<(head.startIndex + 26)))!
            let prefix = head.subdata(in: (head.startIndex + 26)..<(head.startIndex + 34))
            let wlen = Int(head.readBigEndian(UInt16.self, at: 34)!)
            guard let wrapped = try handle.read(upToCount: wlen), wrapped.count == wlen else { throw VaultCryptoError.truncated }
            return (Header(kind: kind, chunkSize: chunk, fileID: id, noncePrefix: prefix, wrappedKey: wrapped), fixed + wlen)
        }
    }

    static func keyContext(_ id: UUID) -> String { "vault.filekey.v1." + id.uuidString }

    static func nonce(prefix: Data, index: UInt64) throws -> AES.GCM.Nonce {
        var n = prefix
        n.appendBigEndian(UInt32(truncatingIfNeeded: index))
        return try AES.GCM.Nonce(data: n)
    }

    static func aad(headerDigest: Data, index: UInt64, final: Bool) -> Data {
        var a = headerDigest
        a.appendBigEndian(index)
        a.append(final ? 1 : 0)
        return a
    }

    // MARK: Commodités

    @discardableResult
    public static func encrypt(_ data: Data, to url: URL, kind: Kind, fileID: UUID = UUID(), wrappingKey: SymmetricKey) throws -> UUID {
        let w = try Writer(url: url, kind: kind, fileID: fileID, wrappingKey: wrappingKey, chunkSize: max(1024, min(defaultChunkSize, data.count)))
        try w.write(data)
        try w.finish()
        return fileID
    }

    public static func decrypt(_ url: URL, wrappingKey: SymmetricKey) throws -> Data {
        let r = try Reader(url: url, wrappingKey: wrappingKey)
        return try r.read(offset: 0, length: Int(r.plaintextLength))
    }

    public struct StreamResult: Sendable {
        public var fileID: UUID
        public var plaintextSize: Int64
        public var sha256Hex: String
    }

    /// Chiffre un fichier en flux (mémoire constante, adapté aux vidéos de plusieurs Go)
    /// et calcule simultanément son empreinte SHA-256 (détection des doublons).
    public static func encryptFile(from source: URL, to destination: URL, kind: Kind, fileID: UUID = UUID(),
                                   wrappingKey: SymmetricKey, progress: ((Int64) -> Void)? = nil) throws -> StreamResult {
        guard let input = try? FileHandle(forReadingFrom: source) else { throw VaultCryptoError.io("lecture impossible") }
        defer { try? input.close() }
        let writer = try Writer(url: destination, kind: kind, fileID: fileID, wrappingKey: wrappingKey)
        var hasher = SHA256()
        var total: Int64 = 0
        do {
            while true {
                let chunk: Data? = try autoreleasepoolCompat { try input.read(upToCount: 1024 * 1024) }
                guard let chunk, !chunk.isEmpty else { break }
                hasher.update(data: chunk)
                try writer.write(chunk)
                total += Int64(chunk.count)
                progress?(total)
            }
            try writer.finish()
        } catch {
            writer.abort()
            throw error
        }
        let digest = Data(hasher.finalize()).hexString
        return StreamResult(fileID: fileID, plaintextSize: total, sha256Hex: digest)
    }

    /// Déchiffre vers un fichier en clair (exports, espace de travail temporaire protégé).
    public static func decryptFile(_ source: URL, to destination: URL, wrappingKey: SymmetricKey) throws {
        let r = try Reader(url: source, wrappingKey: wrappingKey)
        _ = FileManager.default.createFile(atPath: destination.path, contents: nil)
        guard let out = try? FileHandle(forWritingTo: destination) else { throw VaultCryptoError.io("écriture impossible") }
        defer { try? out.close() }
        var offset: Int64 = 0
        let step = 4 * r.chunkSize
        while offset < r.plaintextLength {
            let n = Int(min(Int64(step), r.plaintextLength - offset))
            let part = try autoreleasepoolCompat { try r.read(offset: offset, length: n) }
            try out.write(contentsOf: part)
            offset += Int64(n)
        }
    }

    /// Rotation de clé : ré-chiffre le fichier (en flux) sous une nouvelle clé maîtresse.
    public static func rewrap(_ url: URL, from oldKey: SymmetricKey, to newKey: SymmetricKey) throws {
        let handle = try FileHandle(forReadingFrom: url)
        let (header, headerLen) = try Header.parse(handle)
        try handle.close()
        let fileKey = try KeyWrap.unwrap(header.wrappedKey, with: oldKey, context: keyContext(header.fileID))
        // Le contenu est authentifié par le condensé de l'en-tête : on doit donc ré-chiffrer
        // les blocs. Pour rester en flux, on réécrit dans un fichier temporaire.
        let reader = try Reader(url: url, wrappingKey: oldKey)
        let tmp = url.appendingPathExtension("rewrap")
        let writer = try Writer(url: tmp, kind: header.kind, fileID: header.fileID, wrappingKey: newKey,
                                chunkSize: header.chunkSize, fileKey: fileKey)
        var off: Int64 = 0
        while off < reader.plaintextLength {
            let n = Int(min(Int64(header.chunkSize * 4), reader.plaintextLength - off))
            try writer.write(try reader.read(offset: off, length: n))
            off += Int64(n)
        }
        try writer.finish()
        _ = headerLen
        try FileManager.default.removeItem(at: url)
        try FileManager.default.moveItem(at: tmp, to: url)
    }

    // MARK: Écriture

    public final class Writer {
        private let finalURL: URL
        private let tempURL: URL
        private let handle: FileHandle
        private let header: Header
        private let headerDigest: Data
        private let fileKey: SymmetricKey
        private var buffer = Data()
        private var index: UInt64 = 0
        private var finished = false
        public let chunkSize: Int

        public init(url: URL, kind: Kind, fileID: UUID = UUID(), wrappingKey: SymmetricKey,
                    chunkSize: Int = EncryptedFile.defaultChunkSize, fileKey: SymmetricKey? = nil) throws {
            self.chunkSize = chunkSize
            self.finalURL = url
            self.tempURL = url.deletingLastPathComponent().appendingPathComponent("." + url.lastPathComponent + ".partial")
            let key = fileKey ?? SymmetricKey(size: .bits256)
            self.fileKey = key
            let wrapped = try KeyWrap.wrap(key, with: wrappingKey, context: EncryptedFile.keyContext(fileID))
            self.header = Header(kind: kind, chunkSize: chunkSize, fileID: fileID,
                                 noncePrefix: SecureRandom.bytes(8), wrappedKey: wrapped)
            let encoded = header.encoded
            self.headerDigest = Data(SHA256.hash(data: encoded))
            try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            guard FileManager.default.createFile(atPath: tempURL.path, contents: nil),
                  let h = try? FileHandle(forWritingTo: tempURL) else { throw VaultCryptoError.io("création impossible") }
            self.handle = h
            try handle.write(contentsOf: encoded)
        }

        public func write(_ data: Data) throws {
            precondition(!finished)
            buffer.append(data)
            while buffer.count > chunkSize {
                let chunk = buffer.prefix(chunkSize)
                try emit(Data(chunk), final: false)
                buffer.removeFirst(chunkSize)
            }
        }

        private func emit(_ chunk: Data, final: Bool) throws {
            let nonce = try EncryptedFile.nonce(prefix: header.noncePrefix, index: index)
            let box = try AES.GCM.seal(chunk, using: fileKey, nonce: nonce,
                                       authenticating: EncryptedFile.aad(headerDigest: headerDigest, index: index, final: final))
            try handle.write(contentsOf: box.ciphertext)
            try handle.write(contentsOf: box.tag)
            index += 1
        }

        public func finish() throws {
            guard !finished else { return }
            try emit(buffer, final: true)
            buffer = Data()
            finished = true
            try handle.synchronize()
            try handle.close()
            if FileManager.default.fileExists(atPath: finalURL.path) {
                try FileManager.default.removeItem(at: finalURL)
            }
            try FileManager.default.moveItem(at: tempURL, to: finalURL)
        }

        public func abort() {
            guard !finished else { return }
            finished = true
            try? handle.close()
            try? FileManager.default.removeItem(at: tempURL)
        }

        deinit { abort() }
    }

    // MARK: Lecture à accès aléatoire

    /// Lecteur à accès aléatoire : ne déchiffre que les blocs nécessaires
    /// (lecture vidéo en flux via AVAssetResourceLoader, sans copie en clair).
    public final class Reader: @unchecked Sendable {
        public let header: Header
        public let plaintextLength: Int64
        public var chunkSize: Int { header.chunkSize }
        private let handle: FileHandle
        private let headerLength: Int
        private let headerDigest: Data
        private let fileKey: SymmetricKey
        private let chunkCount: UInt64
        private let lock = NSLock()
        private var cache: (UInt64, Data)?

        public init(url: URL, wrappingKey: SymmetricKey) throws {
            guard let h = try? FileHandle(forReadingFrom: url) else { throw VaultCryptoError.io("ouverture impossible") }
            handle = h
            let (header, len) = try Header.parse(h)
            self.header = header
            self.headerLength = len
            self.headerDigest = Data(SHA256.hash(data: header.encoded))
            self.fileKey = try KeyWrap.unwrap(header.wrappedKey, with: wrappingKey, context: EncryptedFile.keyContext(header.fileID))
            let fileSize = Int64(try h.seekToEnd())
            let body = fileSize - Int64(len)
            let stride = Int64(header.chunkSize + EncryptedFile.tagSize)
            guard body >= Int64(EncryptedFile.tagSize) else { throw VaultCryptoError.truncated }
            let count = (body + stride - 1) / stride
            let lastCipher = body - (count - 1) * stride - Int64(EncryptedFile.tagSize)
            guard lastCipher >= 0 else { throw VaultCryptoError.truncated }
            self.chunkCount = UInt64(count)
            self.plaintextLength = (count - 1) * Int64(header.chunkSize) + lastCipher
        }

        deinit { try? handle.close() }

        public func chunk(_ i: UInt64) throws -> Data {
            lock.lock(); defer { lock.unlock() }
            if let c = cache, c.0 == i { return c.1 }
            guard i < chunkCount else { throw VaultCryptoError.invalidFormat("index") }
            let stride = UInt64(header.chunkSize + EncryptedFile.tagSize)
            try handle.seek(toOffset: UInt64(headerLength) + i * stride)
            guard let raw = try handle.read(upToCount: Int(stride)), raw.count >= EncryptedFile.tagSize else { throw VaultCryptoError.truncated }
            let final = i == chunkCount - 1
            if !final && raw.count != Int(stride) { throw VaultCryptoError.truncated }
            let cipher = raw.prefix(raw.count - EncryptedFile.tagSize)
            let tag = raw.suffix(EncryptedFile.tagSize)
            do {
                let box = try AES.GCM.SealedBox(nonce: try EncryptedFile.nonce(prefix: header.noncePrefix, index: i),
                                                ciphertext: cipher, tag: tag)
                let plain = try AES.GCM.open(box, using: fileKey,
                                             authenticating: EncryptedFile.aad(headerDigest: headerDigest, index: i, final: final))
                cache = (i, plain)
                return plain
            } catch {
                throw VaultCryptoError.authenticationFailed
            }
        }

        public func read(offset: Int64, length: Int) throws -> Data {
            guard length > 0, offset < plaintextLength else { return Data() }
            let end = min(plaintextLength, offset + Int64(length))
            var out = Data(capacity: Int(end - offset))
            var pos = offset
            let cs = Int64(header.chunkSize)
            while pos < end {
                let ci = UInt64(pos / cs)
                let c = try chunk(ci)
                let start = Int(pos - Int64(ci) * cs)
                let take = min(c.count - start, Int(end - pos))
                guard take > 0 else { throw VaultCryptoError.truncated }
                out.append(c.subdata(in: (c.startIndex + start)..<(c.startIndex + start + take)))
                pos += Int64(take)
            }
            return out
        }

        /// Vérifie l'intégrité de tous les blocs.
        public func verifyAll() throws {
            for i in 0..<chunkCount { _ = try chunk(i) }
        }
    }
}

/// `autoreleasepool` n'existe que sur les plateformes Apple.
@inline(__always)
public func autoreleasepoolCompat<T>(_ body: () throws -> T) rethrows -> T {
    #if canImport(ObjectiveC)
    return try autoreleasepool(invoking: body)
    #else
    return try body()
    #endif
}
