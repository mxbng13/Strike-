import Foundation
import XCTest
@testable import VaultCore

final class CryptoTests: XCTestCase {
    func testPBKDF2MatchesRFC7914Vectors() {
        // RFC 7914 §11 : PBKDF2-HMAC-SHA256 ("passwd", "salt", c=1, dkLen=64)
        let out = PBKDF2.portableSHA256(password: Data("passwd".utf8), salt: Data("salt".utf8), iterations: 1, keyLength: 64)
        XCTAssertEqual(out.hexString, "55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783")
        // ("Password", "NaCl", c=80000, dkLen=64)
        let out2 = PBKDF2.portableSHA256(password: Data("Password".utf8), salt: Data("NaCl".utf8), iterations: 80000, keyLength: 64)
        XCTAssertEqual(out2.hexString, "4ddcd8f60b98be21830cee5ef22701f9641a4418d04c0414aeff08876b34ab56a1d425a1225833549adb841b51c9b3176a272bdebba1d078478f62b397f33c8d")
        XCTAssertEqual(PBKDF2.sha256(password: Data("passwd".utf8), salt: Data("salt".utf8), iterations: 1, keyLength: 64), out)
    }

    func testRoundTripSmallAndEmpty() throws {
        let dir = tempDir()
        let mk = SymmetricKey(size: .bits256)
        for size in [0, 1, 1023, 1024, 1025, 70_000] {
            let data = SecureRandom.bytes(size)
            let url = dir.appendingPathComponent("f\(size).vlt")
            try EncryptedFile.encrypt(data, to: url, kind: .thumbnail, wrappingKey: mk)
            XCTAssertEqual(try EncryptedFile.decrypt(url, wrappingKey: mk), data, "taille \(size)")
            // Le contenu en clair n'apparaît pas dans le fichier.
            if size >= 64 {
                let raw = try Data(contentsOf: url)
                XCTAssertNil(raw.range(of: data.prefix(32)))
            }
        }
    }

    func testStreamingLargeFileAndRandomAccess() throws {
        let dir = tempDir()
        let mk = SymmetricKey(size: .bits256)
        // 24 Mo pseudo-aléatoires (non multiple de la taille des blocs).
        let src = dir.appendingPathComponent("video.mov")
        var gen = SystemRandomNumberGenerator()
        FileManager.default.createFile(atPath: src.path, contents: nil)
        let h = try FileHandle(forWritingTo: src)
        var sha = SHA256()
        for _ in 0..<24 {
            var block = Data(count: 1_000_000)
            block.withUnsafeMutableBytes { p in for i in stride(from: 0, to: p.count, by: 8) { p.storeBytes(of: gen.next() as UInt64, toByteOffset: min(i, p.count - 8), as: UInt64.self) } }
            sha.update(data: block)
            try h.write(contentsOf: block)
        }
        try h.close()
        let dest = dir.appendingPathComponent("video.vlt")
        var lastProgress: Int64 = 0
        let r = try EncryptedFile.encryptFile(from: src, to: dest, kind: .original, wrappingKey: mk) { lastProgress = $0 }
        XCTAssertEqual(r.plaintextSize, 24_000_000)
        XCTAssertEqual(lastProgress, 24_000_000)
        XCTAssertEqual(r.sha256Hex, Data(sha.finalize()).hexString)

        let reader = try EncryptedFile.Reader(url: dest, wrappingKey: mk)
        XCTAssertEqual(reader.plaintextLength, 24_000_000)
        let original = try FileHandle(forReadingFrom: src)
        for (off, len) in [(0, 10), (262_143, 2), (5_000_000, 700_000), (23_999_990, 10), (23_999_990, 100)] {
            try original.seek(toOffset: UInt64(off))
            let expected = try original.read(upToCount: min(len, 24_000_000 - off))!
            XCTAssertEqual(try reader.read(offset: Int64(off), length: len), expected, "plage \(off)")
        }
        try original.close()

        let out = dir.appendingPathComponent("clear.mov")
        try EncryptedFile.decryptFile(dest, to: out, wrappingKey: mk)
        XCTAssertEqual(try Data(contentsOf: out).count, 24_000_000)
        var sha2 = SHA256(); sha2.update(data: try Data(contentsOf: out))
        XCTAssertEqual(Data(sha2.finalize()).hexString, r.sha256Hex)
    }

