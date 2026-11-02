import SwiftUI
import VaultCore

/// Onglet PHOTOS : galerie chronologique (années, mois, jours, tout), filtres et sélection multiple.
struct PhotosTabView: View {
    @EnvironmentObject var library: MediaLibrary
    @EnvironmentObject var session: VaultSession
    @State private var granularity: LibraryState.TimelineGranularity = .all
    @State private var filter: KindFilter = .all
    @State private var selecting = false
    @State private var selection: Set<UUID> = []
    @State private var viewer: ViewerContext?
    @State private var importKind: ImportMenu.ImportKind?
    @State private var scrollTarget: String?

    enum KindFilter: String, CaseIterable, Identifiable {
        case all = "Tout", photos = "Photos", videos = "Vidéos", favorites = "Favoris"
        var id: String { rawValue }
    }

    var items: [MediaItem] {
        let v = library.visibleItems()
        switch filter {
        case .all: return v
        case .photos: return v.filter { $0.kind == .photo }
        case .videos: return v.filter { $0.kind == .video }
        case .favorites: return v.filter(\.isFavorite)
        }
    }

    var body: some View {
        NavigationStack {
            let current = items
            let sections = LibraryState.timeline(current, granularity: granularity == .all ? .days : granularity)
            ScrollViewReader { proxy in
                ScrollView {
                    if current.isEmpty {
                        EmptyStateView(symbol: "lock.square.stack", title: "Votre coffre est vide",
                                       message: "Touchez + pour importer des photos et vidéos depuis Photos, Fichiers ou l'appareil photo. Tout est chiffré sur cet appareil.")
                            .padding(.top, 80)
                    } else {
                        switch granularity {
                        case .years: yearCards(sections, proxy: proxy)
                        case .months: monthCards(sections)
                        case .days: daySections(sections)
                        case .all:
                            header
                            MediaGrid(items: sections.flatMap(\.items), selection: $selection, selecting: selecting) { open($0, in: current) }
                        }
                    }
                    Color.clear.frame(height: 90)
                }
                .pinchToResizeGrid()
                .onChange(of: scrollTarget) { _, t in
                    guard let t else { return }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { withAnimation { proxy.scrollTo(t, anchor: .top) } }
                    scrollTarget = nil
                }
            }
            .navigationTitle(selecting ? "\(selection.count) sélectionné(s)" : "Photos")
            .navigationBarTitleDisplayMode(selecting ? .inline : .large)
            .toolbar { toolbar }
            .safeAreaInset(edge: .bottom) {
                if selecting {
                    SelectionActionBar(selection: $selection) { endSelection() }
                } else if !current.isEmpty {
                    Picker("Affichage", selection: $granularity.animation(.spring(response: 0.35))) {
                        ForEach(LibraryState.TimelineGranularity.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .padding(6)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(.horizontal, 40).padding(.bottom, 8)
                }
            }
            .importMenu($importKind)
            .fullScreenCover(item: $viewer) { ctx in MediaViewer(context: ctx) }
        }
    }

    var header: some View {
        let s = LibraryStatistics(state: library.state, scope: session.scope)
        return HStack {
            Text(FrenchDates.countLabel(photos: s.photoCount, videos: s.videoCount))
            Spacer()
            if library.preferences.discreetMode { Label("Discret", systemImage: "eye.slash").labelStyle(.iconOnly) }
        }
        .font(.footnote).foregroundStyle(.secondary).padding(.horizontal).padding(.bottom, 4)
    }

    @ToolbarContentBuilder var toolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarTrailing) {
            if selecting {
                Button(selection.count == items.count ? "Aucun" : "Tout") {
                    selection = selection.count == items.count ? [] : Set(items.map(\.id))
                }
                Button("OK") { endSelection() }.bold()
            } else {
                Menu {
                    Picker("Filtre", selection: $filter) {
                        ForEach(KindFilter.allCases) { Text($0.rawValue).tag($0) }
                    }
                    Divider()
                    Button {
                        library.updatePreferences { $0.discreetMode.toggle() }
                    } label: {
                        Label(library.preferences.discreetMode ? "Quitter le mode discret" : "Mode discret",
                              systemImage: library.preferences.discreetMode ? "eye" : "eye.slash")
                    }
                    Menu("Taille de la grille") {
                        ForEach(2...7, id: \.self) { n in
                            Button("\(n) colonnes") { library.updatePreferences { $0.gridColumns = n } }
                        }
                    }
                    Button { session.lock() } label: { Label("Verrouiller maintenant", systemImage: "lock") }
                } label: {
                    Image(systemName: filter == .all ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill")
                }
                Button("Sélect.") { withAnimation { selecting = true } }
                ImportMenuButton(kind: $importKind)
            }
        }
    }

    func endSelection() { withAnimation { selecting = false; selection = [] } }

    func open(_ item: MediaItem, in list: [MediaItem]) {
        let ordered = list.sorted { $0.captureDate > $1.captureDate }.map(\.id)
        viewer = ViewerContext(ids: ordered, index: ordered.firstIndex(of: item.id) ?? 0)
    }

    // MARK: Vues par période

    func yearCards(_ sections: [LibraryState.TimelineSection], proxy: ScrollViewProxy) -> some View {
        LazyVStack(spacing: 16) {
            ForEach(sections) { s in
                Button {
                    withAnimation(.spring(response: 0.35)) { granularity = .months }
                    scrollTarget = monthKey(for: s.start)
                } label: {
                    PeriodCard(item: keyItem(s.items), title: s.title, subtitle: s.subtitle, height: 230)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal)
    }

    func monthCards(_ sections: [LibraryState.TimelineSection]) -> some View {
        LazyVStack(spacing: 14) {
            ForEach(sections) { s in
                Button {
                    withAnimation(.spring(response: 0.35)) { granularity = .days }
                    scrollTarget = firstDayKey(in: s)
                } label: {
                    PeriodCard(item: keyItem(s.items), title: s.title, subtitle: s.subtitle, height: 180)
                }
                .buttonStyle(.plain)
                .id(s.id)
            }
        }
        .padding(.horizontal)
    }

    func daySections(_ sections: [LibraryState.TimelineSection]) -> some View {
        LazyVStack(alignment: .leading, spacing: 6, pinnedViews: [.sectionHeaders]) {
            ForEach(sections) { s in
                Section {
                    MediaGrid(items: s.items, selection: $selection, selecting: selecting) { open($0, in: items) }
                        .padding(.bottom, 14)
                } header: {
                    HStack(alignment: .firstTextBaseline) {
                        Text(s.title).font(.headline)
                        Spacer()
                        Text(s.subtitle).font(.caption).foregroundStyle(.secondary)
                        if selecting {
                            Button("Tout") { selection.formUnion(s.items.map(\.id)) }.font(.caption.weight(.semibold))
                        }
                    }
                    .padding(.horizontal).padding(.vertical, 8)
                    .background(.bar)
                }
                .id(s.id)
            }
        }
    }

    func keyItem(_ items: [MediaItem]) -> MediaItem? {
        items.first(where: \.isFavorite) ?? items.first(where: { $0.kind == .photo && !$0.isScreenshot }) ?? items.first
    }

    func monthKey(for d: Date) -> String {
        let c = Calendar.vault.dateComponents([.year, .month], from: d)
        // Premier mois disponible de l'année (les sections sont triées du plus récent au plus ancien).
        let months = LibraryState.timeline(items, granularity: .months).filter { Calendar.vault.component(.year, from: $0.start) == c.year }
        return months.first?.id ?? "\(c.year!)-\(c.month!)"
    }

    func firstDayKey(in month: LibraryState.TimelineSection) -> String {
        guard let first = month.items.first else { return month.id }
        let c = Calendar.vault.dateComponents([.year, .month, .day], from: first.captureDate)
        return "\(c.year!)-\(c.month!)-\(c.day!)"
    }
}

/// Grande carte d'une période (année / mois), façon Photos.
struct PeriodCard: View {
    let item: MediaItem?
    let title: String
    let subtitle: String
    var height: CGFloat

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            if let item {
                Color.clear.frame(height: height).overlay(ThumbnailView(item: item, showBadges: false))
            } else {
                Rectangle().fill(.quaternary).frame(height: height)
            }
            LinearGradient(colors: [.clear, .black.opacity(0.55)], startPoint: .center, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 28, weight: .bold, design: .serif))
                Text(subtitle).font(.footnote.weight(.medium)).opacity(0.85)
            }
            .foregroundStyle(.white).padding(16)
        }
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 18))
    }
}
