import SwiftUI
import UniformTypeIdentifiers
import VaultCore

/// Création du coffre : présentation, code, clé de récupération, Face ID.
struct OnboardingView: View {
    @EnvironmentObject var session: VaultSession
    enum Step { case welcome, length, create, confirm, recovery, biometrics, restoreBackup, restoreCloud }
    @State private var step: Step = .welcome
    @State private var length = 6
    @State private var pin = ""
    @State private var first = ""
    @State private var shake: CGFloat = 0
    @State private var message: String?
    @State private var wipeAfterTen = false
    @State private var recoveryKey = ""
    @State private var acknowledged = false
    @State private var restoringKey: SymmetricKey?

    var body: some View {
        ZStack {
            LockBackground()
            Group {
                switch step {
                case .welcome: welcome
                case .length: lengthChoice
                case .create: pinStep(title: "Choisissez votre code", subtitle: "\(length) chiffres. Il chiffre votre coffre : il n'est enregistré nulle part.")
                case .confirm: pinStep(title: "Confirmez votre code", subtitle: message ?? "Saisissez-le une seconde fois.")
                case .recovery: recovery
                case .biometrics: biometrics
                case .restoreBackup: RestoreBackupView(onRestored: { key in restoringKey = key; step = .length }, onCancel: { step = .welcome })
                case .restoreCloud: RestoreCloudView(onRestored: { key in restoringKey = key; step = .length }, onCancel: { step = .welcome })
                }
            }
            .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .opacity))
        }
        .preferredColorScheme(.dark)
        .animation(.spring(response: 0.45, dampingFraction: 0.9), value: step)
    }

    var welcome: some View {
        VStack(alignment: .leading, spacing: 28) {
            Spacer()
            Image(systemName: "lock.square.stack").font(.system(size: 44, weight: .thin))
            VStack(alignment: .leading, spacing: 10) {
                Text("VAULT").font(.system(size: 15, weight: .semibold)).tracking(9).opacity(0.7)
                Text("Votre galerie.\nVraiment privée.").font(.system(size: 38, weight: .bold, design: .serif))
            }
            VStack(alignment: .leading, spacing: 18) {
                feature("lock.shield", "Chiffrement réel", "Chaque photo et vidéo est chiffrée en AES-256 sur l'appareil, avec sa propre clé.")
                feature("wand.and.stars", "Retouche et montage", "Éditeur photo complet et montage vidéo, sans jamais toucher à l'original.")
                feature("icloud.slash", "Rien ne sort sans vous", "Aucun envoi, aucune analyse distante. Sauvegarde et synchro chiffrées de bout en bout, si vous le décidez.")
            }
            Spacer()
            Button { step = .length } label: {
                Text("Créer mon coffre").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 16)
                    .background(.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous)).foregroundStyle(.black)
            }
            HStack {
                Button("Restaurer une sauvegarde") { step = .restoreBackup }
                Spacer()
                if CloudConfig.isAvailable { Button("Depuis iCloud") { step = .restoreCloud } }
            }
            .font(.footnote.weight(.medium)).foregroundStyle(.white.opacity(0.75))
        }
        .foregroundStyle(.white)
        .padding(28)
    }

    func feature(_ symbol: String, _ title: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: symbol).font(.title3).frame(width: 30)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.subheadline.weight(.semibold))
                Text(text).font(.footnote).foregroundStyle(.white.opacity(0.7))
            }
        }
    }

    var lengthChoice: some View {
        VStack(spacing: 26) {
            Spacer()
            Text("Longueur du code").font(.title2.bold())
            Text("Un code à 6 chiffres offre un million de combinaisons, contre dix mille pour 4 chiffres.")
                .font(.footnote).foregroundStyle(.white.opacity(0.7)).multilineTextAlignment(.center)
            HStack(spacing: 14) {
                lengthCard(6, "Recommandé")
                lengthCard(4, "Plus rapide")
            }
            Toggle(isOn: $wipeAfterTen) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Effacer après 10 erreurs").font(.subheadline.weight(.semibold))
                    Text("Les clés sont détruites : le contenu devient définitivement illisible.").font(.caption).foregroundStyle(.white.opacity(0.65))
                }
            }
            .padding().background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
            Spacer()
            Button { step = .create } label: {
                Text("Continuer").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 16)
                    .background(.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous)).foregroundStyle(.black)
            }
        }
        .foregroundStyle(.white).padding(28)
    }

    func lengthCard(_ n: Int, _ caption: String) -> some View {
        Button { length = n } label: {
            VStack(spacing: 8) {
                Text("\(n)").font(.system(size: 40, weight: .light, design: .rounded))
                Text("chiffres").font(.caption)
                Text(caption).font(.caption2.weight(.semibold)).opacity(0.7)
            }
            .frame(maxWidth: .infinity).padding(.vertical, 22)
            .background(RoundedRectangle(cornerRadius: 18).fill(.white.opacity(length == n ? 0.18 : 0.06)))
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(.white.opacity(length == n ? 0.8 : 0.15)))
        }
        .foregroundStyle(.white)
    }

    func pinStep(title: String, subtitle: String) -> some View {
        VStack(spacing: 18) {
            Spacer(minLength: 30)
            Text(title).font(.title3.weight(.semibold))
            Text(subtitle).font(.footnote).foregroundStyle(.white.opacity(0.7)).multilineTextAlignment(.center).padding(.horizontal, 30)
                .frame(minHeight: 40)
            Spacer(minLength: 20)
            PINEntry(length: length, pin: $pin, shake: shake) { value in handle(value) }
            Spacer(minLength: 20)
            Button("Retour") { pin = ""; first = ""; message = nil; step = .length }
                .font(.footnote).foregroundStyle(.white.opacity(0.7)).padding(.bottom, 20)
        }
        .foregroundStyle(.white)
    }

    func handle(_ value: String) {
        if step == .create {
            if VaultKeyManager.isWeakPIN(value) {
                Haptics.error(); withAnimation(.linear(duration: 0.4)) { shake += 1 }
                pin = ""
                message = nil
                first = ""
                return
            }
            first = value; pin = ""; message = nil; step = .confirm
        } else {
            guard value == first else {
                Haptics.error(); withAnimation(.linear(duration: 0.4)) { shake += 1 }
                pin = ""; message = "Les codes ne correspondent pas. Recommencez."
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { first = ""; message = nil; step = .create }
                return
            }
            do {
                // La création ouvre la bibliothèque : on garde l'écran d'accueil le temps d'afficher la clé.
                recoveryKey = try createKeepingOnboarding(pin: value)
                step = .recovery
            } catch {
                message = error.localizedDescription
                pin = ""
            }
        }
    }

    func createKeepingOnboarding(pin: String) throws -> String {
        if let k = restoringKey { return try session.createVault(pin: pin, restoringKey: k) }
        return try session.createVault(pin: pin, wipeAfterTen: wipeAfterTen)
    }

    var recovery: some View {
        VStack(alignment: .leading, spacing: 20) {
            Spacer()
            Image(systemName: "key.horizontal").font(.system(size: 36, weight: .light))
            Text("Votre clé de récupération").font(.title2.bold())
            Text("Notez-la sur papier et rangez-la en lieu sûr. C'est le seul moyen de réinitialiser un code oublié ou de retrouver votre coffre sur un nouvel appareil. Elle ne sera plus jamais affichée.")
                .font(.footnote).foregroundStyle(.white.opacity(0.75))
            Text(recoveryKey)
                .font(.system(size: 20, weight: .medium, design: .monospaced))
                .frame(maxWidth: .infinity).padding(.vertical, 22)
                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 16))
                .textSelection(.disabled)
                .privacySensitive()
            Toggle("J'ai noté ma clé en lieu sûr", isOn: $acknowledged).font(.subheadline)
            Spacer()
            Button { step = Biometrics.kind == .none ? .biometrics : .biometrics } label: {
                Text("Continuer").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 16)
                    .background(.white.opacity(acknowledged ? 1 : 0.3), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .foregroundStyle(.black)
            }
            .disabled(!acknowledged)
        }
        .foregroundStyle(.white).padding(28)
    }

    var biometrics: some View {
        VStack(spacing: 22) {
            Spacer()
            Image(systemName: Biometrics.symbol).font(.system(size: 54, weight: .thin))
            Text(Biometrics.kind == .none ? "Prêt" : "Utiliser \(Biometrics.label) ?").font(.title2.bold())
            Text(Biometrics.kind == .none
                 ? "Votre coffre est créé. Vous pourrez activer la biométrie plus tard dans les réglages si votre appareil la prend en charge."
                 : "Déverrouillez votre coffre d'un regard. La clé reste dans le trousseau sécurisé de l'appareil et est invalidée si \(Biometrics.label) est modifié.")
                .font(.footnote).foregroundStyle(.white.opacity(0.75)).multilineTextAlignment(.center)
            Spacer()
            if Biometrics.kind != .none {
                Button {
                    Task { _ = await session.setBiometrics(true); session.finishOnboarding() }
                } label: {
                    Text("Activer \(Biometrics.label)").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 16)
                        .background(.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous)).foregroundStyle(.black)
                }
            }
            Button(Biometrics.kind == .none ? "Ouvrir mon coffre" : "Plus tard") { session.finishOnboarding() }
                .font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.8)).padding(.bottom, 10)
        }
        .foregroundStyle(.white).padding(28)
    }
}

