import SwiftUI
import CoreImage
import VaultCore

/// Onglet SOUVENIRS : collections générées localement à partir des dates et des lieux.
struct MemoriesTabView: View {
    @EnvironmentObject var library: MediaLibrary

    var body: some View {
        NavigationStack {
            ScrollView {
                let memories = library.memories
                if memories.isEmpty {
                    EmptyStateView(symbol: "sparkles", title: "Pas encore de souvenirs",
                                   message: "VAULT regroupe automatiquement vos voyages, week-ends, saisons et grands jours dès que vous avez assez de photos. Tout est calculé sur l'appareil.")
                        .padding(.top, 60)
                } else {
                    LazyVStack(spacing: 18) {
                        if let top = memories.first { MemoryCard(memory: top, large: true) }
                        let rest = Array(memories.dropFirst())
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)], spacing: 14) {
                            ForEach(rest) { m in MemoryCard(memory: m, large: false) }
                        }
                    }
                    .padding()
                }
                let saved = library.state.savedMemories.values.sorted { $0.start > $1.start }
                if !saved.isEmpty {
                    VStack(alignment: .leading) {
                        SectionHeader(title: "Collections personnalisées")
                        ForEach(saved) { m in MemoryCard(memory: m, large: false).frame(height: 160) }
                    }
                    .padding()
                }
            }
            .navigationTitle("Souvenirs")
            .navigationDestination(for: Memory.self) { MemoryDetailView(memory: $0) }
        }
    }
}

struct MemoryCard: View {
    @EnvironmentObject var library: MediaLibrary
    let memory: Memory
    let large: Bool

    var body: some View {
        NavigationLink(value: memory) {
            ZStack(alignment: .bottomLeading) {
                Color.clear.aspectRatio(large ? 0.9 : 0.75, contentMode: .fit)
                    .overlay {
                        if let k = memory.keyItemID.flatMap({ library.state.items[$0] }) {
                            ThumbnailView(item: k, showBadges: false)
                        } else { Rectangle().fill(.quaternary) }
                    }
                LinearGradient(colors: [.clear, .black.opacity(0.65)], startPoint: .center, endPoint: .bottom)
                VStack(alignment: .leading, spacing: 3) {
                    Text(memory.kind.label.uppercased()).font(.system(size: 10, weight: .bold)).tracking(1.5).opacity(0.8)
                    Text(memory.title).font(.system(size: large ? 28 : 17, weight: .bold, design: .serif)).lineLimit(2)
                    Text(memory.subtitle).font(.caption).opacity(0.85).lineLimit(1)
                }
                .foregroundStyle(.white).padding(large ? 18 : 12)
            }
            .clipShape(RoundedRectangle(cornerRadius: large ? 22 : 16, style: .continuous))
            .shadow(color: .black.opacity(0.15), radius: 10, y: 5)
        }
        .buttonStyle(.plain)
    }
}

/// Détail d'un souvenir : diaporama, vidéo souvenir, modification, enregistrement en album.
struct MemoryDetailView: View {
    @EnvironmentObject var library: MediaLibrary
    @Environment(\.dismiss) var dismiss
    let memory: Memory
    @State private var editing = false
    @State private var selection: Set<UUID> = []
    @State private var title = ""
    @State private var slideshow = false
    @State private var viewer: ViewerContext?
    @State private var renderProgress: Double?
    @State private var message: String?

    var current: Memory { library.memories.first { $0.id == memory.id } ?? library.state.savedMemories[memory.id] ?? memory }
    var items: [MediaItem] { current.itemIDs.compactMap { library.state.items[$0] }.filter { library.isVisible($0.id) } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                Text(current.kind.label.uppercased()).font(.caption2.weight(.bold)).tracking(1.5).foregroundStyle(.secondary)
                if editing {
                    TextField("Titre", text: $title).font(.largeTitle.bold()).onSubmit(saveTitle)
                } else {
                    Text(current.title).font(.system(size: 32, weight: .bold, design: .serif))
                }
                Text(current.subtitle + " · " + FrenchDates.countLabel(photos: items.filter { $0.kind == .photo }.count, videos: items.filter { $0.kind == .video }.count))
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal)

