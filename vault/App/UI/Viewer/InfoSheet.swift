import SwiftUI
import MapKit
import VaultCore

/// Informations techniques d'un média, légende, albums, historique des retouches.
struct InfoSheet: View {
    @EnvironmentObject var library: MediaLibrary
    @EnvironmentObject var session: VaultSession
    @Environment(\.dismiss) var dismiss
    let itemID: UUID
    @State private var caption = ""
    @State private var showMap = false
    @State private var nearby: NearbyBox?
    @State private var viewer: ViewerContext?

    var item: MediaItem? { library.state.items[itemID] }

    var body: some View {
        NavigationStack {
            if let item {
                Form {
                    Section {
                        TextField("Ajouter une légende", text: $caption, axis: .vertical)
                            .onSubmit { save() }
                    }
                    Section("Prise de vue") {
                        row("Date", FrenchDates.dayTitle(item.captureDate))
                        row("Heure", item.captureDate.formatted(date: .omitted, time: .standard))
                        if let cam = item.cameraModel { row("Appareil", cam) }
                        row("Importé le", FrenchDates.shortDay(item.importDate) + " \(Calendar.vault.component(.year, from: item.importDate))")
                    }
                    Section("Fichier") {
                        row("Nom", item.originalFilename)
                        row("Format", Formats.displayName(item.format))
                        row("Taille", ByteFormat.string(item.fileSize))
                        row("Dimensions", "\(item.pixelWidth) × \(item.pixelHeight)")
                        row("Résolution", item.resolutionLabel)
                        if let d = item.duration { row("Durée", FrenchDates.duration(d)) }
                        if let c = item.videoCodec { row("Codec", c.uppercased()) }
                        if let f = item.frameRate, f > 0 { row("Images/s", String(format: "%.0f", f)) }
                        if let c = item.dominantColor { row("Couleur dominante", c.frenchName.capitalized) }
                        if !item.labels.filter({ $0 != "_" }).isEmpty {
                            row("Analyse locale", item.labels.filter { $0 != "_" }.prefix(5).map { $0.replacingOccurrences(of: "_", with: " ") }.joined(separator: ", "))
                        }
                        row("Chiffrement", "AES-256-GCM, clé dédiée")
                    }
                    if let loc = item.location {
                        Section {
                            row("Coordonnées", String(format: "%.4f, %.4f", loc.latitude, loc.longitude))
                            if showMap {
                                Map(initialPosition: .region(MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: loc.latitude, longitude: loc.longitude),
                                                                              span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05)))) {
                                    Marker("", coordinate: CLLocationCoordinate2D(latitude: loc.latitude, longitude: loc.longitude))
                                }
                                .frame(height: 180).clipShape(RoundedRectangle(cornerRadius: 10))
                            } else {
                                Button("Afficher la carte") { showMap = true }
                            }
                            Button("Photos prises au même endroit") { findNearby(loc) }
                            Button("Retirer la localisation", role: .destructive) {
                                library.mutate { $0.items[itemID]?.location = nil }
                            }
                        } header: { Text("Lieu") } footer: {
                            Text("La carte est chargée depuis les serveurs d'Apple Plans, qui reçoivent alors la zone affichée. Les coordonnées restent sinon uniquement dans votre coffre.")
                        }
                    }
                    let albums = library.state.albums(containing: itemID).filter { library.state.isAlbumAccessible($0, scope: session.scope) }
                    if !albums.isEmpty {
                        Section("Albums") {
                            ForEach(albums) { a in HStack { AlbumIcon(album: a, size: 26); Text(a.name) } }
                        }
                    }
                    if item.kind == .photo && (item.isEdited || !item.editHistory.isEmpty) {
                        Section("Historique des retouches") {
                            HStack {
                                Text("Version actuelle").bold()
                                Spacer()
                                Text(item.edit?.summary ?? "Original").font(.caption).foregroundStyle(.secondary)
                            }
                            ForEach(item.editHistory.reversed()) { v in
                                HStack {
                                    VStack(alignment: .leading) {
                                        Text(v.label)
                                        Text(v.date.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Button("Restaurer") { Task { await restore(v.recipe, label: "Restauration : \(v.label)") } }
                                        .font(.caption.weight(.semibold))
                                }
                            }
                            if item.isEdited {
                                Button("Revenir à l'original", role: .destructive) { Task { await restore(nil, label: "Retour à l'original") } }
                            }
                        }
                    }
                }
                .navigationTitle("Informations")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("OK") { save(); dismiss() } } }
                .onAppear { caption = item.caption }
                .sheet(item: $nearby) { box in
                    NavigationStack {
                        ScrollView {
                            MediaGrid(items: box.items, selection: .constant([]), selecting: false) { it in
                                let ids = box.items.map(\.id)
                                viewer = ViewerContext(ids: ids, index: ids.firstIndex(of: it.id) ?? 0)
                            }
                        }
                        .navigationTitle("Au même endroit (\(box.items.count))")
                        .navigationBarTitleDisplayMode(.inline)
                        .fullScreenCover(item: $viewer) { MediaViewer(context: $0) }
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    func row(_ k: String, _ v: String) -> some View {
        LabeledContent(k) { Text(v).multilineTextAlignment(.trailing).textSelection(.enabled) }
    }

    func save() {
        if caption != item?.caption { library.mutate { $0.items[itemID]?.caption = caption } }
    }

    func findNearby(_ loc: GeoPoint) {
        var q = SearchQuery()
        q.near = (loc, 1.0)
        nearby = NearbyBox(items: SearchEngine.search(q, state: library.state, scope: session.scope))
    }

    /// Restaure une version antérieure (ou l'original) en recalculant le rendu.
    func restore(_ recipe: EditRecipe?, label: String) async {
        guard let recipe, !recipe.isIdentity else {
            await library.saveEdit(itemID, recipe: nil, rendered: nil, thumbnail: nil, label: label)
            await library.regenerateThumbnail(itemID)
            return
        }
        library.beginBusy("Restauration de la version")
        defer { library.endBusy() }
        guard let data = try? await library.displayData(itemID, original: true),
              let ci = PhotoRenderer.ciImage(from: data) else { return }
        let (full, thumb) = await Task.detached {
            PhotoRenderer.shared.export(PhotoRenderer.shared.render(ci, recipe: recipe))
        }.value
        await library.saveEdit(itemID, recipe: recipe, rendered: full, thumbnail: thumb, label: label)
    }
}

struct NearbyBox: Identifiable {
    let id = UUID()
    let items: [MediaItem]
}
