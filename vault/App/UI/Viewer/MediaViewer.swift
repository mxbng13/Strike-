import SwiftUI
import AVKit
import VaultCore

/// Visionneuse plein écran : défilement entre médias, zoom, lecture vidéo chiffrée, actions.
struct MediaViewer: View {
    @EnvironmentObject var library: MediaLibrary
    @EnvironmentObject var session: VaultSession
    @Environment(\.dismiss) var dismiss
    let context: ViewerContext
    @State private var ids: [UUID] = []
    @State private var current: UUID?
    @State private var chrome = true
    @State private var showInfo = false
    @State private var editing: MediaItem?
    @State private var videoEditing: VideoProject?
    @State private var addToAlbum = false
    @State private var exporting = false
    @State private var confirmDelete = false
    @State private var dragOffset: CGFloat = 0
    @State private var zoomed = false

    var item: MediaItem? { current.flatMap { library.state.items[$0] } }

    var body: some View {
        ZStack {
            Color.black.opacity(1 - min(0.7, abs(dragOffset) / 600)).ignoresSafeArea()
            TabView(selection: $current) {
                ForEach(ids, id: \.self) { id in
                    if let it = library.state.items[id] {
                        MediaPage(item: it, isCurrent: current == id, zoomed: $zoomed, onTap: { withAnimation(.easeInOut(duration: 0.2)) { chrome.toggle() } })
                            .tag(Optional(id))
                    }
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .offset(y: dragOffset)
            .scaleEffect(1 - min(0.15, abs(dragOffset) / 2000))
            .simultaneousGesture(dismissDrag, including: zoomed ? .subviews : .all)
            .ignoresSafeArea()

            if chrome, let item {
                VStack(spacing: 0) {
                    topBar(item)
                    Spacer()
                    bottomBar(item)
                }
                .transition(.opacity)
            }
        }
        .statusBarHidden(!chrome)
        .preferredColorScheme(.dark)
        .onAppear {
            ids = context.ids.filter { library.isVisible($0) }
            let start = context.ids.indices.contains(context.index) ? context.ids[context.index] : ids.first
            current = start
        }
        .onChange(of: current) { _, id in
            if let id { library.mutate { $0.items[id]?.lastViewed = Date() } }
        }
        .onChange(of: library.revision) { _, _ in
            // Si l'élément courant a été supprimé, passer au suivant.
            guard let c = current, !library.isVisible(c) else { return }
            let idx = ids.firstIndex(of: c) ?? 0
            ids.removeAll { !library.isVisible($0) }
            if ids.isEmpty { dismiss() } else { current = ids[min(idx, ids.count - 1)] }
        }
        .sheet(isPresented: $showInfo) { if let item { InfoSheet(itemID: item.id) } }
        .sheet(isPresented: $addToAlbum) {
            if let item {
                AlbumPickerSheet(title: "Ajouter à un album") { a in library.mutate { $0.add([item.id], to: a.id) }; Haptics.success() }
            }
        }
        .sheet(isPresented: $exporting) { if let item { ExportSheet(ids: [item.id]) } }
        .fullScreenCover(item: $editing) { PhotoEditorView(item: $0) }
        .fullScreenCover(item: $videoEditing) { VideoEditorView(project: $0) }
        .confirmationDialog("Supprimer cet élément ?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Supprimer", role: .destructive) { if let item { library.moveToTrash([item.id]) } }
        } message: { Text("Il restera 30 jours dans « Supprimés récemment ».") }
    }

    /// Glisser vers le bas pour fermer.
    var dismissDrag: some Gesture {
        DragGesture(minimumDistance: 25)
            .onChanged { v in if abs(v.translation.height) > abs(v.translation.width) * 1.5 { dragOffset = v.translation.height } }
            .onEnded { v in
                if abs(dragOffset) > 140 { dismiss() } else { withAnimation(.spring()) { dragOffset = 0 } }
            }
    }

    func topBar(_ item: MediaItem) -> some View {
        HStack {
            Button { dismiss() } label: {
                Image(systemName: "chevron.down").font(.headline).frame(width: 38, height: 38).background(.ultraThinMaterial, in: Circle())
            }
            Spacer()
            VStack(spacing: 1) {
                Text(FrenchDates.shortDay(item.captureDate) + " \(Calendar.vault.component(.year, from: item.captureDate))").font(.subheadline.weight(.semibold))
                Text(item.captureDate.formatted(date: .omitted, time: .shortened)).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button { showInfo = true } label: {
                Image(systemName: "info").font(.headline).frame(width: 38, height: 38).background(.ultraThinMaterial, in: Circle())
            }
        }
        .foregroundStyle(.white)
        .padding(.horizontal).padding(.top, 6)
    }

    func bottomBar(_ item: MediaItem) -> some View {
        HStack {
            barButton("square.and.arrow.up") { exporting = true }
            Spacer()
            barButton(item.isFavorite ? "heart.fill" : "heart") {
                Haptics.tap(); library.mutate { $0.setFavorite([item.id], !item.isFavorite) }
            }
            .foregroundStyle(item.isFavorite ? .red : .white)
            Spacer()
            barButton(item.kind == .photo ? "slider.horizontal.3" : "film.stack") {
                if item.kind == .photo { editing = item } else { videoEditing = VideoProjectFactory.make(from: [item], library: library) }
            }
            Spacer()
            barButton("rectangle.stack.badge.plus") { addToAlbum = true }
            Spacer()
            barButton("trash") { confirmDelete = true }
        }
        .padding(.horizontal, 28).padding(.vertical, 12)
        .background(.ultraThinMaterial)
        .foregroundStyle(.white)
    }

    func barButton(_ symbol: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: symbol).font(.system(size: 20)).frame(width: 44, height: 40) }
    }
}

