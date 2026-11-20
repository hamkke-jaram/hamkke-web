import SwiftUI
import UIKit
import WebKit

/// 웹앱을 띄우는 WKWebView 하나와 그 상태(불러오는 중·준비됨·실패, 화면 주소·제목).
/// 웹과는 src/native.tsx의 다리로 이야기한다:
/// - 웹 → 앱(messageHandlers.hamkke): ready, route(path·title·canGoBack), haptic(style)
/// - 앱 → 웹: window.hjNavigate(path), window.hjBack()
/// 주고받는 것은 화면 주소·제목·진동 종류뿐이다.
@MainActor
final class WebStore: NSObject, ObservableObject {
    enum Phase: Equatable {
        case loading
        case ready
        case failed(String)
    }

    @Published private(set) var phase: Phase = .loading
    @Published private(set) var title = "시나브로"
    @Published private(set) var path = "/"
    @Published private(set) var canGoBack = false
    /// 마지막으로 본 아이(기록하기 탭이 그 아이의 기록 화면으로 간다).
    @Published private(set) var lastChildId: String?
    /// 내려받은 파일(내 데이터 내려받기)을 공유 시트로 보여 줄 때.
    @Published var sharedFile: URL?

    let webView: WKWebView
    private let refresh = UIRefreshControl()
    private var readyFallback: Task<Void, Never>?
    /// 내려받는 중인 파일의 저장 자리.
    fileprivate var pendingDownload: URL?

    override init() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.applicationNameForUserAgent = "HamkkeJaramiOS/1.0"
        let contents = WKUserContentController()
        config.userContentController = contents
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()

        contents.add(WeakMessageHandler(self), name: "hamkke")
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true // 화면 왼쪽 끝에서 밀어 뒤로
        webView.allowsLinkPreview = false
        webView.isOpaque = false
        webView.backgroundColor = UIColor(Theme.bg)
        webView.scrollView.backgroundColor = UIColor(Theme.bg)
        webView.scrollView.keyboardDismissMode = .interactive
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true } // Mac Safari 개발자 메뉴로 살펴보기
        #endif
        refresh.addTarget(self, action: #selector(pullToRefresh), for: .valueChanged)
        webView.scrollView.refreshControl = refresh
        load()
    }

    // MARK: - 앱 → 웹

    func load() {
        phase = .loading
        webView.load(URLRequest(url: AppConfig.webURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15))
    }

    func reload() {
        if case .failed = phase { load() } else { webView.reload() }
    }

    /// 아래 탭: 웹 안에서 화면만 바꾼다(다시 불러오지 않는다).
    func navigate(_ path: String) {
        #if DEBUG
        print("[bridge] app → web: navigate", path, "phase:", phase)
        #endif
        guard phase == .ready else { return }
        webView.evaluateJavaScript("window.hjNavigate ? window.hjNavigate(\(Self.jsString(path))) : (location.href = \(Self.jsString(path)))")
    }

    func goBack() {
        webView.evaluateJavaScript("window.hjBack ? window.hjBack() : history.back()")
    }

    @objc private func pullToRefresh() {
        Haptics.play("soft")
        reload()
    }

    private static func jsString(_ s: String) -> String {
        let data = try? JSONSerialization.data(withJSONObject: [s])
        let arr = data.flatMap { String(data: $0, encoding: .utf8) } ?? "[\"/\"]"
        return String(arr.dropFirst().dropLast())
    }

    // MARK: - 웹 → 앱

    fileprivate func receive(_ body: Any) {
        #if DEBUG
        print("[bridge] web → app:", body)
        #endif
        guard let msg = body as? [String: Any], let type = msg["type"] as? String else { return }
        switch type {
        case "ready":
            readyFallback?.cancel()
            phase = .ready
        case "route":
            if let p = msg["path"] as? String {
                path = p
                if let r = p.range(of: #"^/p/children/(\d+)"#, options: .regularExpression) {
                    lastChildId = String(p[r].split(separator: "/").last ?? "")
                } else if p == "/" || p.hasPrefix("/t") {
                    // 시작 화면으로 나갔거나 선생님으로 들어오면 보호자 쪽에서 본 아이는 잊는다(역할이 바뀔 수 있다).
                    lastChildId = nil
                }
            }
            if let t = msg["title"] as? String, !t.isEmpty { title = t }
            canGoBack = (msg["canGoBack"] as? Bool) ?? false
        case "haptic":
            Haptics.play((msg["style"] as? String) ?? "soft")
        default:
            break
        }
    }

    private func fail(_ error: Error) {
        let ns = error as NSError
        if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { return }
        refresh.endRefreshing()
        readyFallback?.cancel()
        phase = .failed(ns.localizedDescription)
    }
}

