import SwiftUI
import VaultCore

/// Onglet ALBUMS : albums et collections de l'utilisateur, albums intelligents, albums masqués.
final class AlbumRouter: ObservableObject {
    @Published var path = NavigationPath()
}

struct AlbumsTabView: View {
    @EnvironmentObject var library: MediaLibrary
    @EnvironmentObject var session: VaultSession
    @StateObject private var router = AlbumRouter()
    @State private var editing: AlbumDraft?
    @State private var reordering = false

    var body: some View {
        NavigationStack(path: $router.path) {
            AlbumListContent(parent: nil, editing: $editing, reordering: $reordering)
                .navigationTitle("Albums")
                .toolbar {
                    ToolbarItemGroup(placement: .topBarTrailing) {
                        Button(reordering ? "OK" : "Organiser") { withAnimation { reordering.toggle() } }
                        Menu {
                            Button { editing = AlbumDraft(kind: .album) } label: { Label("Nouvel album", systemImage: "rectangle.stack.badge.plus") }
                            Button { editing = AlbumDraft(kind: .folder) } label: { Label("Nouvelle collection", systemImage: "folder.badge.plus") }
                        } label: { Image(systemName: "plus") }
                    }
                }
                .navigationDestination(for: AlbumRoute.self) { route in
                    switch route {
                    case .album(let id): AlbumDetailView(albumID: id)
                    case .folder(let id): FolderView(folderID: id)
                    case .smart(let s): SmartAlbumView(smart: s)
                    case .trash: TrashView()
                    case .projects: ProjectsListView()
                    }
                }
                .sheet(item: $editing) { d in AlbumEditorSheet(draft: d) }
        }
        .environmentObject(router)
    }
}

enum AlbumRoute: Hashable {
    case album(UUID), folder(UUID), smart(SmartAlbum), trash, projects
}

struct AlbumListContent: View {
    @EnvironmentObject var library: MediaLibrary
    @EnvironmentObject var session: VaultSession
    let parent: UUID?
    @Binding var editing: AlbumDraft?
    @Binding var reordering: Bool

    var albums: [Album] { library.state.listedAlbums(parent: parent, scope: session.scope) }
    let columns = [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)]

    var body: some View {
        if reordering {
            List {
                ForEach(albums) { a in
                    HStack { AlbumIcon(album: a, size: 32); Text(a.name); Spacer(); Text(a.protection == .normal ? "" : a.protection.label).font(.caption).foregroundStyle(.secondary) }
                }
                .onMove { from, to in
                    var ids = albums.map(\.id)
                    ids.move(fromOffsets: from, toOffset: to)
                    library.mutate { $0.reorderAlbums(ids) }
                }
            }
            .environment(\.editMode, .constant(.active))
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    if albums.isEmpty && parent != nil {
                        EmptyStateView(symbol: "folder", title: "Collection vide", message: "Ajoutez des albums à cette collection avec le bouton +.")
                    }
                    if !albums.isEmpty {
                        if parent == nil { SectionHeader(title: "Mes albums").padding(.horizontal) }
                        LazyVGrid(columns: columns, spacing: 18) {
                            ForEach(albums) { a in AlbumCard(album: a, editing: $editing) }
                        }
                        .padding(.horizontal)
                    }
                    if parent == nil {
                        smartSection
                        utilitySection
                    }
                }
                .padding(.vertical)
            }
        }
    }

    var smartSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Albums intelligents").padding(.horizontal)
            VStack(spacing: 0) {
                ForEach(SmartAlbum.allCases.filter { $0 != .allPhotos }) { s in
                    NavigationLink(value: AlbumRoute.smart(s)) {
                        HStack {
                            Image(systemName: s.symbol).frame(width: 28).foregroundStyle(Color.accentColor)
                            Text(s.name).foregroundStyle(.primary)
                            Spacer()
                            Text("\(library.state.smartAlbum(s, scope: session.scope).count)").foregroundStyle(.secondary)
                            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
                        }
                        .padding(.horizontal).padding(.vertical, 11)
                    }
                    Divider().padding(.leading, 52)
                }
            }
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
            .padding(.horizontal)
        }
    }

    var hiddenCount: Int { library.state.albums.values.filter { $0.protection == .hidden }.count }

    var utilitySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Autres").padding(.horizontal)
            VStack(spacing: 0) {
                Button {
                    Task {
                        if session.scope.revealHidden { session.scope.revealHidden = false }
                        else { _ = await session.revealHiddenAlbums() }
                    }
                } label: {
                    HStack {
                        Image(systemName: session.scope.revealHidden ? "eye" : "eye.slash").frame(width: 28)
                        Text(session.scope.revealHidden ? "Masquer à nouveau les albums masqués" : "Afficher les albums masqués")
                        Spacer()
                        Image(systemName: "lock.fill").font(.caption).foregroundStyle(.secondary)
                    }
                    .padding(.horizontal).padding(.vertical, 11)
                }
                Divider().padding(.leading, 52)
                NavigationLink(value: AlbumRoute.projects) {
                    HStack {
                        Image(systemName: "film.stack").frame(width: 28)
                        Text("Montages vidéo").foregroundStyle(.primary)
                        Spacer()
                        Text("\(library.state.projects.count)").foregroundStyle(.secondary)
                        Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
                    }
                    .padding(.horizontal).padding(.vertical, 11)
                }
                Divider().padding(.leading, 52)
                NavigationLink(value: AlbumRoute.trash) {
                    HStack {
                        Image(systemName: "trash").frame(width: 28)
                        Text("Supprimés récemment").foregroundStyle(.primary)
                        Spacer()
                        Text("\(library.state.trash.count)").foregroundStyle(.secondary)
                        Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
                    }
                    .padding(.horizontal).padding(.vertical, 11)
                }
                if !session.scope.unlockedAlbums.isEmpty {
                    Divider().padding(.leading, 52)
                    Button { session.relockProtectedAlbums() } label: {
                        HStack { Image(systemName: "lock.rotation").frame(width: 28); Text("Reverrouiller les albums protégés"); Spacer() }
                            .padding(.horizontal).padding(.vertical, 11)
                    }
                }
            }
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
            .padding(.horizontal)
        }
    }
}

