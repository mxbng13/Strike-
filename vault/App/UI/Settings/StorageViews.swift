import SwiftUI
import Charts
import VaultCore

struct StatisticsView: View {
    @EnvironmentObject var library: MediaLibrary
    @EnvironmentObject var session: VaultSession
    @State private var disk: Int64?

    var body: some View {
        let s = LibraryStatistics(state: library.state, scope: session.scope)
        List {
            Section {
                HStack {
                    stat("\(s.photoCount)", "photos")
                    Divider()
                    stat("\(s.videoCount)", "vidéos")
                    Divider()
                    stat("\(s.albumCount)", "albums")
                }
                .frame(height: 64)
                LabeledContent("Médias (originaux)", value: ByteFormat.string(s.totalBytes))
                LabeledContent("Espace disque du coffre", value: disk.map(ByteFormat.string) ?? "…")
                LabeledContent("Photos", value: ByteFormat.string(s.photoBytes))
                LabeledContent("Vidéos", value: ByteFormat.string(s.videoBytes) + " · " + FrenchDates.duration(s.totalVideoDuration))
                LabeledContent("Favoris", value: "\(s.favorites)")
                LabeledContent("Retouchés", value: "\(s.edited)")
                LabeledContent("Localisés", value: "\(s.located)")
            }
            if !s.byYear.isEmpty {
                Section("Répartition par année") {
                    Chart(s.byYear.map { Bucket(label: String($0.year), count: $0.count) }) { y in
                        BarMark(x: .value("Année", y.label), y: .value("Médias", y.count))
                            .foregroundStyle(Color.accentColor.gradient)
                            .cornerRadius(4)
                    }
                    .frame(height: 180)
                }
            }
            if !s.byFormat.isEmpty {
                Section("Formats") {
                    Chart(s.byFormat.prefix(6).map { Bucket(label: $0.format.uppercased(), count: $0.count) }) { f in
                        SectorMark(angle: .value("Nombre", f.count), innerRadius: .ratio(0.6), angularInset: 1.5)
                            .foregroundStyle(by: .value("Format", f.label))
                    }
                    .frame(height: 180)
                }
            }
            if !s.topAlbums.isEmpty {
                Section("Albums les plus fournis") {
                    ForEach(s.topAlbums.map { Bucket(label: $0.name, count: $0.count) }) { a in LabeledContent(a.label, value: "\(a.count)") }
                }
            }
        }
        .navigationTitle("Statistiques")
        .task {
            let layout = library.layout
            disk = await Task.detached { layout.diskUsage() }.value
        }
    }

    func stat(_ v: String, _ l: String) -> some View {
        VStack { Text(v).font(.title2.bold()); Text(l).font(.caption).foregroundStyle(.secondary) }.frame(maxWidth: .infinity)
    }
}

/// Nettoyage intelligent : suggestions uniquement, chaque suppression est validée par l'utilisateur.
struct Bucket: Identifiable {
    let id = UUID()
    let label: String
    let count: Int
}

struct CleanupView: View {
    @EnvironmentObject var library: MediaLibrary
    @EnvironmentObject var session: VaultSession
    @State private var report: CleanupReport?

