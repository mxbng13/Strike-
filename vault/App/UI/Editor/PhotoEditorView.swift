import SwiftUI
import CoreImage
import VaultCore

/// Éditeur photo non destructif : réglages, filtres, recadrage, retouches, avant/après, annulation.
struct PhotoEditorView: View {
    @EnvironmentObject var library: MediaLibrary
    @Environment(\.dismiss) var dismiss
    let item: MediaItem

    enum Tool: String, CaseIterable, Identifiable {
        case adjust = "Réglages", filters = "Filtres", crop = "Recadrer", retouch = "Retouche"
        var id: String { rawValue }
        var symbol: String {
            switch self { case .adjust: return "dial.medium"; case .filters: return "camera.filters"; case .crop: return "crop.rotate"; case .retouch: return "bandage" }
        }
    }
    enum RetouchMode: String, CaseIterable, Identifiable {
        case heal = "Correcteur", local = "Local", blur = "Flou d'arrière-plan"
        var id: String { rawValue }
    }

    @State private var recipe = EditRecipe()
    @State private var undo: [EditRecipe] = []
    @State private var redo: [EditRecipe] = []
    @State private var base: CIImage?
    @State private var rendered: CGImage?
    @State private var originalPreview: CGImage?
    @State private var showOriginal = false
    @State private var tool: Tool = .adjust
    @State private var adjustment: Adjustment = .exposure
    @State private var retouchMode: RetouchMode = .heal
    @State private var healRadius = 0.03
    @State private var selectedLocal: UUID?
    @State private var filterThumbs: [String: CGImage] = [:]
    @State private var renderTask: Task<Void, Never>?
    @State private var subjectMask: CIImage?
    @State private var maskKey: CropSettings?
    @State private var computingMask = false
    @State private var saving = false
    @State private var confirmDiscard = false
    @State private var sliderStart: EditRecipe?

    let renderer = PhotoRenderer.shared

    var body: some View {
        VStack(spacing: 0) {
            topBar
            canvas
            controls
        }
        .background(Color.black.ignoresSafeArea())
        .preferredColorScheme(.dark)
        .task { await load() }
        .onChange(of: recipe) { _, _ in scheduleRender() }
        .confirmationDialog("Abandonner les modifications ?", isPresented: $confirmDiscard, titleVisibility: .visible) {
            Button("Abandonner", role: .destructive) { dismiss() }
        }
        .overlay { if saving { savingOverlay } }
    }

    // MARK: Barre du haut

    var topBar: some View {
        HStack(spacing: 16) {
            Button("Annuler") { if recipe != (item.edit ?? EditRecipe()) { confirmDiscard = true } else { dismiss() } }
            Spacer()
            Button { applyUndo() } label: { Image(systemName: "arrow.uturn.backward") }.disabled(undo.isEmpty)
            Button { applyRedo() } label: { Image(systemName: "arrow.uturn.forward") }.disabled(redo.isEmpty)
            Button {
                commit { $0.autoEnhanced.toggle() }
            } label: {
                Image(systemName: recipe.autoEnhanced ? "wand.and.stars.inverse" : "wand.and.stars")
            }
            .accessibilityLabel("Amélioration automatique")
            Menu {
                Button("Réinitialiser toutes les modifications", role: .destructive) { commit { $0 = EditRecipe() } }
            } label: { Image(systemName: "arrow.counterclockwise.circle") }
            Spacer()
            Button("OK") { Task { await save() } }.bold().disabled(base == nil)
        }
        .padding(.horizontal).padding(.vertical, 10)
        .foregroundStyle(.white)
    }

    // MARK: Zone d'image

