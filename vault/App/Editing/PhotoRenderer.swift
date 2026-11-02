import CoreImage
import CoreImage.CIFilterBuiltins
import UIKit
import ImageIO
import Vision
import VaultCore

/// Moteur de rendu non destructif : applique une EditRecipe à l'image originale avec Core Image (GPU / Metal).
/// Ordre : géométrie (rotation, miroir, perspective, redressement, recadrage) → auto → lumière → couleur
/// → détails → filtre → ajustements locaux → retouches ponctuelles → flou d'arrière-plan → vignettage.
final class PhotoRenderer: @unchecked Sendable {
    static let shared = PhotoRenderer()
    let context: CIContext

    init() {
        context = CIContext(options: [.workingColorSpace: CGColorSpace(name: CGColorSpace.extendedLinearSRGB)!,
                                      .cacheIntermediates: false])
    }

    // MARK: Chargement

    static func ciImage(from data: Data) -> CIImage? {
        CIImage(data: data, options: [.applyOrientationProperty: true])
    }

    /// Version réduite pour l'édition interactive (fluide même sur des photos 48 Mpx).
    static func preview(of image: CIImage, maxSide: CGFloat) -> CIImage {
        let s = min(1, maxSide / max(image.extent.width, image.extent.height))
        guard s < 1 else { return image }
        let f = CIFilter.lanczosScaleTransform()
        f.inputImage = image
        f.scale = Float(s)
        f.aspectRatio = 1
        let out = f.outputImage ?? image
        return out.transformed(by: CGAffineTransform(translationX: -out.extent.minX, y: -out.extent.minY))
    }

    // MARK: Géométrie

    func applyGeometry(_ image: CIImage, _ c: CropSettings) -> CIImage {
        var img = image
        let turns = ((c.quarterTurns % 4) + 4) % 4
        if turns != 0 { img = img.oriented([.up, .left, .down, .right][turns]) }
        if c.flipHorizontal { img = img.oriented(.upMirrored) }
        if c.flipVertical { img = img.oriented(.downMirrored) }
        img = normalize(img)
        if abs(c.perspectiveVertical) > 0.001 || abs(c.perspectiveHorizontal) > 0.001 {
            img = perspective(img, vertical: c.perspectiveVertical, horizontal: c.perspectiveHorizontal)
        }
        if abs(c.straighten) > 0.01 { img = straighten(img, degrees: c.straighten) }
        if !c.rect.isFull {
            let e = img.extent
            let r = c.rect.clamped()
            // Rect normalisé (origine en haut à gauche) → repère Core Image (origine en bas à gauche).
            let crop = CGRect(x: e.minX + r.x * e.width, y: e.minY + (1 - r.y - r.height) * e.height,
                              width: r.width * e.width, height: r.height * e.height).integral
            img = normalize(img.cropped(to: crop))
        }
        return img
    }

    func normalize(_ img: CIImage) -> CIImage {
        img.transformed(by: CGAffineTransform(translationX: -img.extent.minX, y: -img.extent.minY))
    }

    /// Rotation fine + agrandissement automatique pour ne jamais montrer de coins vides.
    func straighten(_ img: CIImage, degrees: Double) -> CIImage {
        let e = img.extent
        let a = degrees * .pi / 180
        let w = e.width, h = e.height
        let scale = (w * abs(cos(a)) + h * abs(sin(a))) / w
        let scale2 = (w * abs(sin(a)) + h * abs(cos(a))) / h
        let s = max(scale, scale2)
        let t = CGAffineTransform(translationX: e.midX, y: e.midY).rotated(by: a).scaledBy(x: s, y: s).translatedBy(x: -e.midX, y: -e.midY)
        return normalize(img.clampedToExtent().transformed(by: t).cropped(to: e))
    }

