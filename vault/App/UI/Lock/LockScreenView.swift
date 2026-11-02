import SwiftUI
import VaultCore

struct LockScreenView: View {
    @EnvironmentObject var session: VaultSession
    @State private var pin = ""
    @State private var shake: CGFloat = 0
    @State private var message: String?
    @State private var unlocking = false
    @State private var opened = false
    @State private var showRecovery = false
    @State private var now = Date()
    private let clock = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var lockedOut: Bool { (session.lockoutUntil ?? .distantPast) > now }

    var body: some View {
        ZStack {
            LockBackground()
            VStack(spacing: 0) {
                Spacer(minLength: 40)
                VStack(spacing: 14) {
                    Image(systemName: opened ? "lock.open.fill" : "lock.fill")
                        .font(.system(size: 30, weight: .light))
                        .contentTransition(.symbolEffect(.replace))
                        .scaleEffect(opened ? 1.15 : 1)
                    Text("VAULT").font(.system(size: 14, weight: .semibold)).tracking(9)
                    Text(subtitle).font(.footnote).foregroundStyle(.white.opacity(message == nil ? 0.6 : 0.9))
                        .multilineTextAlignment(.center).frame(minHeight: 34)
                        .padding(.horizontal, 30)
                }
                .foregroundStyle(.white)
                Spacer(minLength: 30)
                PINEntry(length: session.pinLength, pin: $pin, shake: shake, leftAccessory: biometricButton) { value in
                    Task { await submit(value) }
                }
                .disabled(unlocking || lockedOut)
                .opacity(lockedOut ? 0.35 : 1)
                Spacer(minLength: 20)
                Button("Code oublié ?") { showRecovery = true }
                    .font(.footnote.weight(.medium)).foregroundStyle(.white.opacity(0.7))
                    .padding(.bottom, 24)
            }
            .blur(radius: opened ? 12 : 0)
            .opacity(opened ? 0 : 1)
            .scaleEffect(opened ? 1.06 : 1)
        }
        .preferredColorScheme(.dark)
        .onReceive(clock) { now = $0 }
        .task {
            // Tentative Face ID automatique à l'ouverture.
            if session.canUseBiometrics && !lockedOut { await biometric() }
        }
        .sheet(isPresented: $showRecovery) { RecoveryView().environmentObject(session) }
    }

    var subtitle: String {
        if let until = session.lockoutUntil, until > now {
            let s = Int(until.timeIntervalSince(now))
            return "Trop d'essais. Réessayez dans " + (s >= 60 ? "\(s / 60) min \(s % 60) s" : "\(s) s")
        }
        return message ?? "Saisissez votre code"
    }

    var biometricButton: AnyView? {
        guard session.canUseBiometrics else { return nil }
        return AnyView(Button {
            Task { await biometric() }
        } label: {
            Image(systemName: Biometrics.symbol).font(.system(size: 28, weight: .light))
                .frame(width: 78, height: 78).contentShape(Rectangle())
        }
        .foregroundStyle(.white)
        .accessibilityLabel(Biometrics.label))
    }

    func biometric() async {
        unlocking = true
        let ok = await session.unlockWithBiometrics()
        unlocking = false
        if ok { await celebrate() }
    }

    func submit(_ value: String) async {
        unlocking = true
        let error = await session.unlock(pin: value)
        unlocking = false
        if let error {
            Haptics.error()
            withAnimation(.linear(duration: 0.4)) { shake += 1 }
            message = error.localizedDescription
            pin = ""
        } else {
            await celebrate()
        }
    }

    func celebrate() async {
        Haptics.success()
        withAnimation(.spring(response: 0.45, dampingFraction: 0.7)) { opened = true }
    }
}

