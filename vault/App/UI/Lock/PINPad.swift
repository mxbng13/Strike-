import SwiftUI

/// Indicateur de saisie (points) + clavier numérique circulaire façon iOS.
struct PINDots: View {
    let length: Int
    let filled: Int
    var tint: Color = .white
    var body: some View {
        HStack(spacing: 18) {
            ForEach(0..<length, id: \.self) { i in
                Circle()
                    .strokeBorder(tint.opacity(0.9), lineWidth: 1.2)
                    .background(Circle().fill(i < filled ? tint : .clear))
                    .frame(width: 13, height: 13)
                    .scaleEffect(i < filled ? 1.08 : 1)
                    .animation(.spring(response: 0.25, dampingFraction: 0.6), value: filled)
            }
        }
        .accessibilityLabel("\(filled) chiffres saisis sur \(length)")
    }
}

struct PINPad: View {
    var tint: Color = .white
    var leftAccessory: AnyView? = nil
    let onDigit: (Int) -> Void
    let onDelete: () -> Void
    var deleteVisible = true

    private let rows = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
    private let letters = ["", "ABC", "DEF", "GHI", "JKL", "MNO", "PQRS", "TUV", "WXYZ"]

    var body: some View {
        VStack(spacing: 18) {
            ForEach(rows, id: \.self) { row in
                HStack(spacing: 26) {
                    ForEach(row, id: \.self) { d in key(d) }
                }
            }
            HStack(spacing: 26) {
                Group {
                    if let leftAccessory { leftAccessory } else { Color.clear }
                }
                .frame(width: 78, height: 78)
                key(0)
                Button {
                    Haptics.tap(); onDelete()
                } label: {
                    Image(systemName: "delete.left").font(.system(size: 22, weight: .regular))
                        .frame(width: 78, height: 78).contentShape(Rectangle())
                }
                .opacity(deleteVisible ? 1 : 0)
                .foregroundStyle(tint)
                .accessibilityLabel("Effacer")
            }
        }
    }

    func key(_ d: Int) -> some View {
        Button {
            Haptics.tap(); onDigit(d)
        } label: {
            VStack(spacing: 0) {
                Text("\(d)").font(.system(size: 34, weight: .light, design: .rounded))
                if d > 0 && d < 10 && !letters[d - 1].isEmpty {
                    Text(letters[d - 1]).font(.system(size: 9, weight: .semibold)).tracking(2).opacity(0.7)
                }
            }
            .frame(width: 78, height: 78)
            .background(Circle().fill(tint.opacity(0.12)))
            .contentShape(Circle())
        }
        .buttonStyle(PadButtonStyle())
        .foregroundStyle(tint)
    }
}

struct PadButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .overlay(Circle().fill(Color.white.opacity(configuration.isPressed ? 0.25 : 0)))
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// Saisie complète d'un code (points + clavier) réutilisable.
struct PINEntry: View {
    let length: Int
    @Binding var pin: String
    var tint: Color = .white
    var shake: CGFloat = 0
    var leftAccessory: AnyView? = nil
    let onComplete: (String) -> Void

    var body: some View {
        VStack(spacing: 44) {
            PINDots(length: length, filled: pin.count, tint: tint)
                .modifier(Shake(animatableData: shake))
            PINPad(tint: tint, leftAccessory: leftAccessory, onDigit: { d in
                guard pin.count < length else { return }
                pin.append(String(d))
                if pin.count == length {
                    let value = pin
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) { onComplete(value) }
                }
            }, onDelete: {
                if !pin.isEmpty { pin.removeLast() }
            }, deleteVisible: !pin.isEmpty)
        }
    }
}
