@file:OptIn(UnstableApi::class)

package com.ceccun.harmoni.player

import android.content.ComponentName
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.Timeline
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadService
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import androidx.palette.graphics.Palette
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class HarmoniPlayerModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private val context: Context get() = requireNotNull(appContext.reactContext).applicationContext

  private var controllerFuture: ListenableFuture<MediaController>? = null
  private var controller: MediaController? = null
  private var attachedTo: ExoPlayer? = null
  private val pending = mutableListOf<(ExoPlayer) -> Unit>()
  private var foreground = true

  // Smooth play and pause: ease the volume in (260 ms) and out (180 ms) instead of cutting.
  private var smooth = true
  private var targetVolume = 1f
  private var fade: android.animation.ValueAnimator? = null

  private fun fadeTo(p: ExoPlayer, to: Float, ms: Long, then: (() -> Unit)? = null) {
    fade?.cancel()
    fade = android.animation.ValueAnimator.ofFloat(p.volume, to).apply {
      duration = ms
      interpolator = android.view.animation.LinearInterpolator()
      addUpdateListener { p.volume = it.animatedValue as Float }
      addListener(object : android.animation.AnimatorListenerAdapter() {
        private var cancelled = false
        override fun onAnimationCancel(animation: android.animation.Animator) { cancelled = true }
        override fun onAnimationEnd(animation: android.animation.Animator) { if (!cancelled) then?.invoke() }
      })
      start()
    }
  }

  // Snapshot read synchronously from JS.
  @Volatile private var snapshot = JSONObject()

  // --- listen tracking for the current entry ---
  private var track: Track? = null

  private class Track(val item: MediaItem, val index: Int) {
    var playedMs = 0L
    var lastWall = 0L
    var heard = 0
    var replays = 0
    var lastPos = 0L
    var playReported = false
    var warmed = false
  }

  private val playerListener = object : Player.Listener {
    override fun onEvents(player: Player, events: Player.Events) {
      if (events.containsAny(
          Player.EVENT_PLAYBACK_STATE_CHANGED, Player.EVENT_PLAY_WHEN_READY_CHANGED,
          Player.EVENT_IS_PLAYING_CHANGED, Player.EVENT_MEDIA_ITEM_TRANSITION,
          Player.EVENT_REPEAT_MODE_CHANGED, Player.EVENT_VOLUME_CHANGED, Player.EVENT_TIMELINE_CHANGED,
        )
      ) emitState(player as ExoPlayer)
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
      val t = track ?: return
      if (isPlaying) t.lastWall = SystemClock.elapsedRealtime() else accumulate(t)
      scheduleTick()
    }

    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
      val p = attachedTo ?: return
      val prev = track
      val newIndex = p.currentMediaItemIndex
      if (prev != null) {
        val why = when (reason) {
          Player.MEDIA_ITEM_TRANSITION_REASON_AUTO, Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT -> "ended"
          Player.MEDIA_ITEM_TRANSITION_REASON_SEEK -> if (newIndex < prev.index && newIndex >= 0) "back" else "skip"
          else -> "skip"
        }
        finishTrack(prev, why, if (why == "ended") (prev.item.mediaMetadata.durationMs ?: prev.lastPos) else prev.lastPos)
      }
      startTrack(p)
      // Repeat-one loops don't count as another play.
      if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT && prev != null) track?.playReported = prev.playReported
      sendEvent("onTransition", mapOf(
        "index" to newIndex,
        "reason" to when (reason) {
          Player.MEDIA_ITEM_TRANSITION_REASON_AUTO -> "auto"
          Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT -> "repeat"
          Player.MEDIA_ITEM_TRANSITION_REASON_SEEK -> "seek"
          else -> "queue"
        },
        "songId" to mediaItem?.mediaId,
      ))
    }

    override fun onPositionDiscontinuity(old: Player.PositionInfo, new: Player.PositionInfo, reason: Int) {
      val t = track ?: return
      if (reason == Player.DISCONTINUITY_REASON_SEEK && old.mediaItemIndex == new.mediaItemIndex) {
        sample(t, old.positionMs)
        accumulate(t)
        if (attachedTo?.isPlaying == true) t.lastWall = SystemClock.elapsedRealtime()
        // "They wanted that part again": a seek back of more than 3 s after 5 s of listening.
        if (new.positionMs < old.positionMs - 3000 && t.playedMs > 5000) t.replays = minOf(100, t.replays + 1)
        t.lastPos = new.positionMs
        emitTick()
      }
    }

    override fun onTimelineChanged(timeline: Timeline, reason: Int) {
      if (reason == Player.TIMELINE_CHANGE_REASON_PLAYLIST_CHANGED) {
        val p = attachedTo ?: return
        if (p.mediaItemCount == 0 && track != null) {
          finishTrack(track!!, "close", track!!.lastPos)
          track = null
        }
        sendEvent("onTimeline", mapOf("count" to p.mediaItemCount))
      }
    }

    override fun onPlayerError(error: PlaybackException) {
      track?.let { finishTrack(it, "error", it.lastPos); track = null }
    }
  }

  private fun startTrack(p: ExoPlayer) {
    val item = p.currentMediaItem
    track = if (item == null) null else Track(item, p.currentMediaItemIndex).also {
      it.lastPos = p.currentPosition
      if (p.isPlaying) it.lastWall = SystemClock.elapsedRealtime()
    }
  }

  private fun accumulate(t: Track) {
    if (t.lastWall > 0) {
      t.playedMs += SystemClock.elapsedRealtime() - t.lastWall
      t.lastWall = 0
    }
  }

  private fun sample(t: Track, pos: Long) {
    val dur = attachedTo?.duration ?: C.TIME_UNSET
    if (dur <= 0) return
    // Mark every slice between the last sample and this one as heard.
    val from = ((minOf(t.lastPos, pos) * 20) / dur).toInt().coerceIn(0, 19)
    val to = ((maxOf(t.lastPos, pos) * 20) / dur).toInt().coerceIn(0, 19)
    if (pos >= t.lastPos && pos - t.lastPos < 5_000) for (s in from..to) t.heard = t.heard or (1 shl s)
    else t.heard = t.heard or (1 shl ((pos * 20) / dur).toInt().coerceIn(0, 19))
  }

  private fun finishTrack(t: Track, reason: String, positionMs: Long) {
    accumulate(t)
    val dur = t.item.mediaMetadata.durationMs ?: attachedTo?.duration?.takeIf { it > 0 }
    if (reason == "ended") t.heard = t.heard or (1 shl 19)
    sendEvent("onListen", mapOf(
      "songId" to t.item.mediaId,
      "song" to Core.songJson(t.item),
      "playedMs" to t.playedMs.toDouble(),
      "positionMs" to positionMs.coerceAtLeast(0).toDouble(),
      "durationMs" to dur?.toDouble(),
      "reason" to reason,
      "heard" to t.heard,
      "replays" to t.replays,
    ))
  }

  // --- ticking: drives the playhead, play reports and the JS side's timers in the background ---

  private val tick = object : Runnable {
    override fun run() {
      val p = attachedTo
      if (p != null) {
        val t = track
        if (t != null && p.isPlaying) {
          val pos = p.currentPosition
          sample(t, pos)
          t.lastPos = pos
          val dur = p.duration
          val threshold = if (dur > 0) minOf(30_000L, dur / 2) else 30_000L
          if (!t.playReported && pos >= threshold) {
            t.playReported = true
            sendEvent("onPlayed", mapOf("songId" to t.item.mediaId, "song" to Core.songJson(t.item)))
          }
          if (!t.warmed && pos >= 10_000 && p.hasNextMediaItem()) {
            t.warmed = true
            p.getMediaItemAt(p.nextMediaItemIndex).mediaId.let { Core.warm(it) }
          }
        }
      }
      emitTick()
      scheduleTick()
    }
  }

  private fun scheduleTick() {
    main.removeCallbacks(tick)
    val playing = attachedTo?.isPlaying == true
    val downloading = runCatching { Downloads.active().isNotEmpty() }.getOrDefault(false)
    when {
      playing -> main.postDelayed(tick, 500)
      foreground || downloading -> main.postDelayed(tick, 1000)
      else -> main.postDelayed(tick, 5000)
    }
  }

  private var tickCount = 0
  private fun emitTick() {
    val p = attachedTo
    tickCount++
    val body = mutableMapOf<String, Any?>("now" to System.currentTimeMillis().toDouble())
    if (p != null) {
      body["positionMs"] = p.currentPosition.toDouble()
      body["bufferedMs"] = p.bufferedPosition.toDouble()
      body["durationMs"] = if (p.duration > 0) p.duration.toDouble() else null
      body["playing"] = p.isPlaying
      body["index"] = p.currentMediaItemIndex
    }
    val active = runCatching { Downloads.active() }.getOrDefault(emptyList())
    if (active.isNotEmpty()) {
      body["downloads"] = active.map { mapOf("id" to it.request.id, "percent" to it.percentDownloaded.toDouble(), "state" to Downloads.stateName(it.state)) }
    }
    sendEvent("onTick", body)
  }

  private fun emitState(p: ExoPlayer) {
    val state = JSONObject()
      .put("index", p.currentMediaItemIndex)
      .put("count", p.mediaItemCount)
      .put("songId", p.currentMediaItem?.mediaId)
      .put("playing", p.isPlaying)
      .put("playWhenReady", p.playWhenReady)
      .put("buffering", p.playbackState == Player.STATE_BUFFERING)
      .put("ended", p.playbackState == Player.STATE_ENDED)
      .put("idle", p.playbackState == Player.STATE_IDLE)
      .put("positionMs", p.currentPosition)
      .put("durationMs", if (p.duration > 0) p.duration else JSONObject.NULL)
      .put("repeat", when (p.repeatMode) { Player.REPEAT_MODE_ALL -> "all"; Player.REPEAT_MODE_ONE -> "one"; else -> "off" })
      .put("volume", p.volume.toDouble())
    snapshot = state
    sendEvent("onState", jsonToMap(state))
  }

  private fun jsonToMap(o: JSONObject): Map<String, Any?> =
    o.keys().asSequence().associateWith { k -> o.get(k).let { if (it == JSONObject.NULL) null else it } }

  // --- connecting to the playback service ---

  private fun attach(p: ExoPlayer) {
    if (attachedTo === p) return
    attachedTo?.removeListener(playerListener)
    attachedTo = p
    p.addListener(playerListener)
    startTrack(p)
    emitState(p)
    scheduleTick()
  }

  private val onNewPlayer: (ExoPlayer) -> Unit = { p -> main.post { attach(p) } }

  /** Runs [block] with the service's player, starting and binding the service first if needed. */
  private fun withPlayer(block: (ExoPlayer) -> Unit) {
    val svc = PlaybackService.instance
    if (svc != null && controller?.isConnected == true) {
      attach(svc.player)
      block(svc.player)
      return
    }
    pending += block
    if (controllerFuture != null) return
    val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
    val future = MediaController.Builder(context, token)
      .setListener(object : MediaController.Listener {
        override fun onDisconnected(controller: MediaController) {
          this@HarmoniPlayerModule.controller = null
          controllerFuture = null
          attachedTo?.removeListener(playerListener)
          attachedTo = null
        }
      })
      .buildAsync()
    controllerFuture = future
    future.addListener({
      controller = runCatching { future.get() }.getOrNull()
      val p = PlaybackService.instance?.player
      if (controller == null || p == null) {
        controllerFuture = null
        pending.clear()
        return@addListener
      }
      attach(p)
      val run = pending.toList()
      pending.clear()
      run.forEach { it(p) }
    }, MoreExecutors.directExecutor())
  }

  private val downloadListener = object : DownloadManager.Listener {
    override fun onDownloadChanged(manager: DownloadManager, download: Download, finalException: Exception?) {
      sendEvent("onDownload", jsonToMap(Downloads.describe(download, download.state == Download.STATE_COMPLETED)).toMutableMap().apply {
        put("song", (get("song") as? JSONObject)?.toString())
      })
    }

    override fun onDownloadRemoved(manager: DownloadManager, download: Download) {
      sendEvent("onDownload", mapOf("id" to download.request.id, "state" to "removed"))
    }
  }

  /** Long-press the launcher icon: Search, Liked Songs, Downloads. */
  private fun publishShortcuts(ctx: Context) {
    fun shortcut(id: String, label: String, path: String, icon: Int) =
      androidx.core.content.pm.ShortcutInfoCompat.Builder(ctx, id)
        .setShortLabel(label)
        .setIcon(androidx.core.graphics.drawable.IconCompat.createWithResource(ctx, icon))
        .setIntent(
          android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse("com.ceccun.harmoni://$path"))
            .setPackage(ctx.packageName)
        )
        .build()
    androidx.core.content.pm.ShortcutManagerCompat.setDynamicShortcuts(
      ctx,
      listOf(
        shortcut("search", "Search", "search", R.drawable.harmoni_sc_search),
        shortcut("liked", "Liked Songs", "liked", R.drawable.harmoni_sc_liked),
        shortcut("downloads", "Downloads", "downloads", R.drawable.harmoni_sc_downloads),
      ),
    )
  }

  override fun definition() = ModuleDefinition {
    Name("HarmoniPlayer")

    Events(
      "onState", "onTick", "onTransition", "onTimeline", "onListen", "onPlayed",
      "onError", "onRemoteLike", "onDownload", "onSignedOut",
    )

    OnCreate {
      Core.init(context)
      AuthStore.onSignedOut = { sendEvent("onSignedOut", mapOf<String, Any?>()) }
      Core.onLikedChanged = { id, liked ->
        main.post {
          PlaybackService.instance?.refreshButtons()
          sendEvent("onRemoteLike", mapOf("songId" to id, "liked" to liked))
        }
      }
      PlaybackService.onError = { message, songId -> main.post { sendEvent("onError", mapOf("message" to message, "songId" to songId)) } }
      PlaybackService.playerListeners += onNewPlayer
      runCatching { publishShortcuts(context) }
      main.post {
        PlaybackService.instance?.let { withPlayer { } }
        runCatching { Downloads.manager.addListener(downloadListener) }
        scheduleTick()
      }
    }

    OnDestroy {
      PlaybackService.playerListeners -= onNewPlayer
      main.removeCallbacks(tick)
      attachedTo?.removeListener(playerListener)
      runCatching { Downloads.manager.removeListener(downloadListener) }
      controllerFuture?.let { MediaController.releaseFuture(it) }
    }

    OnActivityEntersForeground {
      foreground = true
      main.post { scheduleTick() }
      if (AuthStore.get(context) != null) runCatching { DownloadService.start(context, HarmoniDownloadService::class.java) }
    }

    OnActivityEntersBackground {
      foreground = false
    }

    // --- session ---

    Function("getSession") {
      AuthStore.get(context)?.let {
        mapOf("server" to it.server, "issuer" to it.issuer, "apiBase" to it.apiBase, "clientId" to it.clientId)
      }
    }

    AsyncFunction("setSession") { json: String ->
      AuthStore.set(context, AuthStore.Session.fromJson(JSONObject(json)))
    }

    AsyncFunction("getAccessToken") { promise: Promise ->
      Core.io.execute { promise.resolve(AuthStore.freshToken(context)) }
    }

    AsyncFunction("refreshAccessToken") { failed: String?, promise: Promise ->
      Core.io.execute { promise.resolve(AuthStore.refreshAfter(context, failed)) }
    }

    AsyncFunction("signOut") { promise: Promise ->
      main.post {
        PlaybackService.instance?.player?.let { it.stop(); it.clearMediaItems() }
        QueueStore.clear(context)
        Core.liked.clear()
        runCatching { Downloads.removeAll(context) }
        Core.io.execute {
          AuthStore.revoke(context)
          main.post { NowPlayingWidget.refresh(context, null) }
          promise.resolve(null)
        }
      }
    }

    // --- playback ---

    Function("getState") { jsonToMap(snapshot) }

    AsyncFunction("getQueue") { promise: Promise ->
      main.post {
        val p = PlaybackService.instance?.player
        if (p != null && p.mediaItemCount > 0) {
          promise.resolve(mapOf(
            "queue" to QueueStore.queueJson((0 until p.mediaItemCount).map { p.getMediaItemAt(it) }),
            "index" to p.currentMediaItemIndex,
            "positionMs" to p.currentPosition.toDouble(),
            "live" to true,
          ))
        } else {
          val saved = QueueStore.load(context)
          promise.resolve(saved?.let { mapOf("queue" to it.queueJson, "index" to it.index, "positionMs" to it.positionMs.toDouble(), "live" to false) })
        }
      }
    }

    AsyncFunction("setQueue") { json: String, index: Int, positionMs: Double, play: Boolean ->
      withPlayer { p ->
        val items = Core.itemsFor(json)
        if (items.isEmpty()) {
          p.stop(); p.clearMediaItems(); return@withPlayer
        }
        p.setMediaItems(items, index.coerceIn(0, items.size - 1), positionMs.toLong().coerceAtLeast(0))
        p.prepare()
        p.playWhenReady = play
      }
    }.runOnQueue(Queues.MAIN)

    /** Replaces everything around the current entry without interrupting it. */
    AsyncFunction("replaceAround") { json: String, index: Int ->
      withPlayer { p ->
        val items = Core.itemsFor(json)
        val cur = p.currentMediaItemIndex
        if (cur < 0 || index !in items.indices || items[index].mediaId != p.currentMediaItem?.mediaId) {
          val pos = p.currentPosition
          val play = p.playWhenReady
          p.setMediaItems(items, index.coerceIn(0, maxOf(0, items.size - 1)), pos)
          p.prepare()
          p.playWhenReady = play
          return@withPlayer
        }
        if (cur + 1 < p.mediaItemCount) p.removeMediaItems(cur + 1, p.mediaItemCount)
        if (cur > 0) p.removeMediaItems(0, cur)
        if (index > 0) p.addMediaItems(0, items.subList(0, index))
        if (index + 1 < items.size) p.addMediaItems(items.subList(index + 1, items.size))
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("insert") { index: Int, json: String ->
      withPlayer { p -> p.addMediaItems(index.coerceIn(0, p.mediaItemCount), Core.itemsFor(json)) }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("removeAt") { index: Int ->
      withPlayer { p -> if (index in 0 until p.mediaItemCount) p.removeMediaItem(index) }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("move") { from: Int, to: Int ->
      withPlayer { p ->
        if (from in 0 until p.mediaItemCount && to in 0 until p.mediaItemCount) p.moveMediaItem(from, to)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("play") {
      withPlayer { p ->
        if (p.playbackState == Player.STATE_IDLE) p.prepare()
        if (p.playbackState == Player.STATE_ENDED) p.seekTo(p.currentMediaItemIndex, 0)
        if (smooth && !p.isPlaying) {
          fade?.cancel()
          p.volume = 0f
          p.play()
          fadeTo(p, targetVolume, 260)
        } else {
          p.play()
        }
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("pause") {
      withPlayer { p ->
        if (smooth && p.isPlaying) {
          fadeTo(p, 0f, 180) {
            p.pause()
            p.volume = targetVolume
          }
        } else {
          fade?.cancel()
          p.pause()
          p.volume = targetVolume
        }
      }
    }.runOnQueue(Queues.MAIN)

    Function("setSmooth") { on: Boolean -> smooth = on }

    AsyncFunction("seekTo") { ms: Double -> withPlayer { it.seekTo(ms.toLong().coerceAtLeast(0)) } }.runOnQueue(Queues.MAIN)

    AsyncFunction("skipTo") { index: Int, positionMs: Double ->
      withPlayer { p ->
        if (index in 0 until p.mediaItemCount) {
          p.seekTo(index, positionMs.toLong().coerceAtLeast(0))
          if (p.playbackState == Player.STATE_IDLE) p.prepare()
        }
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("next") {
      withPlayer { p ->
        if (p.hasNextMediaItem()) p.seekToNextMediaItem() else if (p.mediaItemCount > 0) p.seekTo(0, 0)
        if (p.playbackState == Player.STATE_IDLE) p.prepare()
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("prev") { restartAfterMs: Double ->
      withPlayer { p ->
        if (p.currentPosition > restartAfterMs || !p.hasPreviousMediaItem()) p.seekTo(0) else p.seekToPreviousMediaItem()
        if (p.playbackState == Player.STATE_IDLE) p.prepare()
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setRepeat") { mode: String ->
      withPlayer { p ->
        p.repeatMode = when (mode) { "all" -> Player.REPEAT_MODE_ALL; "one" -> Player.REPEAT_MODE_ONE; else -> Player.REPEAT_MODE_OFF }
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setVolume") { volume: Double ->
      withPlayer {
        fade?.cancel()
        targetVolume = volume.toFloat().coerceIn(0f, 1f)
        it.volume = targetVolume
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stop") {
      PlaybackService.instance?.player?.let { p ->
        track?.let { finishTrack(it, "close", p.currentPosition); track = null }
        p.stop()
        p.clearMediaItems()
      }
      QueueStore.clear(context)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("pauseAtEndOfSong") { on: Boolean ->
      withPlayer { it.pauseAtEndOfMediaItems = on }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("retry") {
      withPlayer { p -> p.prepare(); p.play() }
    }.runOnQueue(Queues.MAIN)

    // --- likes (for the notification heart) ---

    Function("setLikedIds") { json: String ->
      val a = JSONArray(json)
      synchronized(Core.liked) {
        Core.liked.clear()
        for (i in 0 until a.length()) Core.liked.add(a.getString(i))
      }
      main.post { PlaybackService.instance?.refreshButtons() }
    }

    Function("setLiked") { id: String, liked: Boolean ->
      if (liked) Core.liked.add(id) else Core.liked.remove(id)
      main.post { PlaybackService.instance?.refreshButtons() }
    }

    // --- downloads ---

    AsyncFunction("download") { json: String ->
      val a = JSONArray(json)
      for (i in 0 until a.length()) Downloads.add(context, a.getJSONObject(i))
    }

    AsyncFunction("removeDownload") { id: String -> Downloads.remove(context, id) }

    AsyncFunction("removeAllDownloads") { Downloads.removeAll(context) }

    AsyncFunction("getDownloads") { promise: Promise ->
      Core.io.execute { promise.resolve(runCatching { Downloads.all() }.getOrDefault("[]")) }
    }

    AsyncFunction("getDownloadSize") { promise: Promise ->
      Core.io.execute { promise.resolve(runCatching { Core.downloadCache.cacheSpace.toDouble() }.getOrDefault(0.0)) }
    }

    // --- home screen widget ---

    Function("canPinWidget") {
      android.appwidget.AppWidgetManager.getInstance(context).isRequestPinAppWidgetSupported
    }

    Function("hasWidget") {
      android.appwidget.AppWidgetManager.getInstance(context)
        .getAppWidgetIds(ComponentName(context, NowPlayingWidget::class.java)).isNotEmpty()
    }

    AsyncFunction("pinWidget") {
      android.appwidget.AppWidgetManager.getInstance(context)
        .requestPinAppWidget(ComponentName(context, NowPlayingWidget::class.java), null, null)
    }

    // --- artwork colours ---

    AsyncFunction("getArtworkColors") { url: String, promise: Promise ->
      Core.io.execute {
        try {
          val c = URL(url).openConnection() as HttpURLConnection
          c.connectTimeout = 15_000
          c.readTimeout = 15_000
          val bytes = c.inputStream.use { it.readBytes() }
          c.disconnect()
          val opts = android.graphics.BitmapFactory.Options().apply { inSampleSize = 4 }
          val bmp = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
          if (bmp == null) { promise.resolve(null); return@execute }
          val p = Palette.from(bmp).maximumColorCount(16).generate()
          fun hex(s: Palette.Swatch?) = s?.let { String.format("#%06X", 0xFFFFFF and it.rgb) }
          // The web app's colour: a saturation-weighted mean of a 24×24 thumbnail.
          val small = android.graphics.Bitmap.createScaledBitmap(bmp, 24, 24, true)
          var rs = 0.0; var gs = 0.0; var bs = 0.0; var ws = 0.0
          for (y in 0 until 24) for (x in 0 until 24) {
            val c = small.getPixel(x, y)
            val r = (c shr 16) and 0xff; val g = (c shr 8) and 0xff; val b = c and 0xff
            val max = maxOf(r, g, b); val min = minOf(r, g, b)
            val sat = if (max == 0) 0.0 else (max - min).toDouble() / max
            val w = 0.15 + sat * sat
            rs += r * w; gs += g * w; bs += b * w; ws += w
          }
          val mr = Math.round(rs / ws).toInt(); val mg = Math.round(gs / ws).toInt(); val mb = Math.round(bs / ws).toInt()
          fun lin(v: Int): Double { val c = v / 255.0; return if (c <= 0.03928) c / 12.92 else Math.pow((c + 0.055) / 1.055, 2.4) }
          val lum = 0.2126 * lin(mr) + 0.7152 * lin(mg) + 0.0722 * lin(mb)
          fun hex3(r: Int, g: Int, b: Int) = String.format("#%02X%02X%02X", r.coerceIn(0, 255), g.coerceIn(0, 255), b.coerceIn(0, 255))
          promise.resolve(mapOf(
            "color" to hex3(mr, mg, mb),
            "deep" to hex3((mr * 0.38 + 14).toInt(), (mg * 0.38 + 14).toInt(), (mb * 0.38 + 14).toInt()),
            "light" to (lum > 0.4),
            "dominant" to hex(p.dominantSwatch),
            "vibrant" to hex(p.vibrantSwatch),
            "darkVibrant" to hex(p.darkVibrantSwatch),
            "lightVibrant" to hex(p.lightVibrantSwatch),
            "muted" to hex(p.mutedSwatch),
            "darkMuted" to hex(p.darkMutedSwatch),
            "lightMuted" to hex(p.lightMutedSwatch),
          ))
        } catch (e: Exception) {
          promise.resolve(null)
        }
      }
    }
  }
}
