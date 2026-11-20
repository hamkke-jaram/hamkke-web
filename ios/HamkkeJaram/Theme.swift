import SwiftUI
import UIKit

/// 웹의 색 토큰(src/styles.css :root와 다크)과 같은 값. 흰 바탕 + 노란 주 버튼 + 크림 + 따뜻한 갈색 글자.
enum Theme {
    static let bg = Color(light: 0xFFFFFF, dark: 0x1A1410)
    static let surface2 = Color(light: 0xFEF3D7, dark: 0x33261A)
    static let ink = Color(light: 0x2B1D14, dark: 0xF7EFE6)
    static let ink2 = Color(light: 0x5A524B, dark: 0xD3C7BA)
    static let line = Color(light: 0xEBE4D8, dark: 0x40332A)
    static let brand = Color(light: 0x8A4B00, dark: 0xF5BD6E)
    static let cta = Color(hex: 0xFFC144)
    static let ctaInk = Color(hex: 0x2B1D14)
}

extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }

    /// 밝게·어둡게에 따라 바뀌는 색.
    init(light: UInt32, dark: UInt32) {
        self.init(uiColor: UIColor { trait in
            let hex = trait.userInterfaceStyle == .dark ? dark : light
            return UIColor(
                red: CGFloat((hex >> 16) & 0xFF) / 255,
                green: CGFloat((hex >> 8) & 0xFF) / 255,
                blue: CGFloat(hex & 0xFF) / 255,
                alpha: 1
            )
        })
    }
}

/// 누를 때의 짧은 진동. 웹이 { type: 'haptic', style }으로 부르기도 한다(src/native.tsx).
enum Haptics {
    static func play(_ style: String) {
        switch style {
        case "light": UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case "medium": UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        case "success": UINotificationFeedbackGenerator().notificationOccurred(.success)
        default: UIImpactFeedbackGenerator(style: .soft).impactOccurred(intensity: 0.7)
        }
    }
}

/// 번들에 넣은 그림(Images/*.png).
enum Art {
    static func image(_ name: String) -> UIImage? { UIImage(named: name) }
}
