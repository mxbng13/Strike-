import Foundation

/// Hiérarchie des clés de VAULT :
///
///  Clé maîtresse (MK, 256 bits aléatoires) ─┬─ emballe la clé de chaque fichier (VLT1)
///                                           └─ chiffre l'index de la bibliothèque
///  MK est stockée uniquement emballée :
///   • par KEK_code = HKDF(PBKDF2(code, sel, 600 000 itérations), poivre de l'appareil)
///   • par KEK_secours = PBKDF2(clé de récupération, sel2)
///   • (optionnel) en copie Keychain protégée par Face ID / Touch ID (biometryCurrentSet)
///  Le code n'est jamais stocké, ni en clair ni haché : on vérifie qu'il ouvre l'emballage AES-GCM.
///  Le poivre est un secret aléatoire distinct dans le Keychain « ThisDeviceOnly ».
public struct VaultConfig: Codable, Sendable, Equatable {
    public var version: Int = 1
    public var pinLength: Int
    public var pinSalt: Data
    public var pinIterations: Int
    public var wrappedByPIN: Data
    public var recoverySalt: Data
    public var recoveryIterations: Int
    public var wrappedByRecovery: Data
    public var keyCheck: Data
    public var createdAt: Date
    public var policy: AttemptPolicy
}

public enum VaultKeyError: Error, Equatable, Sendable {
    case notConfigured
    case alreadyConfigured
    case invalidPIN
    case wrongPIN(remainingBeforeWipe: Int?)
    case lockedOut(until: Date)
    case wiped
    case wrongRecoveryKey
    case corrupted
}

public final class VaultKeyManager: @unchecked Sendable {
    public static let defaultIterations = 600_000
    private let store: SecretStore
    private let iterations: Int
    private let now: () -> Date
    private let lock = NSLock()

    public init(store: SecretStore, iterations: Int = VaultKeyManager.defaultIterations, clock: @escaping () -> Date = Date.init) {
        self.store = store
        self.iterations = iterations
        self.now = clock
    }

    public var isConfigured: Bool { (try? store.read(SecretAccount.config)) != nil }

    public func config() throws -> VaultConfig {
        guard let data = try store.read(SecretAccount.config) else { throw VaultKeyError.notConfigured }
        do { return try JSONDecoder().decode(VaultConfig.self, from: data) } catch { throw VaultKeyError.corrupted }
    }

    public var attemptState: AttemptState {
        guard let d = try? store.read(SecretAccount.attempts),
              let s = try? JSONDecoder().decode(AttemptState.self, from: d) else { return AttemptState() }
        return s
    }

    private func saveAttempts(_ s: AttemptState) {
        if let d = try? JSONEncoder().encode(s) { try? store.write(d, account: SecretAccount.attempts) }
    }

    private func saveConfig(_ c: VaultConfig) throws {
        try store.write(try JSONEncoder().encode(c), account: SecretAccount.config)
    }

    public static func isValidPIN(_ pin: String, length: Int) -> Bool {
        pin.count == length && pin.allSatisfy { $0.isASCII && $0.isNumber }
    }

    /// Refuse les codes trivialement devinables (0000, 1234, 123456, 111111…).
    public static func isWeakPIN(_ pin: String) -> Bool {
        let d = pin.compactMap { $0.wholeNumberValue }
        guard d.count >= 4 else { return true }
        if Set(d).count == 1 { return true }
        let asc = zip(d, d.dropFirst()).allSatisfy { $1 == ($0 + 1) % 10 }
        let desc = zip(d, d.dropFirst()).allSatisfy { $0 == ($1 + 1) % 10 }
        return asc || desc
    }

    private func pepper() throws -> Data {
        if let p = try store.read(SecretAccount.pepper) { return p }
        let p = SecureRandom.bytes(32)
        try store.write(p, account: SecretAccount.pepper)
        return p
    }

