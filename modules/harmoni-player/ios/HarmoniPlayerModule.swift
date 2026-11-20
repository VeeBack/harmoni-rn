import ExpoModulesCore
import Network

/// The iOS side of modules/harmoni-player. Same name, functions and events as the Android
/// module (HarmoniPlayerModule.kt), so JS runs unchanged.
///
/// So far only the session is real (Keychain, refresh): enough to sign in and browse.
/// Playback, downloads, artwork colours and the bass meter are stubs that answer like an
/// idle player with nothing saved. Android-only things (the self-updater, link settings,
/// equalizer, widget pinning) answer "not here" for good.
public final class HarmoniPlayerModule: Module {
  private let pathMonitor = NWPathMonitor()
  private var expensive = false

  public func definition() -> ModuleDefinition {
    Name("HarmoniPlayer")

    Events(
      "onState", "onTick", "onTransition", "onTimeline", "onListen", "onPlayed",
      "onError", "onRemoteLike", "onDownload", "onSignedOut", "onRemoteCommand", "onSystemTransfer", "onUpdate"
    )

    OnCreate {
      AuthStore.shared.onSignedOut = { [weak self] in
        self?.sendEvent("onSignedOut", [:])
      }
      self.pathMonitor.pathUpdateHandler = { [weak self] path in
        self?.expensive = path.isExpensive || path.isConstrained
      }
      self.pathMonitor.start(queue: DispatchQueue.global(qos: .utility))
    }

    OnDestroy {
      self.pathMonitor.cancel()
    }

    // --- session (real) ---

    Function("getSession") { () -> [String: String]? in
      guard let s = AuthStore.shared.get() else { return nil }
      return ["server": s.server, "issuer": s.issuer, "apiBase": s.apiBase, "clientId": s.clientId]
    }

    AsyncFunction("setSession") { (json: String) in
      AuthStore.shared.set(try AuthStore.Session.from(json: json))
    }

    AsyncFunction("getAccessToken") { (promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        promise.resolve(AuthStore.shared.freshToken())
      }
    }

    AsyncFunction("refreshAccessToken") { (failed: String?, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        promise.resolve(AuthStore.shared.refreshAfter(failed))
      }
    }

    AsyncFunction("signOut") { (promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        AuthStore.shared.revoke()
        promise.resolve(nil)
      }
    }

    // --- playback (stubs until the AVPlayer port) ---

    Function("getState") { () -> [String: Any] in [:] }
    AsyncFunction("getQueue") { () -> [String: Any]? in nil }
    AsyncFunction("setQueue") { (_: String, _: Int, _: Double, _: Bool) in }
    AsyncFunction("replaceAround") { (_: String, _: Int) in }
    AsyncFunction("insert") { (_: Int, _: String) in }
    AsyncFunction("removeAt") { (_: Int) in }
    AsyncFunction("removeRange") { (_: Int, _: Int) in }
    AsyncFunction("move") { (_: Int, _: Int) in }
    AsyncFunction("play") {}
    AsyncFunction("pause") {}
    AsyncFunction("seekTo") { (_: Double) in }
    AsyncFunction("skipTo") { (_: Int, _: Double) in }
    AsyncFunction("next") {}
    AsyncFunction("prev") { (_: Double) in }
    AsyncFunction("setRepeat") { (_: String) in }
    AsyncFunction("setVolume") { (_: Double) in }
    AsyncFunction("stop") {}
    AsyncFunction("retry") {}
    AsyncFunction("pauseAtEndOfSong") { (_: Bool) in }
    Function("setSmooth") { (_: Bool) in }
    Function("setCrossfade") { (_: Double) in }
    Function("bass") { () -> Double in 0 }
    Function("bassWindow") { (n: Int) -> [Double] in Array(repeating: -1, count: max(0, n)) }

    // --- Harmoni Link in the system controls (stubs) ---

    AsyncFunction("setRemote") { (_: String?) in }
    Function("setLinkDevices") { (_: String, _: String?, _: Double) in }

    // --- likes (stubs: only the lock screen's heart uses them) ---

    Function("setLikedIds") { (_: String) in }
    Function("setLiked") { (_: String, _: Bool) in }

    // --- downloads (stubs) ---

    AsyncFunction("download") { (_: String) in }
    AsyncFunction("prioritizeDownloads") { (_: String) in }
    AsyncFunction("removeDownload") { (_: String) in }
    AsyncFunction("removeDownloads") { (_: String) in }
    AsyncFunction("removeAllDownloads") {}
    AsyncFunction("getDownloads") { () -> String in "[]" }
    AsyncFunction("getDownloadSize") { () -> Double in 0 }

    AsyncFunction("getArtworkColors") { (_: String) -> [String: Any]? in nil }

    // --- Android-only: never on iOS ---

    Function("linksEnabled") { () -> Bool in true } // Universal Links need no switch
    Function("openLinkSettings") { () -> Bool in false }
    Function("updateState") { () -> [String: Any] in ["state": "idle"] }
    Function("updateReady") { (_: String) -> String? in nil }
    Function("downloadUpdate") { (_: String, _: String, _: String?, _: Double) in }
    Function("cancelUpdate") {}
    Function("canInstallUpdates") { () -> Bool in false }
    Function("openInstallPermission") { () -> Bool in false }
    AsyncFunction("installUpdate") { (_: String, _: String) -> String in "failed" }
    Function("takeUpdated") { () -> String? in nil }
    Function("installer") { () -> String? in nil }
    Function("networkMetered") { () -> Bool in self.expensive }
    Function("hasEqualizer") { () -> Bool in false }
    AsyncFunction("openEqualizer") { () -> Bool in false }
    Function("canPinWidget") { () -> Bool in false }
    Function("hasWidget") { () -> Bool in false }
    AsyncFunction("pinWidget") { () -> Bool in false }
  }
}