/// Restauration d'une archive .vaultbackup choisie dans Fichiers.
struct RestoreBackupView: View {
    @EnvironmentObject var session: VaultSession
    let onRestored: (SymmetricKey) -> Void
    let onCancel: () -> Void
    @State private var file: URL?
    @State private var passphrase = ""
    @State private var picking = false
    @State private var progress: Double?
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Spacer()
            Image(systemName: "externaldrive.badge.timemachine").font(.system(size: 38, weight: .light))
            Text("Restaurer une sauvegarde").font(.title2.bold())
            Text("Choisissez un fichier .vaultbackup, puis saisissez la phrase secrète définie lors de la sauvegarde.")
                .font(.footnote).foregroundStyle(.white.opacity(0.75))
            Button { picking = true } label: {
                Label(file?.lastPathComponent ?? "Choisir le fichier", systemImage: "doc")
                    .frame(maxWidth: .infinity, alignment: .leading).padding()
                    .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
            }
            SecureField("Phrase secrète", text: $passphrase)
                .padding().background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
            if let progress { ProgressView(value: progress).tint(.white) }
            if let error { Text(error).font(.footnote).foregroundStyle(.red) }
            Spacer()
            Button {
                guard let file else { return }
                Task {
                    progress = 0; error = nil
                    do {
                        let key = try await BackupService.restore(from: file, passphrase: passphrase, layout: session.layout) { p in
                            Task { @MainActor in progress = p }
                        }
                        onRestored(key)
                    } catch {
                        self.error = "Restauration impossible : phrase secrète incorrecte ou fichier endommagé."
                        progress = nil
                    }
                }
            } label: {
                Text("Restaurer").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 16)
                    .background(.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous)).foregroundStyle(.black)
            }
            .disabled(file == nil || passphrase.isEmpty || progress != nil)
            Button("Annuler", action: onCancel).font(.footnote).foregroundStyle(.white.opacity(0.7)).frame(maxWidth: .infinity)
        }
        .foregroundStyle(.white).padding(28)
        .fileImporter(isPresented: $picking, allowedContentTypes: [UTType(exportedAs: "com.vault.backup"), .data]) { r in
            if case .success(let u) = r { file = u }
        }
    }
}