            HStack(spacing: 10) {
                actionButton("Diaporama", "play.fill") { slideshow = true }
                actionButton("Vidéo souvenir", "film") { Task { await makeVideo() } }
                actionButton("En album", "rectangle.stack.badge.plus") { saveAsAlbum() }
            }
            .padding()
            if let renderProgress { ProgressView(value: renderProgress) { Text("Création de la vidéo souvenir…").font(.caption) }.padding(.horizontal) }
            if let message { Text(message).font(.footnote).foregroundStyle(.green).padding(.horizontal) }
            if editing {
                Text("Touchez les éléments à retirer de ce souvenir.").font(.footnote).foregroundStyle(.secondary).padding(.horizontal)
            }
            MediaGrid(items: items, selection: $selection, selecting: editing) { item in
                let ids = items.map(\.id)
                viewer = ViewerContext(ids: ids, index: ids.firstIndex(of: item.id) ?? 0)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if editing {
                    Button("OK") { applyEdits() }.bold()
                } else {
                    Menu {
                        Button { title = current.title; editing = true } label: { Label("Modifier", systemImage: "pencil") }
                        Button { library.overrideMemory(memory.id) { $0.favorite.toggle() } } label: { Label("Mettre en avant", systemImage: "star") }
                        Button(role: .destructive) { library.overrideMemory(memory.id) { $0.dismissed = true }; dismiss() } label: {
                            Label("Ne plus proposer", systemImage: "eye.slash")
                        }
                    } label: { Image(systemName: "ellipsis.circle") }
                }
            }
        }
        .fullScreenCover(isPresented: $slideshow) { SlideshowView(items: items, title: current.title) }
        .fullScreenCover(item: $viewer) { MediaViewer(context: $0) }
    }

    func actionButton(_ title: String, _ symbol: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) { Image(systemName: symbol).font(.title3); Text(title).font(.caption.weight(.semibold)) }
                .frame(maxWidth: .infinity).padding(.vertical, 12)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        .disabled(renderProgress != nil)
    }

    func saveTitle() { library.overrideMemory(memory.id) { $0.title = title } }

    func applyEdits() {
        let removed = selection
        library.overrideMemory(memory.id) { o in
            o.title = title.isEmpty ? nil : title
            o.removedItemIDs.formUnion(removed)
        }
        if library.state.savedMemories[memory.id] != nil {
            library.mutate { s in
                s.savedMemories[memory.id]?.title = title.isEmpty ? memory.title : title
                s.savedMemories[memory.id]?.itemIDs.removeAll { removed.contains($0) }
            }
        }
        library.regenerateMemories()
        selection = []
        editing = false
    }

    func saveAsAlbum() {
        let ids = items.map(\.id)
        library.mutate { s in
            let a = s.createAlbum(name: current.title, symbol: "sparkles")
            s.add(ids, to: a.id)
        }
        library.overrideMemory(memory.id) { $0.saved = true }
        message = "Album « \(current.title) » créé."
        Haptics.success()
    }

    func makeVideo() async {
        let photos = items.filter { $0.kind == .photo }.prefix(60)
        guard !photos.isEmpty else { message = "Ce souvenir ne contient pas de photos."; return }
        renderProgress = 0
        library.beginBusy("Vidéo souvenir")
        defer { library.endBusy(); renderProgress = nil }
        var images: [CIImage] = []
        for p in photos {
            if let d = try? await library.displayData(p.id), let ui = ImageDecoding.downsampled(d, maxPixel: 2200), let cg = ui.cgImage {
                images.append(CIImage(cgImage: cg))
            }
        }
        let out = SecureWorkspace.shared.newFile(ext: "mov", in: "memory", name: current.title)
        do {
            try await MemoryVideoRenderer.render(images: images, options: .init(title: current.title, subtitle: current.subtitle), to: out) { p in
                Task { @MainActor in renderProgress = p }
            }
            if let id = await library.importGenerated(out, name: current.title + ".mov", date: current.end) {
                library.overrideMemory(memory.id) { _ in }
                message = "Vidéo souvenir ajoutée au coffre. Ouvrez-la pour ajouter une musique ou des textes."
                _ = id
            }
        } catch {
            message = nil
            library.errorMessage = "La vidéo n'a pas pu être créée : \(error.localizedDescription)"
        }
    }
}

/// Diaporama plein écran avec effet Ken Burns et fondus.
struct SlideshowView: View {
    @EnvironmentObject var library: MediaLibrary
    @Environment(\.dismiss) var dismiss
    let items: [MediaItem]
    let title: String
    @State private var index = 0
    @State private var images: [UUID: UIImage] = [:]
    @State private var paused = false
    @State private var zoom = false
    let timer = Timer.publish(every: 4, on: .main, in: .common).autoconnect()

    var photos: [MediaItem] { items.filter { $0.kind == .photo } }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let item = photos[safe: index], let img = images[item.id] {
                Image(uiImage: img).resizable().scaledToFill()
                    .scaleEffect(zoom ? 1.12 : 1.0)
                    .animation(.linear(duration: 4.2), value: zoom)
                    .frame(maxWidth: .infinity, maxHeight: .infinity).clipped().ignoresSafeArea()
                    .id(item.id)
                    .transition(.opacity.animation(.easeInOut(duration: 1)))
            } else {
                ProgressView().tint(.white)
            }
            VStack {
                HStack {
                    Text(title).font(.headline).foregroundStyle(.white).shadow(radius: 4)
                    Spacer()
                    Button { dismiss() } label: { Image(systemName: "xmark").padding(10).background(.ultraThinMaterial, in: Circle()) }
                }
                Spacer()
                HStack(spacing: 40) {
                    Button { step(-1) } label: { Image(systemName: "backward.fill") }
                    Button { paused.toggle() } label: { Image(systemName: paused ? "play.fill" : "pause.fill").font(.title) }
                    Button { step(1) } label: { Image(systemName: "forward.fill") }
                }
                .foregroundStyle(.white).padding(.bottom, 30)
            }
            .padding()
        }
        .preferredColorScheme(.dark)
        .statusBarHidden()
        .onReceive(timer) { _ in if !paused { step(1) } }
        .task { await preload(around: 0); zoom.toggle() }
        .onChange(of: index) { _, i in Task { await preload(around: i) }; zoom.toggle() }
    }

    func step(_ d: Int) {
        guard !photos.isEmpty else { return }
        withAnimation(.easeInOut(duration: 1)) { index = (index + d + photos.count) % photos.count }
    }

    func preload(around i: Int) async {
        for k in [i, i + 1, i + 2] where photos.indices.contains(k) {
            let it = photos[k]
            guard images[it.id] == nil, let d = try? await library.displayData(it.id) else { continue }
            images[it.id] = await Task.detached { ImageDecoding.downsampled(d, maxPixel: 2400) }.value
        }
        // Libère la mémoire des images éloignées.
        for (id, _) in images where !(photos.indices.contains(i) && [photos[safe: i]?.id, photos[safe: i + 1]?.id, photos[safe: i + 2]?.id, photos[safe: i - 1]?.id].contains(id)) {
            images[id] = nil
        }
    }
}

extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}
