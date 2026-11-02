import SwiftUI
import VaultCore

struct AlbumDetailView: View {
    @EnvironmentObject var library: MediaLibrary
    @EnvironmentObject var session: VaultSession
    let albumID: UUID
    @State private var selecting = false
    @State private var selection: Set<UUID> = []
    @State private var viewer: ViewerContext?
    @State private var importKind: ImportMenu.ImportKind?
    @State private var editing: AlbumDraft?
    @State private var addFromLibrary = false
    @State private var slideshow = false
    @State private var reorder = false

    var album: Album? { library.state.albums[albumID] }
    var items: [MediaItem] { library.state.albumItems(albumID) }

    var body: some View {
        Group {
            if let album, library.state.isAlbumAccessible(album, scope: session.scope) {
                content(album)
            } else {
                EmptyStateView(symbol: "lock.fill", title: "Album verrouillé", message: "Authentifiez-vous pour voir son contenu.")
            }
        }
        .navigationTitle(selecting ? "\(selection.count) sélectionné(s)" : (album?.name ?? ""))
        .navigationBarTitleDisplayMode(.inline)
    }

    func content(_ album: Album) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    AlbumIcon(album: album, size: 46)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(album.name).font(.title2.bold())
                        Text("\(FrenchDates.countLabel(photos: items.filter { $0.kind == .photo }.count, videos: items.filter { $0.kind == .video }.count)) · créé le \(FrenchDates.shortDay(album.createdAt)) \(Calendar.vault.component(.year, from: album.createdAt))")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                if !album.details.isEmpty { Text(album.details).font(.subheadline).foregroundStyle(.secondary) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal).padding(.bottom, 8)
            if items.isEmpty {
                EmptyStateView(symbol: album.symbol, title: "Album vide", message: "Ajoutez des médias depuis votre coffre ou importez-en de nouveaux.")
            } else {
                MediaGrid(items: items, selection: $selection, selecting: selecting) { item in
                    let ids = items.map(\.id)
                    viewer = ViewerContext(ids: ids, index: ids.firstIndex(of: item.id) ?? 0, albumID: albumID)
                }
            }
            Color.clear.frame(height: 80)
        }
        .pinchToResizeGrid()
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if selecting {
                    Button("OK") { selecting = false; selection = [] }.bold()
                } else {
                    Button("Sélect.") { selecting = true }
                    Menu {
                        Button { addFromLibrary = true } label: { Label("Ajouter depuis le coffre", systemImage: "plus.rectangle.on.rectangle") }
                        Button { importKind = .library } label: { Label("Importer depuis Photos", systemImage: "photo.on.rectangle") }
                        Button { importKind = .files } label: { Label("Importer depuis Fichiers", systemImage: "folder") }
                        if UIImagePickerController.isSourceTypeAvailable(.camera) {
                            Button { importKind = .camera } label: { Label("Prendre une photo ou vidéo", systemImage: "camera") }
                        }
                        Divider()
                        Picker("Trier", selection: Binding(get: { album.sort }, set: { v in library.mutate { $0.albums[albumID]?.sort = v } })) {
                            ForEach(AlbumSort.allCases, id: \.self) { Text($0.label).tag($0) }
                        }
                        if album.sort == .custom && items.count > 1 {
                            Button { reorder = true } label: { Label("Réorganiser", systemImage: "arrow.up.arrow.down") }
                        }
                        if !items.isEmpty {
                            Button { slideshow = true } label: { Label("Diaporama", systemImage: "play.rectangle") }
                        }
                        Button { editing = AlbumDraft(album: album) } label: { Label("Modifier l'album", systemImage: "pencil") }
                    } label: { Image(systemName: "ellipsis.circle") }
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            if selecting { SelectionActionBar(selection: $selection, currentAlbum: albumID) { selecting = false; selection = [] } }
        }
        .importMenu($importKind, albumID: albumID)
        .fullScreenCover(item: $viewer) { MediaViewer(context: $0) }
        .fullScreenCover(isPresented: $slideshow) { SlideshowView(items: items, title: album.name) }
        .sheet(item: $editing) { AlbumEditorSheet(draft: $0) }
        .sheet(isPresented: $addFromLibrary) {
            LibraryPicker(title: "Ajouter à « \(album.name) »", excluded: Set(album.itemIDs)) { ids in
                library.mutate { $0.add(ids, to: albumID) }
            }
        }
        .sheet(isPresented: $reorder) { ReorderAlbumSheet(albumID: albumID) }
    }
}

