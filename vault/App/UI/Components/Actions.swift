import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import ImageIO
import VaultCore

/// Barre d'actions de la sélection multiple.
struct SelectionActionBar: View {
    @EnvironmentObject var library: MediaLibrary
    @Binding var selection: Set<UUID>
    var currentAlbum: UUID? = nil
    var onDone: () -> Void
    @State private var addToAlbum = false
    @State private var moveFromAlbum = false
    @State private var exporting = false
    @State private var confirmDelete = false
    @State private var newProject: VideoProject?

    var ids: [UUID] { Array(selection) }
    var allFavorite: Bool { library.items(ids).allSatisfy(\.isFavorite) }

    var body: some View {
        HStack(spacing: 0) {
            action("square.and.arrow.up", "Exporter") { exporting = true }
            action("rectangle.stack.badge.plus", "Album") { addToAlbum = true }
            if currentAlbum != nil {
                action("arrow.right.square", "Déplacer") { moveFromAlbum = true }
            }
            action(allFavorite ? "heart.slash" : "heart", "Favori") {
                library.mutate { $0.setFavorite(ids, !allFavorite) }
            }
            Menu {
                if currentAlbum != nil {
                    Button { library.mutate { $0.remove(ids, from: currentAlbum!) }; onDone() } label: {
                        Label("Retirer de l'album", systemImage: "minus.circle")
                    }
                }
                let videos = library.items(ids).filter { $0.kind == .video }
                if !videos.isEmpty {
                    Button { newProject = VideoProjectFactory.make(from: videos, library: library) } label: {
                        Label("Créer un montage", systemImage: "film.stack")
                    }
                }
            } label: {
                VStack(spacing: 3) { Image(systemName: "ellipsis.circle").font(.system(size: 19)); Text("Plus").font(.caption2) }
                    .frame(maxWidth: .infinity)
            }
            action("trash", "Supprimer", role: .destructive) { confirmDelete = true }
        }
        .disabled(selection.isEmpty)
        .padding(.top, 8).padding(.bottom, 4)
        .background(.bar)
        .sheet(isPresented: $addToAlbum) {
            AlbumPickerSheet(title: "Ajouter à un album") { album in
                library.mutate { $0.add(ids, to: album.id) }
                Haptics.success(); onDone()
            }
        }
        .sheet(isPresented: $moveFromAlbum) {
            AlbumPickerSheet(title: "Déplacer vers…", excluding: currentAlbum) { album in
                if let from = currentAlbum { library.mutate { $0.move(ids, from: from, to: album.id) } }
                Haptics.success(); onDone()
            }
        }
        .sheet(isPresented: $exporting) { ExportSheet(ids: ids) }
        .fullScreenCover(item: $newProject) { p in VideoEditorView(project: p) }
        .confirmationDialog("Supprimer \(selection.count) élément(s) ?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Supprimer", role: .destructive) { library.moveToTrash(ids); onDone() }
        } message: {
            Text("Ils resteront 30 jours dans « Supprimés récemment ».")
        }
    }

    func action(_ symbol: String, _ label: String, role: ButtonRole? = nil, _ run: @escaping () -> Void) -> some View {
        Button(role: role, action: run) {
            VStack(spacing: 3) { Image(systemName: symbol).font(.system(size: 19)); Text(label).font(.caption2) }
                .frame(maxWidth: .infinity)
        }
        .foregroundStyle(role == .destructive ? Color.red : Color.accentColor)
    }
}

enum VideoProjectFactory {
    @MainActor static func make(from videos: [MediaItem], library: MediaLibrary) -> VideoProject {
        var p = VideoProject(name: "Montage du " + FrenchDates.shortDay(Date()))
        p.clips = videos.sorted { $0.captureDate < $1.captureDate }.map { VideoClip(mediaID: $0.id, sourceDuration: $0.duration ?? 0) }
        library.mutate { $0.projects[p.id] = p }
        return p
    }
}

/// Choix d'un album (avec création rapide).
struct AlbumPickerSheet: View {
    @EnvironmentObject var library: MediaLibrary
    @EnvironmentObject var session: VaultSession
    @Environment(\.dismiss) var dismiss
    let title: String
    var excluding: UUID? = nil
    let onPick: (Album) -> Void
    @State private var newName = ""