    var canvas: some View {
        GeometryReader { geo in
            ZStack {
                if let img = showOriginal ? originalPreview : rendered {
                    let size = CGSize(width: img.width, height: img.height)
                    let rect = fitRect(size, in: geo.size)
                    Image(decorative: img, scale: 1).resizable().scaledToFit()
                        .frame(width: rect.width, height: rect.height)
                        .position(x: rect.midX, y: rect.midY)
                        .overlay {
                            if tool == .crop && !showOriginal {
                                CropOverlay(rect: Binding(get: { recipe.crop.rect }, set: { r in recipe.crop.rect = r }),
                                            ratio: aspectRatio(size), imageRect: rect,
                                            onBegin: { sliderStart = recipe }, onEnd: { endInteraction() })
                            }
                            if tool == .retouch && retouchMode == .local {
                                ForEach(recipe.localAdjustments) { l in
                                    Circle().strokeBorder(.white.opacity(l.id == selectedLocal ? 0.9 : 0.4), lineWidth: 1.5)
                                        .frame(width: l.radius * 2 * min(rect.width, rect.height), height: l.radius * 2 * min(rect.width, rect.height))
                                        .position(x: rect.minX + l.x * rect.width, y: rect.minY + l.y * rect.height)
                                        .allowsHitTesting(false)
                                }
                            }
                        }
                        .contentShape(Rectangle())
                        .gesture(SpatialTapGesture().onEnded { v in tapped(v.location, in: rect) })
                        .simultaneousGesture(LongPressGesture(minimumDuration: 0.25).sequenced(before: DragGesture(minimumDistance: 0))
                            .onChanged { v in if case .second(true, _) = v, tool != .crop { showOriginal = true } }
                            .onEnded { _ in showOriginal = false })
                } else {
                    ProgressView().tint(.white)
                }
                VStack {
                    if showOriginal {
                        Text("ORIGINAL").font(.caption2.weight(.bold)).tracking(2).padding(.horizontal, 10).padding(.vertical, 5)
                            .background(.ultraThinMaterial, in: Capsule())
                    }
                    Spacer()
                    if tool != .crop && !showOriginal {
                        Text("Maintenez l'image pour voir l'original").font(.caption2).foregroundStyle(.white.opacity(0.5))
                    }
                }
                .padding(8)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .padding(.horizontal, 8)
    }

    func fitRect(_ img: CGSize, in box: CGSize) -> CGRect {
        let s = min(box.width / img.width, box.height / img.height)
        let w = img.width * s, h = img.height * s
        return CGRect(x: (box.width - w) / 2, y: (box.height - h) / 2, width: w, height: h)
    }

    func aspectRatio(_ shown: CGSize) -> Double? {
        recipe.crop.aspect.ratio(originalAspect: Double(shown.width / shown.height))
    }

    // MARK: Contrôles

    var controls: some View {
        VStack(spacing: 14) {
            switch tool {
            case .adjust: adjustControls
            case .filters: filterControls
            case .crop: cropControls
            case .retouch: retouchControls
            }
            HStack {
                ForEach(Tool.allCases) { t in
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) { tool = t }
                        scheduleRender()
                    } label: {
                        VStack(spacing: 4) {
                            Image(systemName: t.symbol).font(.system(size: 19))
                            Text(t.rawValue).font(.caption2)
                        }
                        .frame(maxWidth: .infinity)
                        .foregroundStyle(tool == t ? Color.yellow : .white.opacity(0.75))
                    }
                }
            }
            .padding(.bottom, 6)
        }
        .padding(.top, 10)
        .frame(height: 230, alignment: .top)
    }