    var body: some View {
        List {
            if let r = report {
                Section {
                    Text("Rien n'est supprimé automatiquement. Ouvrez une catégorie, choisissez les éléments, puis confirmez.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Section {
                    row("Doublons exacts", "square.on.square", r.exactDuplicates.flatMap { $0.dropFirst() },
                        detail: "\(r.exactDuplicates.count) groupe(s) · " + ByteFormat.string(CleanupReport.duplicateSavings(r.exactDuplicates, state: library.state)) + " récupérables")
                    row("Photos similaires", "square.stack.3d.down.right", r.similarPhotos.flatMap { $0.dropFirst() },
                        detail: "\(r.similarPhotos.count) groupe(s) de photos quasi identiques")
                    row("Fichiers volumineux", "externaldrive", r.largeFiles, detail: "Plus de " + ByteFormat.string(library.preferences.largeFileThreshold))
                    row("Photos floues", "camera.metering.unknown", r.blurry, detail: "Netteté faible détectée localement")
                    row("Vidéos très longues", "film", r.longVideos, detail: "Plus de 3 minutes")
                    row("Médias inutilisés", "clock.badge.questionmark", r.unused, detail: "Hors album, jamais consultés depuis 6 mois")
                    row("Captures d'écran", "camera.viewfinder", r.screenshots, detail: "")
                }
            } else {
                HStack { ProgressView(); Text("Analyse en cours…") }
            }
        }
        .navigationTitle("Nettoyage")
        .task(id: library.revision) {
            let state = library.state, scope = session.scope
            report = await Task.detached { CleanupReport.analyze(state, scope: scope) }.value
        }
    }

    func row(_ title: String, _ symbol: String, _ ids: [UUID], detail: String) -> some View {
        NavigationLink {
            CleanupReviewView(title: title, candidates: ids)
        } label: {
            HStack {
                Image(systemName: symbol).frame(width: 28).foregroundStyle(Color.accentColor)
                VStack(alignment: .leading) {
                    Text(title)
                    if !detail.isEmpty { Text(detail).font(.caption).foregroundStyle(.secondary) }
                }
                Spacer()
                Text("\(ids.count)").foregroundStyle(.secondary)
            }
        }
        .disabled(ids.isEmpty)
    }
}

struct CleanupReviewView: View {
    @EnvironmentObject var library: MediaLibrary
    let title: String
    let candidates: [UUID]
    @State private var selection: Set<UUID> = []
    @State private var confirm = false
    @State private var viewer: ViewerContext?

    var body: some View {
        let items = library.items(candidates).filter { library.isVisible($0.id) }
        ScrollView {
            Text("Touchez pour sélectionner. Appui long pour prévisualiser.").font(.footnote).foregroundStyle(.secondary).padding(.horizontal)
            MediaGrid(items: items, selection: $selection, selecting: true) { _ in }
        }
        .navigationTitle(title)
        .toolbar { Button(selection.count == items.count ? "Aucun" : "Tout") { selection = selection.count == items.count ? [] : Set(items.map(\.id)) } }
        .safeAreaInset(edge: .bottom) {
            Button(role: .destructive) { confirm = true } label: {
                Text("Mettre \(selection.count) élément(s) à la corbeille · " + ByteFormat.string(library.items(Array(selection)).reduce(0) { $0 + $1.fileSize }))
                    .frame(maxWidth: .infinity).padding()
            }
            .disabled(selection.isEmpty)
            .background(.bar)
        }
        .confirmationDialog("Mettre à la corbeille ?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Mettre à la corbeille", role: .destructive) { library.moveToTrash(Array(selection)); selection = [] }
        } message: { Text("Vous pourrez les restaurer pendant 30 jours.") }
    }
}

struct BackupSettings: View {
    @EnvironmentObject var library: MediaLibrary
    @EnvironmentObject var session: VaultSession
    @State private var pass = ""
    @State private var pass2 = ""
    @State private var progress: Double?
    @State private var archive: URLBox?
    @State private var result: String?

