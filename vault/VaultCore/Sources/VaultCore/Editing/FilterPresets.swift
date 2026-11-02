import Foundation

/// Filtres originaux de VAULT. Un filtre = des réglages + un « look » (noir et blanc, grain,
/// voile, dominante de couleur). Tout est pondéré par l'intensité choisie (0…1).
public struct FilterPreset: Sendable, Identifiable, Hashable {
    public var id: String
    public var name: String
    public var adjustments: [Adjustment: Double]
    public var monochrome: Bool = false
    /// Grain argentique 0…1.
    public var grain: Double = 0
    /// Relèvement des noirs (aspect mat) 0…1.
    public var fade: Double = 0
    /// Multiplicateurs RGB (dominante). 1 = neutre.
    public var colorCast: (Double, Double, Double) = (1, 1, 1)

    public static func == (a: FilterPreset, b: FilterPreset) -> Bool { a.id == b.id }
    public func hash(into h: inout Hasher) { h.combine(id) }

    public static let all: [FilterPreset] = [
        FilterPreset(id: "natural", name: "Naturel",
                     adjustments: [.vibrance: 18, .contrast: 6, .shadows: 8, .definition: 10]),
        FilterPreset(id: "cinematic", name: "Cinématique",
                     adjustments: [.contrast: 22, .saturation: -14, .highlights: -25, .shadows: 12, .temperature: -8, .vignette: 35],
                     fade: 0.15, colorCast: (0.96, 1.0, 1.05)),
        FilterPreset(id: "vintage", name: "Vintage",
                     adjustments: [.saturation: -22, .contrast: -10, .temperature: 28, .tint: 6, .vignette: 40],
                     grain: 0.35, fade: 0.35, colorCast: (1.06, 1.0, 0.88)),
        FilterPreset(id: "bw", name: "Noir et blanc",
                     adjustments: [.contrast: 18, .definition: 15], monochrome: true),
        FilterPreset(id: "bwsoft", name: "N&B doux",
                     adjustments: [.contrast: -12, .shadows: 20, .highlights: -15], monochrome: true, grain: 0.15, fade: 0.25),
        FilterPreset(id: "warm", name: "Chaud",
                     adjustments: [.temperature: 35, .vibrance: 12, .tint: 4], colorCast: (1.04, 1.0, 0.95)),
        FilterPreset(id: "cold", name: "Froid",
                     adjustments: [.temperature: -35, .saturation: -6, .contrast: 8], colorCast: (0.95, 1.0, 1.06)),
        FilterPreset(id: "film", name: "Argentique",
                     adjustments: [.contrast: 12, .saturation: -10, .highlights: -20, .temperature: 10],
                     grain: 0.5, fade: 0.22, colorCast: (1.02, 1.01, 0.96)),
        FilterPreset(id: "punch", name: "Contrasté",
                     adjustments: [.contrast: 38, .saturation: 16, .blacks: -18, .whites: 12, .definition: 25]),
        FilterPreset(id: "soft", name: "Doux",
                     adjustments: [.contrast: -22, .highlights: -10, .shadows: 25, .sharpness: 0, .vibrance: 8],
                     fade: 0.2),
        FilterPreset(id: "urban", name: "Urbain",
                     adjustments: [.contrast: 26, .saturation: -35, .definition: 40, .temperature: -12, .vignette: 25],
                     colorCast: (0.97, 1.0, 1.03)),
        FilterPreset(id: "portrait", name: "Portrait",
                     adjustments: [.exposure: 6, .contrast: -6, .vibrance: 10, .temperature: 8, .definition: -10, .noiseReduction: 20, .shadows: 10]),
        FilterPreset(id: "golden", name: "Heure dorée",
                     adjustments: [.temperature: 45, .highlights: -15, .vibrance: 20, .contrast: 8],
                     colorCast: (1.06, 1.0, 0.9)),
        FilterPreset(id: "nocturne", name: "Nocturne",
                     adjustments: [.exposure: -10, .contrast: 20, .temperature: -25, .saturation: -10, .vignette: 45],
                     colorCast: (0.92, 0.98, 1.08)),
    ]

    public static func byID(_ id: String) -> FilterPreset? { all.first { $0.id == id } }
}
