import Foundation

public enum TransitionKind: String, Codable, CaseIterable, Sendable {
    case none, crossfade, fadeToBlack, slideLeft, zoom
    public var label: String {
        switch self {
        case .none: return "Aucune"
        case .crossfade: return "Fondu enchaîné"
        case .fadeToBlack: return "Fondu au noir"
        case .slideLeft: return "Glissement"
        case .zoom: return "Zoom"
        }
    }
}

public enum ProjectAspect: String, Codable, CaseIterable, Sendable {
    case original, landscape16x9, portrait9x16, square, classic4x3, cinema21x9
    public var label: String {
        switch self {
        case .original: return "Original"
        case .landscape16x9: return "16:9"
        case .portrait9x16: return "9:16"
        case .square: return "1:1"
        case .classic4x3: return "4:3"
        case .cinema21x9: return "21:9"
        }
    }
    public func ratio(original: Double) -> Double {
        switch self {
        case .original: return original
        case .landscape16x9: return 16.0 / 9
        case .portrait9x16: return 9.0 / 16
        case .square: return 1
        case .classic4x3: return 4.0 / 3
        case .cinema21x9: return 21.0 / 9
        }
    }
}

public enum ExportResolution: String, Codable, CaseIterable, Sendable {
    case p720, p1080, k4
    public var label: String {
        switch self { case .p720: return "720p"; case .p1080: return "1080p"; case .k4: return "4K" }
    }
    /// Plus petit côté en pixels.
    public var shortSide: Int {
        switch self { case .p720: return 720; case .p1080: return 1080; case .k4: return 2160 }
    }

    /// Taille de rendu (paire) pour un rapport donné.
    public func renderSize(aspect: Double) -> (width: Int, height: Int) {
        func even(_ v: Double) -> Int { max(2, Int((v / 2).rounded()) * 2) }
        if aspect >= 1 { return (even(Double(shortSide) * aspect), shortSide) }
        return (shortSide, even(Double(shortSide) / aspect))
    }
}

public struct ClipColor: Codable, Sendable, Hashable {
    public var brightness: Double = 0   // -100…100
    public var contrast: Double = 0     // -100…100
    public var saturation: Double = 0   // -100…100
    public var temperature: Double = 0  // -100…100
    public init() {}
    public var isNeutral: Bool { brightness == 0 && contrast == 0 && saturation == 0 && temperature == 0 }
}

public struct VideoClip: Codable, Sendable, Hashable, Identifiable {
    public var id: UUID = UUID()
    public var mediaID: UUID
    /// Durée totale de la source (s), mémorisée pour borner le rognage.
    public var sourceDuration: Double
    public var sourceStart: Double
    public var sourceEnd: Double
    /// 0.25…4
    public var speed: Double = 1
    /// 0…1
    public var volume: Double = 1
    public var filterID: String?
    public var filterIntensity: Double = 1
    public var color = ClipColor()
    public var transitionOut: TransitionKind = .none
    public var transitionDuration: Double = 0.6
    /// Photo intégrée au montage (durée fixe).
    public var isStill: Bool = false

    public init(mediaID: UUID, sourceDuration: Double, isStill: Bool = false) {
        self.mediaID = mediaID
        self.sourceDuration = sourceDuration
        self.sourceStart = 0
        self.sourceEnd = sourceDuration
        self.isStill = isStill
    }

    public var trimmedDuration: Double { max(0, sourceEnd - sourceStart) }
    public var outputDuration: Double { trimmedDuration / speed }

    public mutating func trim(start: Double, end: Double) {
        let minLen = 0.1
        sourceStart = min(max(0, start), max(0, sourceDuration - minLen))
        sourceEnd = max(min(sourceDuration, end), sourceStart + minLen)
    }

    public mutating func setSpeed(_ s: Double) { speed = min(max(s, 0.25), 4) }
}

public enum TextStyle: String, Codable, CaseIterable, Sendable {
    case title, subtitle, caption, minimal
    public var label: String {
        switch self { case .title: return "Titre"; case .subtitle: return "Sous-titre"; case .caption: return "Légende"; case .minimal: return "Minimal" }
    }
}

public struct TextOverlay: Codable, Sendable, Hashable, Identifiable {
    public var id: UUID = UUID()
    public var text: String
    public var style: TextStyle = .title
    /// Temps dans la sortie (s).
    public var start: Double
    public var duration: Double
    /// Position normalisée du centre.
    public var x: Double = 0.5
    public var y: Double = 0.5
    public var colorHex: String = "#FFFFFF"
    public var withBackground = false
    public init(text: String, start: Double, duration: Double, style: TextStyle = .title) {
        self.text = text; self.start = start; self.duration = duration; self.style = style
    }
    public var end: Double { start + duration }
}