    /// Correction de perspective (verticale / horizontale) par transformation projective.
    func perspective(_ img: CIImage, vertical v: Double, horizontal h: Double) -> CIImage {
        let e = img.extent
        let dv = CGFloat(v) * e.width * 0.25, dh = CGFloat(h) * e.height * 0.25
        let f = CIFilter.perspectiveTransform()
        f.inputImage = img
        // v > 0 : resserre le haut (corrige les verticales fuyantes vers le haut).
        f.topLeft = CGPoint(x: e.minX + max(0, dv), y: e.maxY - max(0, dh))
        f.topRight = CGPoint(x: e.maxX - max(0, dv), y: e.maxY - max(0, -dh))
        f.bottomLeft = CGPoint(x: e.minX + max(0, -dv), y: e.minY + max(0, dh))
        f.bottomRight = CGPoint(x: e.maxX - max(0, -dv), y: e.minY + max(0, -dh))
        guard let out = f.outputImage else { return img }
        // Recadre au plus grand rectangle intérieur.
        let inset = CGRect(x: out.extent.minX + abs(dv), y: out.extent.minY + abs(dh),
                           width: out.extent.width - 2 * abs(dv), height: out.extent.height - 2 * abs(dh))
        let cropped = out.cropped(to: inset.intersection(out.extent))
        // Ramène à la taille d'origine.
        let sx = e.width / cropped.extent.width, sy = e.height / cropped.extent.height
        return normalize(normalize(cropped).transformed(by: CGAffineTransform(scaleX: sx, y: sy)))
    }

    // MARK: Réglages

    func applyAdjustments(_ image: CIImage, _ adj: [Adjustment: Double]) -> CIImage {
        var img = image
        func v(_ a: Adjustment) -> Double { adj[a] ?? 0 }

        if v(.exposure) != 0 {
            let f = CIFilter.exposureAdjust(); f.inputImage = img; f.ev = Float(v(.exposure) / 100 * 2); img = f.outputImage ?? img
        }
        if v(.brightness) != 0 || v(.contrast) != 0 || v(.saturation) != 0 {
            let f = CIFilter.colorControls(); f.inputImage = img
            f.brightness = Float(v(.brightness) / 100 * 0.22)
            f.contrast = Float(1 + v(.contrast) / 100 * 0.45)
            f.saturation = Float(max(0, 1 + v(.saturation) / 100))
            img = f.outputImage ?? img
        }
        // Ombres (+) / hautes lumières (-) : réglage local adaptatif.
        let sh = v(.shadows), hl = v(.highlights)
        if sh > 0 || hl < 0 {
            let f = CIFilter.highlightShadowAdjust(); f.inputImage = img
            f.shadowAmount = Float(max(0, sh) / 100)
            f.highlightAmount = Float(1 + min(0, hl) / 100 * 0.9)
            f.radius = 10
            img = f.outputImage ?? img
        }
        // Courbe de tons : noirs, ombres (-), hautes lumières (+), blancs.
        let bl = v(.blacks), wh = v(.whites)
        if bl != 0 || wh != 0 || sh < 0 || hl > 0 {
            let f = CIFilter.toneCurve(); f.inputImage = img
            f.point0 = CGPoint(x: 0, y: max(0, bl / 100 * 0.12))
            f.point1 = CGPoint(x: 0.25, y: 0.25 + min(0, sh) / 100 * 0.1 + min(0, bl) / 100 * 0.06)
            f.point2 = CGPoint(x: 0.5, y: 0.5)
            f.point3 = CGPoint(x: 0.75, y: 0.75 + max(0, hl) / 100 * 0.1 + max(0, wh) / 100 * 0.05)
            f.point4 = CGPoint(x: 1, y: 1 + min(0, wh) / 100 * 0.15)
            img = f.outputImage ?? img
        }
        if v(.vibrance) != 0 {
            let f = CIFilter.vibrance(); f.inputImage = img; f.amount = Float(v(.vibrance) / 100); img = f.outputImage ?? img
        }
        if v(.temperature) != 0 || v(.tint) != 0 {
            let f = CIFilter.temperatureAndTint(); f.inputImage = img
            // Neutre plus froid que la cible ⇒ image réchauffée.
            f.neutral = CIVector(x: 6500 + CGFloat(v(.temperature)) * 35, y: CGFloat(-v(.tint)) * 0.8)
            f.targetNeutral = CIVector(x: 6500, y: 0)
            img = f.outputImage ?? img
        }
        if v(.noiseReduction) > 0 {
            let f = CIFilter.noiseReduction(); f.inputImage = img
            f.noiseLevel = Float(v(.noiseReduction) / 100 * 0.06); f.sharpness = 0.4
            img = f.outputImage ?? img
        }
        if v(.definition) > 0 {
            let f = CIFilter.unsharpMask(); f.inputImage = img
            f.radius = Float(max(img.extent.width, img.extent.height) / 120)
            f.intensity = Float(v(.definition) / 100 * 0.6)
            img = f.outputImage ?? img
        }
        if v(.sharpness) > 0 {
            let f = CIFilter.sharpenLuminance(); f.inputImage = img
            f.sharpness = Float(v(.sharpness) / 100 * 1.2); f.radius = 1.6
            img = f.outputImage ?? img
        }
        return img.cropped(to: image.extent)
    }