    private func pinKEK(_ pin: String, salt: Data, iterations: Int) throws -> SymmetricKey {
        let stretched = PBKDF2.sha256(password: Data(pin.utf8), salt: salt, iterations: iterations)
        return HKDF<SHA256>.deriveKey(inputKeyMaterial: SymmetricKey(data: stretched), salt: try pepper(),
                                      info: Data("vault.pin.kek.v1".utf8), outputByteCount: 32)
    }

    private func recoveryKEK(_ code: String, salt: Data, iterations: Int) -> SymmetricKey {
        SymmetricKey(data: PBKDF2.sha256(password: Data(code.utf8), salt: salt, iterations: iterations))
    }

    static func keyCheck(_ mk: SymmetricKey) -> Data {
        Data(HMAC<SHA256>.authenticationCode(for: Data("vault.keycheck.v1".utf8), using: mk))
    }

    public func verify(_ mk: SymmetricKey) -> Bool {
        guard let c = try? config() else { return false }
        return ConstantTime.equals(Self.keyCheck(mk), c.keyCheck)
    }

    public struct SetupResult: @unchecked Sendable {
        public let masterKey: SymmetricKey
        /// À montrer une seule fois à l'utilisateur.
        public let recoveryKey: String
    }

    /// Création du coffre. `existingMasterKey` sert à la restauration (sauvegarde / autre appareil).
    public func setup(pin: String, policy: AttemptPolicy = AttemptPolicy(), existingMasterKey: SymmetricKey? = nil) throws -> SetupResult {
        lock.lock(); defer { lock.unlock() }
        guard !isConfigured else { throw VaultKeyError.alreadyConfigured }
        guard Self.isValidPIN(pin, length: pin.count), pin.count == 4 || pin.count == 6 else { throw VaultKeyError.invalidPIN }
        let mk = existingMasterKey ?? SymmetricKey(size: .bits256)
        let recovery = RecoveryKey.generate()
        let pinSalt = SecureRandom.bytes(16)
        let recSalt = SecureRandom.bytes(16)
        let recIter = max(1, iterations / 3)
        let cfg = VaultConfig(
            pinLength: pin.count, pinSalt: pinSalt, pinIterations: iterations,
            wrappedByPIN: try KeyWrap.wrap(mk, with: pinKEK(pin, salt: pinSalt, iterations: iterations), context: "vault.mk.pin"),
            recoverySalt: recSalt, recoveryIterations: recIter,
            wrappedByRecovery: try KeyWrap.wrap(mk, with: recoveryKEK(recovery, salt: recSalt, iterations: recIter), context: "vault.mk.recovery"),
            keyCheck: Self.keyCheck(mk), createdAt: now(), policy: policy)
        try saveConfig(cfg)
        saveAttempts(AttemptState())
        return SetupResult(masterKey: mk, recoveryKey: recovery)
    }

    public func lockoutStatus() -> AttemptDecision {
        AttemptLimiter.check(attemptState, now: now())
    }

    /// Déverrouillage par code. Gère les délais et l'effacement après trop d'échecs.
    public func unlock(pin: String) throws -> SymmetricKey {
        lock.lock(); defer { lock.unlock() }
        let cfg = try config()
        var state = attemptState
        if case .lockedOut(let until) = AttemptLimiter.check(state, now: now()) { throw VaultKeyError.lockedOut(until: until) }
        if let mk = try? KeyWrap.unwrap(cfg.wrappedByPIN, with: pinKEK(pin, salt: cfg.pinSalt, iterations: cfg.pinIterations), context: "vault.mk.pin"),
           ConstantTime.equals(Self.keyCheck(mk), cfg.keyCheck) {
            AttemptLimiter.recordSuccess(&state)
            saveAttempts(state)
            return mk
        }
        let (wipe, decision) = AttemptLimiter.recordFailure(&state, policy: cfg.policy, now: now())
        saveAttempts(state)
        if wipe {
            destroyAllKeysLocked()
            throw VaultKeyError.wiped
        }
        if case .lockedOut(let until) = decision { throw VaultKeyError.lockedOut(until: until) }
        throw VaultKeyError.wrongPIN(remainingBeforeWipe: AttemptLimiter.remainingBeforeWipe(state, policy: cfg.policy))
    }

