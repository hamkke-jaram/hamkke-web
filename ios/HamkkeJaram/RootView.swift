import SwiftUI

/// 앱 전체 화면: 머리줄 + 웹 화면 + 아래 탭. 처음에는 시작 화면(모찌), 서버에 닿지 못하면 안내 화면을 위에 덮는다.
struct RootView: View {
    @StateObject private var web = WebStore()
    @State private var showSplash = true
    @State private var showServer = false
    private let launchedAt = Date()

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                HeaderBar(
                    // 탭 맨 위 화면은 본문이 큰 제목을 보여 주므로 머리줄에는 노란 글자 로고(Figma 홈 머리), 그 아래 화면은 화면 제목.
                    title: Tab.isRoot(web.path) ? nil : web.title,
                    showBack: web.canGoBack && !Tab.isRoot(web.path),
                    onBack: { Haptics.play("soft"); web.goBack() },
                    onReload: { web.reload() },
                    onQR: { web.navigate("/qr") },
                    onServer: { showServer = true }
                )
                WebContainer(store: web)
                if Tab.showsBar(for: web.path) {
                    // 기록하기는 보호자 기능이라 선생님 화면(/t)에서는 두지 않는다.
                    TabBar(selected: Tab.of(web.path), hasChild: web.lastChildId != nil && !web.path.hasPrefix("/t")) { tab in
                        Haptics.play("soft")
                        web.navigate(tab.path(for: web.path, childId: web.lastChildId))
                    }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(.snappy(duration: 0.25), value: Tab.showsBar(for: web.path))

            if case .failed(let message) = web.phase, !showSplash {
                OfflineView(message: message, url: AppConfig.webURL, onRetry: { web.load() }, onServer: { showServer = true })
                    .transition(.opacity)
            }

            if showSplash {
                SplashView()
                    .transition(.opacity.combined(with: .scale(scale: 1.04)))
                    .zIndex(1)
            }
        }
        // 화면 키보드는 웹 화면이 알아서 비킨다. SwiftUI가 탭까지 밀어 올리지 않게 한다.
        .ignoresSafeArea(.keyboard)
        .onChange(of: web.phase) { _, phase in
            guard phase != .loading, showSplash else { return }
            // 시작 화면은 적어도 한 번 뛰는 모습(약 1.4초)은 보여 주고 걷는다.
            let wait = max(0, 1.4 - Date().timeIntervalSince(launchedAt))
            DispatchQueue.main.asyncAfter(deadline: .now() + wait) {
                withAnimation(.easeOut(duration: 0.35)) { showSplash = false }
            }
        }
        .sheet(isPresented: $showServer) {
            ServerSheet { web.load() }
                .presentationDetents([.medium])
        }
        .sheet(item: Binding(get: { web.sharedFile.map(SharedFile.init) }, set: { web.sharedFile = $0?.url })) { file in
            ShareSheet(items: [file.url])
        }
        .tint(Theme.brand)
    }
}

// MARK: - 아래 탭

enum Tab: CaseIterable {
    case home, record, support, account

    var label: String {
        switch self {
        case .home: "홈"
        case .record: "기록하기"
        case .support: "도움받기"
        case .account: "설정"
        }
    }

    var symbol: String {
        switch self {
        case .home: "house.fill"
        case .record: "video.fill"
        case .support: "heart.text.square.fill"
        case .account: "gearshape.fill"
        }
    }

    /// 누르면 갈 웹 주소. 홈은 보던 쪽(보호자 /p, 선생님 /t), 기록하기는 마지막으로 본 아이의 영상 기록.
    func path(for current: String, childId: String?) -> String {
        switch self {
        case .home: current.hasPrefix("/t") ? "/t" : "/p"
        case .record: childId.map { "/p/children/\($0)/record" } ?? "/p"
        case .support: "/support"
        case .account: "/account"
        }
    }

    static func of(_ path: String) -> Tab {
        if path.hasPrefix("/account") { return .account }
        if path.hasPrefix("/support") { return .support }
        if path.hasSuffix("/record") || path.hasSuffix("/observe") { return .record }
        return .home
    }

