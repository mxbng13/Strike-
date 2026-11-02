import UIKit
import UniformTypeIdentifiers
import VaultCore

/// Extension de partage : « Partager › VAULT » depuis Photos, Fichiers, Safari…
/// Elle ne peut RIEN lire du coffre : elle chiffre chaque fichier pour la clé publique de la boîte de dépôt.
/// L'application importe ces dépôts au prochain déverrouillage.
final class ShareViewController: UIViewController {
    private let label = UILabel()
    private let progress = UIProgressView(progressViewStyle: .default)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.black.withAlphaComponent(0.92)
        let icon = UIImageView(image: UIImage(systemName: "lock.fill"))
        icon.tintColor = .white
        icon.contentMode = .scaleAspectFit
        label.textColor = .white
        label.font = .preferredFont(forTextStyle: .headline)
        label.textAlignment = .center
        label.numberOfLines = 0
        label.text = "Chiffrement en cours…"
        progress.tintColor = .white
        let stack = UIStackView(arrangedSubviews: [icon, label, progress])
        stack.axis = .vertical
        stack.spacing = 16
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            icon.heightAnchor.constraint(equalToConstant: 36),
            progress.widthAnchor.constraint(equalToConstant: 200),
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        Task { await process() }
    }

    private var groupID: String? { Bundle.main.object(forInfoDictionaryKey: "VaultAppGroup") as? String }

    private func process() async {
        guard let id = groupID, let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id),
              let keyData = try? Data(contentsOf: container.appendingPathComponent("inbox.pub")),
              let publicKey = try? Curve25519.KeyAgreement.PublicKey(rawRepresentation: keyData) else {
            finish("Ouvrez VAULT une première fois pour activer le partage.")
            return
        }
        let inbox = container.appendingPathComponent("Inbox", isDirectory: true)
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        var count = 0
        for (i, p) in providers.enumerated() {
            guard let type = [UTType.movie, .image, .data].first(where: { p.hasItemConformingToTypeIdentifier($0.identifier) }) else { continue }
            if await seal(p, type: type, publicKey: publicKey, inbox: inbox) { count += 1 }
            await MainActor.run { progress.progress = Float(i + 1) / Float(max(providers.count, 1)) }
        }
        finish(count > 0 ? "\(count) élément(s) déposé(s) dans VAULT.\nIls seront importés au prochain déverrouillage." : "Aucun élément compatible.")
    }

    private func seal(_ provider: NSItemProvider, type: UTType, publicKey: Curve25519.KeyAgreement.PublicKey, inbox: URL) async -> Bool {
        await withCheckedContinuation { cont in
            // Représentation fichier : pas de chargement en mémoire, adapté aux grosses vidéos.
            provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, _ in
                guard let url else { cont.resume(returning: false); return }
                let real = provider.registeredContentTypes.first(where: { $0.conforms(to: type) }) ?? type
                let meta = InboxSealer.Metadata(originalFilename: provider.suggestedName.map { n in
                    (n as NSString).pathExtension.isEmpty ? n + "." + (real.preferredFilenameExtension ?? url.pathExtension) : n
                } ?? url.lastPathComponent, typeIdentifier: real.identifier)
                let ok = (try? InboxSealer.seal(file: url, metadata: meta, recipient: publicKey, inboxDirectory: inbox)) != nil
                cont.resume(returning: ok)
            }
        }
    }

    private func finish(_ message: String) {
        DispatchQueue.main.async {
            self.label.text = message
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
                self.extensionContext?.completeRequest(returningItems: nil)
            }
        }
    }
}
