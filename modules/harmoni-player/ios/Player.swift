import AVFoundation
import Foundation
import QuartzCore

/// The queue player: what PlaybackService.kt and the player half of HarmoniPlayerModule.kt do
/// on Android. Lives on the main thread.
///
/// An AVQueuePlayer holds the current song and the next one, so songs run into each other
/// without a gap. The queue itself (and the index JS takes from the events) is ours: AVQueuePlayer
/// only ever sees those two items, rebuilt whenever the queue changes. When a song ends in a
/// way AVQueuePlayer can't do by itself (repeat one, pause at the end, end of the queue),
/// `actionAtItemEnd` is `.pause` and `itemEnded` takes over.
final class Player: NSObject {
  static let shared = Player()

  /// Events for JS: name, body. Always called on main.
  var emit: ((String, [String: Any?]) -> Void)?
  /// Something the lock screen shows changed (song, playing, position after a seek).
  var onChange: (() -> Void)?

  private let av = AVQueuePlayer()

  private(set) var queue: [Entry] = []
  /// Index of the current song in `queue`; -1 when there is none.
  private(set) var index = -1
  private(set) var repeatMode = "off"
  /// What the person asked for: play as soon as it can (Media3's playWhenReady).
  private(set) var playWhenReady = false
  /// The last song finished and nothing comes after it.
  private(set) var ended = false
  private(set) var failed = false
  var pauseAtEnd = false {
    didSet { updateActionAtEnd() }
  }

  // Smooth play and pause: ease the volume in (260 ms) and out (180 ms) instead of cutting.
  var smooth = true
  private(set) var targetVolume: Float = 1
  private var fade: Timer?

  /// The next song, already loading in AVQueuePlayer after the current one.
  private var nextItem: AVPlayerItem?
  private var nextIndex = -1
  /// Set while the AVQueuePlayer's items are swapped out by us, so it isn't taken as a transition.
  private var rebuilding = false
  /// Where to go once the current item can seek (it can't before it's ready).
  private var pendingSeekMs: Double?
  private var authRetries = 0
  private var skipAfterError: DispatchWorkItem?

  private var observations: [ObjectIdentifier: [NSKeyValueObservation]] = [:]
  private var playerObservations: [NSKeyValueObservation] = []

  // Snapshot read synchronously from JS (any thread).
  private let snapshotLock = NSLock()
  private var _snapshot: [String: Any] = [:]
  var snapshot: [String: Any] {
    snapshotLock.lock(); defer { snapshotLock.unlock() }
    return _snapshot
  }