    var adjustControls: some View {
        VStack(spacing: 12) {
            HStack {
                Text(adjustment.label).font(.footnote.weight(.semibold))
                Spacer()
                Text("\(Int(recipe.value(adjustment)))").font(.footnote.monospacedDigit()).foregroundStyle(.secondary)
                if recipe.value(adjustment) != 0 {
                    Button("Réinit.") { commit { $0.set(adjustment, 0) } }.font(.caption)
                }
            }
            .padding(.horizontal)
            EditSlider(value: Binding(get: { recipe.value(adjustment) }, set: { recipe.set(adjustment, $0) }),
                       range: adjustment.range, onBegin: { sliderStart = recipe }, onEnd: endInteraction)
                .padding(.horizontal)
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(Adjustment.allCases) { a in
                            Button { adjustment = a; Haptics.selection() } label: {
                                ZStack {
                                    Circle().strokeBorder(a == adjustment ? Color.yellow : .white.opacity(0.3), lineWidth: 1.5)
                                    if recipe.value(a) != 0 {
                                        Circle().trim(from: 0, to: abs(recipe.value(a)) / (a.range.upperBound))
                                            .stroke(Color.yellow, lineWidth: 2).rotationEffect(.degrees(-90))
                                    }
                                    Image(systemName: a.symbol).font(.system(size: 16))
                                }
                                .frame(width: 48, height: 48)
                                .foregroundStyle(a == adjustment ? Color.yellow : .white)
                            }
                            .id(a)
                        }
                    }
                    .padding(.horizontal)
                }
                .onChange(of: adjustment) { _, a in withAnimation { proxy.scrollTo(a, anchor: .center) } }
            }
        }
        .foregroundStyle(.white)
    }

    var filterControls: some View {
        VStack(spacing: 12) {
            if let f = recipe.filter, let p = FilterPreset.byID(f.presetID) {
                HStack {
                    Text(p.name).font(.footnote.weight(.semibold))
                    Spacer()
                    Text("\(Int(f.intensity * 100)) %").font(.footnote.monospacedDigit()).foregroundStyle(.secondary)
                }
                .padding(.horizontal)
                EditSlider(value: Binding(get: { (recipe.filter?.intensity ?? 1) * 100 }, set: { recipe.filter?.intensity = $0 / 100 }),
                           range: 0...100, onBegin: { sliderStart = recipe }, onEnd: endInteraction)
                    .padding(.horizontal)
            } else {
                Text("Choisissez un filtre, puis réglez son intensité.").font(.footnote).foregroundStyle(.secondary).frame(height: 52)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    filterCell(nil, name: "Original")
                    ForEach(FilterPreset.all) { p in filterCell(p, name: p.name) }
                }
                .padding(.horizontal)
            }
        }
        .foregroundStyle(.white)
        .task { await buildFilterThumbs() }
    }

    func filterCell(_ p: FilterPreset?, name: String) -> some View {
        let selected = recipe.filter?.presetID == p?.id
        return Button {
            Haptics.selection()
            commit { r in r.filter = p.map { FilterSelection(presetID: $0.id, intensity: r.filter?.presetID == $0.id ? r.filter!.intensity : 1) } }
        } label: {
            VStack(spacing: 5) {
                Group {
                    if let cg = filterThumbs[p?.id ?? "original"] { Image(decorative: cg, scale: 1).resizable().scaledToFill() }
                    else { Rectangle().fill(.white.opacity(0.1)) }
                }
                .frame(width: 64, height: 64).clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(selected ? Color.yellow : .clear, lineWidth: 2))
                Text(name).font(.caption2).foregroundStyle(selected ? Color.yellow : .white.opacity(0.8))
            }
        }
    }

    var cropControls: some View {
        VStack(spacing: 12) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(AspectPreset.allCases) { a in
                        Button(a.label) {
                            commit { r in
                                r.crop.aspect = a
                                if let ratio = a.ratio(originalAspect: currentGeometryAspect) {
                                    r.crop.rect = NormalizedRect.full.fitted(toPixelRatio: ratio, imageAspect: currentGeometryAspect)
                                }
                            }
                        }
                        .font(.caption.weight(.semibold)).padding(.horizontal, 12).padding(.vertical, 7)
                        .background(Capsule().fill(recipe.crop.aspect == a ? Color.yellow : .white.opacity(0.12)))
                        .foregroundStyle(recipe.crop.aspect == a ? .black : .white)
                    }
                }
                .padding(.horizontal)
            }
            labeledSlider("Redresser", value: Binding(get: { recipe.crop.straighten }, set: { recipe.crop.straighten = $0 }), range: -45...45, unit: "°")
            labeledSlider("Perspective V", value: Binding(get: { recipe.crop.perspectiveVertical * 100 }, set: { recipe.crop.perspectiveVertical = $0 / 100 }), range: -100...100, unit: "")
            labeledSlider("Perspective H", value: Binding(get: { recipe.crop.perspectiveHorizontal * 100 }, set: { recipe.crop.perspectiveHorizontal = $0 / 100 }), range: -100...100, unit: "")
            HStack(spacing: 28) {
                Button { commit { $0.crop.quarterTurns = ($0.crop.quarterTurns + 1) % 4; $0.crop.rect = .full } } label: { Image(systemName: "rotate.left") }
                Button { commit { $0.crop.flipHorizontal.toggle() } } label: { Image(systemName: "arrow.left.and.right.righttriangle.left.righttriangle.right") }
                Button { commit { $0.crop.flipVertical.toggle() } } label: { Image(systemName: "arrow.up.and.down.righttriangle.up.righttriangle.down") }
                Button("Réinit.") { commit { $0.crop = CropSettings() } }.font(.caption)
            }
            .font(.title3)
        }
        .foregroundStyle(.white)
    }

    var currentGeometryAspect: Double {
        guard let base else { return 1 }
        var c = recipe.crop; c.rect = .full
        let e = renderer.applyGeometry(base, c).extent
        return Double(e.width / max(e.height, 1))
    }

    func labeledSlider(_ title: String, value: Binding<Double>, range: ClosedRange<Double>, unit: String) -> some View {
        HStack {
            Text(title).font(.caption).frame(width: 92, alignment: .leading)
            Slider(value: value, in: range) { editing in if editing { sliderStart = recipe } else { endInteraction() } }
                .tint(.yellow)
            Text("\(Int(value.wrappedValue))\(unit)").font(.caption.monospacedDigit()).frame(width: 40, alignment: .trailing)
        }
        .padding(.horizontal)
    }

    var retouchControls: some View {
        VStack(spacing: 10) {
            Picker("Outil", selection: $retouchMode) {
                ForEach(RetouchMode.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented).padding(.horizontal)
            switch retouchMode {
            case .heal:
                Text("Touchez une imperfection pour la corriger (\(recipe.healSpots.count) correction(s)).").font(.caption).foregroundStyle(.secondary)
                labeledSlider("Taille", value: Binding(get: { healRadius * 1000 }, set: { healRadius = $0 / 1000 }), range: 8...100, unit: "")
                if !recipe.healSpots.isEmpty {
                    Button("Annuler la dernière correction") { commit { _ = $0.healSpots.popLast() } }.font(.caption)
                }
            case .local:
                if let id = selectedLocal, let idx = recipe.localAdjustments.firstIndex(where: { $0.id == id }) {
                    ScrollView {
                        VStack(spacing: 4) {
                            labeledSlider("Exposition", value: Binding(get: { recipe.localAdjustments[idx].exposure }, set: { recipe.localAdjustments[idx].exposure = $0 }), range: -100...100, unit: "")
                            labeledSlider("Saturation", value: Binding(get: { recipe.localAdjustments[idx].saturation }, set: { recipe.localAdjustments[idx].saturation = $0 }), range: -100...100, unit: "")
                            labeledSlider("Contraste", value: Binding(get: { recipe.localAdjustments[idx].contrast }, set: { recipe.localAdjustments[idx].contrast = $0 }), range: -100...100, unit: "")
                            labeledSlider("Température", value: Binding(get: { recipe.localAdjustments[idx].temperature }, set: { recipe.localAdjustments[idx].temperature = $0 }), range: -100...100, unit: "")
                            labeledSlider("Rayon", value: Binding(get: { recipe.localAdjustments[idx].radius * 100 }, set: { recipe.localAdjustments[idx].radius = $0 / 100 }), range: 5...90, unit: "")
                            labeledSlider("Douceur", value: Binding(get: { recipe.localAdjustments[idx].feather * 100 }, set: { recipe.localAdjustments[idx].feather = $0 / 100 }), range: 5...100, unit: "")
                            HStack {
                                Toggle("Inverser", isOn: Binding(get: { recipe.localAdjustments[idx].inverted }, set: { v in commit { $0.localAdjustments[idx].inverted = v } }))
                                Button("Supprimer", role: .destructive) { commit { $0.localAdjustments.remove(at: idx) }; selectedLocal = nil }
                            }
                            .font(.caption).padding(.horizontal)
                        }
                    }
                } else {
                    Text("Touchez l'image pour placer une zone d'ajustement radiale, puis réglez-la.").font(.caption).foregroundStyle(.secondary)
                        .multilineTextAlignment(.center).padding(.horizontal)
                }
            case .blur:
                Text("Le sujet est détecté localement par Vision (personnes, animaux, objets), puis l'arrière-plan est flouté.")
                    .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center).padding(.horizontal)
                labeledSlider("Intensité", value: Binding(get: { recipe.backgroundBlur * 100 }, set: { recipe.backgroundBlur = $0 / 100 }), range: 0...100, unit: "")
                if computingMask { ProgressView("Détection du sujet…").font(.caption) }
                else if recipe.backgroundBlur > 0 && subjectMask == nil { Text("Aucun sujet détecté sur cette photo.").font(.caption).foregroundStyle(.orange) }
            }
        }
        .foregroundStyle(.white)
    }

    var savingOverlay: some View {
        ZStack {
            Color.black.opacity(0.6).ignoresSafeArea()
            VStack(spacing: 12) {
                ProgressView().tint(.white)
                Text("Rendu en pleine résolution…").font(.footnote).foregroundStyle(.white)
            }
            .padding(24).background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
        }
    }

    // MARK: Interactions

    func tapped(_ p: CGPoint, in rect: CGRect) {
        guard rect.contains(p), tool == .retouch else { return }
        let x = Double((p.x - rect.minX) / rect.width), y = Double((p.y - rect.minY) / rect.height)
        switch retouchMode {
        case .heal:
            guard let base else { return }
            let geo = renderer.applyGeometry(base, recipe.crop)
            let (dx, dy) = renderer.bestHealOffset(geo, x: x, y: y, radius: healRadius)
            commit { $0.healSpots.append(HealSpot(x: x, y: y, radius: healRadius, sourceDX: dx, sourceDY: dy)) }
            Haptics.tap()
        case .local:
            var l = LocalAdjustment(); l.x = x; l.y = y; l.exposure = 20
            commit { $0.localAdjustments.append(l) }
            selectedLocal = l.id
        case .blur: break
        }
    }

    func commit(_ change: (inout EditRecipe) -> Void) {
        undo.append(recipe)
        redo.removeAll()
        change(&recipe)
    }

    func endInteraction() {
        if let s = sliderStart, s != recipe { undo.append(s); redo.removeAll() }
        sliderStart = nil
    }

    func applyUndo() { guard let last = undo.popLast() else { return }; redo.append(recipe); recipe = last }
    func applyRedo() { guard let next = redo.popLast() else { return }; undo.append(recipe); recipe = next }

    // MARK: Rendu

    func load() async {
        recipe = item.edit ?? EditRecipe()
        guard let data = try? await library.displayData(item.id, original: true) else { return }
        let preview: CIImage? = await Task.detached {
            PhotoRenderer.ciImage(from: data).map { PhotoRenderer.preview(of: $0, maxSide: 1600) }
        }.value
        guard let preview else { return }
        // Matérialise l'aperçu pour des rendus rapides.
        if let cg = renderer.cgImage(preview) {
            base = CIImage(cgImage: cg)
            originalPreview = cg
        }
        scheduleRender()
    }

    func scheduleRender() {
        guard let base else { return }
        let r = recipe
        var displayRecipe = r
        if tool == .crop { displayRecipe.crop.rect = .full } // on affiche toute l'image sous le cadre de recadrage
        let needsMask = r.backgroundBlur > 0
        let currentMaskKey = maskKey
        let mask = subjectMask
        renderTask?.cancel()
        renderTask = Task {
            try? await Task.sleep(nanoseconds: 12_000_000)
            guard !Task.isCancelled else { return }
            var m = mask
            if needsMask && (currentMaskKey != r.crop || m == nil) {
                computingMask = true
                let geo = renderer.applyGeometry(base, r.crop)
                m = await Task.detached { PhotoRenderer.shared.subjectMask(for: geo) }.value
                subjectMask = m
                maskKey = r.crop
                computingMask = false
            }
            let usedMask = displayRecipe.crop == r.crop ? m : nil
            let cg = await Task.detached(priority: .userInitiated) { () -> CGImage? in
                let out = PhotoRenderer.shared.render(base, recipe: displayRecipe, subjectMask: usedMask)
                return PhotoRenderer.shared.cgImage(out)
            }.value
            guard !Task.isCancelled else { return }
            rendered = cg
        }
    }

    func buildFilterThumbs() async {
        guard let base, filterThumbs.isEmpty else { return }
        let small = PhotoRenderer.preview(of: renderer.applyGeometry(base, recipe.crop), maxSide: 160)
        let result: [String: CGImage] = await Task.detached {
            var out: [String: CGImage] = [:]
            let r = PhotoRenderer.shared
            out["original"] = r.cgImage(small)
            for p in FilterPreset.all {
                var rec = EditRecipe()
                rec.filter = FilterSelection(presetID: p.id)
                out[p.id] = r.cgImage(r.render(small, recipe: rec))
            }
            return out
        }.value
        filterThumbs = result
    }

    func save() async {
        if recipe.isIdentity {
            if item.isEdited {
                await library.saveEdit(item.id, recipe: nil, rendered: nil, thumbnail: nil, label: "Retour à l'original")
                await library.regenerateThumbnail(item.id)
            }
            dismiss(); return
        }
        saving = true
        let r = recipe
        guard let data = try? await library.displayData(item.id, original: true) else { saving = false; return }
        let (full, thumb) = await Task.detached(priority: .userInitiated) { () -> (Data?, Data?) in
            guard let ci = PhotoRenderer.ciImage(from: data) else { return (nil, nil) }
            let out = PhotoRenderer.shared.render(ci, recipe: r)
            return PhotoRenderer.shared.export(out)
        }.value
        guard let full else {
            saving = false
            library.errorMessage = "Le rendu a échoué."
            return
        }
        await library.saveEdit(item.id, recipe: r, rendered: full, thumbnail: thumb, label: label(for: r))
        saving = false
        Haptics.success()
        dismiss()
    }

    func label(for r: EditRecipe) -> String {
        if let f = r.filter, let p = FilterPreset.byID(f.presetID) { return "Filtre \(p.name)" }
        return r.summary.prefix(1).uppercased() + r.summary.dropFirst()
    }
}

