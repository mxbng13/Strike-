import SwiftUI
import VaultCore

/// Onglet RÉGLAGES : sécurité, confidentialité, apparence, stockage, sauvegarde.
struct SettingsView: View {
    @EnvironmentObject var library: MediaLibrary
    @EnvironmentObject var session: VaultSession
    @State private var bioError: String?
    @State private var showChangePIN = false
    @State private var newRecovery: String?
    @State private var confirmWipe = false
    @State private var confirmWipe2 = false

    var body: some View {
        NavigationStack {
            Form {
                securitySection
                privacySection
                Section("Personnalisation") {
                    NavigationLink { AppearanceSettings() } label: { Label("Apparence et grille", systemImage: "paintbrush") }
                    NavigationLink { TabOrderSettings() } label: { Label("Organisation des onglets", systemImage: "rectangle.3.group") }
                    NavigationLink { BirthdaySettings() } label: { Label("Anniversaires (Souvenirs)", systemImage: "gift") }
                }
                Section("Stockage") {
                    NavigationLink { StatisticsView() } label: { Label("Statistiques", systemImage: "chart.bar.xaxis") }
                    NavigationLink { CleanupView() } label: { Label("Nettoyage intelligent", systemImage: "sparkles") }
                }
                Section("Sauvegarde et synchronisation") {
                    NavigationLink { BackupSettings() } label: { Label("Sauvegarde chiffrée", systemImage: "externaldrive.badge.checkmark") }
                    NavigationLink { SyncSettings() } label: { Label("Synchronisation iCloud", systemImage: "arrow.triangle.2.circlepath.icloud") }
                }
                Section {
                    NavigationLink { SecurityExplainer() } label: { Label("Comment VAULT protège vos médias", systemImage: "lock.doc") }
                }
                Section {
                    Button("Effacer définitivement le coffre", role: .destructive) { confirmWipe = true }
                } footer: {
                    Text("Détruit les clés de chiffrement puis tous les fichiers. Irréversible, sauf sauvegarde chiffrée.")
                }
            }
            .navigationTitle("Réglages")
            .sheet(isPresented: $showChangePIN) { ChangePINView() }
            .alert("Nouvelle clé de récupération", isPresented: Binding(get: { newRecovery != nil }, set: { if !$0 { newRecovery = nil } })) {
                Button("Je l'ai notée") {}
            } message: { Text((newRecovery ?? "") + "\n\nL'ancienne clé ne fonctionne plus. Notez celle-ci en lieu sûr.") }
            .alert("Biométrie", isPresented: Binding(get: { bioError != nil }, set: { if !$0 { bioError = nil } })) { Button("OK") {} } message: { Text(bioError ?? "") }
            .confirmationDialog("Effacer tout le coffre ?", isPresented: $confirmWipe, titleVisibility: .visible) {
                Button("Continuer", role: .destructive) { confirmWipe2 = true }
            } message: { Text("\(library.state.items.count) éléments seront détruits.") }
            .alert("Dernière confirmation", isPresented: $confirmWipe2) {
                Button("Effacer", role: .destructive) {
                    Task { if await session.authenticateExtra(reason: "Effacer le coffre") { session.wipeEverything() } }
                }
                Button("Annuler", role: .cancel) {}
            } message: { Text("Cette action ne peut pas être annulée.") }
        }
    }

    var securitySection: some View {
        Section {
            if Biometrics.kind != .none {
                Toggle(isOn: Binding(get: { session.biometricsEnabled }, set: { on in Task { bioError = await session.setBiometrics(on) } })) {
                    Label("Déverrouiller avec \(Biometrics.label)", systemImage: Biometrics.symbol)
                }
            }
            Button { showChangePIN = true } label: { Label("Modifier le code (\(session.pinLength) chiffres)", systemImage: "number") }
            Picker(selection: $session.autoLock.inactivity) {
                ForEach(AutoLockDelay.allCases) { Text($0.label).tag($0) }
            } label: { Label("Verrouillage automatique", systemImage: "timer") }
            Toggle(isOn: $session.autoLock.lockOnBackground) { Label("Verrouiller en quittant l'app", systemImage: "rectangle.portrait.and.arrow.right") }
            Toggle(isOn: Binding(get: { session.wipeAfterTenEnabled }, set: { session.setWipeAfterTen($0) })) {
                Label("Effacer après 10 codes erronés", systemImage: "exclamationmark.shield")
            }
            Button {
                Task {
                    guard await session.authenticateExtra(reason: "Générer une nouvelle clé de récupération") else { return }
                    newRecovery = try? session.regenerateRecoveryKey()
                }
            } label: { Label("Nouvelle clé de récupération", systemImage: "key.horizontal") }
        } header: { Text("Sécurité") } footer: {
            Text("Après 5 erreurs, des délais croissants s'appliquent (30 s à 1 h). Le code n'est jamais enregistré : il sert à déchiffrer la clé du coffre.")
        }
    }

