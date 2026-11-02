import Foundation

/// Réglages photo. Chaque réglage est un curseur dans [min, max] avec une valeur neutre.
public enum Adjustment: String, Codable, CaseIterable, Sendable, Identifiable {
    case exposure, brightness, contrast, highlights, shadows, whites, blacks
    case saturation, vibrance, temperature, tint
    case sharpness, definition, noiseReduction, vignette

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .exposure: return "Exposition"
        case .brightness: return "Luminosité"
        case .contrast: return "Contraste"
        case .highlights: return "Hautes lumières"
        case .shadows: return "Ombres"
        case .whites: return "Blancs"
        case .blacks: return "Noirs"
        case .saturation: return "Saturation"
        case .vibrance: return "Vibrance"
        case .temperature: return "Température"
        case .tint: return "Teinte"
        case .sharpness: return "Netteté"
        case .definition: return "Définition"
        case .noiseReduction: return "Réduction du bruit"
        case .vignette: return "Vignettage"
        }
    }

    public var symbol: String {
        switch self {
        case .exposure: return "plusminus.circle"
        case .brightness: return "sun.max"
        case .contrast: return "circle.lefthalf.filled"
        case .highlights: return "circle.tophalf.filled"
        case .shadows: return "circle.bottomhalf.filled"
        case .whites: return "circle"
        case .blacks: return "circle.fill"
        case .saturation: return "drop"
        case .vibrance: return "drop.halffull"
        case .temperature: return "thermometer.medium"
        case .tint: return "eyedropper"
        case .sharpness: return "triangle"
        case .definition: return "rhombus"
        case .noiseReduction: return "circle.dotted"
        case .vignette: return "circle.dashed"
        }
    }

    /// Tous les curseurs sont exposés en -100…100 (ou 0…100) ; le moteur Core Image convertit.
    public var range: ClosedRange<Double> {
        switch self {
        case .sharpness, .definition, .noiseReduction, .vignette: return 0...100
        default: return -100...100
        }
    }

    public var group: AdjustmentGroup {
        switch self {
        case .exposure, .brightness, .contrast, .highlights, .shadows, .whites, .blacks: return .light
        case .saturation, .vibrance, .temperature, .tint: return .color
        case .sharpness, .definition, .noiseReduction, .vignette: return .detail
        }
    }
}

public enum AdjustmentGroup: String, CaseIterable, Sendable {
    case light = "Lumière", color = "Couleur", detail = "Détails"
}

public enum AspectPreset: String, Codable, CaseIterable, Sendable, Identifiable {
    case free, original, square, r4x3, r3x4, r16x9, r9x16, r3x2, r2x3, r5x4
    public var id: String { rawValue }
    public var label: String {
        switch self {
        case .free: return "Libre"
        case .original: return "Original"
        case .square: return "Carré"
        case .r4x3: return "4:3"
        case .r3x4: return "3:4"
        case .r16x9: return "16:9"
        case .r9x16: return "9:16"
        case .r3x2: return "3:2"
        case .r2x3: return "2:3"
        case .r5x4: return "5:4"
        }
    }
    /// Rapport largeur / hauteur, nil pour libre.
    public func ratio(originalAspect: Double) -> Double? {
        switch self {
        case .free: return nil
        case .original: return originalAspect
        case .square: return 1
        case .r4x3: return 4.0 / 3
        case .r3x4: return 3.0 / 4
        case .r16x9: return 16.0 / 9
        case .r9x16: return 9.0 / 16
        case .r3x2: return 3.0 / 2
        case .r2x3: return 2.0 / 3
        case .r5x4: return 5.0 / 4
        }
    }
}