    func testWrongKeyTamperingTruncationAreDetected() throws {
        let dir = tempDir()
        let mk = SymmetricKey(size: .bits256)
        let data = SecureRandom.bytes(600_000)
        let url = dir.appendingPathComponent("x.vlt")
        let w = try EncryptedFile.Writer(url: url, kind: .original, wrappingKey: mk, chunkSize: 100_000)
        try w.write(data); try w.finish()

        XCTAssertThrowsError(try EncryptedFile.decrypt(url, wrappingKey: SymmetricKey(size: .bits256))) {
            XCTAssertEqual($0 as? VaultCryptoError, .authenticationFailed)
        }
        // Bit modifié dans un bloc.
        var raw = try Data(contentsOf: url)
        let tampered = dir.appendingPathComponent("t.vlt")
        raw[raw.count - 50_000] ^= 0x01
        try raw.write(to: tampered)
        XCTAssertThrowsError(try EncryptedFile.decrypt(tampered, wrappingKey: mk))

        // Troncature exactement à une frontière de bloc : le dernier bloc restant n'est pas « final ».
        raw = try Data(contentsOf: url)
        let headerLen = raw.count - 6 * 100_016 // 5 blocs pleins + bloc final plein
        let cut = raw.prefix(headerLen + 3 * 100_016)
        let truncated = dir.appendingPathComponent("tr.vlt")
        try cut.write(to: truncated)
        XCTAssertThrowsError(try EncryptedFile.decrypt(truncated, wrappingKey: mk))

        // Échange de deux blocs.
        raw = try Data(contentsOf: url)
        var swapped = raw
        let b1 = raw.subdata(in: headerLen..<(headerLen + 100_016))
        let b2 = raw.subdata(in: (headerLen + 100_016)..<(headerLen + 200_032))
        swapped.replaceSubrange(headerLen..<(headerLen + 100_016), with: b2)
        swapped.replaceSubrange((headerLen + 100_016)..<(headerLen + 200_032), with: b1)
        let sw = dir.appendingPathComponent("sw.vlt")
        try swapped.write(to: sw)
        XCTAssertThrowsError(try EncryptedFile.decrypt(sw, wrappingKey: mk))
    }

    func testKeyRotation() throws {
        let dir = tempDir()
        let a = SymmetricKey(size: .bits256), b = SymmetricKey(size: .bits256)
        let data = SecureRandom.bytes(300_000)
        let url = dir.appendingPathComponent("r.vlt")
        try EncryptedFile.encrypt(data, to: url, kind: .original, wrappingKey: a)
        try EncryptedFile.rewrap(url, from: a, to: b)
        XCTAssertEqual(try EncryptedFile.decrypt(url, wrappingKey: b), data)
        XCTAssertThrowsError(try EncryptedFile.decrypt(url, wrappingKey: a))
    }

    func testInboxSealing() throws {
        let dir = tempDir()
        let inbox = dir.appendingPathComponent("inbox")
        let priv = Curve25519.KeyAgreement.PrivateKey()
        let src = dir.appendingPathComponent("shared.jpg")
        let payload = SecureRandom.bytes(150_000)
        try payload.write(to: src)
        try InboxSealer.seal(file: src, metadata: .init(originalFilename: "shared.jpg", typeIdentifier: "public.jpeg"),
                             recipient: priv.publicKey, inboxDirectory: inbox)
        let pending = InboxSealer.pending(in: inbox)
        XCTAssertEqual(pending.count, 1)
        let (key, meta) = try InboxSealer.open(pending[0], privateKey: priv)
        XCTAssertEqual(meta.originalFilename, "shared.jpg")
        XCTAssertEqual(try EncryptedFile.decrypt(pending[0].paths.payload, wrappingKey: key), payload)
        // Une autre clé privée ne peut rien ouvrir.
        XCTAssertThrowsError(try InboxSealer.open(pending[0], privateKey: Curve25519.KeyAgreement.PrivateKey()))
        InboxSealer.remove(pending[0])
        XCTAssertTrue(InboxSealer.pending(in: inbox).isEmpty)
    }

    func testRecoveryKeyFormat() {
        let k = RecoveryKey.generate()
        XCTAssertEqual(k.count, 29)
        XCTAssertEqual(k.split(separator: "-").count, 6)
        XCTAssertEqual(RecoveryKey.normalize(k.lowercased().replacingOccurrences(of: "-", with: " ")), k)
        XCTAssertNil(RecoveryKey.normalize("ABCD"))
        XCTAssertNotEqual(RecoveryKey.generate(), RecoveryKey.generate())
    }

    func testStableUUIDAndHex() {
        XCTAssertEqual(UUID.stable("x"), UUID.stable("x"))
        XCTAssertNotEqual(UUID.stable("x"), UUID.stable("y"))
        let d = SecureRandom.bytes(20)
        XCTAssertEqual(Data(hex: d.hexString), d)
    }
}