    var privacySection: some View {
        Section {
            Toggle(isOn: pref(\.discreetMode)) { Label("Mode discret", systemImage: "eye.slash") }
            Toggle(isOn: pref(\.hideNotificationPreviews)) { Label("Masquer les aperçus de notifications", systemImage: "bell.slash") }
            Toggle(isOn: pref(\.keepLocation)) { Label("Conserver la localisation à l'import", systemImage: "location") }
            Toggle(isOn: Binding(get: { library.preferences.visualAnalysisEnabled }, set: { on in
                library.updatePreferences { $0.visualAnalysisEnabled = on }
                if on { library.analyzeLibraryVisually() }
            })) { Label("Analyse visuelle locale", systemImage: "cpu") }
            if !library.preferences.visualAnalysisEnabled && library.state.items.values.contains(where: { !$0.labels.isEmpty }) {
                Button("Effacer les étiquettes visuelles", role: .destructive) { library.clearVisualLabels() }
            }
            Toggle(isOn: pref(\.skipDuplicatesOnImport)) { Label("Ignorer les doublons à l'import", systemImage: "square.on.square") }
            Toggle(isOn: pref(\.deleteFromLibraryAfterImport)) { Label("Proposer de supprimer de Photos après import", systemImage: "photo.badge.minus") }
        } header: { Text("Confidentialité") } footer: {
            Text("Le mode discret floute les miniatures et masque le contenu en cas d'enregistrement d'écran. La suppression dans Photos est toujours confirmée par iOS.")
        }
    }

    func pref(_ kp: WritableKeyPath<VaultPreferences, Bool>) -> Binding<Bool> {
        Binding(get: { library.preferences[keyPath: kp] }, set: { v in library.updatePreferences { $0[keyPath: kp] = v } })
    }
}

struct ChangePINView: View {
    @EnvironmentObject var session: VaultSession
    @Environment(\.dismiss) var dismiss
    @State private var current = ""
    @State private var new = ""
    @State private var confirm = ""
    @State private var length = 6
    @State private var error: String?
    @State private var working = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Code actuel") { SecureField("Code actuel", text: $current).keyboardType(.numberPad) }
                Section {
                    Picker("Longueur", selection: $length) { Text("4 chiffres").tag(4); Text("6 chiffres").tag(6) }.pickerStyle(.segmented)
                    SecureField("Nouveau code", text: $new).keyboardType(.numberPad)
                    SecureField("Confirmer", text: $confirm).keyboardType(.numberPad)
                } header: { Text("Nouveau code") } footer: {
                    if VaultKeyManager.isWeakPIN(new) && new.count == length { Text("Code trop simple (suite ou chiffres identiques).").foregroundStyle(.orange) }
                }
                if let error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle("Modifier le code")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") {
                        Task {
                            working = true
                            error = await session.changePIN(current: current, new: new)
                            working = false
                            if error == nil { Haptics.success(); dismiss() }
                        }
                    }
                    .disabled(working || new.count != length || new != confirm || !new.allSatisfy(\.isNumber) || VaultKeyManager.isWeakPIN(new) || current.isEmpty)
                }
            }
        }
    }
}

struct AppearanceSettings: View {
    @EnvironmentObject var library: MediaLibrary
    let accents = ["#0A84FF", "#5E5CE6", "#BF5AF2", "#FF375F", "#FF9F0A", "#32D74B", "#64D2FF", "#AC8E68", "#8E8E93"]

