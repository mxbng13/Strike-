import SwiftUI
import AVKit
import UniformTypeIdentifiers
import VaultCore

/// Éditeur vidéo : timeline, découpe, vitesse, son, filtres, couleurs, transitions, textes, musique, format, export.
struct VideoEditorView: View {
    @EnvironmentObject var library: MediaLibrary
    @EnvironmentObject var session: VaultSession
    @Environment(\.dismiss) var dismiss
    @State var project: VideoProject
    @State private var sources: [UUID: URL] = [:]
    @State private var musicURL: URL?
    @State private var preparing = true
    @State private var prepareProgress = 0.0
    @State private var player = AVPlayer()
    @State private var duration = 0.0
    @State private var currentTime = 0.0
    @State private var playing = false
    @State private var selectedClip: UUID?
    @State private var panel: Panel = .clip
    @State private var clipTool: ClipTool = .trim
    @State private var rebuildTask: Task<Void, Never>?
    @State private var timeObserver: Any?
    @State private var addClips = false
    @State private var editingText: TextOverlay?
    @State private var importMusic = false
    @State private var exportSheet = false
    @State private var error: String?

    enum Panel: String, CaseIterable, Identifiable {
        case clip = "Clip", text = "Textes", music = "Musique", format = "Format"
        var id: String { rawValue }
        var symbol: String {
            switch self { case .clip: return "film"; case .text: return "textformat"; case .music: return "music.note"; case .format: return "aspectratio" }
        }
    }
    enum ClipTool: String, CaseIterable, Identifiable {
        case trim = "Découper", speed = "Vitesse", audio = "Son", filter = "Filtre", color = "Couleur", transition = "Transition"
        var id: String { rawValue }
    }