    /// 탭의 맨 위 화면(뒤로 버튼 없이 앱 이름을 보여 준다): 시작·보호자 홈·아이 홈·선생님 홈·도움받기·내 정보.
    static func isRoot(_ path: String) -> Bool {
        if ["/", "/p", "/t", "/support", "/account"].contains(path) { return true }
        return path.range(of: #"^/p/children/\d+/?$"#, options: .regularExpression) != nil
    }

    /// 들어가기 전(시작·준비 화면)과 실시간 카메라 화면에서는 탭을 숨긴다.
    static func showsBar(for path: String) -> Bool {
        guard path.hasPrefix("/p") || path.hasPrefix("/t") || path.hasPrefix("/support") || path.hasPrefix("/account") else { return false }
        return !path.hasSuffix("/observe")
    }
}

struct TabBar: View {
    let selected: Tab
    let hasChild: Bool
    let onSelect: (Tab) -> Void

    var body: some View {
        HStack(alignment: .bottom, spacing: 0) {
            ForEach(Tab.allCases, id: \.self) { tab in
                if tab == .record && !hasChild {
                    EmptyView()
                } else if tab == .record {
                    // 가운데 둥근 노란 버튼: 가장 자주 하는 일(영상 기록)
                    Button { onSelect(tab) } label: {
                        VStack(spacing: 3) {
                            Image(systemName: tab.symbol)
                                .font(.system(size: 20, weight: .bold))
                                .foregroundStyle(Theme.ctaInk)
                                .frame(width: 54, height: 54)
                                .background(Circle().fill(Theme.cta))
                                .overlay(Circle().stroke(Theme.bg, lineWidth: 4))
                                .shadow(color: Theme.brand.opacity(0.25), radius: 8, y: 3)
                                .offset(y: -10)
                                .padding(.bottom, -10)
                            Text(tab.label).font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(selected == tab ? Theme.brand : Theme.ink2)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(PressableStyle())
                    .accessibilityLabel(tab.label)
                    .accessibilityAddTraits(selected == tab ? .isSelected : [])
                } else {
                    Button { onSelect(tab) } label: {
                        VStack(spacing: 4) {
                            Image(systemName: tab.symbol)
                                .font(.system(size: 21, weight: .semibold))
                                .symbolEffect(.bounce, value: selected == tab)
                            Text(tab.label).font(.system(size: 11, weight: .semibold))
                        }
                        .foregroundStyle(selected == tab ? Theme.brand : Theme.ink2.opacity(0.85))
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(PressableStyle())
                    .accessibilityLabel(tab.label)
                    .accessibilityAddTraits(selected == tab ? .isSelected : [])
                }
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 6)
        .background(
            Theme.bg
                .shadow(color: .black.opacity(0.06), radius: 10, y: -2)
                .ignoresSafeArea(edges: .bottom)
        )
        .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 0.5) }
    }
}

/// 눌렀을 때 살짝 작아졌다 돌아오는 버튼.
struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.92 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.55), value: configuration.isPressed)
    }
}

// MARK: - 머리줄

struct HeaderBar: View {
    /// nil이면 시나브로 글자 로고를 보여 준다.
    let title: String?
    let showBack: Bool
    let onBack: () -> Void
    let onReload: () -> Void
    let onQR: () -> Void
    let onServer: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            if showBack {
                Button(action: onBack) {
                    Image(systemName: "chevron.backward")
                        .font(.system(size: 19, weight: .semibold))
                        .frame(width: 40, height: 40)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressableStyle())
                .accessibilityLabel("뒤로")
                .transition(.move(edge: .leading).combined(with: .opacity))
            }
            if let title {
                Text(title)
                    .font(.system(size: 19, weight: .bold))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                    .contentTransition(.opacity)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .animation(.easeOut(duration: 0.2), value: title)
            } else {
                Group {
                    if let mark = Art.image("wordmark") {
                        Image(uiImage: mark).resizable().scaledToFit().frame(height: 22)
                    } else {
                        Text("시나브로").font(.system(size: 19, weight: .heavy)).foregroundStyle(Theme.cta)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement()
                .accessibilityLabel("시나브로")
            }
            Menu {
                Button("새로고침", systemImage: "arrow.clockwise", action: onReload)
                Button("휴대폰으로 열기 (QR)", systemImage: "qrcode", action: onQR)
                Button("서버 주소 바꾸기", systemImage: "server.rack", action: onServer)
            } label: {
                Image(systemName: "ellipsis.circle")
                    .font(.system(size: 21, weight: .regular))
                    .frame(width: 40, height: 40)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("더 보기")
        }
        .foregroundStyle(Theme.ink)
        .padding(.horizontal, 12)
        .frame(height: 52)
        .background(Theme.bg.ignoresSafeArea(edges: .top))
        .animation(.snappy(duration: 0.22), value: showBack)
    }
}

// MARK: - 시작 화면

struct SplashView: View {
    @State private var appear = false

