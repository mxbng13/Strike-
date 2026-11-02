import Foundation
import Security
import LocalAuthentication
import VaultCore

/// Stockage des secrets dans le Keychain iOS.
/// • kSecAttrAccessibleWhenUnlockedThisDeviceOnly : jamais inclus dans les sauvegardes, jamais synchronisé.
/// • Copie biométrique de la clé maîtresse : SecAccessControl .biometryCurrentSet (invalidée si Face ID change).
final class KeychainSecretStore: SecretStore, @unchecked Sendable {
    let service: String

    init(service: String = "com.vault.app.secrets") { self.service = service }

    private func base(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    func read(_ account: String) throws -> Data? {
        var q = base(account)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        // Ne jamais déclencher d'interface pour les lectures ordinaires.
        let ctx = LAContext()
        ctx.interactionNotAllowed = true
        q[kSecUseAuthenticationContext as String] = ctx
        var out: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &out)
        switch status {
        case errSecSuccess: return out as? Data
        case errSecItemNotFound: return nil
        case errSecInteractionNotAllowed: return nil
        default: throw KeychainError.status(status)
        }
    }

    func write(_ data: Data, account: String) throws {
        try? delete(account)
        var q = base(account)
        q[kSecValueData as String] = data
        q[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let status = SecItemAdd(q as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError.status(status) }
    }

    func delete(_ account: String) throws {
        let status = SecItemDelete(base(account) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw KeychainError.status(status) }
    }

    // MARK: Copie biométrique

    func storeBiometricKey(_ key: Data) throws {
        try? delete(SecretAccount.biometricMasterKey)
        var error: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
                                                           .biometryCurrentSet, &error) else {
            throw KeychainError.accessControl
        }
        var q = base(SecretAccount.biometricMasterKey)
        q[kSecValueData as String] = key
        q[kSecAttrAccessControl as String] = access
        let status = SecItemAdd(q as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError.status(status) }
    }

    var hasBiometricKey: Bool {
        var q = base(SecretAccount.biometricMasterKey)
        let ctx = LAContext()
        ctx.interactionNotAllowed = true
        q[kSecUseAuthenticationContext as String] = ctx
        q[kSecReturnAttributes as String] = true
        let status = SecItemCopyMatching(q as CFDictionary, nil)
        return status == errSecSuccess || status == errSecInteractionNotAllowed
    }

    /// Lit la clé après une évaluation biométrique réussie (le même contexte évite une seconde invite).
    func readBiometricKey(context: LAContext) throws -> Data {
        var q = base(SecretAccount.biometricMasterKey)
        q[kSecReturnData as String] = true
        q[kSecUseAuthenticationContext as String] = context
        var out: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &out)
        guard status == errSecSuccess, let d = out as? Data else { throw KeychainError.status(status) }
        return d
    }
}

enum KeychainError: LocalizedError {
    case status(OSStatus)
    case accessControl
    var errorDescription: String? {
        switch self {
        case .status(let s): return "Erreur du trousseau (\(s))."
        case .accessControl: return "Impossible de créer le contrôle d'accès biométrique."
        }
    }
}

/// Authentification biométrique (Face ID / Touch ID / Optic ID).
enum Biometrics {
    enum Kind { case none, faceID, touchID, opticID }

    static var kind: Kind {
        let ctx = LAContext()
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) else { return .none }
        switch ctx.biometryType {
        case .faceID: return .faceID
        case .touchID: return .touchID
        case .opticID: return .opticID
        default: return .none
        }
    }

    static var label: String {
        switch kind {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        case .opticID: return "Optic ID"
        case .none: return "Biométrie"
        }
    }

    static var symbol: String {
        switch kind {
        case .faceID: return "faceid"
        case .touchID: return "touchid"
        case .opticID: return "opticid"
        case .none: return "lock"
        }
    }

    /// Évalue la biométrie et renvoie le contexte authentifié.
    static func authenticate(reason: String) async throws -> LAContext {
        let ctx = LAContext()
        ctx.localizedFallbackTitle = "Saisir le code"
        ctx.localizedCancelTitle = "Annuler"
        try await ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason)
        return ctx
    }
}
