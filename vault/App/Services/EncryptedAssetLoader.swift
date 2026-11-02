import AVFoundation
import UniformTypeIdentifiers
import VaultCore

/// Lecture vidéo directement depuis le fichier chiffré : AVPlayer demande des plages d'octets,
/// on ne déchiffre que les blocs concernés. Aucune copie en clair n'est écrite sur le disque.
final class EncryptedAssetLoader: NSObject, AVAssetResourceLoaderDelegate, @unchecked Sendable {
    static let scheme = "vault-enc"
    private let reader: EncryptedFile.Reader
    private let contentType: String
    let queue = DispatchQueue(label: "vault.video.loader", qos: .userInitiated)

    init(reader: EncryptedFile.Reader, typeIdentifier: String) {
        self.reader = reader
        // AVFoundation attend un UTI (com.apple.quicktime-movie, public.mpeg-4…).
        let ut = UTType(typeIdentifier)
        if ut?.conforms(to: .quickTimeMovie) == true { contentType = UTType.quickTimeMovie.identifier }
        else if ut?.conforms(to: .mpeg4Movie) == true { contentType = UTType.mpeg4Movie.identifier }
        else { contentType = typeIdentifier }
    }

    /// Crée un AVURLAsset adossé au fichier chiffré. Conserver le loader tant que l'asset est utilisé.
    static func asset(for item: MediaItem, reader: EncryptedFile.Reader) -> (AVURLAsset, EncryptedAssetLoader) {
        let loader = EncryptedAssetLoader(reader: reader, typeIdentifier: item.typeIdentifier)
        let url = URL(string: "\(scheme)://media/\(item.id.uuidString).\(item.format.isEmpty ? "mov" : item.format)")!
        let asset = AVURLAsset(url: url)
        asset.resourceLoader.setDelegate(loader, queue: loader.queue)
        return (asset, loader)
    }

    func resourceLoader(_ resourceLoader: AVAssetResourceLoader,
                        shouldWaitForLoadingOfRequestedResource loadingRequest: AVAssetResourceLoadingRequest) -> Bool {
        if let info = loadingRequest.contentInformationRequest {
            info.contentType = contentType
            info.contentLength = reader.plaintextLength
            info.isByteRangeAccessSupported = true
        }
        guard let dataRequest = loadingRequest.dataRequest else {
            loadingRequest.finishLoading()
            return true
        }
        let start = dataRequest.currentOffset != 0 ? dataRequest.currentOffset : dataRequest.requestedOffset
        let end: Int64 = dataRequest.requestsAllDataToEndOfResource
            ? reader.plaintextLength
            : min(reader.plaintextLength, dataRequest.requestedOffset + Int64(dataRequest.requestedLength))
        var offset = start
        let step = 512 * 1024
        do {
            while offset < end {
                if loadingRequest.isCancelled { return true }
                let n = Int(min(Int64(step), end - offset))
                let chunk = try autoreleasepool { try reader.read(offset: offset, length: n) }
                dataRequest.respond(with: chunk)
                offset += Int64(chunk.count)
                if chunk.isEmpty { break }
            }
            loadingRequest.finishLoading()
        } catch {
            loadingRequest.finishLoading(with: error)
        }
        return true
    }
}
