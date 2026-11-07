import Foundation
import UserNotifications

/// Local "today's game is X" reminders. Nothing goes through a server: the app
/// fetches games.json, works out which game airs on each upcoming day with the
/// same rotation math as worker/src/index.ts, and schedules notifications.
/// Rescheduled on every launch, foreground and background refresh, so a game
/// added with `npm run schedule` shows up in the next reminders.
enum Reminders {
    private static let defaults = UserDefaults.standard
    private static let idPrefix = "daily-"
    /// Days ahead to schedule. Only the first `namedDays` mention the game by name,
    /// since a later schedule change can still move days further out.
    private static let daysAhead = 14
    private static let namedDays = 2

    static var isEnabled: Bool {
        get { defaults.bool(forKey: "remindersEnabled") }
        set { defaults.set(newValue, forKey: "remindersEnabled") }
    }

    /// Local time of day for the reminder. Defaults to 9:00.
    static var time: DateComponents {
        get {
            DateComponents(hour: defaults.object(forKey: "reminderHour") as? Int ?? 9,
                           minute: defaults.object(forKey: "reminderMinute") as? Int ?? 0)
        }
        set {
            defaults.set(newValue.hour ?? 9, forKey: "reminderHour")
            defaults.set(newValue.minute ?? 0, forKey: "reminderMinute")
        }
    }

    static var hasAsked: Bool {
        get { defaults.bool(forKey: "remindersAsked") }
        set { defaults.set(newValue, forKey: "remindersAsked") }
    }

    /// Asks for permission and turns reminders on if granted.
    static func requestAndEnable() async -> Bool {
        hasAsked = true
        let granted = (try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        isEnabled = granted
        await reschedule()
        return granted
    }

    static func authorizationStatus() async -> UNAuthorizationStatus {
        await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }

    /// Replaces the pending reminders with fresh ones for the next two weeks.
    static func reschedule() async {
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(idPrefix) }
        center.removePendingNotificationRequests(withIdentifiers: pending)
        guard isEnabled, await authorizationStatus() == .authorized else { return }

        let data = try? await GamesData.fetch()
        var cal = Calendar.current
        cal.timeZone = .current
        let now = Date()
        for offset in 0..<daysAhead {
            guard let day = cal.date(byAdding: .day, value: offset, to: now),
                  let fire = cal.date(bySettingHour: time.hour ?? 9, minute: time.minute ?? 0, second: 0, of: day),
                  fire > now else { continue }
            let content = UNMutableNotificationContent()
            if offset < namedDays, let game = data?.game(on: SharedStore.utcDay(fire)) {
                content.title = "Today's game: \(game.name)"
                content.body = "Fresh leaderboard, 24 hours on the clock. Come post a score."
            } else {
                content.title = "A new game just dropped"
                content.body = "Same game for everyone, brand new leaderboard. Come play."
            }
            content.sound = .default
            let comps = cal.dateComponents([.year, .month, .day, .hour, .minute], from: fire)
            let request = UNNotificationRequest(
                identifier: idPrefix + SharedStore.utcDay(fire),
                content: content,
                trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: false))
            try? await center.add(request)
        }
    }
}

/// worker/games.json, as served raw (every era, so future days resolve too).
struct GamesData: Decodable {
    struct Era: Decodable { let scheduleEpoch: String; let schedule: [String] }
    struct Game: Decodable { let id: String; let name: String }

    let scheduleEpoch: String?
    let schedule: [String]?
    let scheduleHistory: [Era]?
    let games: [Game]

    static func fetch() async throws -> GamesData {
        let url = SharedStore.site.appendingPathComponent("games.json")
        var comps = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "raw", value: "1")]
        let (data, _) = try await URLSession.shared.data(from: comps.url!)
        return try JSONDecoder().decode(GamesData.self, from: data)
    }

    // Mirrors eraFor / dayNumber / getDailyGame in worker/src/index.ts.
    private static let dayEpoch: Date = utcDate("2026-05-01")!

    private static func utcDate(_ s: String) -> Date? {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: s)
    }

    private static func dayNumber(_ s: String) -> Int {
        guard let d = utcDate(s) else { return 0 }
        return Int(floor(d.timeIntervalSince(dayEpoch) / 86_400))
    }

    private func era(for date: String) -> Era? {
        var eras = scheduleHistory ?? []
        if let epoch = scheduleEpoch, let schedule, !schedule.isEmpty {
            eras.append(Era(scheduleEpoch: epoch, schedule: schedule))
        }
        let valid = eras.filter { !$0.schedule.isEmpty }.sorted { $0.scheduleEpoch < $1.scheduleEpoch }
        guard var pick = valid.first else { return nil }
        for e in valid where e.scheduleEpoch <= date { pick = e }
        return pick
    }

    func game(on date: String) -> Game? {
        guard !games.isEmpty else { return nil }
        if let era = era(for: date) {
            let off = Self.dayNumber(date) - Self.dayNumber(era.scheduleEpoch)
            let n = era.schedule.count
            let id = era.schedule[((off % n) + n) % n]
            if let g = games.first(where: { $0.id == id }) { return g }
        }
        let n = games.count
        let day = Self.dayNumber(date)
        return games[((day % n) + n) % n]
    }
}