  private override init() {
    super.init()
    av.automaticallyWaitsToMinimizeStalling = true
    playerObservations = [
      av.observe(\.timeControlStatus, options: [.new]) { [weak self] _, _ in
        DispatchQueue.main.async { self?.playingMaybeChanged() }
      },
      av.observe(\.currentItem, options: [.old, .new]) { [weak self] _, change in
        let old = change.oldValue ?? nil
        let new = change.newValue ?? nil
        DispatchQueue.main.async { self?.currentItemChanged(from: old, to: new) }
      },
    ]
    NotificationCenter.default.addObserver(
      self, selector: #selector(didPlayToEnd(_:)), name: .AVPlayerItemDidPlayToEndTime, object: nil)
    NotificationCenter.default.addObserver(
      self, selector: #selector(failedToPlayToEnd(_:)), name: .AVPlayerItemFailedToPlayToEndTime, object: nil)
    // Timers fire on the run loop they're made on: always main's, whoever touched us first.
    DispatchQueue.main.async {
      Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
        // Saves the playhead while playing, so a closed app resumes close to where it was.
        guard let self, self.isPlaying else { return }
        self.save()
      }
    }
  }

  // MARK: - reading state

  var isPlaying: Bool { av.timeControlStatus == .playing }
  var current: Entry? { queue.indices.contains(index) ? queue[index] : nil }

  var positionMs: Double {
    if ended, let d = durationMs { return d }
    if let p = pendingSeekMs { return p }
    let t = av.currentTime()
    return t.isNumeric ? max(0, t.seconds * 1000) : 0
  }

  var durationMs: Double? {
    if let d = av.currentItem?.duration, d.isNumeric, d.seconds > 0 { return d.seconds * 1000 }
    return current?.durationMs
  }

  var bufferedMs: Double {
    guard let item = av.currentItem else { return 0 }
    let now = av.currentTime()
    for r in item.loadedTimeRanges.map(\.timeRangeValue) where r.containsTime(now) {
      return r.end.seconds * 1000
    }
    return positionMs
  }

  var hasNext: Bool { followingIndex() != nil }

  // MARK: - queue

  func setQueue(_ json: String, index i: Int, positionMs: Double, play: Bool) {
    let entries = Entry.list(json)
    if entries.isEmpty {
      stop()
      return
    }
    queue = entries
    load(min(max(0, i), entries.count - 1), positionMs: max(0, positionMs), play: play, reason: "queue")
    timelineChanged()
  }

  /// Replaces everything around the current song without interrupting it.
  func replaceAround(_ json: String, index i: Int) {
    let entries = Entry.list(json)
    guard let cur = current, entries.indices.contains(i), entries[i].id == cur.id else {
      let pos = positionMs
      queue = entries
      if entries.isEmpty { stop(); return }
      load(min(max(0, i), entries.count - 1), positionMs: pos, play: playWhenReady, reason: "queue")
      timelineChanged()
      return
    }
    queue = entries
    index = i
    timelineChanged()
  }

  func insert(at i: Int, _ json: String) {
    let entries = Entry.list(json)
    guard !entries.isEmpty else { return }
    let at = min(max(0, i), queue.count)
    queue.insert(contentsOf: entries, at: at)
    if index >= at && index >= 0 { index += entries.count }
    timelineChanged()
  }

  func removeRange(_ from: Int, _ to: Int) {
    let a = min(max(0, from), queue.count)
    let b = min(max(a, to), queue.count)
    guard b > a else { return }
    let removingCurrent = index >= a && index < b
    queue.removeSubrange(a..<b)
    if queue.isEmpty {
      stop()
      return
    }
    if removingCurrent {
      // Like Media3: the song after the removed ones takes over, playing if this was.
      load(min(a, queue.count - 1), positionMs: 0, play: playWhenReady, reason: "queue")
    } else if index >= b {
      index -= (b - a)
    }
    timelineChanged()
  }

  func move(_ from: Int, _ to: Int) {
    guard queue.indices.contains(from), queue.indices.contains(to), from != to else { return }
    let e = queue.remove(at: from)
    queue.insert(e, at: to)
    if index == from {
      index = to
    } else if from < index && to >= index {
      index -= 1
    } else if from > index && to <= index {
      index += 1
    }
    timelineChanged()
  }

  /// After any change to the queue: tell JS, fix up what AVQueuePlayer has next, save.
  private func timelineChanged() {
    syncNext()
    emit?("onTimeline", ["count": queue.count])
    emitState()
    save()
    onChange?()
  }

  // MARK: - transport

  func play() {
    guard current != nil else { return }
    AudioSession.activate()
    if ended || failed || av.currentItem == nil {
      load(index, positionMs: ended ? 0 : positionMs, play: true, reason: nil)
      return
    }
    playWhenReady = true
    if smooth && !isPlaying {
      fade?.invalidate()
      av.volume = 0
      startRate()
      fadeTo(targetVolume, ms: 260)
    } else {
      startRate()
    }
    emitState()
  }

  func pause() {
    playWhenReady = false
    if smooth && isPlaying {
      fadeTo(0, ms: 180) { [weak self] in
        guard let self else { return }
        self.av.pause()
        self.av.volume = self.targetVolume
      }
    } else {
      fade?.invalidate()
      av.pause()
      av.volume = targetVolume
    }
    emitState()
    save()
  }

  func seek(to ms: Double) {
    guard current != nil else { return }
    let to = max(0, ms)
    if let t = track {
      let from = positionMs
      sample(t, from)
      accumulate(t)
      if isPlaying { t.lastWall = CACurrentMediaTime() }
      // "They wanted that part again": a seek back of more than 3 s after 5 s of listening.
      if to < from - 3000 && t.playedMs > 5000 { t.replays = min(100, t.replays + 1) }
      t.lastPos = to
    }
    if ended || av.currentItem == nil {
      load(index, positionMs: to, play: playWhenReady, reason: nil)
      return
    }
    if av.currentItem?.status == .readyToPlay {
      av.seek(to: CMTime(value: Int64(to), timescale: 1000), toleranceBefore: .zero, toleranceAfter: .zero)
    } else {
      pendingSeekMs = to
    }
    emitTick()
    onChange?()
  }

  func skip(to i: Int, positionMs: Double) {
    guard queue.indices.contains(i) else { return }
    load(i, positionMs: max(0, positionMs), play: nil, reason: "seek")
  }

  func next() {
    if let n = followingIndex(wrap: true) {
      load(n, positionMs: 0, play: nil, reason: "seek")
    }
  }

  func prev(restartAfterMs: Double) {
    if positionMs > restartAfterMs || index <= 0 {
      seek(to: 0)
    } else {
      load(index - 1, positionMs: 0, play: nil, reason: "seek")
    }
  }

  func setRepeat(_ mode: String) {
    repeatMode = ["all", "one"].contains(mode) ? mode : "off"
    syncNext()
    emitState()
  }

  func setVolume(_ v: Double) {
    fade?.invalidate()
    targetVolume = Float(min(max(0, v), 1))
    av.volume = targetVolume
    emitState()
  }

  func stop() {
    if let t = track {
      finishTrack(t, reason: "close", positionMs: positionMs)
      track = nil
    }
    fade?.invalidate()
    skipAfterError?.cancel()
    rebuilding = true
    av.pause()
    av.removeAllItems()
    rebuilding = false
    forgetObservations()
    nextItem = nil
    queue = []
    index = -1
    playWhenReady = false
    ended = false
    failed = false
    pendingSeekMs = nil
    av.volume = targetVolume
    emit?("onTimeline", ["count": 0])
    emitState()
    QueueStore.clear()
    onChange?()
  }

  func retry() {
    guard current != nil else { return }
    load(index, positionMs: positionMs, play: true, reason: nil)
  }

  // MARK: - loading items

  /// Makes `i` the current song, starting at `positionMs`. `play` nil keeps playWhenReady as it is.
  /// `reason` is the transition JS hears about ("queue", "seek"); nil when it's the same song again.
  private func load(_ i: Int, positionMs: Double, play: Bool?, reason: String?) {
    guard queue.indices.contains(i) else { return }
    let prev = track
    let prevIndex = index
    skipAfterError?.cancel()
    fade?.invalidate()
    av.volume = targetVolume

    rebuilding = true
    av.pause()
    av.removeAllItems()
    forgetObservations()
    nextItem = nil
    index = i
    ended = false
    failed = false
    if let play { playWhenReady = play }
    let item = makeItem(queue[i])
    pendingSeekMs = positionMs > 0 ? positionMs : nil
    av.insert(item, after: nil)
    rebuilding = false
    syncNext()
    if playWhenReady {
      AudioSession.activate()
      if pendingSeekMs == nil { startRate() } // else once it's ready and has seeked
    }

    if let reason {
      authRetries = 0
      if let prev {
        let why = reason == "seek" ? (i < prevIndex ? "back" : "skip") : "skip"
        finishTrack(prev, reason: why, positionMs: prev.lastPos)
      }
      startTrack()
      emit?("onTransition", ["index": i, "reason": reason, "songId": queue[i].id])
    } else if track == nil {
      startTrack()
    }
    emitState()
    save()
    onChange?()
  }

  private func makeItem(_ e: Entry) -> AVPlayerItem {
    let url = Core.playURL(e.id) ?? URL(string: "about:blank")!
    var headers = ["User-Agent": Core.userAgent]
    if let token = AuthStore.shared.peekToken() { headers["Authorization"] = "Bearer \(token)" }
    let asset = AVURLAsset(url: url, options: ["AVURLAssetHTTPHeaderFieldsKey": headers])
    let item = AVPlayerItem(asset: asset)
    item.preferredForwardBufferDuration = 0 // let AVFoundation decide
    let status = item.observe(\.status, options: [.new]) { [weak self, weak item] _, _ in
      DispatchQueue.main.async {
        guard let self, let item else { return }
        self.itemStatusChanged(item)
      }
    }
    observations[ObjectIdentifier(item)] = [status]
    return item
  }

  private func forgetObservations() {
    observations.values.flatMap { $0 }.forEach { $0.invalidate() }
    observations.removeAll()
  }

  /// The song after the current one, or nil. Repeat all goes round; repeat one is handled at the end.
  private func followingIndex(wrap: Bool = false) -> Int? {
    guard index >= 0, !queue.isEmpty else { return nil }
    if index + 1 < queue.count { return index + 1 }
    return (repeatMode == "all" || wrap) ? 0 : nil
  }

  /// Puts the right next song after the current one in AVQueuePlayer.
  private func syncNext() {
    let want: Int? = (repeatMode == "one" || pauseAtEnd) ? nil : followingIndex()
    let wantId = want.map { queue[$0].id }
    if let item = nextItem, nextIndex == want, wantId != nil, av.items().contains(item),
       (item.asset as? AVURLAsset)?.url == Core.playURL(wantId!) {
      updateActionAtEnd()
      return
    }
    // Drop whatever is queued after the current item.
    for item in av.items().dropFirst() {
      av.remove(item)
      observations.removeValue(forKey: ObjectIdentifier(item))?.forEach { $0.invalidate() }
    }
    nextItem = nil
    nextIndex = -1
    if let want, av.currentItem != nil {
      let item = makeItem(queue[want])
      if av.canInsert(item, after: av.currentItem) {
        av.insert(item, after: av.currentItem)
        nextItem = item
        nextIndex = want
      }
    }
    updateActionAtEnd()
  }

  private func updateActionAtEnd() {
    av.actionAtItemEnd = nextItem != nil ? .advance : .pause
  }

  private func startRate() {
    av.play()
  }

  // MARK: - what AVFoundation tells us

  private func itemStatusChanged(_ item: AVPlayerItem) {
    guard item === av.currentItem else { return }
    switch item.status {
    case .readyToPlay:
      if let ms = pendingSeekMs {
        pendingSeekMs = nil
        av.seek(to: CMTime(value: Int64(ms), timescale: 1000), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
          DispatchQueue.main.async {
            guard let self else { return }
            if self.playWhenReady && !self.isPlaying { self.startRate() }
            self.emitState()
          }
        }
      }
      emitState()
      onChange?()
    case .failed:
      handleError(item, item.error)
    default:
      break
    }
  }

  private func currentItemChanged(from old: AVPlayerItem?, to new: AVPlayerItem?) {
    guard !rebuilding else { return }
    if let old { observations.removeValue(forKey: ObjectIdentifier(old))?.forEach { $0.invalidate() } }
    // AVQueuePlayer moved on to the song we had waiting: a natural transition.
    guard let new, new === nextItem else { return }
    let prev = track
    index = nextIndex
    nextItem = nil
    nextIndex = -1
    authRetries = 0
    if let prev {
      finishTrack(prev, reason: "ended", positionMs: prev.item.durationMs ?? prev.lastPos)
    }
    startTrack()
    syncNext()
    emit?("onTransition", ["index": index, "reason": "auto", "songId": current?.id])
    emitState()
    save()
    onChange?()
  }

  @objc private func didPlayToEnd(_ note: Notification) {
    DispatchQueue.main.async { [weak self] in
      guard let self, let item = note.object as? AVPlayerItem, item === self.av.currentItem else { return }
      // With a next song waiting, AVQueuePlayer advances by itself (currentItemChanged).
      guard self.nextItem == nil else { return }
      self.itemEnded()
    }
  }

  /// The current song ended and AVQueuePlayer stopped on it (no next item queued).
  private func itemEnded() {
    if repeatMode == "one" {
      let prev = track
      if let prev { finishTrack(prev, reason: "ended", positionMs: prev.item.durationMs ?? prev.lastPos) }
      startTrack()
      // Repeat-one loops don't count as another play.
      if let prev { track?.playReported = prev.playReported }
      av.seek(to: .zero) { [weak self] _ in
        DispatchQueue.main.async { if self?.playWhenReady == true { self?.startRate() } }
      }
      emit?("onTransition", ["index": index, "reason": "repeat", "songId": current?.id])
      emitState()
      return
    }
    if let n = followingIndex() {
      // Pause at the end of this song (sleep timer): the next one waits, paused.
      let play = !pauseAtEnd && playWhenReady
      let prev = track
      if let prev { finishTrack(prev, reason: "ended", positionMs: prev.item.durationMs ?? prev.lastPos) }
      track = nil
      load(n, positionMs: 0, play: play, reason: nil)
      authRetries = 0
      emit?("onTransition", ["index": n, "reason": "auto", "songId": queue[n].id])
      emitState()
      return
    }
    // The end of the queue.
    if let t = track {
      finishTrack(t, reason: "ended", positionMs: t.item.durationMs ?? t.lastPos)
      track = nil
    }
    ended = true
    emitState()
    save()
    onChange?()
  }

  @objc private func failedToPlayToEnd(_ note: Notification) {
    DispatchQueue.main.async { [weak self] in
      guard let self, let item = note.object as? AVPlayerItem, item === self.av.currentItem else { return }
      self.handleError(item, note.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? Error)
    }
  }

  /// The item whose failure was already handled (status and the notification can both report it).
  private weak var failedItem: AVPlayerItem?

  private func handleError(_ avItem: AVPlayerItem, _ error: Error?) {
    guard avItem !== failedItem else { return }
    failedItem = avItem
    let item = current
    let title = (item?.title.isEmpty == false) ? item!.title : "this song"
    let ns = error as NSError?
    NSLog("HarmoniPlayer: playback error \(ns?.domain ?? "") \(ns?.code ?? 0) \(ns?.localizedDescription ?? "")")
    failed = true
    if let t = track {
      finishTrack(t, reason: "error", positionMs: t.lastPos)
      track = nil
    }
    let at = positionMs

    // AVFoundation doesn't say which HTTP status it got. The first failure of a song may be
    // an expired token: refresh it and try once more before giving up on the song.
    if authRetries < 1 {
      authRetries += 1
      let failedToken = AuthStore.shared.peekToken()
      DispatchQueue.global(qos: .userInitiated).async { [weak self] in
        let token = AuthStore.shared.refreshAfter(failedToken)
        DispatchQueue.main.async {
          guard let self else { return }
          if token == nil {
            self.emit?("onError", ["message": "You've been signed out.", "songId": item?.id])
            self.emitState()
          } else if self.current?.id == item?.id {
            self.load(self.index, positionMs: at, play: self.playWhenReady, reason: nil)
          }
        }
      }
      emitState()
      return
    }

    if isNetwork(ns) {
      playWhenReady = false // stays at the same spot; play tries again
      av.pause()
      emit?("onError", ["message": "Can't reach the server. Check your connection.", "songId": item?.id])
      emitState()
      return
    }

    emit?("onError", ["message": "Couldn't play \(title).", "songId": item?.id])
    emitState()
    // Every source failed: move on (the API docs suggest skipping), unless the person picks something first.
    skipAfterError?.cancel()
    if index + 1 < queue.count {
      let work = DispatchWorkItem { [weak self] in
        guard let self, self.failed else { return }
        self.load(self.index + 1, positionMs: 0, play: true, reason: "seek")
      }
      skipAfterError = work
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.6, execute: work)
    }
  }