/// Carte d'album : couverture masquée tant qu'un album protégé n'est pas déverrouillé.
struct AlbumCard: View {
    @EnvironmentObject var library: MediaLibrary
    @EnvironmentObject var session: VaultSession
    @EnvironmentObject var router: AlbumRouter
    let album: Album
    @Binding var editing: AlbumDraft?
    @State private var confirmDelete = false

    var accessible: Bool { library.state.isAlbumAccessible(album, scope: session.scope) }
    var cover: MediaItem? {
        guard accessible, album.kind == .album else { return nil }
        return (album.coverItemID.flatMap { library.state.items[$0] }) ?? library.state.albumItems(album.id).first
    }

    var body: some View {
        Button {
            Task {
                if album.protection != .normal { guard await session.unlockAlbum(album) else { return } }
                router.path.append(album.kind == .folder ? AlbumRoute.folder(album.id) : AlbumRoute.album(album.id))
            }
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                Color.clear.aspectRatio(1, contentMode: .fit)
                    .overlay {
                        if let cover {
                            ThumbnailView(item: cover, showBadges: false)
                        } else {
                            ZStack {
                                Color(hex: album.colorHex).opacity(0.18)
                                Image(systemName: album.protection != .normal && !accessible ? "lock.fill" : (album.kind == .folder ? "folder.fill" : album.symbol))
                                    .font(.system(size: 34, weight: .light)).foregroundStyle(Color(hex: album.colorHex))
                            }
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(alignment: .topTrailing) {
                        if album.protection != .normal {
                            Image(systemName: album.protection == .hidden ? "eye.slash.fill" : "lock.fill")
                                .font(.caption2).padding(6).background(.ultraThinMaterial, in: Circle()).padding(6)
                        }
                    }
                HStack(spacing: 6) {
                    Circle().fill(Color(hex: album.colorHex)).frame(width: 7, height: 7)
                    Text(album.name).font(.subheadline.weight(.semibold)).lineLimit(1)
                }
                Text(accessible && !library.preferences.discreetMode ? "\(library.state.recursiveCount(album.id))" : "—")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button { editing = AlbumDraft(album: album) } label: { Label("Modifier", systemImage: "pencil") }
            Button(role: .destructive) { confirmDelete = true } label: { Label("Supprimer l'album", systemImage: "trash") }
        }
        .confirmationDialog("Supprimer « \(album.name) » ?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Supprimer l'album", role: .destructive) { library.mutate { $0.deleteAlbum(album.id) } }
        } message: {
            Text("Les photos et vidéos restent dans votre coffre.")
        }
    }
}

struct FolderView: View {
    @EnvironmentObject var library: MediaLibrary
    let folderID: UUID
    @State private var editing: AlbumDraft?
    @State private var reordering = false

    var body: some View {
        AlbumListContent(parent: folderID, editing: $editing, reordering: $reordering)
            .navigationTitle(library.state.albums[folderID]?.name ?? "Collection")
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button(reordering ? "OK" : "Organiser") { reordering.toggle() }
                    Menu {
                        Button { editing = AlbumDraft(kind: .album, parent: folderID) } label: { Label("Nouvel album", systemImage: "rectangle.stack.badge.plus") }
                        Button { editing = AlbumDraft(kind: .folder, parent: folderID) } label: { Label("Nouvelle sous-collection", systemImage: "folder.badge.plus") }
                    } label: { Image(systemName: "plus") }
                }
            }
            .sheet(item: $editing) { AlbumEditorSheet(draft: $0) }
    }
}
