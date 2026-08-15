import Capacitor
import FirebaseMessaging
import Foundation

extension Notification.Name {
    static let tzchatFcmTokenDidRefresh = Notification.Name("TzchatFcmTokenDidRefresh")
}

@objc(IosFcmTokenPlugin)
public class IosFcmTokenPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "IosFcmTokenPlugin"
    public let jsName = "IosFcmToken"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteToken", returnType: CAPPluginReturnPromise)
    ]

    public override func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleTokenRefresh(_:)),
            name: .tzchatFcmTokenDidRefresh,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func handleTokenRefresh(_ notification: Notification) {
        guard let token = notification.object as? String, !token.isEmpty else { return }
        notifyListeners("tokenReceived", data: ["token": token])
    }

    @objc func getToken(_ call: CAPPluginCall) {
        Messaging.messaging().isAutoInitEnabled = true
        Messaging.messaging().token { token, error in
            if let error {
                call.reject("FCM token unavailable", nil, error)
                return
            }
            guard let token, !token.isEmpty else {
                call.reject("FCM token unavailable")
                return
            }
            call.resolve(["token": token])
        }
    }

    @objc func deleteToken(_ call: CAPPluginCall) {
        Messaging.messaging().deleteToken { error in
            Messaging.messaging().isAutoInitEnabled = false
            if let error {
                call.reject("FCM token deletion failed", nil, error)
                return
            }
            call.resolve()
        }
    }
}

@objc(MainViewController)
public class MainViewController: CAPBridgeViewController {
    public override func capacitorDidLoad() {
        // Capacitor 7의 자동 플러그인 등록이 켜진 앱에서는 registerPluginType가
        // 조기 반환하므로, 앱 타깃의 로컬 플러그인은 인스턴스로 명시 등록한다.
        bridge?.registerPluginInstance(IosFcmTokenPlugin())
    }
}
