import Foundation
import VaultCore

/// Sauvegarde / restauration manuelles (« .vaultbackup ») vers Fichiers, iCloud Drive, disque externe…
@MainActor
enum BackupService {
    static func createBackup(library: MediaLibrary, passphrase: String, progress: @escaping @Sendable (Double) -> Void) async throws -> URL {
        library.saveNow()
        let layout = library.layout
        let key = library.masterKeyForServices
        let stamp = Date().formatted(.iso8601.year().month().day())
        let out = SecureWorkspace.shared.newFile(ext: "vaultbackup", in: "backup", name: "VAULT-\(stamp)")
        _ = try await Task.detached(priority: .userInitiated) {
            try BackupArchive.create(at: out, layout: layout, masterKey: key, passphrase: passphrase, progress: progress)
        }.value
        return out
    }

    /// Restaure dans un coffre vide (écran d'accueil). Renvoie la clé maîtresse restaurée.
    static func restore(from url: URL, passphrase: String, layout: VaultLayout,
                        progress: @escaping @Sendable (Double) -> Void) async throws -> SymmetricKey {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        layout.wipeEverything()
        let (key, _) = try await Task.detached(priority: .userInitiated) {
            try BackupArchive.restore(url, passphrase: passphrase, into: layout, progress: progress)
        }.value
        return key
    }
}
