import SwiftUI
import VaultCore

/// Miniature déchiffrée à la demande (jamais écrite en clair sur le disque).
struct ThumbnailView: View {
    @EnvironmentObject var library: MediaLibrary
    let item: MediaItem
    var contentMode: ContentMode = .fill
    var showBadges = true
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            Rectangle().fill(Color(.secondarySystemBackground))
            if let image {
                Image(uiImage: image).resizable().aspectRatio(contentMode: contentMode)
                    .blur(radius: library.preferences.discreetMode ? 18 : 0)
                    .clipped()
                    .transition(.opacity)
            }
        }
        .overlay(alignment: .bottomTrailing) {
            if showBadges, item.kind == .video, let d = item.duration {
                Text(FrenchDates.duration(d)).font(.system(size: 11, weight: .semibold)).foregroundStyle(.white)
                    .shadow(radius: 2).padding(4)
            }
        }
        .overlay(alignment: .bottomLeading) {
            if showBadges && (item.isFavorite || item.isEdited) {
                HStack(spacing: 3) {
                    if item.isFavorite { Image(systemName: "heart.fill") }
                    if item.isEdited { Image(systemName: "slider.horizontal.3") }
                }
                .font(.system(size: 10, weight: .bold)).foregroundStyle(.white).shadow(radius: 2).padding(4)
            }
        }
        .task(id: "\(item.id)-\(library.revision)-\(item.modifiedDate.timeIntervalSince1970)") {
            if let c = library.thumbnails.cached(item.id) { image = c; return }
            let img = await library.thumbnails.image(item.id)
            withAnimation(.easeOut(duration: 0.15)) { image = img }
        }
        .accessibilityLabel(item.kind == .video ? "Vidéo" : "Photo")
    }
}

/// Grille de médias avec sélection multiple et zoom par pincement (2 à 7 colonnes).
struct MediaGrid: View {
    @EnvironmentObject var library: MediaLibrary
    let items: [MediaItem]
    @Binding var selection: Set<UUID>
    var selecting: Bool
    let onOpen: (MediaItem) -> Void

    var body: some View {
        let cols = Array(repeating: GridItem(.flexible(), spacing: spacing), count: library.preferences.gridColumns)
        LazyVGrid(columns: cols, spacing: spacing) {
            ForEach(items) { item in
                cell(item)
            }
        }
    }

    var spacing: CGFloat { library.preferences.gridStyle == .compact ? 1 : 2 }

    @ViewBuilder func cell(_ item: MediaItem) -> some View {
        let selected = selection.contains(item.id)
        Color.clear
            .aspectRatio(library.preferences.gridStyle == .aspect ? max(0.5, min(2, item.aspectRatio)) : 1, contentMode: .fit)
            .overlay(ThumbnailView(item: item, contentMode: .fill))
            .clipShape(RoundedRectangle(cornerRadius: library.preferences.gridStyle == .compact ? 0 : 3, style: .continuous))
            .overlay {
                if selecting {
                    ZStack(alignment: .bottomTrailing) {
                        Color.white.opacity(selected ? 0.25 : 0)
                        Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                            .font(.title3).symbolRenderingMode(.palette)
                            .foregroundStyle(.white, selected ? Color.accentColor : .black.opacity(0.2))
                            .shadow(radius: 2).padding(5)
                    }
                }
            }
            .contentShape(Rectangle())
            .onTapGesture {
                if selecting {
                    Haptics.selection()
                    if selected { selection.remove(item.id) } else { selection.insert(item.id) }
                } else {
                    onOpen(item)
                }
            }
            .contextMenu {
                if !selecting {
                    Button { library.mutate { $0.setFavorite([item.id], !item.isFavorite) } } label: {
                        Label(item.isFavorite ? "Retirer des favoris" : "Ajouter aux favoris", systemImage: item.isFavorite ? "heart.slash" : "heart")
                    }
                    Button(role: .destructive) { library.moveToTrash([item.id]) } label: { Label("Supprimer", systemImage: "trash") }
                }
            } preview: {
                ThumbnailView(item: item, contentMode: .fit, showBadges: false).frame(width: 300, height: 300)
            }
    }
}

/// Pincement pour changer le nombre de colonnes.
struct PinchColumns: ViewModifier {
    @EnvironmentObject var library: MediaLibrary
    @State private var startColumns: Int?
    func body(content: Content) -> some View {
        content.simultaneousGesture(
            MagnifyGesture()
                .onChanged { v in
                    let start = startColumns ?? library.preferences.gridColumns
                    if startColumns == nil { startColumns = start }
                    let target = min(7, max(2, Int((Double(start) / v.magnification).rounded())))
                    if target != library.preferences.gridColumns {
                        Haptics.selection()
                        withAnimation(.spring(response: 0.3)) { library.updatePreferences { $0.gridColumns = target } }
                    }
                }
                .onEnded { _ in startColumns = nil }
        )
    }
}

extension View {
    func pinchToResizeGrid() -> some View { modifier(PinchColumns()) }
}

/// Contexte d'ouverture de la visionneuse.
struct ViewerContext: Identifiable {
    let id = UUID()
    let ids: [UUID]
    let index: Int
    var albumID: UUID?
}