struct LockBackground: View {
    @State private var animate = false
    var body: some View {
        ZStack {
            Color.black
            RadialGradient(colors: [Color(hex: "#1C2A3A").opacity(0.9), .clear], center: animate ? .topLeading : .top,
                           startRadius: 20, endRadius: 520)
            RadialGradient(colors: [Color(hex: "#2A1C33").opacity(0.7), .clear], center: animate ? .bottomTrailing : .bottom,
                           startRadius: 10, endRadius: 480)
        }
        .ignoresSafeArea()
        .onAppear { withAnimation(.easeInOut(duration: 9).repeatForever(autoreverses: true)) { animate = true } }
    }
}

/// Authentification supplémentaire par code (albums protégés).
struct PINChallengeView: View {
    @EnvironmentObject var session: VaultSession
    let challenge: VaultSession.PINChallenge
    @State private var pin = ""
    @State private var shake: CGFloat = 0
    @State private var message: String?
    @Environment(\.dismiss) var dismiss

    var body: some View {
        ZStack {
            LockBackground()
            VStack(spacing: 30) {
                HStack {
                    Spacer()
                    Button("Annuler") { finish(false) }.foregroundStyle(.white)
                }
                .padding(.horizontal)
                Image(systemName: "lock.rectangle.stack").font(.system(size: 30, weight: .light)).foregroundStyle(.white)
                Text(challenge.reason).font(.headline).foregroundStyle(.white)
                if let message { Text(message).font(.footnote).foregroundStyle(.white.opacity(0.85)) }
                Spacer()
                PINEntry(length: session.pinLength, pin: $pin, shake: shake) { value in
                    Task {
                        if let e = await session.verifyChallengePIN(value) {
                            Haptics.error(); withAnimation(.linear(duration: 0.4)) { shake += 1 }
                            message = e.localizedDescription; pin = ""
                        } else {
                            Haptics.success(); finish(true)
                        }
                    }
                }
                Spacer()
            }
            .padding(.top, 20)
        }
        .preferredColorScheme(.dark)
        .interactiveDismissDisabled()
    }

    func finish(_ ok: Bool) {
        session.pinChallenge = nil
        challenge.completion(ok)
    }
}

/// Code oublié : saisie de la clé de récupération puis nouveau code.
struct RecoveryView: View {
    @EnvironmentObject var session: VaultSession
    @Environment(\.dismiss) var dismiss
    @State private var key = ""
    @State private var step = 0
    @State private var newPIN = ""
    @State private var length = 6
    @State private var error: String?
    @State private var working = false

    var body: some View {
        NavigationStack {
            Form {
                if step == 0 {
                    Section {
                        TextField("XXXX-XXXX-XXXX-XXXX-XXXX-XXXX", text: $key, axis: .vertical)
                            .font(.system(.body, design: .monospaced))
                            .textInputAutocapitalization(.characters)
                            .autocorrectionDisabled()
                    } header: {
                        Text("Clé de récupération")
                    } footer: {
                        Text("Il s'agit de la clé de 24 caractères affichée lors de la création du coffre. Sans elle, un code oublié ne peut pas être réinitialisé : c'est le prix d'un vrai chiffrement.")
                    }
                    Button("Continuer") { step = 1 }
                        .disabled(RecoveryKey.normalize(key) == nil)
                } else {
                    Section("Nouveau code") {
                        Picker("Longueur", selection: $length) {
                            Text("4 chiffres").tag(4); Text("6 chiffres").tag(6)
                        }
                        .pickerStyle(.segmented)
                        SecureField("Nouveau code", text: $newPIN).keyboardType(.numberPad)
                    }
                    if let error { Text(error).foregroundStyle(.red) }
                    Button {
                        Task {
                            working = true
                            error = await session.recover(recoveryKey: key, newPIN: newPIN)
                            working = false
                            if error == nil { dismiss() }
                        }
                    } label: {
                        if working { ProgressView() } else { Text("Réinitialiser le code") }
                    }
                    .disabled(newPIN.count != length || !newPIN.allSatisfy(\.isNumber) || working)
                }
            }
            .navigationTitle("Récupération")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } } }
        }
    }
}