  private func isNetwork(_ e: NSError?) -> Bool {
    var cur = e
    while let c = cur {
      if c.domain == NSURLErrorDomain { return true }
      cur = c.userInfo[NSUnderlyingErrorKey] as? NSError
    }
    return false
  }

  private var wasPlaying = false
  private func playingMaybeChanged() {
    let now = isPlaying
    if now != wasPlaying {
      wasPlaying = now
      // After an error the same song can resume (retry) with no transition: track it again.
      if now && track == nil { startTrack() }
      if let t = track {
        if now { t.lastWall = CACurrentMediaTime() } else { accumulate(t) }
      }
      if !now { save() }
      onChange?()
      Heartbeat.shared.reschedule()
    }
    emitState()
  }

  // MARK: - smooth volume

  private func fadeTo(_ to: Float, ms: Double, then: (() -> Void)? = nil) {
    fade?.invalidate()
    let from = av.volume
    let start = CACurrentMediaTime()
    fade = Timer.scheduledTimer(withTimeInterval: 1.0 / 60, repeats: true) { [weak self] timer in
      guard let self else { timer.invalidate(); return }
      let x = Float(min(1, (CACurrentMediaTime() - start) * 1000 / ms))
      self.av.volume = from + (to - from) * x
      if x >= 1 {
        timer.invalidate()
        self.fade = nil
        then?()
      }
    }
  }

