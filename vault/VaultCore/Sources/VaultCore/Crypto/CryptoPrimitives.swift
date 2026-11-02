import Foundation
#if canImport(CryptoKit)
@_exported import CryptoKit
#else
@_exported import Crypto
#endif
#if canImport(CommonCrypto)
import CommonCrypto
#endif

/// Erreurs cryptographiques de VAULT.
public enum VaultCryptoError: Error, Equatable, Sendable {
    case invalidFormat(String)
    case authenticationFailed
    case truncated
    case unsupportedVersion(UInt8)
    case io(String)
}

public enum SecureRandom {
    /// Octets aléatoires issus du générateur du système (SecRandom / getrandom).
    public static func bytes(_ count: Int) -> Data {
        var rng = SystemRandomNumberGenerator()
        var data = Data(count: count)
        data.withUnsafeMutableBytes { raw in
            let buf = raw.bindMemory(to: UInt8.self)
            var i = 0
            while i < count {
                var word = rng.next()
                let n = min(8, count - i)
                withUnsafeBytes(of: &word) { w in
                    for j in 0..<n { buf[i + j] = w[j] }
                }
                i += n
            }
        }
        return data
    }
}

public extension SymmetricKey {
    /// Copie des octets de la clé (à n'utiliser que pour l'emballage / le Keychain).
    var rawData: Data { withUnsafeBytes { Data($0) } }
}

public enum ConstantTime {
    public static func equals(_ a: Data, _ b: Data) -> Bool {
        guard a.count == b.count else { return false }
        var diff: UInt8 = 0
        for i in 0..<a.count { diff |= a[a.startIndex + i] ^ b[b.startIndex + i] }
        return diff == 0
    }
}

/// PBKDF2-HMAC-SHA256. Utilise CommonCrypto quand il est disponible (rapide),
/// sinon une implémentation portable basée sur HMAC (Linux / Android).
public enum PBKDF2 {
    public static func sha256(password: Data, salt: Data, iterations: Int, keyLength: Int = 32) -> Data {
        precondition(iterations > 0 && keyLength > 0)
        #if canImport(CommonCrypto)
        var out = Data(count: keyLength)
        let status = out.withUnsafeMutableBytes { outPtr in
            password.withUnsafeBytes { pwPtr in
                salt.withUnsafeBytes { saltPtr in
                    CCKeyDerivationPBKDF(
                        CCPBKDFAlgorithm(kCCPBKDF2),
                        pwPtr.baseAddress?.assumingMemoryBound(to: Int8.self), password.count,
                        saltPtr.baseAddress?.assumingMemoryBound(to: UInt8.self), salt.count,
                        CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), UInt32(iterations),
                        outPtr.baseAddress?.assumingMemoryBound(to: UInt8.self), keyLength)
                }
            }
        }
        precondition(status == kCCSuccess, "PBKDF2 failed")
        return out
        #else
        return portableSHA256(password: password, salt: salt, iterations: iterations, keyLength: keyLength)
        #endif
    }

    /// Implémentation de référence (RFC 8018), exposée pour les tests croisés.
    public static func portableSHA256(password: Data, salt: Data, iterations: Int, keyLength: Int) -> Data {
        let key = SymmetricKey(data: password)
        var derived = Data()
        var block: UInt32 = 1
        while derived.count < keyLength {
            var be = block.bigEndian
            var input = salt
            input.append(Data(bytes: &be, count: 4))
            var u = Data(HMAC<SHA256>.authenticationCode(for: input, using: key))
            var t = [UInt8](u)
            if iterations > 1 {
                for _ in 1..<iterations {
                    u = Data(HMAC<SHA256>.authenticationCode(for: u, using: key))
                    let bytes = [UInt8](u)
                    for k in 0..<t.count { t[k] ^= bytes[k] }
                }
            }
            derived.append(contentsOf: t)
            block += 1
        }
        return derived.prefix(keyLength)
    }
}

/// Emballage d'une clé symétrique par une autre (AES-256-GCM avec contexte authentifié).
public enum KeyWrap {
    public static func wrap(_ key: SymmetricKey, with kek: SymmetricKey, context: String) throws -> Data {
        let box = try AES.GCM.seal(key.rawData, using: kek, authenticating: Data(context.utf8))
        guard let combined = box.combined else { throw VaultCryptoError.invalidFormat("nonce") }
        return combined
    }

    public static func unwrap(_ wrapped: Data, with kek: SymmetricKey, context: String) throws -> SymmetricKey {
        do {
            let box = try AES.GCM.SealedBox(combined: wrapped)
            let raw = try AES.GCM.open(box, using: kek, authenticating: Data(context.utf8))
            return SymmetricKey(data: raw)
        } catch {
            throw VaultCryptoError.authenticationFailed
        }
    }

    /// Chiffrement de petites données (métadonnées, JSON).
    public static func seal(_ data: Data, with key: SymmetricKey, context: String) throws -> Data {
        let box = try AES.GCM.seal(data, using: key, authenticating: Data(context.utf8))
        guard let combined = box.combined else { throw VaultCryptoError.invalidFormat("nonce") }
        return combined
    }

    public static func open(_ data: Data, with key: SymmetricKey, context: String) throws -> Data {
        do {
            let box = try AES.GCM.SealedBox(combined: data)
            return try AES.GCM.open(box, using: key, authenticating: Data(context.utf8))
        } catch {
            throw VaultCryptoError.authenticationFailed
        }
    }
}

public extension Data {
    var hexString: String { map { String(format: "%02x", $0) }.joined() }

    init?(hex: String) {
        let chars = Array(hex.utf8)
        guard chars.count % 2 == 0 else { return nil }
        var out = Data(capacity: chars.count / 2)
        func val(_ c: UInt8) -> UInt8? {
            switch c {
            case 48...57: return c - 48
            case 97...102: return c - 87
            case 65...70: return c - 55
            default: return nil
            }
        }
        var i = 0
        while i < chars.count {
            guard let h = val(chars[i]), let l = val(chars[i + 1]) else { return nil }
            out.append(h << 4 | l)
            i += 2
        }
        self = out
    }

    mutating func appendBigEndian<T: FixedWidthInteger>(_ v: T) {
        var be = v.bigEndian
        Swift.withUnsafeBytes(of: &be) { append(contentsOf: $0) }
    }

    func readBigEndian<T: FixedWidthInteger>(_ type: T.Type, at offset: Int) -> T? {
        let size = MemoryLayout<T>.size
        guard offset >= 0, offset + size <= count else { return nil }
        var v: T = 0
        for i in 0..<size { v = (v << 8) | T(self[startIndex + offset + i]) }
        return v
    }
}

public extension UUID {
    var data: Data {
        let u = uuid
        return Data([u.0, u.1, u.2, u.3, u.4, u.5, u.6, u.7, u.8, u.9, u.10, u.11, u.12, u.13, u.14, u.15])
    }

    init?(data: Data) {
        guard data.count == 16 else { return nil }
        let b = [UInt8](data)
        self.init(uuid: (b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]))
    }

    /// UUID déterministe dérivé d'une chaîne (identifiants stables des souvenirs).
    static func stable(_ key: String) -> UUID {
        var bytes = [UInt8](SHA256.hash(data: Data(key.utf8)).prefix(16))
        bytes[6] = (bytes[6] & 0x0F) | 0x50
        bytes[8] = (bytes[8] & 0x3F) | 0x80
        return UUID(data: Data(bytes))!
    }
}