    func applyLook(_ image: CIImage, preset: FilterPreset, intensity: Double) -> CIImage {
        guard intensity > 0.001 else { return image }
        var look = image
        if preset.monochrome {
            let f = CIFilter.photoEffectMono(); f.inputImage = look; look = f.outputImage ?? look
        }
        let (r, g, b) = preset.colorCast
        if r != 1 || g != 1 || b != 1 || preset.fade > 0 {
            let fade = CGFloat(preset.fade) * 0.12
            let f = CIFilter.colorMatrix(); f.inputImage = look
            f.rVector = CIVector(x: CGFloat(r) * (1 - fade), y: 0, z: 0, w: 0)
            f.gVector = CIVector(x: 0, y: CGFloat(g) * (1 - fade), z: 0, w: 0)
            f.bVector = CIVector(x: 0, y: 0, z: CGFloat(b) * (1 - fade), w: 0)
            f.biasVector = CIVector(x: fade, y: fade, z: fade, w: 0)
            look = f.outputImage ?? look
        }
        if preset.grain > 0 { look = addGrain(look, amount: preset.grain) }
        look = look.cropped(to: image.extent)
        if intensity >= 0.999 { return look }
        let d = CIFilter.dissolveTransition()
        d.inputImage = image; d.targetImage = look; d.time = Float(intensity)
        return d.outputImage?.cropped(to: image.extent) ?? look
    }

    func addGrain(_ image: CIImage, amount: Double) -> CIImage {
        guard let noise = CIFilter.randomGenerator().outputImage else { return image }
        let scale = max(1, max(image.extent.width, image.extent.height) / 1500)
        let mono = CIFilter.colorMatrix()
        mono.inputImage = noise.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let k = CGFloat(amount) * 0.18
        mono.rVector = CIVector(x: k, y: 0, z: 0, w: 0)
        mono.gVector = CIVector(x: k, y: 0, z: 0, w: 0)
        mono.bVector = CIVector(x: k, y: 0, z: 0, w: 0)
        mono.biasVector = CIVector(x: 0.5 - k / 2, y: 0.5 - k / 2, z: 0.5 - k / 2, w: 0)
        mono.aVector = CIVector(x: 0, y: 0, z: 0, w: 1)
        let blend = CIFilter.softLightBlendMode()
        blend.inputImage = mono.outputImage?.cropped(to: image.extent)
        blend.backgroundImage = image
        return blend.outputImage ?? image
    }

    func radialMask(center: CGPoint, radius: CGFloat, feather: CGFloat, inverted: Bool, extent: CGRect) -> CIImage {
        let g = CIFilter.radialGradient()
        g.center = center
        g.radius0 = Float(radius * (1 - feather))
        g.radius1 = Float(radius)
        g.color0 = inverted ? .black : .white
        g.color1 = inverted ? .white : .black
        return g.outputImage!.cropped(to: extent)
    }