  // MARK: - listen tracking for the current song

  final class Track {
    let item: Entry
    let index: Int
    var playedMs: Double = 0
    var lastWall: CFTimeInterval = 0
    var heard = 0
    var replays = 0
    var lastPos: Double = 0
    var playReported = false
    var warmed = false
    init(_ item: Entry, _ index: Int) { self.item = item; self.index = index }
  }

  private(set) var track: Track?

  private func startTrack() {
    guard let e = current else { track = nil; return }
    let t = Track(e, index)
    t.lastPos = positionMs
    if isPlaying { t.lastWall = CACurrentMediaTime() }
    track = t
  }

  private func accumulate(_ t: Track) {
    if t.lastWall > 0 {
      t.playedMs += (CACurrentMediaTime() - t.lastWall) * 1000
      t.lastWall = 0
    }
  }

  private func sample(_ t: Track, _ pos: Double) {
    guard let dur = durationMs, dur > 0 else { return }
    func slice(_ p: Double) -> Int { min(19, max(0, Int(p * 20 / dur))) }
    // Mark every slice between the last sample and this one as heard.
    if pos >= t.lastPos && pos - t.lastPos < 5000 {
      for s in slice(min(t.lastPos, pos))...slice(max(t.lastPos, pos)) { t.heard |= 1 << s }
    } else {
      t.heard |= 1 << slice(pos)
    }
  }

