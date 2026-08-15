# ==========================================
# ProGuard / R8 Rules for Ionic + Capacitor
# 안전 기본 템플릿 (필요 최소 + 보수적 keep)
# ==========================================
# ⚠️ 런타임 크래시가 나면 Play Console의 크래시 스택을 보고
#    해당 패키지/클래스를 -keep 으로 보완하세요.
#    (mapping.txt 업로드 필수: 디옵스케이트 해제로 분석 용이)
#
# ✅ mapping.txt 위치 (기본):
#    app/build/outputs/mapping/release/mapping.txt
# ==========================================

########## 기본 가이드 ##########
# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

########## WebView + JS Interface ##########
-keepattributes *Annotation*
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

########## Android 기본/리소스 ##########
#-keep class **.R$* { *; }

########## 직렬화 / 네이티브 ##########
-keep class ** implements java.io.Serializable { *; }
-keepclasseswithmembernames class * {
    native <methods>;
}

########## 리플렉션/애노테이션 ##########
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod
# Gson/Moshi 등을 쓴다면 필요 시 아래 보강
#-keep class com.google.gson.stream.** { *; }
#-keep class com.google.gson.** { *; }

########## Capacitor / AndroidX / Google ##########
-keep class com.getcapacitor.** { *; }
-keep class androidx.** { *; }
-keep interface androidx.** { *; }
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

# [ADD] Capacitor 공식 플러그인(예: local-notifications, geolocation) 패키지 보존
-keep class com.capacitorjs.plugins.** { *; }

# [ADD] Capacitor Community AdMob 플러그인 보존
-keep class com.getcapacitor.community.admob.** { *; }

########## 네트워킹(예: Retrofit/OkHttp) — 사용 시 활성화 ##########
#-keep class retrofit2.** { *; }
#-keep class okhttp3.** { *; }
#-dontwarn okhttp3.**
#-dontwarn okio.**
#-dontwarn javax.annotation.**
#-keep class com.squareup.okhttp.** { *; }
#-keepattributes Exceptions

########## 이미지 라이브러리(Glide/Picasso 등) — 사용 시 활성화 ##########
#-keep class com.bumptech.glide.** { *; }
#-keep public class * implements com.bumptech.glide.module.GlideModule
#-keep public class * extends com.bumptech.glide.AppGlideModule
#-keep class com.squareup.picasso.** { *; }

########## 앱 고유 패키지(모델/DTO 등) — 필요시 패키지명 교체 ##########
#-keep class your.package.name.model.** { *; }

########## 로그 제거(선택) ##########
#-assumenosideeffects class android.util.Log {
#    public static *** v(...);
#    public static *** d(...);
#    public static *** i(...);
#    public static *** w(...);
#    public static *** e(...);
#}

########## 라인 넘버/소스 파일(디버깅 가독성) ##########
-keepattributes SourceFile,LineNumberTable
#-renamesourcefileattribute SourceFile