    var albums: [Album] {
        library.state.albums.values
            .filter { $0.kind == .album && $0.id != excluding && ($0.protection != .hidden || session.scope.revealHidden) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        TextField("Nouvel album", text: $newName)
                        Button("Créer") {
                            var created: Album?
                            library.mutate { created = $0.createAlbum(name: newName) }
                            if let created { onPick(created); dismiss() }
                        }
                        .disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
                Section {
                    ForEach(albums) { a in
                        Button {
                            Task {
                                if a.protection != .normal { guard await session.unlockAlbum(a) else { return } }
                                onPick(a); dismiss()
                            }
                        } label: {
                            HStack {
                                AlbumIcon(album: a, size: 34)
                                Text(a.name).foregroundStyle(.primary)
                                Spacer()
                                if a.protection != .normal { Image(systemName: "lock.fill").foregroundStyle(.secondary) }
                                Text("\(a.itemIDs.count)").foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }
}

struct AlbumIcon: View {
    let album: Album
    var size: CGFloat = 40
    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.24, style: .continuous)
            .fill(Color(hex: album.colorHex).gradient)
            .frame(width: size, height: size)
            .overlay(Image(systemName: album.kind == .folder ? "folder.fill" : album.symbol)
                .font(.system(size: size * 0.45, weight: .medium)).foregroundStyle(.white))
    }
}

/// Options d'export puis feuille de partage iOS (Photos, Fichiers, AirDrop…).
struct ExportSheet: View {
    @EnvironmentObject var library: MediaLibrary
    @EnvironmentObject var session: VaultSession
    @Environment(\.dismiss) var dismiss
    let ids: [UUID]
    @State private var options = ExportOptions()
    @State private var progress: Double?
    @State private var urls: [URL] = []
    @State private var sharing = false
    @State private var error: String?

    var hasEdited: Bool { library.items(ids).contains(where: \.isEdited) }
    var hasPhotos: Bool { library.items(ids).contains { $0.kind == .photo } }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Éléments", value: "\(ids.count)")
                    LabeledContent("Taille d'origine", value: ByteFormat.string(library.items(ids).reduce(0) { $0 + $1.fileSize }))
                }
                if hasEdited {
                    Picker("Version", selection: $options.useEdited) {
                        Text("Retouchée").tag(true); Text("Originale").tag(false)
                    }
                }
                if hasPhotos {
                    Picker("Format photo", selection: $options.photoFormat) {
                        ForEach(ExportOptions.PhotoFormat.allCases) { Text($0.label).tag($0) }
                    }
                }
                Section {
                    Toggle("Retirer la localisation", isOn: $options.stripLocation)
                } footer: {
                    Text("Les copies exportées sont déchiffrées temporairement puis effacées dès la fermeture du partage. Une fois partagées, elles ne sont plus protégées par VAULT.")
                }
                if let progress { ProgressView(value: progress) }
                if let error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle("Exporter")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Continuer") { Task { await prepare() } }.disabled(progress != nil)
                }
            }
            .sheet(isPresented: $sharing, onDismiss: {
                ExportService.cleanup(urls); urls = []; session.resumeAutoLock(); dismiss()
            }) {
                ShareSheet(items: urls)
            }
        }
        .presentationDetents([.medium, .large])
    }

    func prepare() async {
        progress = 0
        library.beginBusy("Préparation de l'export")
        defer { library.endBusy() }
        do {
            urls = try await ExportService.prepare(ids, library: library, options: options) { p in progress = p }
            session.suspendAutoLock()
            sharing = true
        } catch {
            self.error = error.localizedDescription
        }
        progress = nil
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

/// Export d'un fichier vers l'app Fichiers sans le charger en mémoire.
struct DocumentExporter: UIViewControllerRepresentable {
    let url: URL
    let onFinish: (Bool) -> Void
    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let vc = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
        vc.delegate = context.coordinator
        return vc
    }
    func updateUIViewController(_ vc: UIDocumentPickerViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(onFinish) }
    final class Coordinator: NSObject, UIDocumentPickerDelegate {
        let onFinish: (Bool) -> Void
        init(_ f: @escaping (Bool) -> Void) { onFinish = f }
        func documentPicker(_ c: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { onFinish(true) }
        func documentPickerWasCancelled(_ c: UIDocumentPickerViewController) { onFinish(false) }
    }
}

/// Appareil photo intégré : la prise de vue va directement dans le coffre, jamais dans la photothèque.
struct CameraPicker: UIViewControllerRepresentable {
    let onCapture: (URL?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let vc = UIImagePickerController()
        vc.sourceType = .camera
        vc.mediaTypes = [UTType.image.identifier, UTType.movie.identifier]
        vc.videoQuality = .typeHigh
        vc.videoMaximumDuration = 60 * 60
        vc.delegate = context.coordinator
        return vc
    }
    func updateUIViewController(_ vc: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(onCapture) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onCapture: (URL?) -> Void
        init(_ f: @escaping (URL?) -> Void) { onCapture = f }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let movie = info[.mediaURL] as? URL {
                let dst = SecureWorkspace.shared.newFile(ext: movie.pathExtension.isEmpty ? "mov" : movie.pathExtension, in: "camera")
                try? FileManager.default.moveItem(at: movie, to: dst)
                onCapture(dst)
            } else if let image = info[.originalImage] as? UIImage, let cg = image.cgImage {
                // Enregistre en HEIC avec les métadonnées de prise de vue (date, réglages).
                let dst = SecureWorkspace.shared.newFile(ext: "heic", in: "camera", name: "IMG_" + Date().formatted(.iso8601.year().month().day().time(includingFractionalSeconds: false)).replacingOccurrences(of: ":", with: ""))
                var props = (info[.mediaMetadata] as? [CFString: Any]) ?? [:]
                props[kCGImagePropertyOrientation] = CGImagePropertyOrientation(image.imageOrientation).rawValue
                if let dest = CGImageDestinationCreateWithURL(dst as CFURL, UTType.heic.identifier as CFString, 1, nil) {
                    props[kCGImageDestinationLossyCompressionQuality] = 0.9
                    CGImageDestinationAddImage(dest, cg, props as CFDictionary)
                    _ = CGImageDestinationFinalize(dest)
                }
                onCapture(dst)
            } else {
                onCapture(nil)
            }
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { onCapture(nil) }
    }
}

extension CGImagePropertyOrientation {
    init(_ o: UIImage.Orientation) {
        switch o {
        case .up: self = .up
        case .down: self = .down
        case .left: self = .left
        case .right: self = .right
        case .upMirrored: self = .upMirrored
        case .downMirrored: self = .downMirrored
        case .leftMirrored: self = .leftMirrored
        case .rightMirrored: self = .rightMirrored
        @unknown default: self = .up
        }
    }
}

/// Menu « + » : photothèque, Fichiers, appareil photo.
struct ImportMenu: ViewModifier {
    @EnvironmentObject var library: MediaLibrary
    @EnvironmentObject var session: VaultSession
    @Binding var isPresented: ImportKind?
    var albumID: UUID? = nil
    @State private var pickerItems: [PhotosPickerItem] = []

    enum ImportKind: Identifiable { case library, files, camera; var id: Self { self } }

    func body(content: Content) -> some View {
        content
            .photosPicker(isPresented: Binding(get: { isPresented == .library }, set: { if !$0 { isPresented = nil } }),
                          selection: $pickerItems, maxSelectionCount: nil, selectionBehavior: .ordered,
                          matching: .any(of: [.images, .videos, .screenshots, .panoramas]),
                          preferredItemEncoding: .current, photoLibrary: .shared())
            .onChange(of: pickerItems) { _, items in
                guard !items.isEmpty else { return }
                library.startImport(sources: items.map { .picker($0) }, into: albumID)
                pickerItems = []
            }
            .fileImporter(isPresented: Binding(get: { isPresented == .files }, set: { if !$0 { isPresented = nil } }),
                          allowedContentTypes: [.image, .movie, .video], allowsMultipleSelection: true) { result in
                if case .success(let urls) = result {
                    library.startImport(urls.map { ImportRequest(url: $0, originalName: $0.lastPathComponent, securityScoped: true) }, into: albumID)
                }
            }
            .fullScreenCover(isPresented: Binding(get: { isPresented == .camera }, set: { if !$0 { isPresented = nil } })) {
                CameraPicker { url in
                    isPresented = nil
                    if let url { library.startImport([ImportRequest(url: url, originalName: url.lastPathComponent, deleteSource: true)], into: albumID) }
                }
                .ignoresSafeArea()
            }
            .onChange(of: isPresented) { old, new in
                if new != nil && old == nil { session.suspendAutoLock() }
                if new == nil && old != nil { session.resumeAutoLock() }
            }
    }
}

extension View {
    func importMenu(_ kind: Binding<ImportMenu.ImportKind?>, albumID: UUID? = nil) -> some View {
        modifier(ImportMenu(isPresented: kind, albumID: albumID))
    }
}

struct ImportMenuButton: View {
    @Binding var kind: ImportMenu.ImportKind?
    var body: some View {
        Menu {
            Button { kind = .library } label: { Label("Depuis Photos", systemImage: "photo.on.rectangle") }
            Button { kind = .files } label: { Label("Depuis Fichiers", systemImage: "folder") }
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                Button { kind = .camera } label: { Label("Appareil photo", systemImage: "camera") }
            }
        } label: {
            Image(systemName: "plus")
        }
        .accessibilityLabel("Importer")
    }
}
