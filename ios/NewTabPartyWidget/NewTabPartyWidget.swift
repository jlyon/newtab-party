import ImageIO
import SwiftUI
import UIKit
import WidgetKit

// "Today's game" home screen widget: the game's logo and name, how many people
// have played, the top score, and your own best today (from the App Group).

struct DailyEntry: TimelineEntry {
    let date: Date
    let gameName: String
    let logo: UIImage?
    let plays: Int?
    let topScore: Int?
    let myBest: Int?

    static let placeholder = DailyEntry(date: Date(), gameName: "Today's game", logo: nil,
                                        plays: 12, topScore: 4_200, myBest: nil)
}

struct DailyProvider: TimelineProvider {
    private struct Daily: Decodable {
        struct Game: Decodable { let id: String; let name: String }
        struct Score: Decodable { let score: Int }
        let game: Game
        let scores: [Score]
        let totalPlays: Int
    }

    func placeholder(in context: Context) -> DailyEntry { .placeholder }

    func getSnapshot(in context: Context, completion: @escaping (DailyEntry) -> Void) {
        if context.isPreview { completion(.placeholder); return }
        Task { completion(await load()) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DailyEntry>) -> Void) {
        Task {
            let entry = await load()
            // Refresh every half hour for the play count, and right after the game changes at midnight UTC.
            let midnight = SharedStore.nextUTCMidnight().addingTimeInterval(60)
            let next = min(midnight, Date().addingTimeInterval(30 * 60))
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }

    private func load() async -> DailyEntry {
        let best = SharedStore.bestToday
        guard let (data, _) = try? await URLSession.shared.data(from: SharedStore.site.appendingPathComponent("api/daily")),
              let daily = try? JSONDecoder().decode(Daily.self, from: data) else {
            return DailyEntry(date: Date(), gameName: best?.gameName ?? "newtab.party", logo: nil,
                              plays: nil, topScore: nil, myBest: best?.score)
        }
        let logoURL = SharedStore.site.appendingPathComponent("games/logos/\(daily.game.id).png")
        let logo = await Self.thumbnail(from: logoURL, maxPixels: 360)
        return DailyEntry(date: Date(), gameName: daily.game.name, logo: logo,
                          plays: daily.totalPlays, topScore: daily.scores.first?.score,
                          myBest: best?.gameId == daily.game.id ? best?.score : nil)
    }

    /// Widgets have a tight memory budget, so decode the logo at a small size.
    private static func thumbnail(from url: URL, maxPixels: Int) async -> UIImage? {
        guard let (data, _) = try? await URLSession.shared.data(from: url),
              let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixels,
            kCGImageSourceCreateThumbnailWithTransform: true,
        ]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: cg)
    }
}

private let gold = Color(red: 1, green: 215 / 255, blue: 0)
private let widgetGradient = LinearGradient(colors: [Color(red: 0.11, green: 0.07, blue: 0.24), Color(red: 0.03, green: 0.03, blue: 0.06)],
                                        startPoint: .topLeading, endPoint: .bottomTrailing)

struct DailyWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: DailyEntry

    var body: some View {
        Group {
            if family == .systemMedium { medium } else { small }
        }
        .widgetBackground(widgetGradient)
    }

    private var logo: some View {
        Group {
            if let image = entry.logo {
                Image(uiImage: image).resizable().scaledToFit()
            } else {
                Image(systemName: "gamecontroller.fill").resizable().scaledToFit()
                    .foregroundStyle(gold.opacity(0.85)).padding(10)
            }
        }
    }

    private var label: some View {
        Text("TODAY'S GAME").font(.system(size: 9, weight: .bold)).tracking(1.4).foregroundStyle(.white.opacity(0.5))
    }

    private var small: some View {
        VStack(spacing: 4) {
            label
            logo.frame(maxHeight: .infinity)
            Text(entry.gameName).font(.caption.weight(.bold)).foregroundStyle(.white)
                .lineLimit(1).minimumScaleFactor(0.7)
            if let best = entry.myBest {
                Text("Your best \(best.formatted())").font(.caption2.weight(.semibold)).foregroundStyle(gold)
            }
        }
    }

    private var medium: some View {
        HStack(spacing: 14) {
            logo.frame(width: 110, height: 110)
            VStack(alignment: .leading, spacing: 6) {
                label
                Text(entry.gameName).font(.headline.weight(.heavy)).foregroundStyle(.white)
                    .lineLimit(2).minimumScaleFactor(0.75)
                if let top = entry.topScore {
                    stat("Top score", top.formatted())
                }
                if let plays = entry.plays {
                    stat("Plays today", plays.formatted())
                }
                if let best = entry.myBest {
                    stat("Your best", best.formatted(), highlight: true)
                } else {
                    Text("Not played yet").font(.caption).foregroundStyle(.white.opacity(0.55))
                }
            }
            Spacer(minLength: 0)
        }
    }

    private func stat(_ name: String, _ value: String, highlight: Bool = false) -> some View {
        HStack(spacing: 6) {
            Text(name).font(.caption).foregroundStyle(.white.opacity(0.55))
            Text(value).font(.caption.weight(.bold).monospacedDigit()).foregroundStyle(highlight ? gold : .white)
        }
    }
}

private extension View {
    @ViewBuilder
    func widgetBackground<B: View>(_ background: B) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            containerBackground(for: .widget) { background }
        } else {
            padding().background(background)
        }
    }
}

struct DailyWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "DailyGame", provider: DailyProvider()) { entry in
            DailyWidgetView(entry: entry)
        }
        .configurationDisplayName("Today's game")
        .description("Today's game, the top score, and your best.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct NewTabPartyWidgets: WidgetBundle {
    var body: some Widget { DailyWidget() }
}
