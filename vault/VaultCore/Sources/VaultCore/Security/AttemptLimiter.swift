import Foundation

/// Gestion des tentatives de code : délais croissants puis effacement optionnel.
public struct AttemptPolicy: Codable, Sendable, Equatable {
    /// Nombre d'échecs gratuits avant le premier délai.
    public var freeAttempts: Int = 4
    /// Délais (secondes) appliqués après chaque échec supplémentaire.
    public var delays: [TimeInterval] = [30, 60, 300, 900, 3600]
    /// Si défini, la clé maîtresse est détruite après ce nombre d'échecs consécutifs.
    public var wipeAfter: Int? = nil
    public init(freeAttempts: Int = 4, delays: [TimeInterval] = [30, 60, 300, 900, 3600], wipeAfter: Int? = nil) {
        self.freeAttempts = freeAttempts
        self.delays = delays
        self.wipeAfter = wipeAfter
    }
}

public struct AttemptState: Codable, Sendable, Equatable {
    public var consecutiveFailures: Int = 0
    public var lockedUntil: Date? = nil
    public var lastFailure: Date? = nil
    public var totalFailures: Int = 0
    public init() {}
}

public enum AttemptDecision: Equatable, Sendable {
    case allowed
    case lockedOut(until: Date)
}

public enum AttemptLimiter {
    public static func check(_ state: AttemptState, now: Date) -> AttemptDecision {
        // Si l'horloge a été reculée après un échec, on reste bloqué jusqu'au délai initial.
        if let until = state.lockedUntil {
            if now < until { return .lockedOut(until: until) }
            if let last = state.lastFailure, now < last { return .lockedOut(until: until) }
        }
        return .allowed
    }

    public static func recordFailure(_ state: inout AttemptState, policy: AttemptPolicy, now: Date) -> (shouldWipe: Bool, decision: AttemptDecision) {
        state.consecutiveFailures += 1
        state.totalFailures += 1
        state.lastFailure = now
        if let wipe = policy.wipeAfter, state.consecutiveFailures >= wipe {
            return (true, .allowed)
        }
        let over = state.consecutiveFailures - policy.freeAttempts
        if over > 0, !policy.delays.isEmpty {
            let delay = policy.delays[min(over - 1, policy.delays.count - 1)]
            let until = now.addingTimeInterval(delay)
            state.lockedUntil = until
            return (false, .lockedOut(until: until))
        }
        state.lockedUntil = nil
        return (false, .allowed)
    }

    public static func recordSuccess(_ state: inout AttemptState) {
        state.consecutiveFailures = 0
        state.lockedUntil = nil
    }

    public static func remainingBeforeWipe(_ state: AttemptState, policy: AttemptPolicy) -> Int? {
        policy.wipeAfter.map { max(0, $0 - state.consecutiveFailures) }
    }
}

/// Verrouillage automatique.
public enum AutoLockDelay: Int, Codable, CaseIterable, Sendable, Identifiable {
    case immediately = 0, s30 = 30, m1 = 60, m5 = 300, m15 = 900, never = -1
    public var id: Int { rawValue }
    public var label: String {
        switch self {
        case .immediately: return "Immédiatement"
        case .s30: return "Après 30 secondes"
        case .m1: return "Après 1 minute"
        case .m5: return "Après 5 minutes"
        case .m15: return "Après 15 minutes"
        case .never: return "Jamais (déconseillé)"
        }
    }
}

public struct AutoLockPolicy: Codable, Sendable, Equatable {
    public var inactivity: AutoLockDelay = .m1
    public var lockOnBackground: Bool = true
    /// Délai de grâce lors d'un passage en arrière-plan (ex. appel Face ID système, sélecteur de photos).
    public var backgroundGrace: TimeInterval = 0
    public init(inactivity: AutoLockDelay = .m1, lockOnBackground: Bool = true, backgroundGrace: TimeInterval = 0) {
        self.inactivity = inactivity
        self.lockOnBackground = lockOnBackground
        self.backgroundGrace = backgroundGrace
    }

    public func shouldLockForInactivity(lastActivity: Date, now: Date) -> Bool {
        guard inactivity != .never else { return false }
        return now.timeIntervalSince(lastActivity) >= TimeInterval(max(inactivity.rawValue, 1))
    }

    public func shouldLockOnReturn(backgroundedAt: Date, now: Date) -> Bool {
        if lockOnBackground { return now.timeIntervalSince(backgroundedAt) >= backgroundGrace }
        guard inactivity != .never else { return false }
        return now.timeIntervalSince(backgroundedAt) >= TimeInterval(inactivity.rawValue)
    }
}
