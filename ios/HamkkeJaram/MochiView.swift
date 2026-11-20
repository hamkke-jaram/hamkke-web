import SwiftUI

/// 통통 뛰는 모찌(시작 화면·연결 안내). 웹의 모찌(buddyPhysics)와 같은 애니메이션 원칙:
/// 웅크림(예비 동작) → 길쭉하게 늘어나며 뜀 → 꼭대기에서 잠깐 → 떨어지며 늘어남 → 납작하게 착지 → 출렁이며 돌아옴 → 쉼(숨쉬기).
/// 그림자는 높이 뜰수록 작고 옅어진다. 기기에서 '동작 줄이기'를 켰으면 뛰지 않는다.
struct MochiView: View {
    var image = "mochi-dome"
    var size: CGFloat = 132
    var hop: CGFloat = 70

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private struct Pose {
        var y: CGFloat = 0
        var sx: CGFloat = 1
        var sy: CGFloat = 1
        var tilt: Double = 0
    }

    var body: some View {
        let ratio = (Art.image(image)?.size).map { $0.height / max($0.width, 1) } ?? 0.8
        Group {
            if reduceMotion {
                // 동작 줄이기: 뛰지 않고 그대로 둔다.
                art(ratio).frame(height: size * ratio + 8, alignment: .bottom)
            } else {
                hopping(ratio)
            }
        }
        .accessibilityHidden(true)
    }
    @ViewBuilder
    private func art(_ ratio: CGFloat) -> some View {
        Group {
            if let ui = Art.image(image) {
                Image(uiImage: ui).resizable().scaledToFit()
            } else {
                Ellipse().fill(Theme.cta)
            }
        }
        .frame(width: size, height: size * ratio)
    }

    private func hopping(_ ratio: CGFloat) -> some View {
        art(ratio)
            .keyframeAnimator(initialValue: Pose(), repeating: true) { content, p in
                ZStack(alignment: .bottom) {
                    // 바닥 그림자: 높이 뜰수록 작고 옅게
                    Ellipse()
                        .fill(Theme.ink.opacity(0.14 * (1 - min(-p.y / (hop * 1.6), 0.7))))
                        .frame(width: size * 0.78 * (1 - min(-p.y / (hop * 2.4), 0.5)), height: size * 0.09)
                        .offset(y: size * 0.035)
                    content
                        .scaleEffect(x: p.sx, y: p.sy, anchor: .bottom)
                        .rotationEffect(.degrees(p.tilt), anchor: .bottom)
                        .offset(y: p.y)
                }
                .frame(height: size * ratio + hop + 8, alignment: .bottom)
            } keyframes: { _ in
                KeyframeTrack(\.y) {
                    LinearKeyframe(0, duration: 0.18) // 웅크림
                    CubicKeyframe(-hop, duration: 0.34) // 뜀
                    CubicKeyframe(-hop * 1.04, duration: 0.10) // 꼭대기
                    CubicKeyframe(0, duration: 0.30) // 떨어짐
                    LinearKeyframe(0, duration: 0.90) // 착지·쉼
                }
                KeyframeTrack(\.sy) {
                    CubicKeyframe(0.84, duration: 0.18)
                    CubicKeyframe(1.14, duration: 0.14)
                    CubicKeyframe(1.0, duration: 0.30)
                    CubicKeyframe(1.08, duration: 0.30)
                    CubicKeyframe(0.80, duration: 0.07)
                    SpringKeyframe(1.0, duration: 0.45, spring: .init(response: 0.32, dampingRatio: 0.35))
                    CubicKeyframe(0.975, duration: 0.19)
                    CubicKeyframe(1.0, duration: 0.19)
                }
                KeyframeTrack(\.sx) {
                    CubicKeyframe(1.13, duration: 0.18)
                    CubicKeyframe(0.9, duration: 0.14)
                    CubicKeyframe(1.0, duration: 0.30)
                    CubicKeyframe(0.94, duration: 0.30)
                    CubicKeyframe(1.2, duration: 0.07)
                    SpringKeyframe(1.0, duration: 0.45, spring: .init(response: 0.32, dampingRatio: 0.35))
                    CubicKeyframe(1.02, duration: 0.19)
                    CubicKeyframe(1.0, duration: 0.19)
                }
                KeyframeTrack(\.tilt) {
                    LinearKeyframe(0, duration: 0.18)
                    CubicKeyframe(-6, duration: 0.24)
                    CubicKeyframe(6, duration: 0.40)
                    SpringKeyframe(0, duration: 0.5, spring: .init(response: 0.3, dampingRatio: 0.4))
                    LinearKeyframe(0, duration: 0.5)
                }
            }
    }
}

#Preview {
    MochiView()
}