/// Rectangle normalisé (0…1) dans le repère de l'image orientée, origine en haut à gauche.
public struct NormalizedRect: Codable, Sendable, Hashable {
    public var x: Double, y: Double, width: Double, height: Double
    public init(x: Double, y: Double, width: Double, height: Double) { self.x = x; self.y = y; self.width = width; self.height = height }
    public static let full = NormalizedRect(x: 0, y: 0, width: 1, height: 1)
    public var isFull: Bool { abs(x) < 1e-6 && abs(y) < 1e-6 && abs(width - 1) < 1e-6 && abs(height - 1) < 1e-6 }

    public func clamped() -> NormalizedRect {
        let w = min(max(width, 0.02), 1), h = min(max(height, 0.02), 1)
        return NormalizedRect(x: min(max(x, 0), 1 - w), y: min(max(y, 0), 1 - h), width: w, height: h)
    }

    /// Plus grand rectangle centré de rapport `ratio` (en pixels) contenu dans le cadre actuel.
    public func fitted(toPixelRatio ratio: Double, imageAspect: Double) -> NormalizedRect {
        let currentPixelRatio = (width * imageAspect) / height
        var w = width, h = height
        if currentPixelRatio > ratio { w = height * ratio / imageAspect } else { h = width * imageAspect / ratio }
        return NormalizedRect(x: x + (width - w) / 2, y: y + (height - h) / 2, width: w, height: h).clamped()
    }
}

public struct CropSettings: Codable, Sendable, Hashable {
    public var rect: NormalizedRect = .full
    public var aspect: AspectPreset = .free
    /// Quarts de tour dans le sens antihoraire (0…3).
    public var quarterTurns: Int = 0
    /// Redressement fin en degrés (-45…45).
    public var straighten: Double = 0
    public var flipHorizontal = false
    public var flipVertical = false
    /// Correction de perspective (-1…1) verticale et horizontale.
    public var perspectiveVertical: Double = 0
    public var perspectiveHorizontal: Double = 0
    public init() {}
    public var isIdentity: Bool {
        rect.isFull && quarterTurns % 4 == 0 && abs(straighten) < 0.01 && !flipHorizontal && !flipVertical
            && abs(perspectiveVertical) < 0.001 && abs(perspectiveHorizontal) < 0.001
    }
}

public struct FilterSelection: Codable, Sendable, Hashable {
    public var presetID: String
    /// 0…1
    public var intensity: Double
    public init(presetID: String, intensity: Double = 1) { self.presetID = presetID; self.intensity = intensity }
}

/// Correction ponctuelle (suppression d'imperfections) : clonage adouci depuis une zone voisine.
public struct HealSpot: Codable, Sendable, Hashable, Identifiable {
    public var id: UUID = UUID()
    /// Centre normalisé dans l'image recadrée finale.
    public var x: Double
    public var y: Double
    /// Rayon relatif au plus petit côté.
    public var radius: Double
    /// Décalage de la zone source (normalisé), choisi automatiquement.
    public var sourceDX: Double
    public var sourceDY: Double
    public init(x: Double, y: Double, radius: Double, sourceDX: Double, sourceDY: Double) {
        self.x = x; self.y = y; self.radius = radius; self.sourceDX = sourceDX; self.sourceDY = sourceDY
    }
}

/// Ajustement local radial (masque circulaire adouci).
public struct LocalAdjustment: Codable, Sendable, Hashable, Identifiable {
    public var id: UUID = UUID()
    public var x: Double = 0.5
    public var y: Double = 0.5
    public var radius: Double = 0.3
    /// 0…1 : douceur de la transition.
    public var feather: Double = 0.6
    public var inverted = false
    public var exposure: Double = 0
    public var saturation: Double = 0
    public var contrast: Double = 0
    public var temperature: Double = 0
    public init() {}
}