    var layout: TimelineLayout { TimelineLayout(project: project) }
    var selectedIndex: Int? { project.clips.firstIndex { $0.id == selectedClip } }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            preview
            transport
            timeline
            Divider().overlay(.white.opacity(0.1))
            panelView.frame(height: 230)
            panelTabs
        }
        .background(Color.black.ignoresSafeArea())
        .preferredColorScheme(.dark)
        .overlay { if preparing { preparingOverlay } }
        .task { await prepare() }
        .onDisappear { teardown() }
        .onChange(of: project) { _, p in
            library.mutate { $0.projects[p.id] = p }
            scheduleRebuild()
        }
        .sheet(isPresented: $addClips) {
            LibraryPicker(title: "Ajouter des vidéos", kinds: [.video]) { ids in Task { await addVideos(ids) } }
        }
        .sheet(item: $editingText) { t in
            TextOverlayEditor(text: t, duration: layout.duration) { updated in
                if let i = project.texts.firstIndex(where: { $0.id == updated.id }) { project.texts[i] = updated } else { project.texts.append(updated) }
            } onDelete: { project.texts.removeAll { $0.id == t.id } }
        }
        .fileImporter(isPresented: $importMusic, allowedContentTypes: [.audio]) { r in
            if case .success(let url) = r { Task { await setMusic(url) } }
        }
        .sheet(isPresented: $exportSheet) {
            VideoExportSheet(project: project, sources: sources, musicURL: musicURL).environmentObject(library)
        }
        .alert("Montage", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK") {} } message: { Text(error ?? "") }
    }

    // MARK: En-tête et aperçu

    var topBar: some View {
        HStack {
            Button("Fermer") { dismiss() }
            Spacer()
            TextField("Nom du montage", text: $project.name).multilineTextAlignment(.center).font(.headline).frame(maxWidth: 200)
            Spacer()
            Button("Exporter") { player.pause(); exportSheet = true }.bold().disabled(project.clips.isEmpty || preparing)
        }
        .padding(.horizontal).padding(.vertical, 10).foregroundStyle(.white)
    }

    var preview: some View {
        VideoPlayer(player: player)
            .disabled(true)
            .aspectRatio(CGFloat(project.aspect.ratio(original: firstAspect)), contentMode: .fit)
            .frame(maxWidth: .infinity, maxHeight: 300)
            .background(Color.black)
            .onTapGesture { togglePlay() }
    }

    var firstAspect: Double {
        guard let c = project.clips.first, let m = library.state.items[c.mediaID] else { return 16.0 / 9 }
        return m.aspectRatio
    }

    var transport: some View {
        HStack {
            Text(FrenchDates.duration(currentTime)).font(.caption.monospacedDigit())
            Spacer()
            Button { seek(max(0, currentTime - 5)) } label: { Image(systemName: "gobackward.5") }
            Button { togglePlay() } label: { Image(systemName: playing ? "pause.fill" : "play.fill").font(.title2) }.padding(.horizontal, 20)
            Button { seek(min(duration, currentTime + 5)) } label: { Image(systemName: "goforward.5") }
            Spacer()
            Text(FrenchDates.duration(duration)).font(.caption.monospacedDigit())
        }
        .foregroundStyle(.white).padding(.horizontal).padding(.vertical, 8)
    }

    // MARK: Timeline

    var timeline: some View {
        let l = layout
        let pps: CGFloat = 46 // points par seconde
        return ScrollView(.horizontal, showsIndicators: false) {
            ZStack(alignment: .topLeading) {
                HStack(spacing: 0) {
                    ForEach(Array(project.clips.enumerated()), id: \.element.id) { i, clip in
                        let seg = l.clips.first { $0.index == i }
                        let overlapNext = l.transitions.first { $0.fromIndex == i }?.duration ?? 0
                        clipTile(clip, width: max(30, CGFloat((seg?.duration ?? 1) - overlapNext) * pps))
                    }
                    Button { addClips = true } label: {
                        Image(systemName: "plus").font(.title3).frame(width: 52, height: 56)
                            .background(RoundedRectangle(cornerRadius: 8).fill(.white.opacity(0.12)))
                    }
                    .padding(.leading, 8)
                }
                // Textes sous la piste vidéo.
                ForEach(project.texts) { t in
                    Text(t.text).font(.system(size: 9, weight: .semibold)).lineLimit(1).padding(.horizontal, 4)
                        .frame(width: max(20, CGFloat(t.duration) * pps), height: 14, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: 3).fill(Color.purple.opacity(0.75)))
                        .offset(x: CGFloat(t.start) * pps, y: 62)
                        .onTapGesture { editingText = t }
                }
                if project.music != nil {
                    RoundedRectangle(cornerRadius: 3).fill(Color.green.opacity(0.6))
                        .frame(width: CGFloat(l.duration) * pps, height: 8).offset(y: project.texts.isEmpty ? 64 : 80)
                }
                Rectangle().fill(.white).frame(width: 2, height: 92).offset(x: CGFloat(currentTime) * pps - 1, y: -4)
                    .allowsHitTesting(false)
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .frame(height: 112, alignment: .topLeading)
        }
        .foregroundStyle(.white)
    }

    func clipTile(_ clip: VideoClip, width: CGFloat) -> some View {
        let selected = clip.id == selectedClip
        return ZStack(alignment: .bottomLeading) {
            if let item = library.state.items[clip.mediaID] {
                ThumbnailView(item: item, showBadges: false).frame(width: width, height: 56).clipped()
            }
            HStack(spacing: 3) {
                if clip.speed != 1 { Text(String(format: "%.2g×", clip.speed)) }
                if clip.filterID != nil { Image(systemName: "camera.filters") }
                if clip.volume == 0 { Image(systemName: "speaker.slash.fill") }
            }
            .font(.system(size: 9, weight: .bold)).padding(3)
        }
        .frame(width: width, height: 56)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(selected ? Color.yellow : .clear, lineWidth: 2.5))
        .overlay(alignment: .trailing) {
            if clip.transitionOut != .none {
                Image(systemName: "arrow.left.and.right.square.fill").font(.caption).foregroundStyle(.yellow).offset(x: 7)
            }
        }
        .padding(.trailing, 2)
        .onTapGesture { selectedClip = clip.id; panel = .clip; Haptics.selection() }
    }

    // MARK: Panneaux

    var panelTabs: some View {
        HStack {
            ForEach(Panel.allCases) { p in
                Button { panel = p } label: {
                    VStack(spacing: 3) { Image(systemName: p.symbol); Text(p.rawValue).font(.caption2) }
                        .frame(maxWidth: .infinity).foregroundStyle(panel == p ? Color.yellow : .white.opacity(0.75))
                }
            }
        }
        .padding(.vertical, 8)
    }

    @ViewBuilder var panelView: some View {
        switch panel {
        case .clip: clipPanel
        case .text: textPanel
        case .music: musicPanel
        case .format: formatPanel
        }
    }

    @ViewBuilder var clipPanel: some View {
        if let i = selectedIndex {
            VStack(spacing: 10) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(ClipTool.allCases) { t in
                            Button(t.rawValue) { clipTool = t }
                                .font(.caption.weight(.semibold)).padding(.horizontal, 12).padding(.vertical, 6)
                                .background(Capsule().fill(clipTool == t ? Color.yellow : .white.opacity(0.12)))
                                .foregroundStyle(clipTool == t ? .black : .white)
                        }
                    }
                    .padding(.horizontal)
                }
                clipToolView(i).frame(maxHeight: .infinity)
                HStack(spacing: 22) {
                    Button { project.moveClip(from: i, to: max(0, i - 1)) } label: { Image(systemName: "arrow.left") }.disabled(i == 0)
                    Button { project.moveClip(from: i, to: i + 2) } label: { Image(systemName: "arrow.right") }.disabled(i == project.clips.count - 1)
                    Button { if !project.split(at: currentTime) { error = "Placez la tête de lecture à l'intérieur d'un clip pour le fractionner." } } label: {
                        Label("Fractionner", systemImage: "scissors")
                    }
                    Button { var c = project.clips[i]; c.id = UUID(); project.clips.insert(c, at: i + 1) } label: { Image(systemName: "plus.square.on.square") }
                    Button(role: .destructive) { project.clips.remove(at: i); selectedClip = nil } label: { Image(systemName: "trash") }
                }
                .font(.subheadline).padding(.bottom, 4)
            }
            .foregroundStyle(.white)
        } else {
            VStack(spacing: 10) {
                Text("Touchez un clip de la timeline pour le découper, changer sa vitesse, ses couleurs ou ajouter une transition.")
                    .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                Button { addClips = true } label: { Label("Ajouter des vidéos", systemImage: "plus") }
            }
            .padding().frame(maxHeight: .infinity)
        }
    }

    @ViewBuilder func clipToolView(_ i: Int) -> some View {
        let clip = project.clips[i]
        switch clipTool {
        case .trim:
            VStack(spacing: 6) {
                RangeSlider(lower: Binding(get: { clip.sourceStart }, set: { v in project.clips[i].trim(start: v, end: project.clips[i].sourceEnd) }),
                            upper: Binding(get: { clip.sourceEnd }, set: { v in project.clips[i].trim(start: project.clips[i].sourceStart, end: v) }),
                            bounds: 0...max(0.2, clip.sourceDuration))
                    .padding(.horizontal)
                Text("\(FrenchDates.duration(clip.sourceStart)) → \(FrenchDates.duration(clip.sourceEnd)) · \(String(format: "%.1f", clip.trimmedDuration)) s")
                    .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            }
        case .speed:
            VStack(spacing: 8) {
                HStack {
                    ForEach([0.25, 0.5, 1, 1.5, 2, 4], id: \.self) { s in
                        Button(String(format: "%g×", s)) { project.clips[i].setSpeed(s) }
                            .font(.caption.weight(.semibold)).padding(.horizontal, 10).padding(.vertical, 6)
                            .background(Capsule().fill(abs(clip.speed - s) < 0.01 ? Color.yellow : .white.opacity(0.12)))
                            .foregroundStyle(abs(clip.speed - s) < 0.01 ? .black : .white)
                    }
                }
                Slider(value: Binding(get: { log2(clip.speed) }, set: { project.clips[i].setSpeed(pow(2, $0)) }), in: -2...2).tint(.yellow).padding(.horizontal)
                Text("Ralenti < 1× < Accéléré · durée \(String(format: "%.1f", clip.outputDuration)) s").font(.caption).foregroundStyle(.secondary)
            }
        case .audio:
            VStack {
                HStack {
                    Image(systemName: "speaker.fill")
                    Slider(value: Binding(get: { clip.volume }, set: { project.clips[i].volume = $0 }), in: 0...1).tint(.yellow)
                    Text("\(Int(clip.volume * 100)) %").font(.caption.monospacedDigit()).frame(width: 44)
                }
                Button(clip.volume == 0 ? "Rétablir le son" : "Couper le son") { project.clips[i].volume = clip.volume == 0 ? 1 : 0 }.font(.caption)
            }
            .padding(.horizontal)
        case .filter:
            VStack(spacing: 8) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        chip("Aucun", selected: clip.filterID == nil) { project.clips[i].filterID = nil }
                        ForEach(FilterPreset.all) { p in chip(p.name, selected: clip.filterID == p.id) { project.clips[i].filterID = p.id } }
                    }
                    .padding(.horizontal)
                }
                if clip.filterID != nil {
                    HStack {
                        Text("Intensité").font(.caption)
                        Slider(value: Binding(get: { clip.filterIntensity }, set: { project.clips[i].filterIntensity = $0 }), in: 0...1).tint(.yellow)
                    }
                    .padding(.horizontal)
                }
            }
        case .color:
            ScrollView {
                VStack(spacing: 2) {
                    colorSlider("Luminosité", \.brightness, i)
                    colorSlider("Contraste", \.contrast, i)
                    colorSlider("Saturation", \.saturation, i)
                    colorSlider("Température", \.temperature, i)
                }
            }
        case .transition:
            VStack(spacing: 10) {
                if i == project.clips.count - 1 {
                    Text("La transition s'applique entre ce clip et le suivant.").font(.caption).foregroundStyle(.secondary)
                } else {
                    HStack {
                        ForEach(TransitionKind.allCases, id: \.self) { k in
                            chip(k.label, selected: clip.transitionOut == k) { project.clips[i].transitionOut = k }
                        }
                    }
                    .padding(.horizontal)
                    if clip.transitionOut != .none {
                        HStack {
                            Text("Durée").font(.caption)
                            Slider(value: Binding(get: { clip.transitionDuration }, set: { project.clips[i].transitionDuration = $0 }), in: 0.2...2).tint(.yellow)
                            Text(String(format: "%.1f s", clip.transitionDuration)).font(.caption.monospacedDigit())
                        }
                        .padding(.horizontal)
                    }
                }
            }
        }
    }

    func chip(_ label: String, selected: Bool, _ action: @escaping () -> Void) -> some View {
        Button(label, action: action)
            .font(.caption.weight(.semibold)).lineLimit(1).padding(.horizontal, 10).padding(.vertical, 6)
            .background(Capsule().fill(selected ? Color.yellow : .white.opacity(0.12)))
            .foregroundStyle(selected ? .black : .white)
    }

    func colorSlider(_ title: String, _ kp: WritableKeyPath<ClipColor, Double>, _ i: Int) -> some View {
        HStack {
            Text(title).font(.caption).frame(width: 86, alignment: .leading)
            Slider(value: Binding(get: { project.clips[i].color[keyPath: kp] }, set: { project.clips[i].color[keyPath: kp] = $0 }), in: -100...100).tint(.yellow)
            Text("\(Int(project.clips[i].color[keyPath: kp]))").font(.caption.monospacedDigit()).frame(width: 34)
        }
        .padding(.horizontal)
    }

    var textPanel: some View {
        VStack(spacing: 10) {
            Button {
                editingText = TextOverlay(text: "", start: min(currentTime, max(0, layout.duration - 1)), duration: min(3, max(1, layout.duration - currentTime)))
            } label: { Label("Ajouter un texte ou un titre", systemImage: "plus") }
            List {
                ForEach(project.texts) { t in
                    Button { editingText = t } label: {
                        HStack {
                            Text(t.text.isEmpty ? "(vide)" : t.text).lineLimit(1)
                            Spacer()
                            Text("\(FrenchDates.duration(t.start)) · \(String(format: "%.1f", t.duration)) s").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                .onDelete { project.texts.remove(atOffsets: $0) }
            }
            .listStyle(.plain)
        }
        .foregroundStyle(.white).padding(.top, 8)
    }

    var musicPanel: some View {
        VStack(spacing: 12) {
            if let m = project.music {
                HStack {
                    Image(systemName: "music.note")
                    Text(m.title).lineLimit(1)
                    Spacer()
                    Button("Retirer", role: .destructive) { project.music = nil; musicURL = nil }
                }
                .padding(.horizontal)
                labeled("Volume", Binding(get: { m.volume }, set: { project.music?.volume = $0 }), 0...1)
                labeled("Son des clips", Binding(get: { m.clipVolumeWhenMusic }, set: { project.music?.clipVolumeWhenMusic = $0 }), 0...1)
                labeled("Fondu d'entrée", Binding(get: { m.fadeIn }, set: { project.music?.fadeIn = $0 }), 0...5)
                labeled("Fondu de sortie", Binding(get: { m.fadeOut }, set: { project.music?.fadeOut = $0 }), 0...5)
            } else {
                Text("Ajoutez une musique depuis Fichiers (MP3, M4A, WAV…). Elle est chiffrée dans le coffre avec le projet. Utilisez des morceaux dont vous détenez les droits.")
                    .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center).padding(.horizontal)
                Button { session.suspendAutoLock(); importMusic = true } label: { Label("Choisir une musique", systemImage: "music.note.list") }
            }
        }
        .foregroundStyle(.white).padding(.top, 10)
    }

    func labeled(_ t: String, _ v: Binding<Double>, _ r: ClosedRange<Double>) -> some View {
        HStack {
            Text(t).font(.caption).frame(width: 100, alignment: .leading)
            Slider(value: v, in: r).tint(.yellow)
        }
        .padding(.horizontal)
    }

    var formatPanel: some View {
        VStack(spacing: 14) {
            Text("Format d'image").font(.caption).foregroundStyle(.secondary)
            HStack {
                ForEach(ProjectAspect.allCases, id: \.self) { a in chip(a.label, selected: project.aspect == a) { project.aspect = a } }
            }
            Text("Le format recadre chaque clip au centre pour remplir le cadre.").font(.caption2).foregroundStyle(.secondary)
        }
        .padding()
        .foregroundStyle(.white)
    }

    var preparingOverlay: some View {
        ZStack {
            Color.black.opacity(0.85).ignoresSafeArea()
            VStack(spacing: 12) {
                ProgressView(value: prepareProgress).tint(.white).frame(width: 180)
                Text("Préparation des vidéos…").font(.footnote).foregroundStyle(.white)
                Text("Les sources sont déchiffrées dans un espace temporaire protégé, effacé à la fermeture.").font(.caption2)
                    .foregroundStyle(.white.opacity(0.6)).multilineTextAlignment(.center).frame(width: 240)
            }
        }
    }

    // MARK: Logique

    func prepare() async {
        session.suspendAutoLock()
        let ids = Array(Set(project.clips.map(\.mediaID)))
        for (n, id) in ids.enumerated() {
            if sources[id] == nil, let u = try? await library.decryptToWorkspace(id, dir: "editor") { sources[id] = u }
            prepareProgress = Double(n + 1) / Double(max(ids.count, 1))
        }
        if let m = project.music, musicURL == nil { musicURL = try? await library.decryptAudio(m.audioID) }
        project.clips.removeAll { sources[$0.mediaID] == nil }
        selectedClip = selectedClip ?? project.clips.first?.id
        preparing = false
        await rebuild()
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(value: 1, timescale: 20), queue: .main) { t in
            currentTime = t.seconds
            playing = player.rate > 0
        }
    }

    func teardown() {
        player.pause()
        if let o = timeObserver { player.removeTimeObserver(o) }
        for u in sources.values { SecureWorkspace.shared.remove(u.deletingLastPathComponent()) }
        if let m = musicURL { SecureWorkspace.shared.remove(m) }
        library.mutate { $0.projects[project.id] = project }
        session.resumeAutoLock()
    }

    func scheduleRebuild() {
        rebuildTask?.cancel()
        rebuildTask = Task {
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled else { return }
            await rebuild()
        }
    }

    func rebuild() async {
        guard !project.clips.isEmpty else { player.replaceCurrentItem(with: nil); duration = 0; return }
        do {
            let built = try await VideoComposer.build(project: project, sources: sources, music: musicURL, resolution: .p720)
            let item = AVPlayerItem(asset: built.composition)
            item.videoComposition = built.videoComposition
            item.audioMix = built.audioMix
            item.audioTimePitchAlgorithm = .spectral
            let t = player.currentTime()
            let wasPlaying = player.rate > 0
            player.replaceCurrentItem(with: item)
            duration = built.duration
            await player.seek(to: min(t, built.composition.duration), toleranceBefore: .zero, toleranceAfter: .zero)
            if wasPlaying { player.play() }
        } catch {
            self.error = error.localizedDescription
        }
    }

    func togglePlay() {
        if player.rate > 0 { player.pause() } else {
            if currentTime >= duration - 0.05 { seek(0) }
            player.play()
        }
    }

    func seek(_ s: Double) {
        player.seek(to: CMTime(seconds: s, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
        currentTime = s
    }

    func addVideos(_ ids: [UUID]) async {
        preparing = true
        for id in ids {
            guard let item = library.state.items[id], item.kind == .video else { continue }
            if sources[id] == nil, let u = try? await library.decryptToWorkspace(id, dir: "editor") { sources[id] = u }
            if sources[id] != nil { project.clips.append(VideoClip(mediaID: id, sourceDuration: item.duration ?? 0)) }
        }
        preparing = false
    }

    func setMusic(_ url: URL) async {
        defer { session.resumeAutoLock() }
        do {
            let track = try await library.importAudio(url)
            musicURL = try await library.decryptAudio(track.audioID)
            project.music = track
        } catch {
            self.error = "Impossible d'importer cette musique : \(error.localizedDescription)"
        }
    }
}

/// Curseur à deux poignées (début / fin).
struct RangeSlider: View {
    @Binding var lower: Double
    @Binding var upper: Double
    let bounds: ClosedRange<Double>

    var body: some View {
        GeometryReader { g in
            let w = g.size.width
            let span = bounds.upperBound - bounds.lowerBound
            let lx = CGFloat((lower - bounds.lowerBound) / span) * w
            let ux = CGFloat((upper - bounds.lowerBound) / span) * w
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.15)).frame(height: 6)
                Rectangle().fill(Color.yellow).frame(width: max(0, ux - lx), height: 6).offset(x: lx)
                handle.offset(x: lx - 11).gesture(DragGesture().onChanged { v in
                    lower = min(upper - 0.1, max(bounds.lowerBound, bounds.lowerBound + Double(v.location.x / w) * span))
                })
                handle.offset(x: ux - 11).gesture(DragGesture().onChanged { v in
                    upper = max(lower + 0.1, min(bounds.upperBound, bounds.lowerBound + Double(v.location.x / w) * span))
                })
            }
            .frame(height: 30)
        }
        .frame(height: 30)
    }

    var handle: some View {
        RoundedRectangle(cornerRadius: 4).fill(.white).frame(width: 22, height: 30).shadow(radius: 2)
    }
}

