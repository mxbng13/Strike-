import SwiftUI
import VaultCore

struct MainTabView: View {
    @EnvironmentObject var session: VaultSession
    @EnvironmentObject var library: MediaLibrary
    @StateObject private var sync = SyncService.shared
    @State private var tab: AppTab = .photos

    var body: some View {
        TabView(selection: $tab) {
            ForEach(library.preferences.tabOrder) { t in
                content(t)
                    .tabItem { Label(t.title, systemImage: t.symbol) }
                    .tag(t)
            }
        }
        .tint(Color(hex: library.preferences.accentHex))
        .preferredColorScheme(library.preferences.theme.colorScheme)
        .overlay(alignment: .top) {
            ActivityBanner()
                .animation(.spring(response: 0.4, dampingFraction: 0.85), value: library.importProgress != nil)
        }
        .alert("VAULT", isPresented: Binding(get: { library.errorMessage != nil }, set: { if !$0 { library.errorMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(library.errorMessage ?? "") }
        .sheet(item: $library.lastImportSummary) { summary in
            ImportSummaryView(summary: summary).presentationDetents([.medium])
        }
        .task {
            if sync.enabled && CloudConfig.isAvailable { await sync.syncNow(library: library, keyManager: session.keyManager) }
        }
        .onChange(of: library.revision) { _, _ in scheduleSync() }
    }

    @State private var syncDebounce: Task<Void, Never>?
    func scheduleSync() {
        guard sync.enabled, CloudConfig.isAvailable else { return }
        syncDebounce?.cancel()
        syncDebounce = Task {
            try? await Task.sleep(nanoseconds: 15_000_000_000)
            guard !Task.isCancelled else { return }
            await sync.syncNow(library: library, keyManager: session.keyManager)
        }
    }

    @ViewBuilder func content(_ t: AppTab) -> some View {
        switch t {
        case .photos: PhotosTabView()
        case .albums: AlbumsTabView()
        case .memories: MemoriesTabView()
        case .search: SearchTabView()
        case .settings: SettingsView()
        }
    }
}

struct ImportSummaryView: View {
    let summary: ImportProgress
    @Environment(\.dismiss) var dismiss
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Label("\(summary.imported) élément(s) chiffré(s) dans le coffre", systemImage: "lock.fill")
                    if summary.duplicates > 0 {
                        Label("\(summary.duplicates) doublon(s) ignoré(s)", systemImage: "square.on.square")
                    }
                }
                if !summary.failures.isEmpty {
                    Section("Échecs") {
                        ForEach(summary.failures, id: \.self) { Text($0).font(.footnote) }
                    }
                }
            }
            .navigationTitle("Import terminé")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("OK") { dismiss() } } }
        }
    }
}
