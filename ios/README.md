# newtab.party for iOS

A SwiftUI app around https://newtab.party with native features on top, so it is more than a repackaged website (App Store guideline 4.2).

| Feature | Where |
|---|---|
| Game Center daily leaderboard, scores submitted at game end | `NewTabParty/GameCenter.swift` |
| Score bar after each game: haptics, share sheet, Game Center | `NewTabParty/ContentView.swift`, `AppModel.swift` |
| Daily reminder naming the new game (local notifications) | `NewTabParty/Reminders.swift` |
| Home screen widget: today's game, top score, your best | `NewTabPartyWidget/` |
| Settings sheet: reminder time, Game Center, privacy, support | `NewTabParty/SettingsView.swift` |
| Score bridge, hidden Chrome buttons, native About buttons | `NewTabParty/WebView.swift` |

Only today's game counts. The bridge forwards each game's `postMessage({ highScore })` to the app, which ignores `/play/<date>` replays. Reminders use the same rotation math as `worker/src/index.ts` on `/games.json?raw=1`, and are rescheduled on launch, on foreground and in a background refresh just after midnight UTC.

## One-time setup before submitting

Needs a paid Apple Developer account.

1. In Xcode, pick your team under Signing & Capabilities for both the NewTabParty and NewTabPartyWidget targets. Automatic signing registers the App Group `group.party.newtab.app` and the Game Center capability.
2. In App Store Connect, create the app with bundle ID `party.newtab.app`.
3. Under Game Center, add a **recurring** leaderboard with ID `party.newtab.daily`: score format integer, sort high to low, duration 1 day, starting at 00:00 UTC.
4. Set the privacy policy URL to https://newtab.party/privacy.
5. App Privacy answers: Gameplay Content and Other User Content (the optional leaderboard name), not linked to the user, not used for tracking. This matches `Shared/PrivacyInfo.xcprivacy`.
6. Archive (Product, then Archive) and upload. TestFlight works from the same upload.

The site must be deployed with name moderation, reporting and `/privacy` before review, since the app loads the live site.