/// Édition d'un texte / titre.
struct TextOverlayEditor: View {
    @Environment(\.dismiss) var dismiss
    @State var text: TextOverlay
    let duration: Double
    let onSave: (TextOverlay) -> Void
    let onDelete: () -> Void
    let colors = ["#FFFFFF", "#000000", "#FFD60A", "#FF453A", "#0A84FF", "#32D74B", "#BF5AF2"]

    var body: some View {
        NavigationStack {
            Form {
                Section { TextField("Votre texte", text: $text.text, axis: .vertical).font(.title3) }
                Section("Style") {
                    Picker("Style", selection: $text.style) { ForEach(TextStyle.allCases, id: \.self) { Text($0.label).tag($0) } }
                        .pickerStyle(.segmented)
                    HStack {
                        ForEach(colors, id: \.self) { c in
                            Circle().fill(Color(hex: c)).frame(width: 28, height: 28)
                                .overlay(Circle().strokeBorder(.gray, lineWidth: text.colorHex == c ? 3 : 0.5))
                                .onTapGesture { text.colorHex = c }
                        }
                    }
                    Toggle("Fond", isOn: $text.withBackground)
                }
                Section("Position") {
                    Picker("Position", selection: $text.y) {
                        Text("Haut").tag(0.15); Text("Centre").tag(0.5); Text("Bas").tag(0.85)
                    }
                    .pickerStyle(.segmented)
                }
                Section("Durée") {
                    HStack { Text("Début"); Slider(value: $text.start, in: 0...max(0.1, duration - 0.5)); Text(FrenchDates.duration(text.start)).monospacedDigit() }
                    HStack { Text("Durée"); Slider(value: $text.duration, in: 0.5...max(0.6, duration - text.start)); Text(String(format: "%.1f s", text.duration)).monospacedDigit() }
                }
                Section { Button("Supprimer ce texte", role: .destructive) { onDelete(); dismiss() } }
            }
            .navigationTitle("Texte")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("OK") { onSave(text); dismiss() }.disabled(text.text.isEmpty) }
            }
        }
    }
}

