import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        WebView(url: SharedStore.site, model: model)
            .ignoresSafeArea()
            .overlay(alignment: .bottom) {
                if let result = model.result {
                    ResultBar(result: result)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 12)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .sheet(isPresented: $model.showSettings) { SettingsView() }
    }
}

/// Native end-of-game bar: score, share sheet and Game Center. Hides itself after a few seconds.
private struct ResultBar: View {
    @EnvironmentObject private var model: AppModel
    let result: AppModel.Result

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 1) {
                Text(result.isNewBest ? "NEW BEST" : "GAME OVER")
                    .font(.caption2.weight(.bold))
                    .tracking(1.5)
                    .lineLimit(1)
                    .foregroundStyle(result.isNewBest ? Color.gold : .secondary)
                Text(result.score.formatted())
                    .font(.title2.weight(.heavy).monospacedDigit())
                    .foregroundStyle(.white)
            }
            Spacer(minLength: 8)
            ShareLink(item: SharedStore.site, message: Text(model.shareText)) {
                Label("Share", systemImage: "square.and.arrow.up")
            }
            .buttonStyle(BarButtonStyle())
            Button {
                GameCenter.shared.showLeaderboard()
            } label: {
                Label("Game Center", systemImage: "trophy.fill").labelStyle(.iconOnly)
            }
            .buttonStyle(BarButtonStyle())
            .accessibilityLabel("Game Center leaderboard")
            Button(action: model.dismissResult) {
                Image(systemName: "xmark").font(.footnote.weight(.bold))
            }
            .foregroundStyle(.secondary)
            .accessibilityLabel("Dismiss")
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(.white.opacity(0.12)))
        .environment(\.colorScheme, .dark)
        .frame(maxWidth: 520)
    }
}

private struct BarButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Color.black)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(Color.gold.opacity(configuration.isPressed ? 0.7 : 1), in: Capsule())
    }
}

extension Color {
    static let gold = Color(red: 1, green: 215 / 255, blue: 0)
}
