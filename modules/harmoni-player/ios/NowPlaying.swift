import AVFoundation
import MediaPlayer
import UIKit

/// The app's audio session: playback that goes on with the screen off and the silent switch on.
enum AudioSession {
  private static var configured = false
  /// An interruption (a call, Siri) paused us; play again when it ends if iOS says so.
  private static var resumeAfterInterruption = false

  static func configure() {
    guard !configured else { return }
    configured = true
    let s = AVAudioSession.sharedInstance()
    do {
      try s.setCategory(.playback, mode: .default, policy: .longFormAudio)
    } catch {
      NSLog("HarmoniPlayer: audio session category failed: \(error)")
    }
    let nc = NotificationCenter.default
    nc.addObserver(forName: AVAudioSession.interruptionNotification, object: s, queue: .main) { note in
      guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
      let p = Player.shared
      switch type {
      case .began:
        resumeAfterInterruption = p.playWhenReady
        if p.playWhenReady { p.pauseNow() }
      case .ended:
        let raw = (note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt) ?? 0
        let opts = AVAudioSession.InterruptionOptions(rawValue: raw)
        if resumeAfterInterruption && opts.contains(.shouldResume) { p.play() }
        resumeAfterInterruption = false
      @unknown default:
        break
      }
    }
    // Headphones out (or Bluetooth gone): pause, like Android's "audio becoming noisy".
    nc.addObserver(forName: AVAudioSession.routeChangeNotification, object: s, queue: .main) { note in
      guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
            AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable else { return }
      if Player.shared.playWhenReady { Player.shared.pauseNow() }
    }
  }

  static func activate() {
    configure()
    do {
      try AVAudioSession.sharedInstance().setActive(true)
    } catch {
      NSLog("HarmoniPlayer: audio session activation failed: \(error)")
    }
  }
}

/// The lock screen, Control Center, headphones and car: what's playing and the buttons for it.
final class NowPlaying {
  static let shared = NowPlaying()

  private var artworkUrl: String?
  private var artwork: MPMediaItemArtwork?
  private var started = false

  /// Registers the remote commands. Main thread.
  func start() {
    guard !started else { return }
    started = true
    let c = MPRemoteCommandCenter.shared()
    let p = Player.shared
    c.playCommand.addTarget { _ in p.play(); return .success }
    c.pauseCommand.addTarget { _ in p.pause(); return .success }
    c.togglePlayPauseCommand.addTarget { _ in
      if p.playWhenReady { p.pause() } else { p.play() }
      return .success
    }
    c.nextTrackCommand.addTarget { _ in p.next(); return .success }
    c.previousTrackCommand.addTarget { _ in p.prev(restartAfterMs: 3000); return .success }
    c.changePlaybackPositionCommand.addTarget { e in
      guard let e = e as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
      p.seek(to: e.positionTime * 1000)
      return .success
    }
    c.likeCommand.localizedTitle = "Like"
    c.likeCommand.addTarget { _ in
      guard let id = p.current?.id else { return .noActionableNowPlayingItem }
      Core.toggleLikeRemotely(id)
      return .success
    }
    c.skipForwardCommand.isEnabled = false
    c.skipBackwardCommand.isEnabled = false
    c.dislikeCommand.isEnabled = false
    c.bookmarkCommand.isEnabled = false
    update()
  }

  /// Shows the current song and where it is. Main thread; cheap enough to call on every change.
  func update() {
    let p = Player.shared
    let center = MPNowPlayingInfoCenter.default()
    let c = MPRemoteCommandCenter.shared()
    guard let e = p.current else {
      center.nowPlayingInfo = nil
      center.playbackState = .stopped
      return
    }
    var info: [String: Any] = [
      MPMediaItemPropertyTitle: e.title,
      MPMediaItemPropertyArtist: e.artist,
      MPNowPlayingInfoPropertyElapsedPlaybackTime: p.positionMs / 1000,
      MPNowPlayingInfoPropertyPlaybackRate: p.isPlaying ? 1.0 : 0.0,
      MPNowPlayingInfoPropertyDefaultPlaybackRate: 1.0,
      MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
      MPNowPlayingInfoPropertyPlaybackQueueIndex: max(0, p.index),
      MPNowPlayingInfoPropertyPlaybackQueueCount: p.queue.count,
    ]
    if let album = e.album { info[MPMediaItemPropertyAlbumTitle] = album }
    if let d = p.durationMs { info[MPMediaItemPropertyPlaybackDuration] = d / 1000 }
    if e.artworkUrl == artworkUrl, let artwork { info[MPMediaItemPropertyArtwork] = artwork }
    center.nowPlayingInfo = info
    center.playbackState = p.isPlaying ? .playing : .paused
    c.nextTrackCommand.isEnabled = p.hasNext || p.queue.count > 1
    c.likeCommand.isActive = Core.isLiked(e.id)
    if e.artworkUrl != artworkUrl { loadArtwork(e.artworkUrl) }
  }

  private func loadArtwork(_ url: String?) {
    artworkUrl = url
    artwork = nil
    guard let url, let u = URL(string: Core.sizedArtwork(url, 600)) else { return }
    URLSession.shared.dataTask(with: u) { [weak self] data, _, _ in
      guard let data, let image = UIImage(data: data) else { return }
      DispatchQueue.main.async {
        guard let self, self.artworkUrl == url else { return }
        self.artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        self.update()
      }
    }.resume()
  }
}

/// The tick that drives the playhead, play reports and the JS side's timers (src/lib/heartbeat.ts):
/// every 0.5 s while playing, 1 s with the app open, 5 s otherwise. iOS suspends the app in the
/// background unless audio is playing, so in practice it ticks while playing or open.
final class Heartbeat {
  static let shared = Heartbeat()

  /// The module sends these on to JS.
  var onTick: (() -> Void)?
  private var timer: Timer?
  private var foreground = true
  private var refreshing = false

  init() {
    let nc = NotificationCenter.default
    nc.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
      self?.foreground = true
      self?.reschedule()
    }
    nc.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
      self?.foreground = false
      self?.reschedule()
    }
  }

  /// Main thread.
  func reschedule() {
    timer?.invalidate()
    let interval: TimeInterval = Player.shared.isPlaying ? 0.5 : (foreground ? 1 : 5)
    timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: false) { [weak self] _ in
      self?.fire()
    }
  }

  private func fire() {
    Player.shared.tickWhilePlaying()
    onTick?()
    keepTokenFresh()
    reschedule()
  }

  /// Songs are requested with the token the player has at hand (it can't wait for a refresh on
  /// main), so refresh it in the background well before it runs out.
  private func keepTokenFresh() {
    // Only the peeked copy here: get() could wait behind a refresh holding the lock.
    guard !refreshing, AuthStore.shared.expiresWithin(5 * 60_000) else { return }
    refreshing = true
    DispatchQueue.global(qos: .utility).async { [weak self] in
      _ = AuthStore.shared.freshToken(minValidMs: 5 * 60_000)
      DispatchQueue.main.async { self?.refreshing = false }
    }
  }
}