/// Export : résolution, rendu, puis chiffrement du résultat dans le coffre (les clips d'origine sont conservés).
struct VideoExportSheet: View {
    @EnvironmentObject var library: MediaLibrary
    @Environment(\.dismiss) var dismiss
    let project: VideoProject
    let sources: [UUID: URL]
    let musicURL: URL?
    @State private var resolution: ExportResolution = .p1080
    @State private var progress: Double?
    @State private var done = false
    @State private var error: String?
    let can4K = VideoComposer.supports4K()

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Résolution", selection: $resolution) {
                        ForEach(ExportResolution.allCases, id: \.self) { r in
                            Text(r.label + (r == .k4 && !can4K ? " (non pris en charge)" : "")).tag(r)
                        }
                    }
                    .pickerStyle(.inline)
                } footer: {
                    Text("Le montage est rendu en HEVC lorsque l'appareil le permet, puis chiffré dans votre coffre comme une nouvelle vidéo.")
                }
                if let progress {
                    Section { ProgressView(value: progress) { Text("Rendu… \(Int(progress * 100)) %") } }
                }
                if done { Section { Label("Vidéo ajoutée à votre coffre", systemImage: "checkmark.circle.fill").foregroundStyle(.green) } }
                if let error { Section { Text(error).foregroundStyle(.red) } }
            }
            .navigationTitle("Exporter le montage")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(done ? "Fermer" : "Annuler") { dismiss() }.disabled(progress != nil && !done) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Exporter") { Task { await export() } }.disabled(progress != nil || done || (resolution == .k4 && !can4K))
                }
            }
        }
        .presentationDetents([.medium])
    }

    func export() async {
        progress = 0
        library.beginBusy("Export du montage")
        defer { library.endBusy() }
        do {
            let built = try await VideoComposer.build(project: project, sources: sources, music: musicURL, resolution: resolution)
            let out = SecureWorkspace.shared.newFile(ext: "mov", in: "render", name: project.name.isEmpty ? "Montage" : project.name)
            try await VideoComposer.export(built, to: out) { p in Task { @MainActor in progress = p } }
            _ = await library.importGenerated(out, name: (project.name.isEmpty ? "Montage" : project.name) + ".mov")
            done = true
            Haptics.success()
        } catch {
            self.error = error.localizedDescription
            progress = nil
        }
    }
}