    var body: some View {
        Form {
            Picker("Thème", selection: Binding(get: { library.preferences.theme }, set: { v in library.updatePreferences { $0.theme = v } })) {
                ForEach(VaultPreferences.ThemePreference.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            Section("Couleur d'accent") {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 9)) {
                    ForEach(accents, id: \.self) { c in
                        Circle().fill(Color(hex: c)).frame(width: 28, height: 28)
                            .overlay(Circle().strokeBorder(.primary, lineWidth: library.preferences.accentHex == c ? 2.5 : 0).padding(-3))
                            .onTapGesture { library.updatePreferences { $0.accentHex = c } }
                    }
                }
                .padding(.vertical, 6)
            }
            Section("Grille") {
                Picker("Style", selection: Binding(get: { library.preferences.gridStyle }, set: { v in library.updatePreferences { $0.gridStyle = v } })) {
                    ForEach(VaultPreferences.GridStyle.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                Stepper("Colonnes : \(library.preferences.gridColumns)", value: Binding(get: { library.preferences.gridColumns }, set: { v in library.updatePreferences { $0.gridColumns = v } }), in: 2...7)
                Text("Astuce : pincez la grille pour changer le nombre de colonnes.").font(.caption).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Apparence")
    }
}

struct TabOrderSettings: View {
    @EnvironmentObject var library: MediaLibrary
    var body: some View {
        List {
            ForEach(library.preferences.tabOrder) { t in Label(t.title, systemImage: t.symbol) }
                .onMove { from, to in library.updatePreferences { $0.tabOrder.move(fromOffsets: from, toOffset: to) } }
        }
        .environment(\.editMode, .constant(.active))
        .navigationTitle("Onglets")
    }
}

struct BirthdaySettings: View {
    @EnvironmentObject var library: MediaLibrary
    @State private var name = ""
    @State private var date = Date()
    var body: some View {
        Form {
            Section {
                TextField("Prénom", text: $name)
                DatePicker("Date", selection: $date, displayedComponents: .date)
                Button("Ajouter") {
                    let c = Calendar.vault.dateComponents([.month, .day], from: date)
                    library.updatePreferences { $0.birthdays.append(Birthday(name: name, month: c.month!, day: c.day!)) }
                    name = ""
                    library.regenerateMemories()
                }
                .disabled(name.isEmpty)
            } footer: { Text("Ces dates restent chiffrées dans votre coffre et servent uniquement à créer des souvenirs « Anniversaire ».") }
            Section {
                ForEach(library.preferences.birthdays) { b in
                    HStack { Text(b.name); Spacer(); Text("\(b.day) \(FrenchDates.months[b.month - 1])").foregroundStyle(.secondary) }
                }
                .onDelete { idx in library.updatePreferences { $0.birthdays.remove(atOffsets: idx) } }
            }
        }
        .navigationTitle("Anniversaires")
    }
}

struct SecurityExplainer: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                block("lock.shield", "Chiffrement réel", "Chaque fichier est chiffré en AES-256-GCM avec sa propre clé aléatoire, par blocs de 256 Ko authentifiés (toute modification ou troncature est détectée). Les miniatures, les retouches, l'index (noms d'albums, dates, lieux) et les projets de montage sont chiffrés de la même façon.")
                block("key", "Clés", "La clé du coffre n'est jamais écrite en clair. Elle est stockée chiffrée dans le trousseau iOS (« cet appareil uniquement »), par une clé dérivée de votre code (PBKDF2, 600 000 itérations, plus un secret propre à l'appareil). Une copie peut être protégée par Face ID ; elle est invalidée si les visages enregistrés changent.")
                block("hand.raised", "Tentatives", "Délais croissants après 5 erreurs, effacement optionnel après 10. L'effacement détruit les clés : les fichiers deviennent illisibles.")
                block("rectangle.on.rectangle.slash", "Aperçus", "Le contenu est masqué dans le sélecteur d'applications. Le mode discret floute la grille et masque l'écran pendant un enregistrement.")
                block("externaldrive", "Fichiers temporaires", "Le montage vidéo et l'export nécessitent des copies déchiffrées : elles vont dans un espace protégé (NSFileProtectionComplete), exclu des sauvegardes et effacé au verrouillage. La lecture vidéo, elle, déchiffre à la volée sans copie.")
                block("network.slash", "Réseau", "VAULT n'envoie rien sans votre action. La synchronisation iCloud (facultative) n'envoie que des données déjà chiffrées : Apple ne peut pas les lire.")
                block("exclamationmark.triangle", "Limites honnêtes", "Un appareil compromis (jailbreak, logiciel espion) peut lire ce qui est affiché à l'écran. Une capture d'écran ne peut pas être bloquée par une app iOS, seulement signalée. Si vous oubliez votre code ET votre clé de récupération, vos médias sont irrécupérables.")
            }
            .padding()
        }
        .navigationTitle("Sécurité")
    }

    func block(_ s: String, _ t: String, _ b: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: s).font(.title2).frame(width: 34).foregroundStyle(Color.accentColor)
            VStack(alignment: .leading, spacing: 4) { Text(t).font(.headline); Text(b).font(.subheadline).foregroundStyle(.secondary) }
        }
    }
}
