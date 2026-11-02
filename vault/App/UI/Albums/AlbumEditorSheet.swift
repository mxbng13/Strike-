import SwiftUI
import VaultCore

struct AlbumDraft: Identifiable {
    let id = UUID()
    var existingID: UUID?
    var kind: AlbumKind
    var name = ""
    var details = ""
    var colorHex = Album.palette[5]
    var symbol = "photo.on.rectangle"
    var protection: AlbumProtection = .normal
    var parent: UUID?
    var coverItemID: UUID?

    init(kind: AlbumKind, parent: UUID? = nil) {
        self.kind = kind; self.parent = parent
        if kind == .folder { symbol = "folder.fill" }
    }

    init(album: Album) {
        existingID = album.id; kind = album.kind; name = album.name; details = album.details; colorHex = album.colorHex
        symbol = album.symbol; protection = album.protection; parent = album.parentID; coverItemID = album.coverItemID
    }
}

struct AlbumEditorSheet: View {
    @EnvironmentObject var library: MediaLibrary
    @EnvironmentObject var session: VaultSession
    @Environment(\.dismiss) var dismiss
    @State var draft: AlbumDraft
    @State private var pickCover = false

    var folders: [Album] {
        library.state.albums.values.filter { $0.kind == .folder && $0.id != draft.existingID }
            .filter { draft.existingID == nil || library.state.canMove(album: draft.existingID!, under: $0.id) }
            .sorted { $0.name < $1.name }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 14) {
                        AlbumIcon(album: preview, size: 56)
                        VStack {
                            TextField(draft.kind == .folder ? "Nom de la collection" : "Nom de l'album", text: $draft.name).font(.headline)
                            TextField("Description (facultative)", text: $draft.details, axis: .vertical).font(.subheadline)
                        }
                    }
                }
                Section("Couleur") {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 6), spacing: 12) {
                        ForEach(Album.palette, id: \.self) { hex in
                            Circle().fill(Color(hex: hex)).frame(width: 32, height: 32)
                                .overlay(Circle().strokeBorder(.primary, lineWidth: draft.colorHex == hex ? 2.5 : 0).padding(-4))
                                .onTapGesture { draft.colorHex = hex }
                        }
                    }
                    .padding(.vertical, 6)
                }
                if draft.kind == .album {
                    Section("Icône") {
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 6), spacing: 14) {
                            ForEach(Album.symbols, id: \.self) { s in
                                Image(systemName: s).font(.title3)
                                    .frame(width: 38, height: 38)
                                    .background(RoundedRectangle(cornerRadius: 9).fill(draft.symbol == s ? Color(hex: draft.colorHex).opacity(0.25) : .clear))
                                    .onTapGesture { draft.symbol = s }
                            }
                        }
                        .padding(.vertical, 6)
                    }
                    if let id = draft.existingID, !(library.state.albums[id]?.itemIDs.isEmpty ?? true) {
                        Section {
                            Button { pickCover = true } label: {
                                HStack {
                                    Text("Couverture")
                                    Spacer()
                                    if let c = draft.coverItemID.flatMap({ library.state.items[$0] }) {
                                        ThumbnailView(item: c, showBadges: false).frame(width: 44, height: 44).clipShape(RoundedRectangle(cornerRadius: 6))
                                    } else { Text("Automatique").foregroundStyle(.secondary) }
                                }
                            }
                        }
                    }
                }
                Section {
                    Picker("Confidentialité", selection: $draft.protection) {
                        ForEach(AlbumProtection.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                } footer: {
                    Text(protectionHelp)
                }
                if !folders.isEmpty {
                    Section {
                        Picker("Dans la collection", selection: $draft.parent) {
                            Text("Aucune (racine)").tag(UUID?.none)
                            ForEach(folders) { f in Text(f.name).tag(UUID?.some(f.id)) }
                        }
                    }
                }
            }
            .navigationTitle(draft.existingID == nil ? (draft.kind == .folder ? "Nouvelle collection" : "Nouvel album") : "Modifier")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Enregistrer") { Task { await save() } }.bold() }
            }
            .sheet(isPresented: $pickCover) {
                if let id = draft.existingID {
                    CoverPicker(albumID: id) { draft.coverItemID = $0 }
                }
            }
        }
    }

    var protectionHelp: String {
        switch draft.protection {
        case .normal: return "Visible partout dans VAULT."
        case .protected: return "L'album reste visible, mais son contenu n'apparaît nulle part (galerie, recherche, souvenirs) tant que vous ne l'avez pas déverrouillé avec \(Biometrics.kind == .none ? "votre code" : Biometrics.label + " ou votre code")."
        case .hidden: return "L'album n'apparaît pas dans la liste. Pour le voir : Albums › Afficher les albums masqués (authentification requise)."
        }
    }

    var preview: Album {
        var a = Album(kind: draft.kind, name: draft.name, colorHex: draft.colorHex, symbol: draft.symbol)
        a.protection = draft.protection
        return a
    }

    func save() async {
        // Renforcer la protection d'un album n'exige rien ; l'affaiblir exige une authentification.
        if let id = draft.existingID, let old = library.state.albums[id], old.protection != .normal, draft.protection == .normal {
            guard await session.authenticateExtra(reason: "Retirer la protection de « \(old.name) »") else { return }
        }
        library.mutate { s in
            if let id = draft.existingID, var a = s.albums[id] {
                a.name = draft.name.isEmpty ? a.name : draft.name
                a.details = draft.details
                a.colorHex = draft.colorHex
                a.symbol = draft.symbol
                a.protection = draft.protection
                a.coverItemID = draft.coverItemID ?? a.coverItemID
                if s.canMove(album: id, under: draft.parent) { a.parentID = draft.parent }
                a.modifiedAt = Date()
                s.albums[id] = a
            } else {
                var a = s.createAlbum(name: draft.name, kind: draft.kind, protection: draft.protection, parent: draft.parent,
                                      colorHex: draft.colorHex, symbol: draft.symbol)
                a.details = draft.details
                s.albums[a.id] = a
                if draft.protection != .normal { session.scope.unlockedAlbums.insert(a.id) }
            }
        }
        Haptics.success()
        dismiss()
    }
}

struct CoverPicker: View {
    @EnvironmentObject var library: MediaLibrary
    @Environment(\.dismiss) var dismiss
    let albumID: UUID
    let onPick: (UUID) -> Void
    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 4), spacing: 2) {
                    ForEach(library.state.albumItems(albumID)) { item in
                        Color.clear.aspectRatio(1, contentMode: .fit).overlay(ThumbnailView(item: item)).clipped()
                            .onTapGesture { onPick(item.id); dismiss() }
                    }
                }
            }
            .navigationTitle("Choisir la couverture")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } } }
        }
    }
}