/// Curseur fluide avec graduation et retour haptique au centre.
struct EditSlider: View {
    @Binding var value: Double
    let range: ClosedRange<Double>
    var onBegin: () -> Void = {}
    var onEnd: () -> Void = {}
    @State private var dragging = false

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let span = range.upperBound - range.lowerBound
            let x = CGFloat((value - range.lowerBound) / span) * w
            let zeroX = CGFloat((0 - range.lowerBound) / span) * w
            ZStack(alignment: .leading) {
                HStack(spacing: 0) {
                    ForEach(0..<41) { i in
                        Rectangle().fill(.white.opacity(i % 5 == 0 ? 0.55 : 0.25)).frame(width: 1, height: i % 5 == 0 ? 14 : 8)
                        if i < 40 { Spacer(minLength: 0) }
                    }
                }
                Rectangle().fill(Color.yellow.opacity(0.7))
                    .frame(width: abs(x - zeroX), height: 3)
                    .offset(x: min(x, zeroX))
                Capsule().fill(Color.yellow).frame(width: 4, height: 28).offset(x: x - 2)
            }
            .frame(height: 30)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { g in
                    if !dragging { dragging = true; onBegin() }
                    let v = range.lowerBound + Double(min(max(0, g.location.x), w) / w) * span
                    let snapped = abs(v) < span * 0.015 ? 0 : v
                    if snapped == 0 && value != 0 { Haptics.selection() }
                    value = snapped
                }
                .onEnded { _ in dragging = false; onEnd() })
            .onTapGesture(count: 2) { onBegin(); value = 0; onEnd() }
        }
        .frame(height: 30)
    }
}

