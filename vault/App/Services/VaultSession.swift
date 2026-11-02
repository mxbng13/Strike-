import SwiftUI
import Combine
import LocalAuthentication
import VaultCore

/// État global de sécurité : verrouillage, clé maîtresse en mémoire, accès aux albums protégés.
/// La clé maîtresse n'existe qu'en mémoire vive pendant une session déverrouillée.
@MainActor
final class VaultSession: ObservableObject {
    enum Phase: Equatable { case loading, onboarding, locked, unlocked }

    @Published private(set) var phase: Phase = .loading
    @Published private(set) var library: MediaLibrary?
    @Published var scope = AccessScope.locked
    @Published var privacyCurtain = false
    @Published var pinChallenge: PINChallenge?
    @Published var lockoutUntil: Date?
    @Published var autoLock: AutoLockPolicy { didSet { saveSettings() } }
    @Published var biometricsEnabled: Bool
    @Published var isScreenCaptured = false

    let keychain = KeychainSecretStore()
    let keyManager: VaultKeyManager
    let layout: VaultLayout
    private var masterKey: SymmetricKey?
    private var lastActivity = Date()
    private var backgroundedAt: Date?
    private var timer: AnyCancellable?
    private var captureObserver: AnyCancellable?
    /// Suspend le verrouillage pendant les feuilles système (sélecteur, appareil photo, partage).
    private var autoLockSuspensions = 0

    struct PINChallenge: Identifiable {
        let id = UUID()
        let reason: String
        let completion: (Bool) -> Void
    }

    init() {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        layout = VaultLayout(root: support.appendingPathComponent("Vault", isDirectory: true))
        keyManager = VaultKeyManager(store: keychain)
        let d = UserDefaults.standard
        if let data = d.data(forKey: "vault.autolock"), let p = try? JSONDecoder().decode(AutoLockPolicy.self, from: data) {
            autoLock = p
        } else {
            autoLock = AutoLockPolicy()
        }
        biometricsEnabled = d.bool(forKey: "vault.biometrics")
        phase = keyManager.isConfigured ? .locked : .onboarding
        if case .lockedOut(let until) = keyManager.lockoutStatus() { lockoutUntil = until }
        timer = Timer.publish(every: 5, on: .main, in: .common).autoconnect().sink { [weak self] _ in self?.tick() }
        isScreenCaptured = UIScreen.main.isCaptured
        captureObserver = NotificationCenter.default.publisher(for: UIScreen.capturedDidChangeNotification)
            .sink { [weak self] _ in self?.isScreenCaptured = UIScreen.main.isCaptured }
    }

    private func saveSettings() {
        UserDefaults.standard.set(try? JSONEncoder().encode(autoLock), forKey: "vault.autolock")
        UserDefaults.standard.set(biometricsEnabled, forKey: "vault.biometrics")
    }

    var pinLength: Int { (try? keyManager.config().pinLength) ?? 6 }

    // MARK: Création

    func createVault(pin: String, wipeAfterTen: Bool) throws -> String {
        var policy = AttemptPolicy()
        if wipeAfterTen { policy.wipeAfter = 10 }
        let result = try keyManager.setup(pin: pin, policy: policy)
        try openLibrary(with: result.masterKey, reveal: false)
        return result.recoveryKey
    }

    /// Restauration à partir d'une clé maîtresse récupérée (sauvegarde ou autre appareil).
    func createVault(pin: String, restoringKey: SymmetricKey) throws -> String {
        let result = try keyManager.setup(pin: pin, existingMasterKey: restoringKey)
        try openLibrary(with: result.masterKey, reveal: false)
        return result.recoveryKey
    }

    /// Fin de l'accueil : la clé de récupération a été montrée, on entre dans la galerie.
    func finishOnboarding() {
        guard library != nil else { return }
        withAnimation(.spring(response: 0.55, dampingFraction: 0.85)) { phase = .unlocked }
    }

    // MARK: Déverrouillage

    enum UnlockError: LocalizedError {
        case wrong(remaining: Int?), locked(Date), wiped, other(String)
        var errorDescription: String? {
            switch self {
            case .wrong(let r): return r.map { "Code incorrect. \($0) essai(s) avant effacement." } ?? "Code incorrect."
            case .locked(let d): return "Trop d'essais. Réessayez \(d.formatted(.relative(presentation: .named)))."
            case .wiped: return "Trop d'essais : le coffre a été effacé."
            case .other(let s): return s
            }
        }
    }

