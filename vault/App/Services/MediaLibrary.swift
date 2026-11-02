import SwiftUI
import Combine
import Photos
import PhotosUI
import AVFoundation
import ImageIO
import UniformTypeIdentifiers
import VaultCore

struct ImportProgress: Equatable {
    var total: Int
    var done = 0
    var current = ""
    var currentFraction = 0.0
    var imported = 0
    var duplicates = 0
    var failures: [String] = []
    var fraction: Double { total == 0 ? 1 : (Double(done) + currentFraction) / Double(total) }
}

/// Source d'import : fichier déjà disponible, ou élément du sélecteur Photos chargé au dernier moment
/// (un seul fichier temporaire à la fois sur le disque, même pour des centaines de vidéos).
enum ImportSource {
    case file(ImportRequest)
    case picker(PhotosPickerItem)
}

/// Une demande d'import (fichier en clair temporaire ou URL de l'app Fichiers).
struct ImportRequest: Sendable {
    var url: URL
    var originalName: String?
    var typeHint: String?
    var securityScoped = false
    /// Supprimer le fichier source après import (copies temporaires).
    var deleteSource = false
    /// Identifiant de la photothèque, pour récupérer date / lieu / sous-type et supprimer l'original sur demande.
    var assetIdentifier: String?
    var forcedDate: Date?
}

/// Bibliothèque déverrouillée : état en mémoire + persistance chiffrée + opérations sur les fichiers.
@MainActor
final class MediaLibrary: ObservableObject {
    @Published private(set) var state: LibraryState
    @Published var importProgress: ImportProgress?
    @Published var lastImportSummary: ImportProgress?
    @Published var activity: (label: String, progress: Double?)?
    @Published var errorMessage: String?
    @Published private(set) var memories: [Memory] = []
    @Published private(set) var revision = 0

    let layout: VaultLayout
    private let key: SymmetricKey
    weak var session: VaultSession?
    let thumbnails: ThumbnailCache
    private var hashes: Set<String>
    private var saveTask: Task<Void, Never>?
    private var memoryTask: Task<Void, Never>?
    private var importTask: Task<Void, Never>?
    private var busy = 0

    init(layout: VaultLayout, key: SymmetricKey, session: VaultSession) throws {
        self.layout = layout
        self.key = key
        self.session = session
        let loaded = try LibraryStore.load(layout: layout, key: key)
        state = loaded
        hashes = Set(loaded.items.values.map(\.sha256))
        thumbnails = ThumbnailCache(layout: layout, key: key)
    }

    var isBusy: Bool { importProgress != nil || busy > 0 }
    var scope: AccessScope { session?.scope ?? .locked }
    var preferences: VaultPreferences { state.preferences }

    func didUnlock() {
        let expired = state.expiredTrash(now: Date())
        if !expired.isEmpty { purgeForever(expired) }
        ensureInboxKey()
        processInbox()
        regenerateMemories()
    }

    func willLock() {
        importTask?.cancel()
        saveTask?.cancel()
        try? LibraryStore.save(state, layout: layout, key: key)
        thumbnails.purge()
        memories = []
    }

    // MARK: Mutations & persistance

    func mutate(_ body: (inout LibraryState) -> Void) {
        body(&state)
        revision += 1
        scheduleSave()
    }

    func updatePreferences(_ body: (inout VaultPreferences) -> Void) {
        mutate { body(&$0.preferences) }
    }

    private func scheduleSave() {
        saveTask?.cancel()
        let snapshot = state, layout = layout, key = key
        saveTask = Task.detached(priority: .utility) {
            try? await Task.sleep(nanoseconds: 500_000_000)
            guard !Task.isCancelled else { return }
            do { try LibraryStore.save(snapshot, layout: layout, key: key) }
            catch { await MainActor.run { self.errorMessage = "Échec de l'enregistrement : \(error.localizedDescription)" } }
        }
        scheduleMemories()
    }

    func saveNow() {
        saveTask?.cancel()
        try? LibraryStore.save(state, layout: layout, key: key)
    }

    // MARK: Requêtes (filtrées par la portée d'accès de la session)

    func visibleItems() -> [MediaItem] { state.visibleItems(scope: scope) }

    func items(_ ids: [UUID]) -> [MediaItem] { ids.compactMap { state.items[$0] } }

    func isVisible(_ id: UUID) -> Bool { state.isItemVisible(id, scope: scope) }

    // MARK: Souvenirs

