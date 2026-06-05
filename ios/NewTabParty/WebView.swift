import SwiftUI
import WebKit

struct WebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.scrollView.bounces = false
        webView.scrollView.bouncesZoom = false
        webView.scrollView.isScrollEnabled = false
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 8/255, green: 8/255, blue: 16/255, alpha: 1)
        webView.allowsBackForwardNavigationGestures = false
        webView.navigationDelegate = context.coordinator

        webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator() }

    class Coordinator: NSObject, WKNavigationDelegate {
        func webView(
            _ webView: WKWebView,
            decidePolicyFor action: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = action.request.url else { decisionHandler(.allow); return }
            let host = url.host ?? ""
            if host == "newtab.party" || host.hasSuffix(".newtab.party") || host.isEmpty {
                decisionHandler(.allow)
            } else if action.navigationType == .linkActivated {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
            } else {
                decisionHandler(.allow)
            }
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
    }
}