/// Recette de retouche non destructive : l'original n'est jamais modifié,
/// le rendu est recalculé à partir de cette description.
public struct EditRecipe: Codable, Sendable, Hashable {
    public var adjustments: [Adjustment: Double] = [:]
    public var crop = CropSettings()
    public var filter: FilterSelection?
    public var healSpots: [HealSpot] = []
    public var localAdjustments: [LocalAdjustment] = []
    /// Intensité du flou d'arrière-plan (0 = désactivé, 1 = maximum) via segmentation Vision.
    public var backgroundBlur: Double = 0
    /// Valeurs de correction automatique appliquées (pour pouvoir les afficher et les annuler).
    public var autoEnhanced = false

    public init() {}

    public func value(_ a: Adjustment) -> Double { adjustments[a] ?? 0 }

    public mutating func set(_ a: Adjustment, _ v: Double) {
        let c = min(max(v, a.range.lowerBound), a.range.upperBound)
        if abs(c) < 0.0001 { adjustments[a] = nil } else { adjustments[a] = c }
    }

    public var isIdentity: Bool {
        adjustments.values.allSatisfy { abs($0) < 0.0001 } && crop.isIdentity && (filter == nil || filter!.intensity < 0.0001)
            && healSpots.isEmpty && localAdjustments.isEmpty && backgroundBlur < 0.0001
    }

    /// Réglages effectifs = réglages de l'utilisateur + contribution du filtre pondérée par son intensité.
    public func effectiveAdjustments(presets: [FilterPreset] = FilterPreset.all) -> [Adjustment: Double] {
        var out = adjustments
        if let f = filter, let p = presets.first(where: { $0.id == f.presetID }) {
            for (k, v) in p.adjustments {
                let combined = (out[k] ?? 0) + v * f.intensity
                out[k] = min(max(combined, k.range.lowerBound), k.range.upperBound)
            }
        }
        return out
    }

    public var summary: String {
        var parts: [String] = []
        if !adjustments.isEmpty { parts.append("\(adjustments.count) réglage(s)") }
        if let f = filter, let p = FilterPreset.byID(f.presetID) { parts.append("filtre \(p.name)") }
        if !crop.isIdentity { parts.append("recadrage") }
        if !healSpots.isEmpty { parts.append("\(healSpots.count) retouche(s)") }
        if !localAdjustments.isEmpty { parts.append("ajustement local") }
        if backgroundBlur > 0 { parts.append("flou d'arrière-plan") }
        return parts.isEmpty ? "Original" : parts.joined(separator: ", ")
    }
}

// Codable pour le dictionnaire à clé enum (encodé en objet JSON lisible).
extension EditRecipe {
    enum CodingKeys: String, CodingKey { case adjustments, crop, filter, healSpots, localAdjustments, backgroundBlur, autoEnhanced }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let raw = try c.decodeIfPresent([String: Double].self, forKey: .adjustments) ?? [:]
        adjustments = Dictionary(uniqueKeysWithValues: raw.compactMap { k, v in Adjustment(rawValue: k).map { ($0, v) } })
        crop = try c.decodeIfPresent(CropSettings.self, forKey: .crop) ?? CropSettings()
        filter = try c.decodeIfPresent(FilterSelection.self, forKey: .filter)
        healSpots = try c.decodeIfPresent([HealSpot].self, forKey: .healSpots) ?? []
        localAdjustments = try c.decodeIfPresent([LocalAdjustment].self, forKey: .localAdjustments) ?? []
        backgroundBlur = try c.decodeIfPresent(Double.self, forKey: .backgroundBlur) ?? 0
        autoEnhanced = try c.decodeIfPresent(Bool.self, forKey: .autoEnhanced) ?? false
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(Dictionary(uniqueKeysWithValues: adjustments.map { ($0.key.rawValue, $0.value) }), forKey: .adjustments)
        try c.encode(crop, forKey: .crop)
        try c.encodeIfPresent(filter, forKey: .filter)
        try c.encode(healSpots, forKey: .healSpots)
        try c.encode(localAdjustments, forKey: .localAdjustments)
        try c.encode(backgroundBlur, forKey: .backgroundBlur)
        try c.encode(autoEnhanced, forKey: .autoEnhanced)
    }
}
