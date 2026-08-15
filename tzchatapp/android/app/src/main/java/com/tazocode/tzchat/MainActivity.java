package com.tazocode.tzchat;

import com.getcapacitor.BridgeActivity;

import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.content.pm.ApplicationInfo;
import android.view.WindowManager;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;

import androidx.core.view.WindowCompat;

public class MainActivity extends BridgeActivity {

  private static final String TAG = "MainActivity";

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // ✅ 키보드 모드 강제: adjustResize + stateHidden
    try {
      getWindow().setSoftInputMode(
        WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
          | WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN
      );
      WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
      Log.i(TAG, "[BOOT] SoftInput=ADJUST_RESIZE | STATE_HIDDEN, edge-to-edge ON");
    } catch (Throwable t) {
      Log.w(TAG, "Failed to set soft input mode or edge-to-edge", t);
    }

    createNotificationChannel(); // channelId: "tzchat_alerts_v2"

    // 🐛 개발 편의: WebView 디버깅
    try {
      boolean isDebuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;

      if (isDebuggable) {
        WebView.setWebContentsDebuggingEnabled(true);
        Log.i(TAG, "[BOOT] WebContents debugging enabled (FLAG_DEBUGGABLE=ON)");
      } else {
        Log.i(TAG, "[BOOT] Release-like build (FLAG_DEBUGGABLE=OFF)");
      }
    } catch (Throwable t) {
      Log.w(TAG, "Failed to enable WebView debugging", t);
    }

    // 🍪 쿠키/서드파티 쿠키 허용
    try {
      CookieManager cm = CookieManager.getInstance();
      cm.setAcceptCookie(true);

      WebView webView = (getBridge() != null) ? getBridge().getWebView() : null;
      if (webView != null) {
        cm.setAcceptThirdPartyCookies(webView, true);

        WebSettings ws = webView.getSettings();
        if (ws != null) {
          ws.setDomStorageEnabled(true);
          ws.setDatabaseEnabled(true);

          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            ws.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
          }
        }

        Log.i(TAG, "WebView cookie setup done. acceptCookie=TRUE, thirdParty=TRUE");
      } else {
        Log.w(TAG, "Bridge WebView is null; cannot apply cookie settings.");
      }
    } catch (Throwable t) {
      Log.e(TAG, "Error while configuring WebView/Cookies", t);
    }

    // ✅ (중요) In-App Update(Play Core) 코드는 제거했습니다.
    // 업데이트 유도는 JS 플러그인(@capawesome/capacitor-app-update)에서 처리하세요.
  }

  /**
   * 알림 채널 생성: 높은 중요도 + 기본 알림음 + 진동
   */
  private void createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

    final String channelId = "tzchat_alerts_v2";
    final String name = "Chat Messages";
    final String desc = "New chat and friend notifications";
    final int importance = NotificationManager.IMPORTANCE_HIGH;

    NotificationManager nm = getSystemService(NotificationManager.class);
    if (nm == null) return;

    NotificationChannel existing = nm.getNotificationChannel(channelId);
    if (existing != null) {
      // 채널 속성은 최초 생성 뒤 사용자가 관리하므로 기존 설정을 덮어쓰지 않는다.
      return;
    }

    NotificationChannel ch = new NotificationChannel(channelId, name, importance);
    ch.setDescription(desc);
    AudioAttributes audioAttributes = new AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION)
      .build();
    ch.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), audioAttributes);
    ch.enableVibration(true);
    ch.setVibrationPattern(new long[]{0, 80});

    nm.createNotificationChannel(ch);
  }
}
