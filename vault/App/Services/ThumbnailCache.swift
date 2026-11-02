import UIKit
import ImageIO
import VaultCore

/// Miniatures déchiffrées à la demande, gardées uniquement en mémoire (purgées au verrouillage).
final class ThumbnailCache: @unchecked Sendable {
    private let cache = NSCache<NSUUID, UIImage>()
    private let layout: VaultLayout
    private let key: SymmetricKey
    private let queue = DispatchQueue(label: "vault.thumbs", qos: .userInitiated, attributes: .concurrent)
    private let limiter = DispatchSemaphore(value: 6)
    private var inflight: [UUID: [(UIImage?) -> Void]] = [:]
    private let lock = NSLock()
    private var purged = false

    init(layout: VaultLayout, key: SymmetricKey) {
        self.layout = layout
        self.key = key
        cache.countLimit = 1500
        cache.totalCostLimit = 120 * 1024 * 1024
    }

    func cached(_ id: UUID) -> UIImage? { cache.object(forKey: id as NSUUID) }

    func image(_ id: UUID) async -> UIImage? {
        if let c = cached(id) { return c }
        return await withCheckedContinuation { cont in
            load(id) { cont.resume(returning: $0) }
        }
    }

    private func load(_ id: UUID, completion: @escaping (UIImage?) -> Void) {
        lock.lock()
        if purged { lock.unlock(); completion(nil); return }
        if inflight[id] != nil { inflight[id]!.append(completion); lock.unlock(); return }
        inflight[id] = [completion]
        lock.unlock()
        queue.async { [self] in
            limiter.wait()
            defer { limiter.signal() }
            var img: UIImage?
            if let data = try? EncryptedFile.decrypt(layout.thumbnail(id), wrappingKey: key),
               let decoded = UIImage(data: data)?.preparingForDisplay() {
                img = decoded
                let cost = Int(decoded.size.width * decoded.size.height * decoded.scale * decoded.scale * 4)
                cache.setObject(decoded, forKey: id as NSUUID, cost: cost)
            }
            lock.lock()
            let waiters = inflight.removeValue(forKey: id) ?? []
            lock.unlock()
            waiters.forEach { $0(img) }
        }
    }

    func remove(_ id: UUID) { cache.removeObject(forKey: id as NSUUID) }

    func purge() {
        lock.lock(); purged = true; lock.unlock()
        cache.removeAllObjects()
    }
}

/// Décodage d'images réduit (évite de charger 48 Mpx en mémoire pour l'affichage).
enum ImageDecoding {
    static func downsampled(_ data: Data, maxPixel: CGFloat) -> UIImage? {
        guard let src = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, [
                  kCGImageSourceCreateThumbnailFromImageAlways: true,
                  kCGImageSourceCreateThumbnailWithTransform: true,
                  kCGImageSourceShouldCacheImmediately: true,
                  kCGImageSourceThumbnailMaxPixelSize: maxPixel,
              ] as CFDictionary) else { return nil }
        return UIImage(cgImage: cg)
    }
}
