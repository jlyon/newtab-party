import SwiftUI
import WebKit

struct WebView: UIViewRepresentable {
    let url: URL
    let model: AppModel

    /// Runs at document start: hides the Chrome Web Store buttons (an iOS app
    /// shouldn't promote another platform's store).
    private static let hideChromeCSS = """
    (function () {
      var s = document.createElement('style');
      s.textContent = '.btn-install, a[href*="chromewebstore.google.com"] { display: none !important; }';
      document.documentElement.appendChild(s);
    })();
    """

    /// Runs at document end in the main frame: forwards each finished game to the
    /// app and adds native buttons to the About modal.
    private static let bridgeJS = """
    (function () {
      if (window.__ntApp) return; window.__ntApp = 1;
      function post(m) { try { webkit.messageHandlers.newtab.postMessage(m); } catch (e) {} }
      window.addEventListener('message', function (e) {
        var d = e.data;
        if (!d || typeof d.highScore !== 'number') return;
        var g = (typeof currentGame !== 'undefined' && currentGame) ? currentGame : null;
        post({ type: 'score', score: Math.floor(d.highScore), path: location.pathname,
               gameId: g ? g.id : '', gameName: g ? g.name : '' });
      });
      var links = document.querySelector('#about-modal .modal-links');
      if (links) {
        [['Game Center', 'gamecenter'], ['App settings', 'settings']].forEach(function (b) {
          var btn = document.createElement('button');
          btn.textContent = b[0];
          btn.onclick = function () { post({ type: b[1] }); };
          links.insertBefore(btn, links.firstChild);
        });
      }
    })();
    """

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.applicationNameForUserAgent = "NewtabPartyApp/1.0"

        let controller = config.userContentController
        controller.addUserScript(WKUserScript(source: Self.hideChromeCSS, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        controller.addUserScript(WKUserScript(source: Self.bridgeJS, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        controller.add(WeakMessageHandler(context.coordinator), name: "newtab")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.scrollView.bounces = false
        webView.scrollView.bouncesZoom = false
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 8/255, green: 8/255, blue: 16/255, alpha: 1)
        webView.allowsBackForwardNavigationGestures = false
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        model.webView = webView

        webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(model: model) }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        let model: AppModel
        init(model: AppModel) { self.model = model }

        // MARK: Bridge

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
            Task { @MainActor in
                switch type {
                case "score":
                    model.gameEnded(score: (body["score"] as? NSNumber)?.intValue ?? 0,
                                    gameId: body["gameId"] as? String ?? "",
                                    gameName: body["gameName"] as? String ?? "",
                                    path: body["path"] as? String ?? "")
                case "gamecenter":
                    GameCenter.shared.showLeaderboard()
                case "settings":
                    model.showSettings = true
                default:
                    break
                }
            }
        }

        // MARK: Navigation

        private static func isOwnSite(_ url: URL) -> Bool {
            let host = url.host ?? ""
            return host.isEmpty || host == "newtab.party" || host.hasSuffix(".newtab.party")
        }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = action.request.url else { decisionHandler(.allow); return }
            if Self.isOwnSite(url) || action.navigationType != .linkActivated {
                decisionHandler(.allow)
            } else {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
            }
        }

        /// target="_blank" links: our own pages load in place, everything else opens in Safari.
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = action.request.url {
                if Self.isOwnSite(url) { webView.load(action.request) } else { UIApplication.shared.open(url) }
            }
            return nil
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            Task { @MainActor in model.pageLoaded() }
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation _: WKNavigation!, withError error: Error) {
            let html = """
            <html><body style="background:#080810;color:rgba(255,255,255,0.4);font-family:-apple-system;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;">
            <div><p style="font-size:14px;letter-spacing:2px;text-transform:uppercase">No connection</p>
            <p style="font-size:12px;margin-top:8px">Check your internet and try again.</p></div>
            </body></html>
            """
            webView.loadHTMLString(html, baseURL: nil)
        }

        // MARK: JavaScript dialogs

        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
            guard let top = UIApplication.shared.topViewController else { completionHandler(); return }
            top.present(alert, animated: true)
        }

        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
            guard let top = UIApplication.shared.topViewController else { completionHandler(false); return }
            top.present(alert, animated: true)
        }
    }
}

/// WKUserContentController retains its handlers; this breaks the cycle.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}
