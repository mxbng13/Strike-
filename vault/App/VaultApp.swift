import SwiftUI
import VaultCore

@main
struct VaultApp: App {
    @StateObject private var session = VaultSession()
    @Environment(\.scenePhase) private var scenePhase

    init() { NotificationService.configure() }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .onChange(of: scenePhase) { _, phase in session.scenePhaseChanged(phase) }
        }
    }
}

struct RootView: View {
    @EnvironmentObject var session: VaultSession

    var body: some View {
        ZStack {
            switch session.phase {
            case .loading:
                Color.black.ignoresSafeArea()
            case .onboarding:
                OnboardingView().transition(.opacity)
            case .locked:
                LockScreenView().transition(.opacity)
            case .unlocked:
                if let lib = session.library {
                    MainTabView()
                        .environmentObject(lib)
                        .transition(.asymmetric(insertion: .scale(scale: 1.04).combined(with: .opacity), removal: .opacity))
                }
            }
            if session.privacyCurtain && session.phase != .onboarding {
                PrivacyCurtain().transition(.opacity).zIndex(10)
            }
            if session.isScreenCaptured && session.phase == .unlocked && (session.library?.preferences.discreetMode ?? false) {
                CaptureWarning().zIndex(9)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: session.privacyCurtain)
        .fullScreenCover(item: $session.pinChallenge) { challenge in
            PINChallengeView(challenge: challenge).environmentObject(session)
        }
        .background(ActivityTracker { session.noteActivity() })
    }
}

/// Masque le contenu dans le sélecteur d'applications et pendant les invites système.
struct PrivacyCurtain: View {
    var body: some View {
        ZStack {
            Rectangle().fill(.ultraThinMaterial).ignoresSafeArea()
            Color.black.opacity(0.75).ignoresSafeArea()
            VStack(spacing: 14) {
                Image(systemName: "lock.fill").font(.system(size: 34, weight: .light))
                Text("VAULT").font(.system(size: 15, weight: .semibold)).tracking(8)
            }
            .foregroundStyle(.white.opacity(0.85))
        }
    }
}

struct CaptureWarning: View {
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 12) {
                Image(systemName: "record.circle").font(.largeTitle)
                Text("Enregistrement d'écran détecté").font(.headline)
                Text("Le mode discret masque le contenu pendant la capture ou la recopie de l'écran.")
                    .font(.footnote).multilineTextAlignment(.center).foregroundStyle(.secondary)
            }
            .foregroundStyle(.white).padding(40)
        }
    }
}

/// Détecte toute interaction (sans interférer avec les gestes) pour le verrouillage automatique.
struct ActivityTracker: UIViewRepresentable {
    let onActivity: () -> Void

    func makeUIView(context: Context) -> UIView {
        let v = UIView(frame: .zero)
        v.isUserInteractionEnabled = false
        DispatchQueue.main.async { context.coordinator.install(from: v) }
        return v
    }
    func updateUIView(_ uiView: UIView, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(onActivity) }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        let onActivity: () -> Void
        private var installed = false
        init(_ f: @escaping () -> Void) { onActivity = f }

        func install(from view: UIView) {
            guard !installed, let window = view.window ?? UIApplication.shared.connectedScenes
                .compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in self?.install(from: view) }
                return
            }
            let g = UILongPressGestureRecognizer(target: self, action: #selector(touched))
            g.minimumPressDuration = 0
            g.cancelsTouchesInView = false
            g.delaysTouchesBegan = false
            g.delegate = self
            window.addGestureRecognizer(g)
            installed = true
        }
        @objc func touched() { onActivity() }
        func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith o: UIGestureRecognizer) -> Bool { true }
        func gestureRecognizer(_ g: UIGestureRecognizer, shouldBeRequiredToFailBy o: UIGestureRecognizer) -> Bool { false }
    }
}
