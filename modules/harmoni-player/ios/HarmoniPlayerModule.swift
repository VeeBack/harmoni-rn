import ExpoModulesCore
import Network

/// The iOS side of modules/harmoni-player. Same name, functions and events as the Android
/// module (HarmoniPlayerModule.kt), so JS runs unchanged.
///
/// Real so far: the session (AuthStore), playback (Player: the queue, gapless, repeat, the
/// sleep timer's pause at the end of a song, listen reports), the lock screen and remote
/// controls (NowPlaying), and the tick JS's timers run on (Heartbeat).
/// Still stubs: crossfade, the bass meter, Harmoni Link in the system controls, downloads and
/// artwork colours. Android-only things (the self-updater, link settings, equalizer, widget
/// pinning) answer "not here" for good.
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

      DispatchQueue.main.async { [weak self] in
        let player = Player.shared
        player.emit = { name, body in self?.sendEvent(name, body) }
        player.onChange = { NowPlaying.shared.update() }
        Core.onLikedChanged = { id, liked in
          NowPlaying.shared.update()
          self?.sendEvent("onRemoteLike", ["songId": id, "liked": liked])
        }
        Heartbeat.shared.onTick = { Player.shared.emitTick() }
        AudioSession.configure()
        NowPlaying.shared.start()
        Heartbeat.shared.reschedule()
        player.emitState()
      }
    }

    OnDestroy {
      self.pathMonitor.cancel()
      DispatchQueue.main.async {
        Player.shared.emit = nil
        Heartbeat.shared.onTick = nil
        Core.onLikedChanged = nil
      }
    }

    // --- session ---

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
      Player.shared.stop()
      QueueStore.clear()
      Core.setLiked([])
      DispatchQueue.global(qos: .userInitiated).async {
        AuthStore.shared.revoke()
        promise.resolve(nil)
      }
    }.runOnQueue(.main)

    // --- playback ---

    Function("getState") { () -> [String: Any] in Player.shared.snapshot }

    AsyncFunction("getQueue") { () -> [String: Any]? in
      let p = Player.shared
      if !p.queue.isEmpty {
        return ["queue": Entry.json(p.queue), "index": p.index, "positionMs": p.positionMs, "live": true]
      }
      guard let saved = QueueStore.load() else { return nil }
      return ["queue": saved.queueJson, "index": saved.index, "positionMs": saved.positionMs, "live": false]
    }.runOnQueue(.main)

    AsyncFunction("setQueue") { (json: String, index: Int, positionMs: Double, play: Bool) in
      Player.shared.setQueue(json, index: index, positionMs: positionMs, play: play)
    }.runOnQueue(.main)

    AsyncFunction("replaceAround") { (json: String, index: Int) in
      Player.shared.replaceAround(json, index: index)
    }.runOnQueue(.main)

    AsyncFunction("insert") { (index: Int, json: String) in
      Player.shared.insert(at: index, json)
    }.runOnQueue(.main)

    AsyncFunction("removeAt") { (index: Int) in
      Player.shared.removeRange(index, index + 1)
    }.runOnQueue(.main)

    AsyncFunction("removeRange") { (from: Int, to: Int) in
      Player.shared.removeRange(from, to)
    }.runOnQueue(.main)

    AsyncFunction("move") { (from: Int, to: Int) in
      Player.shared.move(from, to)
    }.runOnQueue(.main)

    AsyncFunction("play") { Player.shared.play() }.runOnQueue(.main)
    AsyncFunction("pause") { Player.shared.pause() }.runOnQueue(.main)
    AsyncFunction("seekTo") { (ms: Double) in Player.shared.seek(to: ms) }.runOnQueue(.main)
    AsyncFunction("skipTo") { (index: Int, positionMs: Double) in
      Player.shared.skip(to: index, positionMs: positionMs)
    }.runOnQueue(.main)
    AsyncFunction("next") { Player.shared.next() }.runOnQueue(.main)
    AsyncFunction("prev") { (restartAfterMs: Double) in
      Player.shared.prev(restartAfterMs: restartAfterMs)
    }.runOnQueue(.main)
    AsyncFunction("setRepeat") { (mode: String) in Player.shared.setRepeat(mode) }.runOnQueue(.main)
    AsyncFunction("setVolume") { (volume: Double) in Player.shared.setVolume(volume) }.runOnQueue(.main)
    AsyncFunction("stop") { Player.shared.stop() }.runOnQueue(.main)
    AsyncFunction("retry") { Player.shared.retry() }.runOnQueue(.main)
    AsyncFunction("pauseAtEndOfSong") { (on: Bool) in Player.shared.pauseAtEnd = on }.runOnQueue(.main)

    Function("setSmooth") { (on: Bool) in
      DispatchQueue.main.async { Player.shared.smooth = on }
    }

    // Not yet on iOS: crossfade and the bass meter.
    Function("setCrossfade") { (_: Double) in }
    Function("bass") { () -> Double in 0 }
    Function("bassWindow") { (n: Int) -> [Double] in Array(repeating: 0, count: min(max(1, n), 120)) }

    // --- Harmoni Link in the system controls (not yet on iOS) ---

    AsyncFunction("setRemote") { (_: String?) in }
    Function("setLinkDevices") { (_: String, _: String?, _: Double) in }

    // --- likes (the lock screen's heart) ---

    Function("setLikedIds") { (json: String) in
      let ids = ((try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String]) ?? []
      Core.setLiked(ids)
      DispatchQueue.main.async { NowPlaying.shared.update() }
    }

    Function("setLiked") { (id: String, liked: Bool) in
      Core.setLiked(id, liked)
      DispatchQueue.main.async { NowPlaying.shared.update() }
    }

    // --- downloads (not yet on iOS) ---

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