    func unlock(pin: String) async -> UnlockError? {
        let km = keyManager
        let result: Result<SymmetricKey, Error> = await Task.detached(priority: .userInitiated) {
            Result { try km.unlock(pin: pin) }
        }.value
        switch result {
        case .success(let key):
            lockoutUntil = nil
            do { try openLibrary(with: key) } catch { return .other(error.localizedDescription) }
            return nil
        case .failure(let e):
            switch e as? VaultKeyError {
            case .wrongPIN(let r)?: return .wrong(remaining: r)
            case .lockedOut(let until)?: lockoutUntil = until; return .locked(until)
            case .wiped?:
                wipeLocalData()
                return .wiped
            default: return .other(e.localizedDescription)
            }
        }
    }

    var canUseBiometrics: Bool { biometricsEnabled && Biometrics.kind != .none && keychain.hasBiometricKey }

    func unlockWithBiometrics() async -> Bool {
        guard canUseBiometrics else { return false }
        do {
            let ctx = try await Biometrics.authenticate(reason: "Déverrouiller VAULT")
            let chain = keychain
            let data = try await Task.detached { try chain.readBiometricKey(context: ctx) }.value
            let key = try keyManager.unlock(biometricKeyData: data)
            try openLibrary(with: key)
            return true
        } catch {
            return false
        }
    }

    func recover(recoveryKey: String, newPIN: String) async -> String? {
        let km = keyManager
        do {
            let key = try await Task.detached { try km.recover(recoveryKey: recoveryKey, newPIN: newPIN) }.value
            try openLibrary(with: key)
            if biometricsEnabled { try? keychain.storeBiometricKey(key.rawData) }
            return nil
        } catch VaultKeyError.wrongRecoveryKey {
            return "Clé de récupération incorrecte."
        } catch {
            return error.localizedDescription
        }
    }

    private func openLibrary(with key: SymmetricKey, reveal: Bool = true) throws {
        try layout.prepare()
        excludeFromBackup()
        let lib = try MediaLibrary(layout: layout, key: key, session: self)
        masterKey = key
        library = lib
        scope = .locked
        lastActivity = Date()
        // Laisse le temps à l'animation d'ouverture du cadenas.
        if reveal { DispatchQueue.main.asyncAfter(deadline: .now() + 0.38) { [weak self] in
            guard let self, self.library === lib else { return }
            withAnimation(.spring(response: 0.55, dampingFraction: 0.85)) { self.phase = .unlocked }
        } }
        lib.didUnlock()
    }

    private func excludeFromBackup() {
        var url = layout.root
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? url.setResourceValues(values)
    }

    // MARK: Verrouillage

    func lock() {
        guard phase == .unlocked else { return }
        library?.willLock()
        library = nil
        masterKey = nil
        scope = .locked
        pinChallenge = nil
        SecureWorkspace.shared.wipe()
        withAnimation(.easeInOut(duration: 0.25)) { phase = .locked }
    }

    func noteActivity() { lastActivity = Date() }

    func suspendAutoLock() { autoLockSuspensions += 1 }
    func resumeAutoLock() { autoLockSuspensions = max(0, autoLockSuspensions - 1); lastActivity = Date() }

    private func tick() {
        guard phase == .unlocked, autoLockSuspensions == 0 else { return }
        if library?.isBusy == true { lastActivity = Date(); return } // import / export en cours
        if autoLock.shouldLockForInactivity(lastActivity: lastActivity, now: Date()) { lock() }
    }

    func scenePhaseChanged(_ p: ScenePhase) {
        switch p {
        case .active:
            privacyCurtain = false
            if let b = backgroundedAt, phase == .unlocked, autoLockSuspensions == 0,
               autoLock.shouldLockOnReturn(backgroundedAt: b, now: Date()), library?.isBusy != true {
                lock()
            }
            backgroundedAt = nil
            lastActivity = Date()
            if phase == .unlocked { library?.processInbox() }
        case .inactive:
            // Masque le contenu dans le sélecteur d'applications.
            privacyCurtain = true
        case .background:
            privacyCurtain = true
            backgroundedAt = Date()
            if phase == .unlocked, autoLock.lockOnBackground, autoLock.backgroundGrace == 0,
               autoLockSuspensions == 0, library?.isBusy != true {
                lock()
            }
        @unknown default: break
        }
    }

    // MARK: Réglages de sécurité