/// Réorganisation manuelle (glisser-déposer).
struct ReorderAlbumSheet: View {
    @EnvironmentObject var library: MediaLibrary
    @Environment(\.dismiss) var dismiss
    let albumID: UUID
    var body: some View {
        NavigationStack {
            List {
                ForEach(library.state.albumItems(albumID)) { item in
                    HStack(spacing: 12) {
                        ThumbnailView(item: item).frame(width: 54, height: 54).clipShape(RoundedRectangle(cornerRadius: 8))
                        VStack(alignment: .leading) {
                            Text(item.originalFilename).font(.subheadline).lineLimit(1)
                            Text(FrenchDates.full(item.captureDate)).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                .onMove { from, to in library.mutate { $0.reorder(albumID: albumID, from: Array(from), to: to) } }
            }
            .environment(\.editMode, .constant(.active))
            .navigationTitle("Réorganiser")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("OK") { dismiss() } } }
        }
    }
}

/// Sélection de médias existants du coffre.
struct LibraryPicker: View {
    @EnvironmentObject var library: MediaLibrary
    @Environment(\.dismiss) var dismiss
    let title: String
    var excluded: Set<UUID> = []
    var kinds: Set<MediaKind> = [.photo, .video]
    let onDone: ([UUID]) -> Void
    @State private var selection: Set<UUID> = []

    var body: some View {
        NavigationStack {
            ScrollView {
                MediaGrid(items: library.visibleItems().filter { !excluded.contains($0.id) && kinds.contains($0.kind) }
                            .sorted { $0.captureDate > $1.captureDate },
                          selection: $selection, selecting: true) { _ in }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Ajouter (\(selection.count))") { onDone(Array(selection)); dismiss() }.disabled(selection.isEmpty)
                }
            }
        }
    }
}

struct SmartAlbumView: View {
    @EnvironmentObject var library: MediaLibrary
    @EnvironmentObject var session: VaultSession
    let smart: SmartAlbum
    @State private var selecting = false
    @State private var selection: Set<UUID> = []
    @State private var viewer: ViewerContext?

    var body: some View {
        let items = library.state.smartAlbum(smart, scope: session.scope)
        ScrollView {
            if items.isEmpty {
                EmptyStateView(symbol: smart.symbol, title: smart.name, message: "Aucun élément pour le moment.")
            } else {
                MediaGrid(items: items, selection: $selection, selecting: selecting) { item in
                    let ids = items.map(\.id)
                    viewer = ViewerContext(ids: ids, index: ids.firstIndex(of: item.id) ?? 0)
                }
            }
        }
        .pinchToResizeGrid()
        .navigationTitle(smart.name)
        .toolbar { Button(selecting ? "OK" : "Sélect.") { selecting.toggle(); selection = [] } }
        .safeAreaInset(edge: .bottom) {
            if selecting { SelectionActionBar(selection: $selection) { selecting = false; selection = [] } }
        }
        .fullScreenCover(item: $viewer) { MediaViewer(context: $0) }
    }
}

/// Corbeille : restauration ou suppression définitive (effacement cryptographique).
struct TrashView: View {
    @EnvironmentObject var library: MediaLibrary
    @State private var selection: Set<UUID> = []
    @State private var confirm = false

    var body: some View {
        let items = library.trashedItems
        ScrollView {
            if items.isEmpty {
                EmptyStateView(symbol: "trash", title: "Corbeille vide", message: "Les éléments supprimés sont conservés 30 jours, puis effacés définitivement.")
            } else {
                Text("Touchez des éléments pour les sélectionner. Après 30 jours, ils sont effacés définitivement.")
                    .font(.footnote).foregroundStyle(.secondary).padding(.horizontal)
                MediaGrid(items: items, selection: $selection, selecting: true) { _ in }
            }
        }
        .navigationTitle("Supprimés récemment")
        .safeAreaInset(edge: .bottom) {
            if !items.isEmpty {
                HStack {
                    Button(selection.isEmpty ? "Tout restaurer" : "Restaurer (\(selection.count))") {
                        library.restore(selection.isEmpty ? items.map(\.id) : Array(selection)); selection = []
                    }
                    Spacer()
                    Button(selection.isEmpty ? "Tout supprimer" : "Supprimer (\(selection.count))", role: .destructive) { confirm = true }
                        .foregroundStyle(.red)
                }
                .padding().background(.bar)
            }
        }
        .confirmationDialog("Suppression définitive", isPresented: $confirm, titleVisibility: .visible) {
            Button("Supprimer définitivement", role: .destructive) {
                library.purgeForever(selection.isEmpty ? items.map(\.id) : Array(selection)); selection = []
            }
        } message: {
            Text("Les fichiers chiffrés et leurs clés seront détruits. Cette action est irréversible.")
        }
    }
}
