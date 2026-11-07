import BackgroundTasks
import SwiftUI
import UserNotifications
import WidgetKit

@main
struct NewTabPartyApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(model)
                .preferredColorScheme(.dark)
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active { model.becameActive() }
            if phase == .background { AppDelegate.scheduleRefresh() }
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    /// Listed under BGTaskSchedulerPermittedIdentifiers in Info.plist.
    static let refreshTask = "party.newtab.app.refresh"

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        Task { @MainActor in GameCenter.shared.authenticate() }

        // Shortly after midnight UTC: re-check tomorrow's game for the reminder and refresh the widget.
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.refreshTask, using: nil) { task in
            Self.scheduleRefresh()
            let work = Task {
                await Reminders.reschedule()
                WidgetCenter.shared.reloadAllTimelines()
                task.setTaskCompleted(success: true)
            }
            task.expirationHandler = { work.cancel() }
        }
        return true
    }

    static func scheduleRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: refreshTask)
        request.earliestBeginDate = SharedStore.nextUTCMidnight().addingTimeInterval(5 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    // The arcade is already on screen, so a reminder arriving now stays quiet.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([])
    }
}
