import Foundation

/// Data shared between the app and the home screen widget through the App Group.
enum SharedStore {
    static let appGroup = "group.party.newtab.app"
    static let site = URL(string: "https://newtab.party")!

    private static var defaults: UserDefaults {
        UserDefaults(suiteName: appGroup) ?? .standard
    }

    struct Best: Codable, Equatable {
        var date: String      // UTC day, YYYY-MM-DD
        var gameId: String
        var gameName: String
        var score: Int
    }

    /// The player's best score on today's game, or nil if they haven't played it yet.
    static var bestToday: Best? {
        guard let data = defaults.data(forKey: "bestToday"),
              let best = try? JSONDecoder().decode(Best.self, from: data),
              best.date == utcDay(Date()) else { return nil }
        return best
    }

    /// Records a finished game. Returns true if it beat today's best.
    @discardableResult
    static func record(score: Int, gameId: String, gameName: String) -> Bool {
        let today = utcDay(Date())
        if let best = bestToday, best.gameId == gameId, best.score >= score { return false }
        let best = Best(date: today, gameId: gameId, gameName: gameName, score: score)
        if let data = try? JSONEncoder().encode(best) { defaults.set(data, forKey: "bestToday") }
        return true
    }

    static func utcDay(_ date: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    /// The next midnight UTC, when the daily game changes.
    static func nextUTCMidnight(after date: Date = Date()) -> Date {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let start = cal.startOfDay(for: date)
        return cal.date(byAdding: .day, value: 1, to: start)!
    }
}
