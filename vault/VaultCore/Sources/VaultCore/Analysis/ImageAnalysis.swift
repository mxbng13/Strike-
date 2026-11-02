import Foundation

/// Analyses d'image portables. L'app iOS fournit des pixels réduits (Core Graphics) ;
/// les calculs eux-mêmes sont ici, testables et réutilisables sur Android.
public enum ImageAnalysis {
    /// dHash 64 bits à partir d'une image en niveaux de gris 9×8 (ligne par ligne).
    public static func differenceHash(gray9x8 px: [UInt8]) -> UInt64 {
        precondition(px.count == 72, "9×8 pixels attendus")
        var hash: UInt64 = 0
        var bit: UInt64 = 0
        for row in 0..<8 {
            for col in 0..<8 {
                if px[row * 9 + col] > px[row * 9 + col + 1] { hash |= (1 << bit) }
                bit += 1
            }
        }
        return hash
    }

    public static func hammingDistance(_ a: UInt64, _ b: UInt64) -> Int { (a ^ b).nonzeroBitCount }

    /// Netteté : variance du laplacien sur une image en niveaux de gris (typ. 128×128).
    /// Valeurs faibles ⇒ image probablement floue.
    public static func laplacianVariance(gray: [UInt8], width: Int, height: Int) -> Double {
        guard width >= 3, height >= 3, gray.count >= width * height else { return 0 }
        var sum = 0.0, sumSq = 0.0
        var n = 0.0
        for y in 1..<(height - 1) {
            for x in 1..<(width - 1) {
                let c = Double(gray[y * width + x])
                let l = Double(gray[y * width + x - 1]) + Double(gray[y * width + x + 1])
                    + Double(gray[(y - 1) * width + x]) + Double(gray[(y + 1) * width + x]) - 4 * c
                sum += l
                sumSq += l * l
                n += 1
            }
        }
        let mean = sum / n
        return sumSq / n - mean * mean
    }

    public static let blurThreshold = 60.0

    /// Couleur dominante à partir de pixels RGBA (typ. 32×32).
    public static func dominantColor(rgba: [UInt8]) -> NamedColor? {
        guard rgba.count >= 4 else { return nil }
        var buckets: [NamedColor: Double] = [:]
        var i = 0
        while i + 3 < rgba.count {
            let r = Double(rgba[i]) / 255, g = Double(rgba[i + 1]) / 255, b = Double(rgba[i + 2]) / 255
            i += 4
            let (h, s, v) = hsv(r, g, b)
            let color = classify(h: h, s: s, v: v)
            // Les couleurs saturées pèsent davantage que les gris pour refléter la perception.
            let weight = (color == .gray || color == .black || color == .white) ? 0.6 : 0.6 + s
            buckets[color, default: 0] += weight
        }
        return buckets.max { $0.value < $1.value || ($0.value == $1.value && $0.key.rawValue > $1.key.rawValue) }?.key
    }

    public static func hsv(_ r: Double, _ g: Double, _ b: Double) -> (Double, Double, Double) {
        let mx = max(r, g, b), mn = min(r, g, b), d = mx - mn
        var h = 0.0
        if d > 0 {
            if mx == r { h = 60 * ((g - b) / d).truncatingRemainder(dividingBy: 6) }
            else if mx == g { h = 60 * ((b - r) / d + 2) }
            else { h = 60 * ((r - g) / d + 4) }
        }
        if h < 0 { h += 360 }
        return (h, mx == 0 ? 0 : d / mx, mx)
    }

    public static func classify(h: Double, s: Double, v: Double) -> NamedColor {
        if v < 0.18 { return .black }
        if s < 0.15 { return v > 0.85 ? .white : .gray }
        if h >= 15 && h < 45 && v < 0.6 && s > 0.3 { return .brown }
        switch h {
        case 0..<15, 345...360: return .red
        case 15..<45: return .orange
        case 45..<70: return .yellow
        case 70..<165: return .green
        case 165..<195: return .teal
        case 195..<255: return .blue
        case 255..<290: return .purple
        default: return .pink
        }
    }

    /// Regroupe les quasi-doublons (photos similaires : rafales, copies redimensionnées).
    public static func similarGroups(_ items: [(UUID, UInt64)], maxDistance: Int = 6) -> [[UUID]] {
        var parent = Array(0..<items.count)
        func find(_ x: Int) -> Int { var x = x; while parent[x] != x { parent[x] = parent[parent[x]]; x = parent[x] }; return x }
        for i in 0..<items.count {
            for j in (i + 1)..<max(i + 1, items.count) where hammingDistance(items[i].1, items[j].1) <= maxDistance {
                let a = find(i), b = find(j)
                if a != b { parent[b] = a }
            }
        }
        var groups: [Int: [UUID]] = [:]
        for i in 0..<items.count { groups[find(i), default: []].append(items[i].0) }
        return groups.values.filter { $0.count > 1 }.sorted { $0.count > $1.count }
    }
}
