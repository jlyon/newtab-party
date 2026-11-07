import GameKit
import UIKit

/// Game Center: a recurring daily leaderboard that mirrors newtab.party's own.
///
/// Set up in App Store Connect: a *recurring* leaderboard with the ID below,
/// "High score is best", resetting every day at 00:00 UTC, so each day's board
/// matches that day's game.
@MainActor
final class GameCenter: NSObject, ObservableObject {
    static let shared = GameCenter()
    static let dailyLeaderboardID = "party.newtab.daily"

    @Published private(set) var isAuthenticated = false
    @Published private(set) var playerName: String?

    /// Sign-in sheet Game Center asked us to show. Held until the player opens
    /// Game Center themselves, so it never interrupts a game.
    private var pendingSignIn: UIViewController?
    private var pendingScore: Int?

    /// Call once at launch. Signs in silently when the player already uses Game Center.
    func authenticate() {
        GKLocalPlayer.local.authenticateHandler = { [weak self] viewController, _ in
            Task { @MainActor in
                guard let self else { return }
                self.pendingSignIn = viewController
                self.isAuthenticated = GKLocalPlayer.local.isAuthenticated
                self.playerName = self.isAuthenticated ? GKLocalPlayer.local.alias : nil
                if self.isAuthenticated, let score = self.pendingScore {
                    self.pendingScore = nil
                    self.submit(score: score)
                }
            }
        }
    }

    /// Submits a finished game of today's game. Queued if the player isn't signed in yet.
    func submit(score: Int) {
        guard GKLocalPlayer.local.isAuthenticated else {
            pendingScore = max(score, pendingScore ?? 0)
            return
        }
        GKLeaderboard.submitScore(score, context: 0, player: GKLocalPlayer.local,
                                  leaderboardIDs: [Self.dailyLeaderboardID]) { _ in }
    }

    /// Shows today's Game Center leaderboard, or the sign-in sheet first if needed.
    func showLeaderboard() {
        guard let presenter = UIApplication.shared.topViewController else { return }
        if !GKLocalPlayer.local.isAuthenticated {
            if let signIn = pendingSignIn {
                pendingSignIn = nil
                presenter.present(signIn, animated: true)
            } else if let url = URL(string: UIApplication.openSettingsURLString) {
                // Game Center turned off or signed out system-wide.
                UIApplication.shared.open(url)
            }
            return
        }
        let vc = GKGameCenterViewController(leaderboardID: Self.dailyLeaderboardID,
                                            playerScope: .global, timeScope: .today)
        vc.gameCenterDelegate = self
        presenter.present(vc, animated: true)
    }
}

extension GameCenter: GKGameCenterControllerDelegate {
    nonisolated func gameCenterViewControllerDidFinish(_ vc: GKGameCenterViewController) {
        Task { @MainActor in vc.dismiss(animated: true) }
    }
}

extension UIApplication {
    /// The view controller currently on top, for presenting system sheets.
    var topViewController: UIViewController? {
        let scenes = connectedScenes.compactMap { $0 as? UIWindowScene }
        let window = scenes.flatMap(\.windows).first { $0.isKeyWindow } ?? scenes.first?.windows.first
        var top = window?.rootViewController
        while let next = top?.presentedViewController { top = next }
        return top
    }
}
