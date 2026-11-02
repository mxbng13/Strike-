import SwiftUI
import VaultCore

/// Onglet RECHERCHE : texte libre en français (dates, périodes, types, formats, couleurs, albums,
/// et contenu visuel si l'analyse locale est activée).
struct SearchTabView: View {
    @EnvironmentObject var library: MediaLibrary
    @EnvironmentObject var session: VaultSession
    @State private var text = ""
    @State private var results: [MediaItem] = []
    @State private var albums: [Album] = []
    @State private var chips: [String] = []
    @State private var viewer: ViewerContext?
    @State private var searchTask: Task<Void, Never>?
    @State private var consent = false

    var body: some View {
        NavigationStack {
            ScrollView {
                if text.trimmingCharacters(in: .whitespaces).isEmpty {
                    suggestions
                } else {
                    resultsView
                }
            }
            .navigationTitle("Recherche")
            .searchable(text: $text, placement: .navigationBarDrawer(displayMode: .always),
                        prompt: "« vidéos été 2025 », « chien », « HEIC rouge »…")
            .onChange(of: text) { _, _ in runSearch() }
            .onChange(of: library.revision) { _, _ in runSearch() }
            .onChange(of: session.scope) { _, _ in runSearch() }
            .fullScreenCover(item: $viewer) { MediaViewer(context: $0) }
            .sheet(isPresented: $consent) { VisualAnalysisConsent() }
        }
    }

    var suggestions: some View {
        VStack(alignment: .leading, spacing: 22) {
            let s = SearchEngine.suggestions(state: library.state, scope: session.scope)
            if !s.isEmpty {
                SectionHeader(title: "Suggestions")
                FlowChips(items: s) { text = $0 }
            }
            SectionHeader(title: "Exemples")
            FlowChips(items: ["Photos de 2024", "Vidéos", "Juillet 2025", "Hier", "Il y a 2 ans", "Été", "Favoris", "Captures d'écran",
                              "Panoramas", "HEIC", "MOV", "Bleu", "Volumineux", "Modifiés"]) { text = $0 }
            if !library.preferences.visualAnalysisEnabled {
                Button { consent = true } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "eye.trianglebadge.exclamationmark").font(.title2)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Recherche visuelle").font(.headline)
                            Text("Trouvez « chien », « plage » ou « paysage ». Désactivée par défaut : l'analyse se fait uniquement sur cet appareil, après votre accord.")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    .padding().frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
                }
                .buttonStyle(.plain)
            }
        }
        .padding()
    }

    var resultsView: some View {
        VStack(alignment: .leading, spacing: 14) {
            if !chips.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack { ForEach(chips, id: \.self) { c in Text(c).font(.caption.weight(.semibold)).padding(.horizontal, 10).padding(.vertical, 5).background(Capsule().fill(Color.accentColor.opacity(0.15))) } }
                        .padding(.horizontal)
                }
            }
            if !albums.isEmpty {
                SectionHeader(title: "Albums").padding(.horizontal)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(albums) { a in
                            VStack { AlbumIcon(album: a, size: 64); Text(a.name).font(.caption).lineLimit(1) }.frame(width: 80)
                        }
                    }
                    .padding(.horizontal)
                }
            }
            SectionHeader(title: "\(results.count) résultat(s)").padding(.horizontal)
            if results.isEmpty {
                Text("Aucun média ne correspond. Les contenus des albums protégés ne sont recherchés qu'une fois ces albums déverrouillés.")
                    .font(.footnote).foregroundStyle(.secondary).padding(.horizontal)
            } else {
                MediaGrid(items: results, selection: .constant([]), selecting: false) { item in
                    let ids = results.map(\.id)
                    viewer = ViewerContext(ids: ids, index: ids.firstIndex(of: item.id) ?? 0)
                }
            }
        }
        .padding(.vertical)
    }

    func runSearch() {
        searchTask?.cancel()
        let q = text, state = library.state, scope = session.scope, mem = library.memories
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 150_000_000)
            guard !Task.isCancelled else { return }
            let (r, a, c) = await Task.detached(priority: .userInitiated) { () -> ([MediaItem], [Album], [String]) in
                let (query, res) = SearchEngine.search(q, state: state, scope: scope, memories: mem)
                let albums = SearchEngine.albums(matching: q, state: state, scope: scope)
                return (res, albums, query.chips)
            }.value
            guard !Task.isCancelled else { return }
            results = r; albums = a; chips = c
        }
    }
}

/// Consentement explicite pour l'analyse visuelle locale.
struct VisualAnalysisConsent: View {
    @EnvironmentObject var library: MediaLibrary
    @Environment(\.dismiss) var dismiss
    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 18) {
                Image(systemName: "cpu").font(.system(size: 40, weight: .light))
                Text("Analyse visuelle sur l'appareil").font(.title2.bold())
                Text("VAULT peut reconnaître le contenu de vos photos (animaux, paysages, plage, nourriture…) grâce au framework Vision d'Apple, exécuté **localement** sur cet iPhone.")
                Text("• Aucune image n'est envoyée sur Internet.\n• Les étiquettes obtenues sont chiffrées dans l'index du coffre.\n• Vous pouvez désactiver l'analyse et effacer les étiquettes à tout moment dans Réglages.")
                    .font(.subheadline).foregroundStyle(.secondary)
                Spacer()
                Button {
                    library.updatePreferences { $0.visualAnalysisEnabled = true }
                    library.analyzeLibraryVisually()
                    dismiss()
                } label: {
                    Text("Activer l'analyse locale").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 14)
                        .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 14)).foregroundStyle(.white)
                }
                Button("Pas maintenant") { dismiss() }.frame(maxWidth: .infinity)
            }
            .padding(24)
        }
        .presentationDetents([.large])
    }
}

/// Pastilles qui passent à la ligne.
struct FlowChips: View {
    let items: [String]
    let onTap: (String) -> Void
    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(items, id: \.self) { s in
                Button(s) { onTap(s) }
                    .font(.subheadline).padding(.horizontal, 12).padding(.vertical, 7)
                    .background(Capsule().fill(Color(.secondarySystemBackground)))
                    .foregroundStyle(.primary)
            }
        }
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxW = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0, width: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > maxW && x > 0 { x = 0; y += rowH + spacing; rowH = 0 }
            x += s.width + spacing
            rowH = max(rowH, s.height)
            width = max(width, x)
        }
        return CGSize(width: min(width, maxW), height: y + rowH)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > bounds.maxX && x > bounds.minX { x = bounds.minX; y += rowH + spacing; rowH = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            rowH = max(rowH, s.height)
        }
    }
}