    var body: some View {
        ZStack {
            // Figma '스플래시': 흰 바탕, 모찌 가족(통통 뛰는), 노란 시나브로 글자 로고.
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 22) {
                MochiView(image: "mochi-family", size: 237, hop: 60)
                VStack(spacing: 8) {
                    if let mark = Art.image("wordmark") {
                        Image(uiImage: mark).resizable().scaledToFit().frame(width: 137)
                    } else {
                        Text("시나브로").font(.system(size: 32, weight: .heavy)).foregroundStyle(Theme.cta)
                    }
                    Text("아이 곁의 시간을 함께 기록해요")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Theme.ink2)
                }
                .opacity(appear ? 1 : 0)
                .offset(y: appear ? 0 : 10)
                ProgressView()
                    .tint(Theme.brand)
                    .padding(.top, 8)
                    .opacity(appear ? 1 : 0)
            }
        }
        .onAppear { withAnimation(.easeOut(duration: 0.5).delay(0.15)) { appear = true } }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("시나브로를 여는 중")
    }
}

// MARK: - 서버에 닿지 못했을 때

struct OfflineView: View {
    let message: String
    let url: URL
    let onRetry: () -> Void
    let onServer: () -> Void

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 14) {
                MochiView(image: "mochi-friend", size: 120, hop: 40)
                Text("앱 서버에 연결하지 못했어요")
                    .font(.system(size: 21, weight: .bold))
                    .foregroundStyle(Theme.ink)
                Text("이 Mac에서 웹 개발 서버(npm run dev:lan)와 API(./gradlew bootRun)가 켜져 있는지 확인해 주세요.")
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.ink2)
                    .multilineTextAlignment(.center)
                Text(url.absoluteString)
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Theme.brand)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(Theme.surface2))
                Text(message).font(.footnote).foregroundStyle(Theme.ink2.opacity(0.8)).multilineTextAlignment(.center)
                VStack(spacing: 10) {
                    Button {
                        Haptics.play("soft")
                        onRetry()
                    } label: {
                        Text("다시 시도").font(.system(size: 17, weight: .bold)).frame(maxWidth: .infinity, minHeight: 52)
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    Button("서버 주소 바꾸기", action: onServer)
                        .font(.system(size: 16, weight: .semibold))
                        .frame(minHeight: 44)
                }
                .padding(.top, 8)
            }
            .padding(.horizontal, 28)
        }
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(Theme.ctaInk)
            .background(RoundedRectangle(cornerRadius: 15).fill(Theme.cta))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

// MARK: - 서버 주소 바꾸기

struct ServerSheet: View {
    let onApply: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var text = AppConfig.webURL.absoluteString
    @State private var invalid = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("http://192.168.0.10:5173/", text: $text)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("웹앱 주소")
                } footer: {
                    Text(invalid
                         ? "주소 모양이 맞지 않아요. 예: http://192.168.0.10:5173"
                         : "시뮬레이터는 http://localhost:5173/try 그대로 두면 돼요(데모). 휴대폰에서는 Mac의 와이파이 주소(npm run dev:lan이 터미널에 보여 줘요)만 넣으면 데모가 열려요. 가입·로그인 화면은 주소 끝에 /login을 붙여요.")
                }
                if AppConfig.isOverridden {
                    Section {
                        Button("기본값(\(AppConfig.defaultURL.absoluteString))으로 되돌리기") {
                            AppConfig.setWebURL(nil)
                            onApply()
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle("서버 주소")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("저장") {
                        if AppConfig.setWebURL(text) == nil { invalid = true; return }
                        onApply()
                        dismiss()
                    }
                    .bold()
                }
            }
        }
    }
}

// MARK: - 공유 시트(내려받은 파일)

struct SharedFile: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}