// MARK: - WKNavigationDelegate

extension WebStore: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        refresh.endRefreshing()
        // 우리 웹앱이면 곧 'ready'를 보낸다. 다른 페이지(오류 화면 등)여도 멈춰 있지 않게 잠시 뒤 준비됨으로 둔다.
        readyFallback?.cancel()
        readyFallback = Task { [weak self] in
            try? await Task.sleep(for: .seconds(2.5))
            guard let self, !Task.isCancelled, self.phase == .loading else { return }
            self.phase = .ready
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        fail(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        fail(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        load() // 메모리 부족 등으로 웹 화면이 꺼지면 다시 연다
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        if action.shouldPerformDownload { return .download }
        guard let url = action.request.url else { return .allow }
        let scheme = url.scheme?.lowercased() ?? ""
        // 전화·문자·메일(상담 안내)과 앱 밖 사이트는 iOS가 연다.
        if ["tel", "sms", "mailto"].contains(scheme) {
            await UIApplication.shared.open(url)
            return .cancel
        }
        let appHost = AppConfig.webURL.host
        if (scheme == "http" || scheme == "https"), url.host != appHost, action.targetFrame?.isMainFrame ?? true,
           action.navigationType == .linkActivated {
            await UIApplication.shared.open(url)
            return .cancel
        }
        return .allow
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse) async -> WKNavigationResponsePolicy {
        response.canShowMIMEType ? .allow : .download
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }
}

// MARK: - 내려받기(내 데이터 내려받기 → 공유 시트로 '파일에 저장' 등)

extension WebStore: WKDownloadDelegate {
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String) async -> URL? {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(suggestedFilename.isEmpty ? "hamkke-jaram-export.json" : suggestedFilename)
        pendingDownload = url
        return url
    }

    func downloadDidFinish(_ download: WKDownload) {
        sharedFile = pendingDownload
        pendingDownload = nil
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        pendingDownload = nil
    }
}

// MARK: - WKUIDelegate

extension WebStore: WKUIDelegate {
    /// 실시간 관찰 기록의 카메라: 앱이 띄운 웹앱 주소에서만 허락한다(마이크는 웹이 요청하지 않는다).
    func webView(_ webView: WKWebView, decideMediaCapturePermissionsFor origin: WKSecurityOrigin,
                 initiatedBy frame: WKFrameInfo, type: WKMediaCaptureType) async -> WKPermissionDecision {
        origin.host == AppConfig.webURL.host ? .grant : .deny
    }

    /// target=_blank 링크는 같은 화면에서 연다(새 창 없음).
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
            if url.host == AppConfig.webURL.host { webView.load(URLRequest(url: url)) } else { UIApplication.shared.open(url) }
        }
        return nil
    }
}

/// WKUserContentController가 handler를 강하게 붙잡으므로, 순환 참조가 생기지 않게 약하게 넘긴다.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var store: WebStore?
    init(_ store: WebStore) { self.store = store }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        let body = message.body
        MainActor.assumeIsolated { store?.receive(body) }
    }
}

/// SwiftUI 안에 WKWebView를 놓는다.
struct WebContainer: UIViewRepresentable {
    let store: WebStore
    func makeUIView(context: Context) -> WKWebView { store.webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