/// Une page de la visionneuse.
struct MediaPage: View {
    @EnvironmentObject var library: MediaLibrary
    let item: MediaItem
    let isCurrent: Bool
    @Binding var zoomed: Bool
    let onTap: () -> Void
    @State private var image: UIImage?

    var body: some View {
        Group {
            if item.kind == .photo {
                ZStack {
                    if let img = image {
                        ZoomableImage(image: img, zoomed: $zoomed, onTap: onTap)
                    } else if let thumb = library.thumbnails.cached(item.id) {
                        Image(uiImage: thumb).resizable().scaledToFit()
                    } else {
                        ProgressView().tint(.white)
                    }
                }
                .task(id: "\(item.id)-\(item.modifiedDate.timeIntervalSince1970)") { await load() }
            } else {
                if isCurrent { EncryptedVideoPlayer(item: item) } else {
                    if let t = library.thumbnails.cached(item.id) { Image(uiImage: t).resizable().scaledToFit() }
                }
            }
        }
    }

    func load() async {
        guard let data = try? await library.displayData(item.id) else { return }
        let maxPixel = max(UIScreen.main.bounds.width, UIScreen.main.bounds.height) * UIScreen.main.scale * 2
        let img = await Task.detached { ImageDecoding.downsampled(data, maxPixel: maxPixel) }.value
        image = img
    }
}

/// Image zoomable (UIScrollView) : pincement, double-tapotement, déplacement.
struct ZoomableImage: UIViewRepresentable {
    let image: UIImage
    @Binding var zoomed: Bool
    let onTap: () -> Void

