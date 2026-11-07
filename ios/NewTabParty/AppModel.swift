import SwiftUI
import UIKit
import WebKit
import WidgetKit

/// App state shared by the web view, the score bar and the settings sheet.
@MainActor
final class AppModel: ObservableObject {
    struct Result: Equatable {
        let score: Int
        let gameName: String
        let isNewBest: Bool
    }

    @Published var result: Result?
    @Published var showSettings = false

    weak var webView: WKWebView?
    private var loadedDay = SharedStore.utcDay(Date())
    private var hideResult: Task<Void, Never>?

    /// A game in the page finished (forwarded from its postMessage({ highScore })).
    func gameEnded(score: Int, gameId: String, gameName: String, path: String) {
        // Only today's game counts. /play/<date> replays are practice.
        guard path == "/", score > 0, !gameId.isEmpty else { return }

        let isNewBest = SharedStore.record(score: score, gameId: gameId, gameName: gameName)
        let haptics = UINotificationFeedbackGenerator()
        haptics.notificationOccurred(isNewBest ? .success : .warning)

        GameCenter.shared.submit(score: score)
        WidgetCenter.shared.reloadAllTimelines()

        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
            result = Result(score: score, gameName: gameName, isNewBest: isNewBest)
        }
        hideResult?.cancel()
        hideResult = Task {
            try? await Task.sleep(nanoseconds: 12_000_000_000)
            guard !Task.isCancelled else { return }
            withAnimation { result = nil }
        }

        // First finished game: offer the daily reminder.
        if !Reminders.hasAsked {
            Task {
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                _ = await Reminders.requestAndEnable()
            }
        }
    }

    func dismissResult() {
        hideResult?.cancel()
        withAnimation { result = nil }
    }

    var shareText: String {
        guard let result else { return "Play today's game at newtab.party" }
        return "I scored \(result.score.formatted()) on \(result.gameName) at newtab.party. Beat that."
    }

    /// Back in the foreground: a new UTC day means a new game, so reload the arcade.
    func becameActive() {
        let today = SharedStore.utcDay(Date())
        if today != loadedDay {
            loadedDay = today
            result = nil
            webView?.load(URLRequest(url: SharedStore.site, cachePolicy: .reloadIgnoringLocalCacheData))
        }
        Task { await Reminders.reschedule() }
        WidgetCenter.shared.reloadAllTimelines()
    }

    func pageLoaded() {
        loadedDay = SharedStore.utcDay(Date())
    }
}