/// Cadre de recadrage : déplacement et redimensionnement par les coins, contrainte de format.
struct CropOverlay: View {
    @Binding var rect: NormalizedRect
    let ratio: Double?
    let imageRect: CGRect
    let onBegin: () -> Void
    let onEnd: () -> Void
    @State private var start: NormalizedRect?

    var body: some View {
        let r = CGRect(x: imageRect.minX + rect.x * imageRect.width, y: imageRect.minY + rect.y * imageRect.height,
                       width: rect.width * imageRect.width, height: rect.height * imageRect.height)
        ZStack {
            // Assombrit l'extérieur du cadre.
            Path { p in p.addRect(imageRect); p.addRect(r) }
                .fill(Color.black.opacity(0.55), style: FillStyle(eoFill: true))
                .allowsHitTesting(false)
            Rectangle().strokeBorder(.white, lineWidth: 1.5).frame(width: r.width, height: r.height).position(x: r.midX, y: r.midY)
            // Grille des tiers.
            Path { p in
                for i in 1...2 {
                    let fx = r.minX + r.width * CGFloat(i) / 3, fy = r.minY + r.height * CGFloat(i) / 3
                    p.move(to: CGPoint(x: fx, y: r.minY)); p.addLine(to: CGPoint(x: fx, y: r.maxY))
                    p.move(to: CGPoint(x: r.minX, y: fy)); p.addLine(to: CGPoint(x: r.maxX, y: fy))
                }
            }
            .stroke(.white.opacity(0.4), lineWidth: 0.6).allowsHitTesting(false)
            Rectangle().fill(.clear).contentShape(Rectangle()).frame(width: r.width, height: r.height).position(x: r.midX, y: r.midY)
                .gesture(drag { s, t in
                    var n = s
                    n.x = s.x + t.width / imageRect.width
                    n.y = s.y + t.height / imageRect.height
                    return n.clamped()
                })
            ForEach(0..<4) { corner in
                let pt = CGPoint(x: corner % 2 == 0 ? r.minX : r.maxX, y: corner < 2 ? r.minY : r.maxY)
                Circle().fill(.white).frame(width: 22, height: 22).shadow(radius: 2)
                    .position(pt)
                    .gesture(drag { s, t in resize(s, corner: corner, dx: t.width / imageRect.width, dy: t.height / imageRect.height) })
            }
        }
    }