    /// Validation d'une clé obtenue autrement (copie biométrique du Keychain).
    public func unlock(biometricKeyData: Data) throws -> SymmetricKey {
        let mk = SymmetricKey(data: biometricKeyData)
        guard verify(mk) else { throw VaultKeyError.corrupted }
        var state = attemptState
        AttemptLimiter.recordSuccess(&state)
        saveAttempts(state)
        return mk
    }

    /// Code oublié : la clé de récupération permet de définir un nouveau code.
    public func recover(recoveryKey: String, newPIN: String) throws -> SymmetricKey {
        lock.lock(); defer { lock.unlock() }
        var cfg = try config()
        guard let normalized = RecoveryKey.normalize(recoveryKey),
              let mk = try? KeyWrap.unwrap(cfg.wrappedByRecovery, with: recoveryKEK(normalized, salt: cfg.recoverySalt, iterations: cfg.recoveryIterations), context: "vault.mk.recovery"),
              ConstantTime.equals(Self.keyCheck(mk), cfg.keyCheck) else {
            throw VaultKeyError.wrongRecoveryKey
        }
        guard Self.isValidPIN(newPIN, length: newPIN.count), newPIN.count == 4 || newPIN.count == 6 else { throw VaultKeyError.invalidPIN }
        cfg.pinSalt = SecureRandom.bytes(16)
        cfg.pinLength = newPIN.count
        cfg.wrappedByPIN = try KeyWrap.wrap(mk, with: pinKEK(newPIN, salt: cfg.pinSalt, iterations: cfg.pinIterations), context: "vault.mk.pin")
        try saveConfig(cfg)
        saveAttempts(AttemptState())
        return mk
    }

    /// Changement de code (4 ou 6 chiffres) : seul l'emballage de MK change, les médias ne sont pas ré-chiffrés.
    public func changePIN(masterKey mk: SymmetricKey, newPIN: String) throws {
        lock.lock(); defer { lock.unlock() }
        guard verify(mk) else { throw VaultKeyError.corrupted }
        guard Self.isValidPIN(newPIN, length: newPIN.count), newPIN.count == 4 || newPIN.count == 6 else { throw VaultKeyError.invalidPIN }
        var cfg = try config()
        cfg.pinSalt = SecureRandom.bytes(16)
        cfg.pinLength = newPIN.count
        cfg.pinIterations = iterations
        cfg.wrappedByPIN = try KeyWrap.wrap(mk, with: pinKEK(newPIN, salt: cfg.pinSalt, iterations: iterations), context: "vault.mk.pin")
        try saveConfig(cfg)
    }

    /// Génère une nouvelle clé de récupération (l'ancienne devient inutilisable).
    public func regenerateRecoveryKey(masterKey mk: SymmetricKey) throws -> String {
        lock.lock(); defer { lock.unlock() }
        guard verify(mk) else { throw VaultKeyError.corrupted }
        var cfg = try config()
        let code = RecoveryKey.generate()
        cfg.recoverySalt = SecureRandom.bytes(16)
        cfg.wrappedByRecovery = try KeyWrap.wrap(mk, with: recoveryKEK(code, salt: cfg.recoverySalt, iterations: cfg.recoveryIterations), context: "vault.mk.recovery")
        try saveConfig(cfg)
        return code
    }

    public func updatePolicy(_ policy: AttemptPolicy, masterKey mk: SymmetricKey) throws {
        lock.lock(); defer { lock.unlock() }
        guard verify(mk) else { throw VaultKeyError.corrupted }
        var cfg = try config()
        cfg.policy = policy
        try saveConfig(cfg)
    }

    /// Effacement cryptographique : sans ces secrets, les fichiers chiffrés sont irrécupérables.
    public func destroyAllKeys() {
        lock.lock(); defer { lock.unlock() }
        destroyAllKeysLocked()
    }

    private func destroyAllKeysLocked() {
        for a in SecretAccount.all { try? store.delete(a) }
    }
}
