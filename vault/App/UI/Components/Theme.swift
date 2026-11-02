import SwiftUI
import VaultCore

extension Color {
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        let v = UInt32(s, radix: 16) ?? 0x8E8E93
        self.init(red: Double((v >> 16) & 255) / 255, green: Double((v >> 8) & 255) / 255, blue: Double(v & 255) / 255)
    }
}

extension VaultPreferences.ThemePreference {
    var colorScheme: ColorScheme? {
        switch self { case .system: return nil; case .light: return .light; case .dark: return .dark }
    }
}

enum Haptics {
    static func tap() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    static func error() { UINotificationFeedbackGenerator().notificationOccurred(.error) }
    static func selection() { UISelectionFeedbackGenerator().selectionChanged() }
}

/// Effet de secousse (code incorrect).
struct Shake: GeometryEffect {
    var amount: CGFloat = 10
    var shakes: CGFloat = 4
    var animatableData: CGFloat
    func effectValue(size: CGSize) -> ProjectionTransform {
        ProjectionTransform(CGAffineTransform(translationX: amount * sin(animatableData * .pi * shakes), y: 0))
    }
}

struct SectionHeader: View {
    let title: String
    var subtitle: String = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.system(.title3, design: .default, weight: .bold))
            if !subtitle.isEmpty { Text(subtitle).font(.subheadline).foregroundStyle(.secondary) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct EmptyStateView: View {
    let symbol: String
    let title: String
    let message: String
    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: symbol)
        } description: {
            Text(message)
        }
    }
}

/// Bandeau de progression (imports, exports, analyses).
struct ActivityBanner: View {
    @EnvironmentObject var library: MediaLibrary
    var body: some View {
        if let p = library.importProgress {
            banner(title: "Import \(min(p.done + 1, p.total)) sur \(p.total)", subtitle: p.current, progress: p.fraction) {
                library.cancelImport()
            }
        } else if let a = library.activity {
            banner(title: a.label, subtitle: "", progress: a.progress, cancel: nil)
        }
    }

    func banner(title: String, subtitle: String, progress: Double?, cancel: (() -> Void)?) -> some View {
        HStack(spacing: 12) {
            if let progress {
                ProgressView(value: progress).progressViewStyle(.circular).frame(width: 22)
            } else {
                ProgressView()
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.subheadline.weight(.semibold))
                if !subtitle.isEmpty { Text(subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
            }
            Spacer()
            if let progress { Text("\(Int(progress * 100)) %").font(.caption.monospacedDigit()).foregroundStyle(.secondary) }
            if let cancel { Button("Annuler", action: cancel).font(.caption.weight(.semibold)) }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
        .padding(.horizontal, 12)
        .transition(.move(edge: .top).combined(with: .opacity))
    }
}