    func makeUIView(context: Context) -> UIScrollView {
        let sv = UIScrollView()
        sv.delegate = context.coordinator
        sv.maximumZoomScale = 6
        sv.minimumZoomScale = 1
        sv.showsHorizontalScrollIndicator = false
        sv.showsVerticalScrollIndicator = false
        sv.contentInsetAdjustmentBehavior = .never
        sv.backgroundColor = .clear
        let iv = UIImageView(image: image)
        iv.contentMode = .scaleAspectFit
        iv.translatesAutoresizingMaskIntoConstraints = false
        sv.addSubview(iv)
        NSLayoutConstraint.activate([
            iv.widthAnchor.constraint(equalTo: sv.frameLayoutGuide.widthAnchor),
            iv.heightAnchor.constraint(equalTo: sv.frameLayoutGuide.heightAnchor),
            iv.leadingAnchor.constraint(equalTo: sv.contentLayoutGuide.leadingAnchor),
            iv.trailingAnchor.constraint(equalTo: sv.contentLayoutGuide.trailingAnchor),
            iv.topAnchor.constraint(equalTo: sv.contentLayoutGuide.topAnchor),
            iv.bottomAnchor.constraint(equalTo: sv.contentLayoutGuide.bottomAnchor),
        ])
        context.coordinator.imageView = iv
        let double = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.doubleTap(_:)))
        double.numberOfTapsRequired = 2
        sv.addGestureRecognizer(double)
        let single = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.singleTap))
        single.require(toFail: double)
        sv.addGestureRecognizer(single)
        return sv
    }

    func updateUIView(_ sv: UIScrollView, context: Context) {
        context.coordinator.parent = self
        if context.coordinator.imageView?.image !== image { context.coordinator.imageView?.image = image }
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIScrollViewDelegate {
        var parent: ZoomableImage
        weak var imageView: UIImageView?
        init(_ p: ZoomableImage) { parent = p }

        func viewForZooming(in scrollView: UIScrollView) -> UIView? { imageView }

        func scrollViewDidZoom(_ sv: UIScrollView) {
            let z = sv.zoomScale > 1.01
            if z != parent.zoomed { DispatchQueue.main.async { self.parent.zoomed = z } }
        }

        @objc func doubleTap(_ g: UITapGestureRecognizer) {
            guard let sv = g.view as? UIScrollView else { return }
            if sv.zoomScale > 1.01 {
                sv.setZoomScale(1, animated: true)
            } else {
                let p = g.location(in: imageView)
                let s: CGFloat = 2.5
                let size = CGSize(width: sv.bounds.width / s, height: sv.bounds.height / s)
                sv.zoom(to: CGRect(x: p.x - size.width / 2, y: p.y - size.height / 2, width: size.width, height: size.height), animated: true)
            }
        }

        @objc func singleTap() { parent.onTap() }
    }
}

/// Lecteur vidéo lisant directement le fichier chiffré (aucune copie en clair).
struct EncryptedVideoPlayer: View {
    @EnvironmentObject var library: MediaLibrary
    let item: MediaItem
    @State private var player: AVPlayer?
    @State private var loader: EncryptedAssetLoader?
    @State private var failed = false

    var body: some View {
        ZStack {
            if let player {
                PlayerController(player: player)
                    .overlay(alignment: .bottom) { skipControls(player) }
            } else if failed {
                VStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle")
                    Text("Lecture impossible").font(.footnote)
                }.foregroundStyle(.white)
            } else {
                ProgressView().tint(.white)
            }
        }
        .task(id: item.id) { setup() }
        .onDisappear { player?.pause(); player = nil; loader = nil }
    }

    func setup() {
        do {
            let reader = try library.originalReader(item.id)
            let (asset, l) = EncryptedAssetLoader.asset(for: item, reader: reader)
            loader = l
            let p = AVPlayer(playerItem: AVPlayerItem(asset: asset))
            p.allowsExternalPlayback = false
            player = p
            p.play()
        } catch {
            failed = true
        }
    }

    func skipControls(_ p: AVPlayer) -> some View {
        HStack(spacing: 60) {
            Button { seek(p, by: -10) } label: { Image(systemName: "gobackward.10") }
            Button { seek(p, by: 10) } label: { Image(systemName: "goforward.10") }
        }
        .font(.title2).foregroundStyle(.white.opacity(0.9))
        .padding(.bottom, 130)
    }

    func seek(_ p: AVPlayer, by s: Double) {
        let t = CMTimeGetSeconds(p.currentTime()) + s
        p.seek(to: CMTime(seconds: max(0, t), preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
    }
}

/// AVPlayerViewController : lecture, pause, barre de progression, volume, plein écran, vitesse.
struct PlayerController: UIViewControllerRepresentable {
    let player: AVPlayer
    func makeUIViewController(context: Context) -> AVPlayerViewController {
        let vc = AVPlayerViewController()
        vc.player = player
        vc.allowsPictureInPicturePlayback = false   // évite l'affichage hors du coffre verrouillé
        vc.canStartPictureInPictureAutomaticallyFromInline = false
        vc.entersFullScreenWhenPlaybackBegins = false
        vc.videoGravity = .resizeAspect
        return vc
    }
    func updateUIViewController(_ vc: AVPlayerViewController, context: Context) {
        if vc.player !== player { vc.player = player }
    }
}