/// Liste des projets de montage sauvegardés.
struct ProjectsListView: View {
    @EnvironmentObject var library: MediaLibrary
    @State private var open: VideoProject?

    var body: some View {
        let projects = library.state.projects.values.sorted { $0.modifiedAt > $1.modifiedAt }
        List {
            if projects.isEmpty {
                Text("Sélectionnez des vidéos puis « Plus › Créer un montage », ou ouvrez une vidéo et touchez l'icône de montage.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            ForEach(projects) { p in
                Button { open = p } label: {
                    HStack(spacing: 12) {
                        if let c = p.clips.first, let item = library.state.items[c.mediaID] {
                            ThumbnailView(item: item, showBadges: false).frame(width: 64, height: 40).clipShape(RoundedRectangle(cornerRadius: 6))
                        }
                        VStack(alignment: .leading) {
                            Text(p.name).foregroundStyle(.primary)
                            Text("\(p.clips.count) clip(s) · \(FrenchDates.duration(TimelineLayout(project: p).duration))").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .onDelete { idx in
                let ids = idx.map { projects[$0].id }
                library.mutate { s in ids.forEach { s.projects[$0] = nil } }
            }
        }
        .navigationTitle("Montages")
        .fullScreenCover(item: $open) { VideoEditorView(project: $0) }
    }
}