/// Nouvel appareil : récupération de la clé maîtresse via iCloud + clé de récupération.
struct RestoreCloudView: View {
    let onRestored: (SymmetricKey) -> Void
    let onCancel: () -> Void
    @State private var code = ""
    @State private var working = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Spacer()
            Image(systemName: "icloud.and.arrow.down").font(.system(size: 38, weight: .light))
            Text("Retrouver mon coffre").font(.title2.bold())
            Text("Saisissez la clé de récupération de votre coffre. Les médias seront ensuite téléchargés et déchiffrés sur cet appareil.")
                .font(.footnote).foregroundStyle(.white.opacity(0.75))
            TextField("XXXX-XXXX-…", text: $code, axis: .vertical)
                .font(.system(.body, design: .monospaced)).textInputAutocapitalization(.characters).autocorrectionDisabled()
                .padding().background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
            if let error { Text(error).font(.footnote).foregroundStyle(.red) }
            Spacer()
            Button {
                Task {
                    working = true; error = nil
                    do {
                        let key = try await SyncService.shared.fetchMasterKey(recoveryKey: code)
                        SyncService.shared.enabled = true
                        onRestored(key)
                    } catch VaultKeyError.wrongRecoveryKey {
                        error = "Clé de récupération incorrecte."
                    } catch {
                        self.error = "Aucun coffre trouvé sur ce compte iCloud, ou iCloud indisponible."
                    }
                    working = false
                }
            } label: {
                Group { if working { ProgressView().tint(.black) } else { Text("Continuer") } }
                    .font(.headline).frame(maxWidth: .infinity).padding(.vertical, 16)
                    .background(.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous)).foregroundStyle(.black)
            }
            .disabled(RecoveryKey.normalize(code) == nil || working)
            Button("Annuler", action: onCancel).font(.footnote).foregroundStyle(.white.opacity(0.7)).frame(maxWidth: .infinity)
        }
        .foregroundStyle(.white).padding(28)
    }
}
