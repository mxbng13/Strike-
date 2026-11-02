import Foundation
import XCTest
@testable import VaultCore

func tempDir(_ name: String = UUID().uuidString) -> URL {
    let u = FileManager.default.temporaryDirectory.appendingPathComponent("vaulttests-" + name, isDirectory: true)
    try? FileManager.default.removeItem(at: u)
    try! FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
    return u
}

var utcCalendar: Calendar {
    var c = Calendar.vault
    c.timeZone = TimeZone(identifier: "Europe/Paris")!
    return c
}

func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 12, _ min: Int = 0) -> Date {
    utcCalendar.date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: min))!
}

func makeItem(_ kind: MediaKind = .photo, at d: Date, size: Int64 = 3_000_000, format: String = "heic",
              location: GeoPoint? = nil, sha: String? = nil, w: Int = 4032, h: Int = 3024) -> MediaItem {
    var i = MediaItem(kind: kind, originalFilename: "IMG_\(Int.random(in: 1000...9999)).\(format)", typeIdentifier: "public.\(format)",
                      format: format, fileSize: size, pixelWidth: w, pixelHeight: h, duration: kind == .video ? 30 : nil,
                      captureDate: d, importDate: d, location: location, sha256: sha ?? UUID().uuidString)
    i.modifiedDate = d
    return i
}
