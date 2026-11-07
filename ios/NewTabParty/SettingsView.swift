import SwiftUI
import UserNotifications

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @ObservedObject private var gameCenter = GameCenter.shared

    @State private var remindersOn = Reminders.isEnabled
    @State private var reminderTime = Self.date(from: Reminders.time)
    @State private var notificationsDenied = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Daily reminder", isOn: $remindersOn)
                    if remindersOn {
                        DatePicker("Time", selection: $reminderTime, displayedComponents: .hourAndMinute)
                    }
                    if notificationsDenied {
                        Button("Turn on notifications in Settings") {
                            if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                        }
                    }
                } header: {
                    Text("Reminders")
                } footer: {
                    Text("A nudge each day with the name of the new game. A new game drops every day at midnight UTC.")
                }

                Section("Game Center") {
                    Button("Today's Game Center leaderboard") { GameCenter.shared.showLeaderboard() }
                    LabeledContent("Player", value: gameCenter.playerName ?? "Not signed in")
                }

                Section("About") {
                    Link("Privacy policy", destination: SharedStore.site.appendingPathComponent("privacy"))
                    Link("Report a problem", destination: URL(string: "https://github.com/jlyon/newtab-party/issues")!)
                    LabeledContent("Version", value: Bundle.main.appVersion)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .task { await refreshPermission() }
            .onChange(of: remindersOn) { on in
                Task {
                    if on {
                        let granted = await Reminders.requestAndEnable()
                        if !granted { remindersOn = false }
                        await refreshPermission()
                    } else {
                        Reminders.isEnabled = false
                        await Reminders.reschedule()
                    }
                }
            }
            .onChange(of: reminderTime) { time in
                Reminders.time = Calendar.current.dateComponents([.hour, .minute], from: time)
                Task { await Reminders.reschedule() }
            }
        }
        .preferredColorScheme(.dark)
    }

    private func refreshPermission() async {
        notificationsDenied = await Reminders.authorizationStatus() == .denied
    }

    private static func date(from comps: DateComponents) -> Date {
        Calendar.current.date(bySettingHour: comps.hour ?? 9, minute: comps.minute ?? 0, second: 0, of: Date()) ?? Date()
    }
}

private extension Bundle {
    var appVersion: String {
        let v = infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let b = infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(v) (\(b))"
    }
}