    func applyLocal(_ image: CIImage, _ locals: [LocalAdjustment]) -> CIImage {
        var img = image
        let e = image.extent
        let minSide = min(e.width, e.height)
        for l in locals {
            var adjusted = img
            var adj: [Adjustment: Double] = [:]
            adj[.exposure] = l.exposure; adj[.saturation] = l.saturation; adj[.contrast] = l.contrast; adj[.temperature] = l.temperature
            adjusted = applyAdjustments(adjusted, adj)
            let center = CGPoint(x: e.minX + l.x * e.width, y: e.minY + (1 - l.y) * e.height)
            let mask = radialMask(center: center, radius: l.radius * minSide, feather: l.feather, inverted: l.inverted, extent: e)
            let b = CIFilter.blendWithMask()
            b.inputImage = adjusted; b.backgroundImage = img; b.maskImage = mask
            img = b.outputImage?.cropped(to: e) ?? img
        }
        return img
    }

    /// Correcteur ponctuel : recouvre l'imperfection par une zone voisine, fondue en douceur.
    func applyHeal(_ image: CIImage, _ spots: [HealSpot]) -> CIImage {
        var img = image
        let e = image.extent
        let minSide = min(e.width, e.height)
        for s in spots {
            let r = s.radius * minSide
            let center = CGPoint(x: e.minX + s.x * e.width, y: e.minY + (1 - s.y) * e.height)
            let shift = CGAffineTransform(translationX: -s.sourceDX * e.width, y: s.sourceDY * e.height)
            let source = img.clampedToExtent().transformed(by: shift).cropped(to: e)
            // Égalisation de luminosité entre la source et l'entourage de la cible.
            let mask = radialMask(center: center, radius: r, feather: 0.55, inverted: false, extent: e)
            let b = CIFilter.blendWithMask()
            b.inputImage = source; b.backgroundImage = img; b.maskImage = mask
            img = b.outputImage?.cropped(to: e) ?? img
        }
        return img
    }

    /// Choisit automatiquement la zone source la plus proche en couleur de l'entourage du défaut.
    func bestHealOffset(_ image: CIImage, x: Double, y: Double, radius: Double) -> (Double, Double) {
        let e = image.extent
        let minSide = min(e.width, e.height)
        let r = radius * minSide
        let c = CGPoint(x: e.minX + x * e.width, y: e.minY + (1 - y) * e.height)
        func average(_ rect: CGRect) -> SIMD4<Float>? {
            let rr = rect.intersection(e)
            guard !rr.isEmpty else { return nil }
            let f = CIFilter.areaAverage(); f.inputImage = image; f.extent = rr
            guard let out = f.outputImage else { return nil }
            var px = [Float](repeating: 0, count: 4)
            context.render(out, toBitmap: &px, rowBytes: 16, bounds: CGRect(origin: out.extent.origin, size: CGSize(width: 1, height: 1)), format: .RGBAf, colorSpace: nil)
            return SIMD4(px[0], px[1], px[2], px[3])
        }
        let ring = CGRect(x: c.x - r * 1.6, y: c.y - r * 1.6, width: r * 3.2, height: r * 3.2)
        guard let target = average(ring) else { return (0, 2.2 * radius) }
        var best = (0.0, 2.2 * radius * minSide / e.height)
        var bestScore = Float.greatestFiniteMagnitude
        for k in 0..<8 {
            let a = Double(k) * .pi / 4
            let dx = cos(a) * 2.2 * r, dy = sin(a) * 2.2 * r
            let rect = CGRect(x: c.x + dx - r, y: c.y + dy - r, width: 2 * r, height: 2 * r)
            guard e.contains(rect), let avg = average(rect) else { continue }
            let d = avg - target
            let score = (d * d).sum()
            if score < bestScore { bestScore = score; best = (dx / e.width, -dy / e.height) }
        }
        return best
    }

    /// Masque du sujet (personnes, animaux, objets) calculé localement par Vision.
    func subjectMask(for image: CIImage) -> CIImage? {
        let small = PhotoRenderer.preview(of: image, maxSide: 1024)
        guard let cg = context.createCGImage(small, from: small.extent) else { return nil }
        let handler = VNImageRequestHandler(cgImage: cg, options: [:])
        var maskBuffer: CVPixelBuffer?
        let fg = VNGenerateForegroundInstanceMaskRequest()
        if (try? handler.perform([fg])) != nil, let obs = fg.results?.first {
            maskBuffer = try? obs.generateScaledMaskForImage(forInstances: obs.allInstances, from: handler)
        }
        if maskBuffer == nil {
            let person = VNGeneratePersonSegmentationRequest()
            person.qualityLevel = .accurate
            if (try? handler.perform([person])) != nil { maskBuffer = person.results?.first?.pixelBuffer }
        }
        guard let buf = maskBuffer else { return nil }
        let mask = CIImage(cvPixelBuffer: buf)
        let sx = image.extent.width / mask.extent.width, sy = image.extent.height / mask.extent.height
        return mask.transformed(by: CGAffineTransform(scaleX: sx, y: sy)).cropped(to: image.extent)
    }