  private func finishTrack(_ t: Track, reason: String, positionMs: Double) {
    accumulate(t)
    let dur = t.item.durationMs ?? durationMs
    if reason == "ended" { t.heard |= 1 << 19 }
    emit?("onListen", [
      "songId": t.item.id,
      "song": t.item.raw,
      "playedMs": t.playedMs,
      "positionMs": max(0, positionMs),
      "durationMs": dur,
      "reason": reason,
      "heard": t.heard,
      "replays": t.replays,
    ])
  }

  /// Every tick while playing: the playhead, play reports, warming the next song.
  func tickWhilePlaying() {
    guard let t = track, isPlaying else { return }
    let pos = positionMs
    sample(t, pos)
    t.lastPos = pos
    let dur = durationMs ?? 0
    let threshold = dur > 0 ? min(30_000, dur / 2) : 30_000
    if !t.playReported && pos >= threshold {
      t.playReported = true
      emit?("onPlayed", ["songId": t.item.id, "song": t.item.raw])
    }
    if !t.warmed && pos >= 10_000, let n = followingIndex() {
      t.warmed = true
      Core.warm(queue[n].id)
    }
  }

  // MARK: - events

  func emitState() {
    let state: [String: Any] = [
      "index": index,
      "count": queue.count,
      "songId": current?.id ?? NSNull(),
      "playing": isPlaying,
      "playWhenReady": playWhenReady,
      "buffering": playWhenReady && av.timeControlStatus == .waitingToPlayAtSpecifiedRate,
      "ended": ended,
      "idle": current == nil || failed,
      "positionMs": positionMs,
      "durationMs": durationMs ?? NSNull(),
      "repeat": repeatMode,
      "volume": Double(targetVolume),
    ]
    snapshotLock.lock()
    _snapshot = state
    snapshotLock.unlock()
    emit?("onState", state.mapValues { $0 as Any? })
  }

  func emitTick() {
    var body: [String: Any?] = ["now": Date().timeIntervalSince1970 * 1000]
    if current != nil {
      body["positionMs"] = positionMs
      body["bufferedMs"] = bufferedMs
      body["durationMs"] = durationMs
      body["playing"] = isPlaying
      body["index"] = index
    }
    emit?("onTick", body)
  }

  func save() {
    guard !queue.isEmpty else { return }
    QueueStore.save(queue, index: index, positionMs: positionMs, repeatMode: repeatMode)
  }

  // MARK: - for the lock screen and interruptions

  /// Pauses without the smooth fade (an interruption already silenced us).
  func pauseNow() {
    playWhenReady = false
    fade?.invalidate()
    av.pause()
    av.volume = targetVolume
    emitState()
    save()
  }
}
