import Foundation

/// Stockage de secrets. Sur iOS : Keychain (kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
/// et contrôle d'accès biométrique pour la copie « Face ID » de la clé maîtresse).
/// Aucune clé ni code n'est jamais écrit dans un fichier ordinaire.
public protocol SecretStore: AnyObject, Sendable {
    func read(_ account: String) throws -> Data?
    func write(_ data: Data, account: String) throws
    func delete(_ account: String) throws
}

/// Implémentation en mémoire (tests, prévisualisations SwiftUI).
public final class InMemorySecretStore: SecretStore, @unchecked Sendable {
    private var values: [String: Data] = [:]
    private let lock = NSLock()
    public init() {}
    public func read(_ account: String) throws -> Data? { lock.lock(); defer { lock.unlock() }; return values[account] }
    public func write(_ data: Data, account: String) throws { lock.lock(); values[account] = data; lock.unlock() }
    public func delete(_ account: String) throws { lock.lock(); values[account] = nil; lock.unlock() }
    public var accounts: [String] { lock.lock(); defer { lock.unlock() }; return Array(values.keys) }
}

public enum SecretAccount {
    public static let config = "vault.config.v1"
    public static let pepper = "vault.pepper.v1"
    public static let attempts = "vault.attempts.v1"
    /// Copie de la clé maîtresse protégée par la biométrie (gérée par l'app iOS).
    public static let biometricMasterKey = "vault.bio.mk.v1"
    public static let all = [config, pepper, attempts, biometricMasterKey]
}