    func drag(_ apply: @escaping (NormalizedRect, CGSize) -> NormalizedRect) -> some Gesture {
        DragGesture()
            .onChanged { g in
                if start == nil { start = rect; onBegin() }
                rect = apply(start!, g.translation)
            }
            .onEnded { _ in start = nil; onEnd() }
    }

    func resize(_ s: NormalizedRect, corner: Int, dx: Double, dy: Double) -> NormalizedRect {
        var minX = s.x, minY = s.y, maxX = s.x + s.width, maxY = s.y + s.height
        if corner % 2 == 0 { minX += dx } else { maxX += dx }
        if corner < 2 { minY += dy } else { maxY += dy }
        minX = max(0, min(minX, maxX - 0.05)); maxX = min(1, max(maxX, minX + 0.05))
        minY = max(0, min(minY, maxY - 0.05)); maxY = min(1, max(maxY, minY + 0.05))
        var n = NormalizedRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
        if let ratio {
            let aspect = Double(imageRect.width / imageRect.height)
            // Ajuste la hauteur au rapport demandé en gardant le coin opposé fixe.
            let h = n.width * aspect / ratio
            if corner < 2 { n.y = maxY - h } 
            n.height = h
            if n.y < 0 || n.y + n.height > 1 {
                n.height = min(n.height, corner < 2 ? maxY : 1 - minY)
                n.width = n.height * ratio / aspect
                if corner % 2 == 0 { n.x = maxX - n.width }
                if corner < 2 { n.y = maxY - n.height }
            }
        }
        return n.clamped()
    }
}
