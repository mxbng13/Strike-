import Foundation

/// Valeur JSON typée (fusion à trois voies indépendante des types métier).
public indirect enum JSONValue: Codable, Equatable, Sendable {
    case null, bool(Bool), number(Double), string(String), array([JSONValue]), object([String: JSONValue])

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .number(let n): try c.encode(n)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }

    public subscript(key: String) -> JSONValue? {
        if case .object(let o) = self { return o[key] }
        return nil
    }

    public var number: Double? { if case .number(let n) = self { return n }; return nil }

    /// Fusion à trois voies. Les champs modifiés d'un seul côté sont repris ; pour les tableaux
    /// de chaînes (ex. médias d'un album), les ajouts et retraits des deux côtés sont combinés ;
    /// sinon le côté le plus récent l'emporte.
    public static func merge(base: JSONValue?, local: JSONValue, remote: JSONValue, preferRemote: Bool) -> JSONValue {
        if local == remote { return local }
        if let base {
            if local == base { return remote }
            if remote == base { return local }
        }
        switch (base, local, remote) {
        case (_, .object(let l), .object(let r)):
            var b: [String: JSONValue] = [:]
            if case .object(let bo)? = base { b = bo }
            var out: [String: JSONValue] = [:]
            for k in Set(l.keys).union(r.keys) {
                switch (l[k], r[k]) {
                case let (lv?, rv?): out[k] = merge(base: b[k], local: lv, remote: rv, preferRemote: preferRemote)
                case let (lv?, nil): if b[k] == nil || b[k] != lv { out[k] = lv }      // ajouté localement ou supprimé à distance sans conflit
                case let (nil, rv?): if b[k] == nil || b[k] != rv { out[k] = rv }
                default: break
                }
            }
            return .object(out)
        case (_, .array(let l), .array(let r)) where l.allSatisfy(\.isString) && r.allSatisfy(\.isString):
            var b: [JSONValue] = []
            if case .array(let ba)? = base { b = ba }
            let bset = Set(b.compactMap(\.stringValue))
            let lset = Set(l.compactMap(\.stringValue)), rset = Set(r.compactMap(\.stringValue))
            let removed = bset.subtracting(lset).union(bset.subtracting(rset))
            var result: [JSONValue] = []
            var seen: Set<String> = []
            let (first, second) = preferRemote ? (r, l) : (l, r)
            for v in first + second {
                guard let s = v.stringValue, !removed.contains(s), seen.insert(s).inserted else { continue }
                result.append(v)
            }
            return .array(result)
        default:
            return preferRemote ? remote : local
        }
    }

    var isString: Bool { if case .string = self { return true }; return false }
    var stringValue: String? { if case .string(let s) = self { return s }; return nil }
}
