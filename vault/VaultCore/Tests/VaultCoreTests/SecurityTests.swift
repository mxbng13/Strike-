import Foundation
import XCTest
@testable import VaultCore

final class SecurityTests: XCTestCase {
    final class Clock: @unchecked Sendable { var now = Date(timeIntervalSince1970: 1_800_000_000) }

    func manager(_ store: InMemorySecretStore = InMemorySecretStore(), clock: Clock = Clock()) -> VaultKeyManager {
        VaultKeyManager(store: store, iterations: 1000, clock: { clock.now })
    }

    func testSetupUnlockAndPINNeverStored() throws {
        let store = InMemorySecretStore()
        let m = manager(store)
        XCTAssertFalse(m.isConfigured)
        let setup = try m.setup(pin: "482915")
        XCTAssertTrue(m.isConfigured)
        let mk = try m.unlock(pin: "482915")
        XCTAssertEqual(mk.rawData, setup.masterKey.rawData)
        // Ni le code ni la clé maîtresse n'apparaissent en clair dans le stockage.
        for account in store.accounts {
            let data = try store.read(account)!
            XCTAssertNil(data.range(of: Data("482915".utf8)), account)
            XCTAssertNil(data.range(of: setup.masterKey.rawData), account)
        }
        XCTAssertThrowsError(try m.setup(pin: "111222")) { XCTAssertEqual($0 as? VaultKeyError, .alreadyConfigured) }
    }

    func testWrongPINBackoffAndLockout() throws {
        let clock = Clock()
        let m = manager(clock: clock)
        _ = try m.setup(pin: "2580")
        for i in 1...4 {
            XCTAssertThrowsError(try m.unlock(pin: "0000")) {
                guard case .wrongPIN = $0 as? VaultKeyError else { return XCTFail("tentative \(i): \($0)") }
            }
        }
        // 5e échec : délai de 30 s.
        XCTAssertThrowsError(try m.unlock(pin: "0000")) {
            guard case .lockedOut(let until) = $0 as? VaultKeyError else { return XCTFail("\($0)") }
            XCTAssertEqual(until.timeIntervalSince(clock.now), 30, accuracy: 0.01)
        }
        // Même le bon code est refusé pendant le délai.
        XCTAssertThrowsError(try m.unlock(pin: "2580")) { guard case .lockedOut = $0 as? VaultKeyError else { return XCTFail() } }
        clock.now += 31
        XCTAssertNoThrow(try m.unlock(pin: "2580"))
        XCTAssertEqual(m.attemptState.consecutiveFailures, 0)
    }

    func testClockRollbackDoesNotBypassLockout() {
        var s = AttemptState()
        let p = AttemptPolicy(freeAttempts: 0, delays: [600])
        let t = Date(timeIntervalSince1970: 1_000_000)
        _ = AttemptLimiter.recordFailure(&s, policy: p, now: t)
        XCTAssertEqual(AttemptLimiter.check(s, now: t + 10), .lockedOut(until: t + 600))
        XCTAssertEqual(AttemptLimiter.check(s, now: t - 3600), .lockedOut(until: t + 600))
        XCTAssertEqual(AttemptLimiter.check(s, now: t + 601), .allowed)
    }

    func testWipeAfterTooManyAttempts() throws {
        let store = InMemorySecretStore()
        let m = manager(store)
        _ = try m.setup(pin: "9157", policy: AttemptPolicy(freeAttempts: 10, delays: [], wipeAfter: 3))
        XCTAssertThrowsError(try m.unlock(pin: "1111")) { XCTAssertEqual($0 as? VaultKeyError, .wrongPIN(remainingBeforeWipe: 2)) }
        XCTAssertThrowsError(try m.unlock(pin: "1112"))
        XCTAssertThrowsError(try m.unlock(pin: "1113")) { XCTAssertEqual($0 as? VaultKeyError, .wiped) }
        XCTAssertFalse(m.isConfigured)
        XCTAssertTrue(store.accounts.isEmpty)
        XCTAssertThrowsError(try m.unlock(pin: "9157")) { XCTAssertEqual($0 as? VaultKeyError, .notConfigured) }
    }

    func testChangePINKeepsMasterKey() throws {
        let m = manager()
        let s = try m.setup(pin: "1357")
        try m.changePIN(masterKey: s.masterKey, newPIN: "864209")
        XCTAssertThrowsError(try m.unlock(pin: "1357"))
        XCTAssertEqual(try m.unlock(pin: "864209").rawData, s.masterKey.rawData)
        XCTAssertEqual(try m.config().pinLength, 6)
    }

    func testRecoveryKeyResetsPIN() throws {
        let m = manager()
        let s = try m.setup(pin: "1357")
        XCTAssertThrowsError(try m.recover(recoveryKey: RecoveryKey.generate(), newPIN: "2468")) {
            XCTAssertEqual($0 as? VaultKeyError, .wrongRecoveryKey)
        }
        let mk = try m.recover(recoveryKey: s.recoveryKey.lowercased(), newPIN: "2468")
        XCTAssertEqual(mk.rawData, s.masterKey.rawData)
        XCTAssertEqual(try m.unlock(pin: "2468").rawData, s.masterKey.rawData)
        let newCode = try m.regenerateRecoveryKey(masterKey: mk)
        XCTAssertThrowsError(try m.recover(recoveryKey: s.recoveryKey, newPIN: "1111"))
        XCTAssertNoThrow(try m.recover(recoveryKey: newCode, newPIN: "3690"))
    }

    func testBiometricKeyVerification() throws {
        let m = manager()
        let s = try m.setup(pin: "1357")
        XCTAssertNoThrow(try m.unlock(biometricKeyData: s.masterKey.rawData))
        XCTAssertThrowsError(try m.unlock(biometricKeyData: SecureRandom.bytes(32)))
    }

    func testPINValidation() {
        XCTAssertTrue(VaultKeyManager.isWeakPIN("0000"))
        XCTAssertTrue(VaultKeyManager.isWeakPIN("123456"))
        XCTAssertTrue(VaultKeyManager.isWeakPIN("9876"))
        XCTAssertTrue(VaultKeyManager.isWeakPIN("7890"))
        XCTAssertFalse(VaultKeyManager.isWeakPIN("482915"))
        XCTAssertFalse(VaultKeyManager.isValidPIN("12a4", length: 4))
        XCTAssertThrowsError(try manager().setup(pin: "12345"))
    }

    func testAutoLockPolicy() {
        let t = Date()
        var p = AutoLockPolicy(inactivity: .m1, lockOnBackground: true)
        XCTAssertFalse(p.shouldLockForInactivity(lastActivity: t, now: t + 59))
        XCTAssertTrue(p.shouldLockForInactivity(lastActivity: t, now: t + 60))
        XCTAssertTrue(p.shouldLockOnReturn(backgroundedAt: t, now: t + 0.1))
        p.lockOnBackground = false
        XCTAssertFalse(p.shouldLockOnReturn(backgroundedAt: t, now: t + 30))
        XCTAssertTrue(p.shouldLockOnReturn(backgroundedAt: t, now: t + 61))
        p.inactivity = .never
        XCTAssertFalse(p.shouldLockForInactivity(lastActivity: t, now: t + 99999))
    }
}
