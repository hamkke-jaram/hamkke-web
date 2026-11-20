import SwiftUI

/// 함께자람 iOS 앱. 웹앱(hamkke-web)을 WKWebView로 띄우고, 그 둘레를 iOS 화면으로 감싼다:
/// 모찌가 통통 뛰는 시작 화면, 앱 머리줄(제목·뒤로), 아래 탭(홈·기록하기·도움받기·내 정보), 당겨서 새로고침,
/// 누를 때 진동, 서버에 닿지 못했을 때의 안내. 화면 내용과 기능은 웹과 같아 웹을 고치면 앱도 같이 바뀐다.
@main
struct HamkkeJaramApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