    private func scheduleMemories() {
        memoryTask?.cancel()
        memoryTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            guard !Task.isCancelled else { return }
            self?.regenerateMemories()
        }
    }

    func regenerateMemories() {
        let items = visibleItems()
        let overrides = state.memoryOverrides
        let birthdays = state.preferences.birthdays
        Task.detached(priority: .utility) {
            let gen = MemoryGenerator(birthdays: birthdays)
            let result = gen.generate(items, overrides: overrides)
            await MainActor.run { self.memories = result }
        }
    }

    func overrideMemory(_ id: UUID, _ body: (inout MemoryOverride) -> Void) {
        mutate { s in
            var o = s.memoryOverrides[id] ?? MemoryOverride()
            body(&o)
            s.memoryOverrides[id] = o
        }
    }

    // MARK: Import

    func startImport(_ requests: [ImportRequest], into albumID: UUID? = nil) {
        startImport(sources: requests.map { .file($0) }, into: albumID)
    }

    func startImport(sources requests: [ImportSource], into albumID: UUID? = nil) {
        guard !requests.isEmpty else { return }
        if importProgress != nil {
            // File d'attente simple : on enchaîne après l'import courant.
            let previous = importTask
            importTask = Task { [weak self] in
                await previous?.value
                await self?.runImport(requests, albumID: albumID)
            }
            return
        }
        importTask = Task { [weak self] in await self?.runImport(requests, albumID: albumID) }
    }

    private func runImport(_ requests: [ImportSource], albumID: UUID?) async {
        importProgress = ImportProgress(total: requests.count)
        var importedIDs: [UUID] = []
        var assetsToDelete: [String] = []
        let prefs = state.preferences
        for source in requests {
            if Task.isCancelled { break }
            importProgress?.currentFraction = 0
            var req: ImportRequest
            switch source {
            case .file(let r): req = r
            case .picker(let p):
                importProgress?.current = "Préparation…"
                do {
                    guard let picked = try await p.loadTransferable(type: PickedMedia.self) else { throw ImportError.unreadable("élément de la photothèque") }
                    req = ImportRequest(url: picked.url, originalName: picked.url.lastPathComponent,
                                        typeHint: p.supportedContentTypes.first?.identifier, deleteSource: true,
                                        assetIdentifier: p.itemIdentifier)
                } catch {
                    importProgress?.failures.append(error.localizedDescription)
                    importProgress?.done += 1
                    continue
                }
            }
            importProgress?.current = req.originalName ?? req.url.lastPathComponent
            do {
                let item = try await importOne(req, prefs: prefs)
                if let item {
                    importedIDs.append(item.id)
                    importProgress?.imported += 1
                    if let a = req.assetIdentifier { assetsToDelete.append(a) }
                } else {
                    importProgress?.duplicates += 1
                }
            } catch {
                importProgress?.failures.append("\(req.originalName ?? req.url.lastPathComponent) : \(error.localizedDescription)")
            }
            if req.deleteSource { try? FileManager.default.removeItem(at: req.url) }
            importProgress?.done += 1
        }
        if let albumID, !importedIDs.isEmpty { mutate { $0.add(importedIDs, to: albumID) } }
        saveNow()
        if let p = importProgress, !p.failures.isEmpty || p.duplicates > 0 { lastImportSummary = p }
        let finished = importProgress
        importProgress = nil
        if prefs.deleteFromLibraryAfterImport, !assetsToDelete.isEmpty { await deleteFromPhotoLibrary(assetsToDelete) }
        NotificationService.notifyIfBackground(title: "Import terminé",
                                               body: "\(finished?.imported ?? 0) élément(s) mis à l'abri.",
                                               hidePreview: state.preferences.hideNotificationPreviews)
    }

    /// Renvoie nil si doublon ignoré.
    private func importOne(_ req: ImportRequest, prefs: VaultPreferences) async throws -> MediaItem? {
        let scoped = req.securityScoped && req.url.startAccessingSecurityScopedResource()
        defer { if scoped { req.url.stopAccessingSecurityScopedResource() } }
        let meta = try await MediaMetadataExtractor.extract(url: req.url, typeHint: req.typeHint, analyzeVisually: prefs.visualAnalysisEnabled)
        let assetInfo = req.assetIdentifier.flatMap(Self.assetInfo)
        let layout = layout, key = key, snapshotHashes = hashes, skip = prefs.skipDuplicatesOnImport
        let totalSize = Double((try? FileManager.default.attributesOfItem(atPath: req.url.path)[.size] as? NSNumber)?.int64Value ?? 0)
        // Chiffrement en flux hors du fil principal, avec progression.
        let result: (UUID, String, Int64) = try await Task.detached(priority: .userInitiated) {
            let id = UUID()
            let dest = layout.original(id)
            var lastReport = Date.distantPast
            let r = try EncryptedFile.encryptFile(from: req.url, to: dest, kind: .original, fileID: id, wrappingKey: key) { bytes in
                guard totalSize > 0, Date().timeIntervalSince(lastReport) > 0.1 else { return }
                lastReport = Date()
                let f = Double(bytes) / totalSize
                Task { @MainActor in self.importProgress?.currentFraction = f }
            }
            if let thumb = meta.thumbnailJPEG {
                try EncryptedFile.encrypt(thumb, to: layout.thumbnail(id), kind: .thumbnail, fileID: id, wrappingKey: key)
            }
            return (id, r.sha256Hex, r.plaintextSize)
        }.value
        let (id, sha, size) = result
        if skip && snapshotHashes.contains(sha) {
            layout.deleteFiles(for: id)
            return nil
        }
        var item = MediaItem(id: id, kind: meta.kind, originalFilename: req.originalName ?? req.url.lastPathComponent,
                             typeIdentifier: meta.typeIdentifier, format: meta.format, fileSize: size,
                             pixelWidth: meta.width, pixelHeight: meta.height, duration: meta.duration,
                             captureDate: req.forcedDate ?? assetInfo?.date ?? meta.captureDate ?? Self.fileDate(req.url) ?? Date(),
                             location: prefs.keepLocation ? (assetInfo?.location ?? meta.location) : nil, sha256: sha)
        item.videoCodec = meta.codec
        item.frameRate = meta.frameRate
        item.cameraModel = meta.cameraModel
        item.isScreenshot = meta.isScreenshot || (assetInfo?.screenshot ?? false)
        item.isPanorama = item.isPanorama || (assetInfo?.panorama ?? false)
        item.isFavorite = assetInfo?.favorite ?? false
        item.perceptualHash = meta.perceptualHash
        item.blurScore = meta.blurScore
        item.dominantColor = meta.dominantColor
        item.labels = meta.labels
        hashes.insert(sha)
        mutate { $0.insert(item) }
        return item
    }

    static func fileDate(_ url: URL) -> Date? {
        (try? url.resourceValues(forKeys: [.creationDateKey]))?.creationDate
    }

    struct AssetInfo { var date: Date?; var location: GeoPoint?; var screenshot: Bool; var panorama: Bool; var favorite: Bool }

    /// Métadonnées de la photothèque (date, lieu, sous-type) si l'utilisateur y a donné accès.
    nonisolated static func assetInfo(_ identifier: String) -> AssetInfo? {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard status == .authorized || status == .limited else { return nil }
        guard let a = PHAsset.fetchAssets(withLocalIdentifiers: [identifier], options: nil).firstObject else { return nil }
        return AssetInfo(date: a.creationDate,
                         location: a.location.map { GeoPoint(latitude: $0.coordinate.latitude, longitude: $0.coordinate.longitude) },
                         screenshot: a.mediaSubtypes.contains(.photoScreenshot),
                         panorama: a.mediaSubtypes.contains(.photoPanorama),
                         favorite: a.isFavorite)
    }

    /// Supprime les originaux de la photothèque (iOS demande une confirmation explicite).
    private func deleteFromPhotoLibrary(_ ids: [String]) async {
        let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
        guard status == .authorized || status == .limited else { return }
        let assets = PHAsset.fetchAssets(withLocalIdentifiers: ids, options: nil)
        try? await PHPhotoLibrary.shared().performChanges { PHAssetChangeRequest.deleteAssets(assets) }
    }

    func cancelImport() { importTask?.cancel() }

    // MARK: Boîte de dépôt (extension de partage)

    private var inboxPrivateKey: Curve25519.KeyAgreement.PrivateKey? {
        guard let d = try? EncryptedFile.decrypt(layout.inboxKey, wrappingKey: key) else { return nil }
        return try? Curve25519.KeyAgreement.PrivateKey(rawRepresentation: d)
    }

    private func ensureInboxKey() {
        if let k = inboxPrivateKey {
            if AppGroup.readInboxPublicKey()?.rawRepresentation != k.publicKey.rawRepresentation { AppGroup.writeInboxPublicKey(k.publicKey) }
            return
        }
        let k = Curve25519.KeyAgreement.PrivateKey()
        do {
            try EncryptedFile.encrypt(k.rawRepresentation, to: layout.inboxKey, kind: .other, wrappingKey: key)
            AppGroup.writeInboxPublicKey(k.publicKey)
        } catch {
            errorMessage = "Extension de partage indisponible : \(error.localizedDescription)"
        }
    }

    func processInbox() {
        guard let dir = AppGroup.inboxDirectory, let priv = inboxPrivateKey else { return }
        let pending = InboxSealer.pending(in: dir)
        guard !pending.isEmpty else { return }
        var requests: [ImportRequest] = []
        for p in pending {
            do {
                let (wrap, meta) = try InboxSealer.open(p, privateKey: priv)
                let ext = (meta.originalFilename as NSString).pathExtension
                let tmp = SecureWorkspace.shared.newFile(ext: ext.isEmpty ? (UTType(meta.typeIdentifier)?.preferredFilenameExtension ?? "") : ext, in: "inbox")
                try EncryptedFile.decryptFile(p.paths.payload, to: tmp, wrappingKey: wrap)
                requests.append(ImportRequest(url: tmp, originalName: meta.originalFilename, typeHint: meta.typeIdentifier, deleteSource: true))
            } catch {
                errorMessage = "Un élément partagé n'a pas pu être ouvert."
            }
            InboxSealer.remove(p)
        }
        startImport(requests)
    }

    // MARK: Suppression

    func moveToTrash(_ ids: [UUID]) { mutate { $0.moveToTrash(ids) } }
    func restore(_ ids: [UUID]) { mutate { $0.restoreFromTrash(ids) } }

    /// Suppression définitive : fichiers chiffrés (et donc leurs clés) effacés.
    func purgeForever(_ ids: [UUID]) {
        for id in ids { layout.deleteFiles(for: id); thumbnails.remove(id) }
        let removedHashes = ids.compactMap { state.items[$0]?.sha256 }
        mutate { $0.purge(ids) }
        for h in removedHashes where !state.items.values.contains(where: { $0.sha256 == h }) { hashes.remove(h) }
    }

    var trashedItems: [MediaItem] {
        state.trash.sorted { $0.value > $1.value }.compactMap { state.items[$0.key] }
    }

    // MARK: Accès au contenu déchiffré

    func originalReader(_ id: UUID) throws -> EncryptedFile.Reader {
        try EncryptedFile.Reader(url: layout.original(id), wrappingKey: key)
    }

    /// Données d'affichage d'une photo : rendu retouché s'il existe, sinon l'original.
    func displayData(_ id: UUID, original: Bool = false) async throws -> Data {
        let layout = layout, key = key
        let hasRender = !original && state.items[id]?.isEdited == true && FileManager.default.fileExists(atPath: layout.render(id).path)
        return try await Task.detached(priority: .userInitiated) {
            try EncryptedFile.decrypt(hasRender ? layout.render(id) : layout.original(id), wrappingKey: key)
        }.value
    }

    /// Copie en clair dans l'espace de travail protégé (montage, export). À supprimer après usage.
    func decryptToWorkspace(_ id: UUID, edited: Bool = false, dir: String = "tmp") async throws -> URL {
        guard let item = state.items[id] else { throw ImportError.unreadable(id.uuidString) }
        let layout = layout, key = key
        let useRender = edited && item.isEdited && FileManager.default.fileExists(atPath: layout.render(id).path)
        let ext = useRender ? (item.kind == .photo ? "heic" : item.format) : (item.format.isEmpty ? "bin" : item.format)
        let base = (item.originalFilename as NSString).deletingPathExtension
        let out = SecureWorkspace.shared.newFile(ext: ext, in: dir + "/" + UUID().uuidString, name: base.isEmpty ? id.uuidString : base)
        try await Task.detached(priority: .userInitiated) {
            try EncryptedFile.decryptFile(useRender ? layout.render(id) : layout.original(id), to: out, wrappingKey: key)
        }.value
        return out
    }

    // MARK: Retouches

    /// Enregistre une retouche : rendu chiffré + nouvelle miniature + historique. L'original reste intact.
    func saveEdit(_ id: UUID, recipe: EditRecipe?, rendered: Data?, thumbnail: Data?, label: String) async {
        let layout = layout, key = key
        do {
            try await Task.detached {
                if let rendered { try EncryptedFile.encrypt(rendered, to: layout.render(id), kind: .render, fileID: id, wrappingKey: key) }
                else { try? FileManager.default.removeItem(at: layout.render(id)) }
                if let thumbnail { try EncryptedFile.encrypt(thumbnail, to: layout.thumbnail(id), kind: .thumbnail, fileID: id, wrappingKey: key) }
            }.value
            thumbnails.remove(id)
            mutate { s in s.items[id]?.applyEdit(recipe?.isIdentity == true ? nil : recipe, label: label) }
        } catch {
            errorMessage = "Impossible d'enregistrer la retouche : \(error.localizedDescription)"
        }
    }

    /// Régénère la miniature d'origine (après « Revenir à l'original »).
    func regenerateThumbnail(_ id: UUID) async {
        guard let url = try? await decryptToWorkspace(id) else { return }
        defer { SecureWorkspace.shared.remove(url.deletingLastPathComponent()) }
        if let meta = try? await MediaMetadataExtractor.extract(url: url, typeHint: state.items[id]?.typeIdentifier, analyzeVisually: false),
           let t = meta.thumbnailJPEG {
            try? EncryptedFile.encrypt(t, to: layout.thumbnail(id), kind: .thumbnail, fileID: id, wrappingKey: key)
            thumbnails.remove(id)
            revision += 1
        }
    }

    // MARK: Audio (musique du montage)

    func importAudio(_ url: URL) async throws -> MusicTrack {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let asset = AVURLAsset(url: url)
        let duration = try await asset.load(.duration).seconds
        let id = UUID()
        let layout = layout, key = key
        try await Task.detached { _ = try EncryptedFile.encryptFile(from: url, to: layout.audioFile(id), kind: .audio, fileID: id, wrappingKey: key) }.value
        return MusicTrack(audioID: id, title: url.deletingPathExtension().lastPathComponent, sourceDuration: duration)
    }

    func decryptAudio(_ id: UUID) async throws -> URL {
        let out = SecureWorkspace.shared.newFile(ext: "m4a", in: "audio")
        let layout = layout, key = key
        try await Task.detached { try EncryptedFile.decryptFile(layout.audioFile(id), to: out, wrappingKey: key) }.value
        return out
    }

    /// Ajoute au coffre un fichier produit par l'app (export de montage, vidéo souvenir).
    func importGenerated(_ url: URL, name: String, date: Date = Date()) async -> UUID? {
        let before = Set(state.items.keys)
        startImport([ImportRequest(url: url, originalName: name, deleteSource: true, forcedDate: date)])
        await importTask?.value
        return Set(state.items.keys).subtracting(before).first
    }

    // MARK: Analyse visuelle de la bibliothèque existante (opt-in)

    func analyzeLibraryVisually() {
        let targets = state.items.values.filter { $0.labels.isEmpty }.map(\.id)
        guard !targets.isEmpty else { return }
        busy += 1
        activity = ("Analyse visuelle locale", 0)
        let layout = layout, key = key
        Task {
            var done = 0
            for chunk in stride(from: 0, to: targets.count, by: 20).map({ Array(targets[$0..<min($0 + 20, targets.count)]) }) {
                guard state.preferences.visualAnalysisEnabled else { break }
                let results: [(UUID, [String])] = await Task.detached(priority: .utility) {
                    chunk.compactMap { id in
                        guard let d = try? EncryptedFile.decrypt(layout.thumbnail(id), wrappingKey: key),
                              let src = CGImageSourceCreateWithData(d as CFData, nil),
                              let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { return nil }
                        return (id, VisualClassifier.labels(for: img))
                    }
                }.value
                mutate { s in for (id, l) in results { s.items[id]?.labels = l.isEmpty ? ["_"] : l } }
                done += chunk.count
                activity = ("Analyse visuelle locale", Double(done) / Double(targets.count))
            }
            activity = nil
            busy -= 1
        }
    }

    func clearVisualLabels() {
        mutate { s in for id in s.items.keys { s.items[id]?.labels = [] } }
    }

    func beginBusy(_ label: String) { busy += 1; activity = (label, nil) }
    func endBusy() { busy = max(0, busy - 1); if busy == 0 { activity = nil } }

    var masterKeyForServices: SymmetricKey { key }
}

/// Fichier livré par le sélecteur Photos, copié dans l'espace de travail protégé, au format d'origine (HEIC, HEVC…).
struct PickedMedia: Transferable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(importedContentType: .movie) { received in try copy(received.file) }
        FileRepresentation(importedContentType: .image) { received in try copy(received.file) }
    }

    static func copy(_ src: URL) throws -> PickedMedia {
        let name = src.deletingPathExtension().lastPathComponent
        let dst = SecureWorkspace.shared.newFile(ext: src.pathExtension, in: "picker/" + UUID().uuidString, name: name)
        try FileManager.default.copyItem(at: src, to: dst)
        return PickedMedia(url: dst)
    }
}
