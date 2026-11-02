import UIKit
import UserNotifications

/// Notifications locales. Avec « Masquer les aperçus », le contenu reste générique et sans image,
/// et l'aperçu système est également masqué (hiddenPreviewsBodyPlaceholder).
enum NotificationService {
    static let category = "vault.generic"

    static func configure() {
        let c = UNNotificationCategory(identifier: category, actions: [], intentIdentifiers: [],
                                       hiddenPreviewsBodyPlaceholder: "VAULT", options: [])
        UNUserNotificationCenter.current().setNotificationCategories([c])
    }

    static func requestPermission() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])) ?? false
    }

    @MainActor
    static func notifyIfBackground(title: String, body: String, hidePreview: Bool) {
        guard UIApplication.shared.applicationState != .active else { return }
        let content = UNMutableNotificationContent()
        content.title = hidePreview ? "VAULT" : title
        content.body = hidePreview ? "Une tâche est terminée." : body
        content.categoryIdentifier = category
        content.threadIdentifier = "vault"
        let req = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(req)
    }
}
