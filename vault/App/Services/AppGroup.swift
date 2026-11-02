import Foundation
import VaultCore

/// Conteneur partagé avec l'extension de partage : il ne contient QUE la clé publique de la boîte
/// de dépôt et des fichiers déjà chiffrés pour elle.
enum AppGroup {
    static var identifier: String? { Bundle.main.object(forInfoDictionaryKey: "VaultAppGroup") as? String }

    static var container: URL? {
        guard let id = identifier else { return nil }
        return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id)
    }

    static var inboxDirectory: URL? { container?.appendingPathComponent("Inbox", isDirectory: true) }
    static var publicKeyURL: URL? { container?.appendingPathComponent("inbox.pub") }

    static func writeInboxPublicKey(_ key: Curve25519.KeyAgreement.PublicKey) {
        guard let url = publicKeyURL else { return }
        try? key.rawRepresentation.write(to: url, options: .atomic)
    }

    static func readInboxPublicKey() -> Curve25519.KeyAgreement.PublicKey? {
        guard let url = publicKeyURL, let d = try? Data(contentsOf: url) else { return nil }
        return try? Curve25519.KeyAgreement.PublicKey(rawRepresentation: d)
    }

    static func removeInboxPublicKey() {
        if let url = publicKeyURL { try? FileManager.default.removeItem(at: url) }
    }
}

/// Espace de travail temporaire pour les fichiers déchiffrés (montage vidéo, export, partage).
/// Protection NSFileProtectionComplete, exclu des sauvegardes, entièrement effacé au verrouillage.
final class SecureWorkspace: @unchecked Sendable {
    static let shared = SecureWorkspace()
    let root: URL

    private init() {
        root = FileManager.default.temporaryDirectory.appendingPathComponent("VaultWorkspace", isDirectory: true)
    }

    func directory(_ name: String) -> URL {
        let d = root.appendingPathComponent(name, isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true,
                                                 attributes: [.protectionKey: FileProtectionType.complete])
        var url = d
        var v = URLResourceValues(); v.isExcludedFromBackup = true
        try? url.setResourceValues(v)
        return d
    }

    func newFile(ext: String, in dir: String = "tmp", name: String? = nil) -> URL {
        directory(dir).appendingPathComponent((name ?? UUID().uuidString) + (ext.isEmpty ? "" : "." + ext))
    }

    func remove(_ url: URL) { try? FileManager.default.removeItem(at: url) }

    func wipe() {
        // Écrase les fichiers avant suppression (au mieux : la mémoire flash peut conserver des copies,
        // d'où l'importance de la protection de données iOS qui chiffre déjà ces fichiers).
        if let e = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.fileSizeKey]) {
            for case let u as URL in e {
                if let size = try? u.resourceValues(forKeys: [.fileSizeKey]).fileSize, size > 0, size < 50_000_000,
                   let h = try? FileHandle(forWritingTo: u) {
                    try? h.write(contentsOf: Data(count: size))
                    try? h.close()
                }
            }
        }
        try? FileManager.default.removeItem(at: root)
    }
}