public struct MusicTrack: Codable, Sendable, Hashable {
    /// Fichier audio chiffré dans le coffre (audio/<id>.vlt).
    public var audioID: UUID
    public var title: String
    public var sourceDuration: Double
    public var volume: Double = 0.8
    public var fadeIn: Double = 1
    public var fadeOut: Double = 2
    /// Atténue le son des clips lorsque la musique est présente (0…1).
    public var clipVolumeWhenMusic: Double = 0.5
    public init(audioID: UUID, title: String, sourceDuration: Double) {
        self.audioID = audioID; self.title = title; self.sourceDuration = sourceDuration
    }
}

/// Projet de montage, sauvegardé (chiffré) pour reprendre plus tard.
public struct VideoProject: Codable, Sendable, Hashable, Identifiable {
    public var id: UUID = UUID()
    public var name: String
    public var createdAt: Date
    public var modifiedAt: Date
    public var clips: [VideoClip] = []
    public var texts: [TextOverlay] = []
    public var music: MusicTrack?
    public var aspect: ProjectAspect = .original
    public var resolution: ExportResolution = .p1080
    /// Durée d'affichage par défaut d'une photo.
    public var stillDuration: Double = 3

    public init(name: String, createdAt: Date = Date()) {
        self.name = name
        self.createdAt = createdAt
        self.modifiedAt = createdAt
    }

    public mutating func moveClip(from: Int, to: Int) {
        guard clips.indices.contains(from), to >= 0, to <= clips.count else { return }
        let c = clips.remove(at: from)
        clips.insert(c, at: min(to, clips.count))
    }

    /// Coupe un clip à un instant de la sortie (s) : renvoie false si hors du clip.
    @discardableResult
    public mutating func split(at outputTime: Double) -> Bool {
        let layout = TimelineLayout(project: self)
        guard let seg = layout.clips.first(where: { outputTime > $0.start + 0.05 && outputTime < $0.end - 0.05 }) else { return false }
        var first = clips[seg.index]
        var second = first
        second.id = UUID()
        let sourceCut = first.sourceStart + (outputTime - seg.start) * first.speed
        first.sourceEnd = sourceCut
        first.transitionOut = .none
        second.sourceStart = sourceCut
        clips[seg.index] = first
        clips.insert(second, at: seg.index + 1)
        return true
    }
}

/// Calcul du placement des clips dans le temps (pistes A/B pour les transitions).
public struct TimelineLayout: Sendable, Equatable {
    public struct ClipSegment: Sendable, Equatable {
        public var index: Int
        public var track: Int
        public var start: Double
        public var duration: Double
        public var sourceStart: Double
        public var sourceDuration: Double
        public var end: Double { start + duration }
    }
    public struct TransitionSegment: Sendable, Equatable {
        public var fromIndex: Int
        public var toIndex: Int
        public var kind: TransitionKind
        public var start: Double
        public var duration: Double
        public var end: Double { start + duration }
    }

    public var clips: [ClipSegment] = []
    public var transitions: [TransitionSegment] = []
    public var duration: Double = 0

    public init(project: VideoProject) {
        var t = 0.0
        let cs = project.clips
        for (i, c) in cs.enumerated() {
            var start = t
            if i > 0 {
                let prev = cs[i - 1]
                if prev.transitionOut != .none {
                    let d = TimelineLayout.effectiveTransition(prev, c)
                    if d > 0 {
                        start = t - d
                        transitions.append(TransitionSegment(fromIndex: i - 1, toIndex: i, kind: prev.transitionOut, start: start, duration: d))
                    }
                }
            }
            let track = clips.last.map { last in
                transitions.last?.toIndex == i ? 1 - last.track : last.track
            } ?? 0
            clips.append(ClipSegment(index: i, track: track, start: start, duration: c.outputDuration,
                                     sourceStart: c.sourceStart, sourceDuration: c.trimmedDuration))
            t = start + c.outputDuration
        }
        duration = t
    }

    /// La transition ne peut pas dépasser la moitié de chacun des deux clips voisins.
    public static func effectiveTransition(_ a: VideoClip, _ b: VideoClip) -> Double {
        max(0, min(a.transitionDuration, a.outputDuration / 2, b.outputDuration / 2))
    }

    /// Pour un temps de sortie, renvoie le(s) clip(s) visible(s) et la progression de la transition.
    public func frame(at time: Double) -> (primary: Int?, secondary: Int?, progress: Double, kind: TransitionKind) {
        if let tr = transitions.first(where: { time >= $0.start && time < $0.end }) {
            return (tr.fromIndex, tr.toIndex, (time - tr.start) / tr.duration, tr.kind)
        }
        let c = clips.last(where: { time >= $0.start && time < $0.end })
        return (c?.index, nil, 0, .none)
    }

    /// Correspondance temps de sortie → temps dans la source d'un clip.
    public func sourceTime(clip index: Int, outputTime: Double, speed: Double) -> Double {
        guard let seg = clips.first(where: { $0.index == index }) else { return 0 }
        return seg.sourceStart + (outputTime - seg.start) * speed
    }
}
