// swift-tools-version:5.9
import PackageDescription

// VaultCore : toute la logique indépendante de l'interface (chiffrement, clés,
// bibliothèque, recherche, souvenirs, synchronisation, montage…).
// Compile sur iOS/macOS (CryptoKit) ET sur Linux (swift-crypto), ce qui permet
// de la tester en intégration continue et prépare un futur portage Android.
let package = Package(
    name: "VaultCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "VaultCore", targets: ["VaultCore"])
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-crypto.git", "3.0.0"..<"4.0.0")
    ],
    targets: [
        .target(
            name: "VaultCore",
            dependencies: [
                .product(name: "Crypto", package: "swift-crypto",
                         condition: .when(platforms: [.linux, .android, .windows]))
            ]
        ),
        .testTarget(name: "VaultCoreTests", dependencies: ["VaultCore"])
    ]
)
