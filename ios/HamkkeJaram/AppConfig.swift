import Foundation

/// 앱이 띄울 웹앱 주소.
/// 기본값은 빌드 설정 HJ_WEB_URL(Info.plist의 HJWebURL, 개발용 http://localhost:5173/ — 시뮬레이터는 이 Mac의 localhost에 닿는다).
/// 앱 안 '서버 주소 바꾸기'로 이 기기에서만 바꿀 수 있다(실기기에서 같은 와이파이의 Mac 주소를 넣을 때).
enum AppConfig {
    private static let overrideKey = "hj.webURL"

    static var defaultURL: URL {
        let raw = Bundle.main.object(forInfoDictionaryKey: "HJWebURL") as? String
        if let raw, let url = URL(string: raw), url.scheme != nil { return url }
        return URL(string: "http://localhost:5173/")!
    }

    static var webURL: URL {
        if let raw = UserDefaults.standard.string(forKey: overrideKey), let url = URL(string: raw) { return url }
        return defaultURL
    }

    static var isOverridden: Bool { UserDefaults.standard.string(forKey: overrideKey) != nil }

    /// 주소를 바꾼다. http(s)로 시작하지 않으면 http://를 붙인다. nil이면 기본값으로 되돌린다.
    @discardableResult
    static func setWebURL(_ text: String?) -> URL? {
        guard var t = text?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty else {
            UserDefaults.standard.removeObject(forKey: overrideKey)
            return nil
        }
        if !t.hasPrefix("http://") && !t.hasPrefix("https://") { t = "http://" + t }
        if !t.hasSuffix("/") { t += "/" }
        guard let url = URL(string: t), url.host != nil else { return nil }
        UserDefaults.standard.set(url.absoluteString, forKey: overrideKey)
        return url
    }
}