    func setBiometrics(_ on: Bool) async -> String? {
        if on {
            guard let key = masterKey else { return "Coffre verrouillé." }
            do {
                _ = try await Biometrics.authenticate(reason: "Activer \(Biometrics.label) pour VAULT")
                try keychain.storeBiometricKey(key.rawData)
                biometricsEnabled = true
                saveSettings()
                return nil
            } catch {
                biometricsEnabled = false
                return error.localizedDescription
            }
        } else {
            try? keychain.delete(SecretAccount.biometricMasterKey)
            biometricsEnabled = false
            saveSettings()
            return nil
        }
    }

    func changePIN(current: String, new: String) async -> String? {
        let km = keyManager
        do {
            let key = try await Task.detached { try km.unlock(pin: current) }.value
            try await Task.detached { try km.changePIN(masterKey: key, newPIN: new) }.value
            return nil
        } catch {
            return (error as? VaultKeyError).map { e -> String in
                switch e {
                case .wrongPIN: return "Code actuel incorrect."
                case .lockedOut(let d): return "Trop d'essais, réessayez \(d.formatted(.relative(presentation: .named)))."
                case .invalidPIN: return "Le nouveau code doit contenir 4 ou 6 chiffres."
                default: return "Impossible de changer le code."
                }
            } ?? error.localizedDescription
        }
    }

    func regenerateRecoveryKey() throws -> String {
        guard let key = masterKey else { throw VaultKeyError.notConfigured }
        return try keyManager.regenerateRecoveryKey(masterKey: key)
    }

    var wipeAfterTenEnabled: Bool { (try? keyManager.config().policy.wipeAfter) != nil }

    func setWipeAfterTen(_ on: Bool) {
        guard let key = masterKey, var p = try? keyManager.config().policy else { return }
        p.wipeAfter = on ? 10 : nil
        try? keyManager.updatePolicy(p, masterKey: key)
        objectWillChange.send()
    }

    /// Accès à la clé pour les services du coffre (jamais exposée à l'interface).
    func withKey<T>(_ body: (SymmetricKey) throws -> T) rethrows -> T? {
        guard let k = masterKey else { return nil }
        return try body(k)
    }

    /// Effacement définitif : clés détruites puis fichiers supprimés.
    func wipeEverything() {
        library?.willLock()
        library = nil
        masterKey = nil
        keyManager.destroyAllKeys()
        wipeLocalData()
    }

    private func wipeLocalData() {
        try? keychain.delete(SecretAccount.biometricMasterKey)
        layout.wipeEverything()
        SecureWorkspace.shared.wipe()
        if let inbox = AppGroup.inboxDirectory { try? FileManager.default.removeItem(at: inbox) }
        AppGroup.removeInboxPublicKey()
        biometricsEnabled = false
        saveSettings()
        withAnimation { phase = .onboarding }
    }

    // MARK: Authentification supplémentaire (albums protégés / masqués)

    func authenticateExtra(reason: String) async -> Bool {
        if canUseBiometrics {
            if (try? await Biometrics.authenticate(reason: reason)) != nil { return true }
        }
        return await withCheckedContinuation { cont in
            pinChallenge = PINChallenge(reason: reason) { ok in cont.resume(returning: ok) }
        }
    }

    func verifyChallengePIN(_ pin: String) async -> UnlockError? {
        let km = keyManager
        let r: Result<SymmetricKey, Error> = await Task.detached { Result { try km.unlock(pin: pin) } }.value
        switch r {
        case .success: return nil
        case .failure(let e):
            switch e as? VaultKeyError {
            case .wrongPIN(let rem)?: return .wrong(remaining: rem)
            case .lockedOut(let d)?: return .locked(d)
            case .wiped?: wipeLocalData(); return .wiped
            default: return .other(e.localizedDescription)
            }
        }
    }

    func unlockAlbum(_ album: Album) async -> Bool {
        if scope.unlockedAlbums.contains(album.id) { return true }
        guard await authenticateExtra(reason: "Ouvrir « \(album.name) »") else { return false }
        scope.unlockedAlbums.insert(album.id)
        if album.protection == .hidden { scope.revealHidden = true }
        return true
    }

    func revealHiddenAlbums() async -> Bool {
        if scope.revealHidden { return true }
        guard await authenticateExtra(reason: "Afficher les albums masqués") else { return false }
        scope.revealHidden = true
        // Une seule authentification suffit pour la session : les albums masqués sont aussi déverrouillés.
        let hidden = library.map { Array($0.state.albums.values) } ?? []
        for a in hidden where a.protection == .hidden { scope.unlockedAlbums.insert(a.id) }
        return true
    }

    func relockProtectedAlbums() {
        scope = .locked
    }
}