    var body: some View {
        Form {
            Section {
                SecureField("Phrase secrète de sauvegarde", text: $pass)
                SecureField("Confirmer", text: $pass2)
            } header: { Text("Nouvelle sauvegarde") } footer: {
                Text("Crée un fichier unique « .vaultbackup » que vous enregistrez où vous voulez (iCloud Drive, disque externe, ordinateur). Les médias y restent chiffrés ; la clé du coffre y est protégée par cette phrase (12 caractères minimum). Sans elle, la sauvegarde est inutilisable.")
            }
            Section {
                Button {
                    Task { await create() }
                } label: {
                    if let progress { ProgressView(value: progress) { Text("Création… \(Int(progress * 100)) %") } }
                    else { Text("Créer et enregistrer la sauvegarde") }
                }
                .disabled(pass.count < 12 || pass != pass2 || progress != nil)
            }
            if let result { Section { Text(result).font(.footnote) } }
            Section("Restauration") {
                Text("Pour restaurer, installez VAULT sur l'appareil cible et choisissez « Restaurer une sauvegarde » sur l'écran d'accueil.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Sauvegarde")
        .sheet(item: $archive, onDismiss: { finish(false) }) { box in
            DocumentExporter(url: box.url) { ok in finish(ok) }
        }
    }

    func create() async {
        progress = 0
        library.beginBusy("Sauvegarde chiffrée")
        defer { library.endBusy() }
        do {
            let url = try await BackupService.createBackup(library: library, passphrase: pass) { p in Task { @MainActor in progress = p } }
            session.suspendAutoLock()
            archive = URLBox(url: url)
        } catch {
            result = "Échec : \(error.localizedDescription)"
        }
        progress = nil
    }

    func finish(_ ok: Bool) {
        if let a = archive { SecureWorkspace.shared.remove(a.url) }
        if archive != nil { session.resumeAutoLock() }
        archive = nil
        if ok { result = "Sauvegarde enregistrée. Conservez la phrase secrète séparément."; pass = ""; pass2 = "" }
    }
}

struct URLBox: Identifiable {
    let id = UUID()
    let url: URL
}

struct SyncSettings: View {
    @EnvironmentObject var library: MediaLibrary
    @EnvironmentObject var session: VaultSession
    @ObservedObject var sync = SyncService.shared

    var body: some View {
        Form {
            if CloudConfig.isAvailable {
                Section {
                    Toggle("Synchroniser via iCloud", isOn: $sync.enabled)
                    if sync.enabled {
                        Button {
                            Task { await sync.syncNow(library: library, keyManager: session.keyManager) }
                        } label: {
                            HStack { Text("Synchroniser maintenant"); Spacer(); if sync.running { ProgressView() } }
                        }
                        .disabled(sync.running)
                        if let d = sync.lastSync { LabeledContent("Dernière synchro", value: d.formatted(date: .abbreviated, time: .shortened)) }
                        if let r = sync.lastReport { Text(r).font(.caption).foregroundStyle(.secondary) }
                        if let e = sync.lastError { Text(e).font(.caption).foregroundStyle(.red) }
                    }
                } footer: {
                    Text("Utilise la base privée CloudKit de VOTRE compte iCloud (votre quota iCloud, sans frais pour l'app). Tout est chiffré sur l'appareil avant l'envoi : Apple ne voit que des blocs opaques. Sur un autre appareil : « Depuis iCloud » sur l'écran d'accueil, avec votre clé de récupération.")
                }
                if !sync.conflicts.isEmpty {
                    Section("Conflits résolus lors de la dernière synchro") {
                        ForEach(sync.conflicts, id: \.name) { c in
                            VStack(alignment: .leading) {
                                Text(c.name.components(separatedBy: ":").first.map(label) ?? c.name)
                                Text(resolution(c.resolution)).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            } else {
                Section {
                    Label("Mode local", systemImage: "iphone")
                    Text("Cette version de VAULT est compilée sans conteneur iCloud : vos médias restent uniquement sur cet appareil. Utilisez la sauvegarde chiffrée pour les copier ailleurs.")
                        .font(.footnote).foregroundStyle(.secondary)
                } footer: {
                    Text("Pour activer la synchronisation, le développeur doit ajouter la capacité iCloud/CloudKit au projet (voir docs/SYNC.md).")
                }
            }
        }
        .navigationTitle("Synchronisation")
    }

    func label(_ kind: String) -> String {
        switch kind { case "media": return "Média"; case "album": return "Album"; case "project": return "Montage"; case "prefs": return "Préférences"; default: return "Souvenir" }
    }

    func resolution(_ r: SyncConflict.Resolution) -> String {
        switch r {
        case .merged: return "Modifié sur deux appareils : modifications fusionnées"
        case .keptLocalOverRemoteDeletion: return "Supprimé ailleurs mais modifié ici : conservé"
        case .restoredRemoteOverLocalDeletion: return "Supprimé ici mais modifié ailleurs : restauré"
        }
    }
}