    func applyBackgroundBlur(_ image: CIImage, amount: Double, mask: CIImage?) -> CIImage {
        guard amount > 0.001, let mask else { return image }
        // Le flou s'applique là où le masque est blanc : on inverse le masque du sujet.
        let inv = CIFilter.colorInvert(); inv.inputImage = mask
        let soft = CIFilter.gaussianBlur(); soft.inputImage = inv.outputImage; soft.radius = 4
        let f = CIFilter.maskedVariableBlur()
        f.inputImage = image.clampedToExtent()
        f.mask = soft.outputImage?.cropped(to: image.extent)
        f.radius = Float(amount * Double(max(image.extent.width, image.extent.height)) / 60)
        return f.outputImage?.cropped(to: image.extent) ?? image
    }

    func applyVignette(_ image: CIImage, amount: Double) -> CIImage {
        guard amount > 0 else { return image }
        let e = image.extent
        let f = CIFilter.vignetteEffect()
        f.inputImage = image
        f.center = CGPoint(x: e.midX, y: e.midY)
        f.radius = Float(hypot(e.width, e.height) / 2 * 0.78)
        f.intensity = Float(amount / 100 * 0.9)
        f.falloff = 0.6
        return f.outputImage?.cropped(to: e) ?? image
    }

    /// Corrections automatiques d'Apple (balance des visages, vibrance, courbe, ombres).
    func applyAuto(_ image: CIImage) -> CIImage {
        var img = image
        for f in image.autoAdjustmentFilters(options: [.redEye: false]) {
            f.setValue(img, forKey: kCIInputImageKey)
            img = f.outputImage ?? img
        }
        return img.cropped(to: image.extent)
    }

    // MARK: Pipeline complet

    func render(_ original: CIImage, recipe: EditRecipe, subjectMask: CIImage? = nil) -> CIImage {
        var img = applyGeometry(original, recipe.crop)
        if recipe.autoEnhanced { img = applyAuto(img) }
        var adj = recipe.effectiveAdjustments()
        let vignette = adj.removeValue(forKey: .vignette) ?? 0
        img = applyAdjustments(img, adj)
        if let f = recipe.filter, let p = FilterPreset.byID(f.presetID) { img = applyLook(img, preset: p, intensity: f.intensity) }
        if !recipe.localAdjustments.isEmpty { img = applyLocal(img, recipe.localAdjustments) }
        if !recipe.healSpots.isEmpty { img = applyHeal(img, recipe.healSpots) }
        if recipe.backgroundBlur > 0 {
            let mask = subjectMask ?? self.subjectMask(for: img)
            img = applyBackgroundBlur(img, amount: recipe.backgroundBlur, mask: mask)
        }
        img = applyVignette(img, amount: vignette)
        return img
    }

    func cgImage(_ image: CIImage) -> CGImage? {
        context.createCGImage(image, from: image.extent, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.displayP3))
    }

    /// Rendu pleine résolution encodé en HEIC (qualité élevée) + miniature JPEG.
    func export(_ image: CIImage, maxThumb: CGFloat = 480) -> (full: Data?, thumb: Data?) {
        let space = CGColorSpace(name: CGColorSpace.displayP3)!
        let full = context.heifRepresentation(of: image, format: .RGBA8, colorSpace: space,
                                              options: [CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): 0.92])
            ?? context.jpegRepresentation(of: image, colorSpace: space, options: [:])
        let small = PhotoRenderer.preview(of: image, maxSide: maxThumb)
        let thumb = context.jpegRepresentation(of: small, colorSpace: space,
                                               options: [CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): 0.82])
        return (full, thumb)
    }
}
