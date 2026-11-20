package kr.hamkkejaram.app;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebBackForwardList;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 뒤로 가기 버튼(또는 뒤로 가기 손짓): 앱 안에서 앞 화면으로 돌아간다.
        // 첫 화면(소개, 보호자 홈, 선생님 홈)이거나 더 돌아갈 화면이 없으면 앱을 닫는다.
        // 로그인한 화면에서 소개·로그인·가입 화면으로 돌아가게 되면(로그인 상태라 그 화면은 곧바로 홈으로 다시 넘어간다) 앱을 닫는다.
        getOnBackPressedDispatcher()
            .addCallback(
                this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                        if (webView != null && !isHomeScreen(webView.getUrl()) && webView.canGoBack() && !backLeavesSignedIn(webView)) {
                            webView.goBack();
                        } else {
                            finish();
                        }
                    }
                }
            );
    }

    private static String pathOf(String url) {
        if (url == null) return "/";
        String path = Uri.parse(url).getPath();
        if (path == null || path.isEmpty()) return "/";
        while (path.length() > 1 && path.endsWith("/")) path = path.substring(0, path.length() - 1);
        return path;
    }

    private static boolean isHomeScreen(String url) {
        String path = pathOf(url);
        return path.equals("/") || path.equals("/p") || path.equals("/t");
    }

    /** 지금 로그인한 사람의 화면(/p…, /t…)인데 바로 앞 기록이 소개·로그인·가입 화면이면 true. */
    private static boolean backLeavesSignedIn(WebView webView) {
        String now = pathOf(webView.getUrl());
        if (!(now.startsWith("/p/") || now.startsWith("/t/"))) return false;
        WebBackForwardList list = webView.copyBackForwardList();
        int index = list.getCurrentIndex() - 1;
        if (index < 0) return false;
        String prev = pathOf(list.getItemAtIndex(index).getUrl());
        return prev.equals("/") || prev.equals("/login") || prev.equals("/signup");
    }
}
