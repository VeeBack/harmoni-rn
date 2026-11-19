@file:OptIn(UnstableApi::class)

package com.ceccun.harmoni.player

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.HttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.CommandButton
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaLibraryService.LibraryParams
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionError
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import org.json.JSONObject

class PlaybackService : MediaLibraryService() {
  companion object {
    private const val TAG = "HarmoniPlayback"
    const val ACTION_LIKE = "harmoni.like"
    const val CHANNEL = "playback"

    @Volatile var instance: PlaybackService? = null
      private set

    /** Listeners from the JS module, re-attached whenever a new player is made. */
    val playerListeners = mutableListOf<(ExoPlayer) -> Unit>()

    /** Errors the JS side should hear about: message, song id. */
    @Volatile var onError: ((String, String?) -> Unit)? = null

    /** Controls pressed on the remote player (notification, lock screen, widget): Link commands for JS. */
    @Volatile var onRemoteCommand: ((JSONObject) -> Unit)? = null

    /** Crossfade length (0 = off), set from Settings. */
    @Volatile var crossfadeMs = 0L
  }

  // --- crossfade (the web's mixer.ts): a second player fades the ending song out with cos,
  // the main player fades the next one in with sin, both on an equal-power curve.
  private var fader: ExoPlayer? = null
  private var fadeStart = 0L
  private var fadeOutMs = 0L
  private var fadeBase = 1f
  private var crossfadedKey: String? = null
  private var ownSkip = false
  /** True while the transition we caused is the one being reported (it counts as "ended"). */
  @Volatile var crossfading = false
    private set

  private val crossfadeTick = object : Runnable {
    override fun run() {
      stepCrossfade()
      main.postDelayed(this, if (fader != null) 30 else 250)
    }
  }

  private fun stepCrossfade() {
    val fading = fader
    if (fading != null) {
      val t = (SystemClock.elapsedRealtime() - fadeStart).toFloat()
      val xo = (t / fadeOutMs.coerceAtLeast(1)).coerceIn(0f, 1f)
      val xi = (t / crossfadeMs.coerceAtLeast(1)).coerceIn(0f, 1f)
      fading.volume = fadeBase * cos(xo * PI.toFloat() / 2)
      player.volume = fadeBase * sin(xi * PI.toFloat() / 2)
      if (xo >= 1f && xi >= 1f) endCrossfade(false)
      return
    }
    val cf = crossfadeMs
    if (cf <= 0 || !player.isPlaying) return
    val dur = player.duration
    val pos = player.currentPosition
    if (dur <= 0 || dur <= 3 * cf || dur - pos > cf) return
    if (player.repeatMode == Player.REPEAT_MODE_ONE || !player.hasNextMediaItem()) return
    val key = "${player.currentMediaItemIndex}:${player.currentMediaItem?.mediaId}"
    if (key == crossfadedKey) return
    crossfadedKey = key
    val item = player.currentMediaItem ?: return
    val out = ExoPlayer.Builder(this)
      .setMediaSourceFactory(DefaultMediaSourceFactory(Core.playbackDataSource))
      .setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), false)
      .build()
    out.setMediaItem(Core.resolve(item), pos)
    fadeBase = player.volume
    out.volume = fadeBase
    out.prepare()
    out.play()
    fader = out
    fadeStart = SystemClock.elapsedRealtime()
    fadeOutMs = dur - pos
    player.volume = 0f
    crossfading = true
    ownSkip = true
    player.seekToNextMediaItem()
    ownSkip = false
  }

  /** Ends a crossfade; when cancelled (pause, skip, seek) the outgoing song stops and the main one is at full volume. */
  fun endCrossfade(cancelled: Boolean) {
    val out = fader ?: return
    fader = null
    out.release()
    player.volume = fadeBase
    crossfading = false
    if (cancelled) crossfadedKey = null
  }

  lateinit var player: ExoPlayer
    private set
  private var remotePlayer: RemotePlayer? = null

  /** Another device is playing: the session shows (and controls) that instead of this phone. */
  fun showRemote(json: JSONObject) {
    val s = session ?: return
    val r = remotePlayer ?: RemotePlayer(mainLooper) { cmd -> onRemoteCommand?.invoke(cmd) }.also { remotePlayer = it }
    r.update(json)
    // Point at the routing session only once it exists: Android looks for it when the
    // routing id changes, and shows "Other device" if it isn't there yet.
    if (Build.VERSION.SDK_INT >= 30) linkRoutingChanged()
    if (s.player !== r) {
      endCrossfade(true)
      if (player.isPlaying) player.pause()
      s.player = r
    }
    refreshButtons()
    NowPlayingWidget.refresh(this, r) // returns early when nothing it shows changed
  }

  fun linkRoutingChanged() {
    val r = remotePlayer ?: return
    if (Build.VERSION.SDK_INT < 30) return
    val id = r.remote?.deviceId
    val ready = id != null && LinkRouteProvider.sessionFor == id
    val want = if (ready) LinkRouteProvider.uniqueSessionId(this, id!!) else null
    if (r.routingId == want) return
    if (want == null) r.routingId = null
    // Give SystemUI's router a moment to see the new session before pointing at it.
    else main.postDelayed({ if (LinkRouteProvider.sessionFor == id) remotePlayer?.routingId = want }, 400)
  }

  /** This phone again (or nothing playing anywhere). */
  fun showLocal() {
    val s = session ?: return
    if (s.player !== player) s.player = player
    remotePlayer = null
    refreshButtons()
    NowPlayingWidget.refresh(this, player)
  }

  /** The player the session (notification, widget, car) is showing right now. */
  val shownPlayer: Player get() = session?.player ?: player
  private var session: MediaLibrarySession? = null
  private val background by lazy { MoreExecutors.listeningDecorator(Core.io) }
  private val main = Handler(Looper.getMainLooper())
  private var authRetries = 0
  private val skipAfterError = Runnable {
    if (player.playerError != null && player.hasNextMediaItem()) {
      player.seekToNextMediaItem()
      player.prepare()
      player.play()
    }
  }
  // Saves the playhead every 10 s while playing, so a killed app resumes close to where it was.
  private val saver = object : Runnable {
    override fun run() {
      if (::player.isInitialized && player.isPlaying) QueueStore.save(this@PlaybackService, player)
      main.postDelayed(this, 10_000)
    }
  }
  private val likeCommand = SessionCommand(ACTION_LIKE, Bundle.EMPTY)

  override fun onCreate() {
    super.onCreate()
    Core.init(this)
    player = ExoPlayer.Builder(this)
      .setMediaSourceFactory(DefaultMediaSourceFactory(Core.playbackDataSource))
      .setAudioAttributes(
        AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
        true,
      )
      .setHandleAudioBecomingNoisy(true)
      .setWakeMode(C.WAKE_MODE_NETWORK)
      .build()
    player.addListener(ServiceListener())

    val open = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      putExtra("harmoni.openPlayer", true)
    }
    val builder = MediaLibrarySession.Builder(this, player, SessionCallback())
    if (open != null) {
      builder.setSessionActivity(
        PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      )
    }
    session = builder.build()

    val provider = DefaultMediaNotificationProvider.Builder(this)
      .setChannelId(CHANNEL)
      .setChannelName(R.string.harmoni_playback_channel)
      .build()
    provider.setSmallIcon(R.drawable.harmoni_stat)
    setMediaNotificationProvider(provider)

    instance = this
    if (Build.VERSION.SDK_INT >= 30) LinkRouteProvider.onSessionReady = { main.post { linkRoutingChanged() } }
    main.postDelayed(saver, 10_000)
    main.post(crossfadeTick)
    // Lets equalizer apps (and the system one) attach to our audio.
    sendBroadcast(
      Intent(android.media.audiofx.AudioEffect.ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION)
        .putExtra(android.media.audiofx.AudioEffect.EXTRA_AUDIO_SESSION, player.audioSessionId)
        .putExtra(android.media.audiofx.AudioEffect.EXTRA_PACKAGE_NAME, packageName)
        .putExtra(android.media.audiofx.AudioEffect.EXTRA_CONTENT_TYPE, android.media.audiofx.AudioEffect.CONTENT_TYPE_MUSIC)
    )
    playerListeners.toList().forEach { it(player) }
    refreshButtons()
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? = session

  override fun onTaskRemoved(rootIntent: Intent?) {
    if (!isPlaybackOngoing) pauseAllPlayersAndStopSelf()
  }

  override fun onDestroy() {
    if (::player.isInitialized && player.mediaItemCount > 0) QueueStore.save(this, player)
    instance = null
    main.removeCallbacks(saver)
    main.removeCallbacks(skipAfterError)
    main.removeCallbacks(crossfadeTick)
    endCrossfade(true)
    sendBroadcast(
      Intent(android.media.audiofx.AudioEffect.ACTION_CLOSE_AUDIO_EFFECT_CONTROL_SESSION)
        .putExtra(android.media.audiofx.AudioEffect.EXTRA_AUDIO_SESSION, player.audioSessionId)
        .putExtra(android.media.audiofx.AudioEffect.EXTRA_PACKAGE_NAME, packageName)
    )
    session?.release()
    session = null
    player.release()
    NowPlayingWidget.refresh(this, null)
    super.onDestroy()
  }

  /** The heart in the notification and on the lock screen. */
  fun refreshButtons() {
    val s = session ?: return
    val id = shownPlayer.currentMediaItem?.mediaId
    val liked = id != null && Core.liked.contains(id)
    val heart = CommandButton.Builder(if (liked) CommandButton.ICON_HEART_FILLED else CommandButton.ICON_HEART_UNFILLED)
      .setDisplayName(if (liked) "Unlike" else "Like")
      .setSessionCommand(likeCommand)
      .build()
    s.setMediaButtonPreferences(if (id == null) ImmutableList.of() else ImmutableList.of(heart))
  }

  private inner class ServiceListener : Player.Listener {
    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
      authRetries = 0
      main.removeCallbacks(skipAfterError)
      // A skip the person made during a fade cancels it.
      if (fader != null && !ownSkip) endCrossfade(true)
      main.post { if (fader == null) crossfading = false }
      refreshButtons()
      QueueStore.save(this@PlaybackService, player)
      NowPlayingWidget.refresh(this@PlaybackService, player)
    }

    override fun onPositionDiscontinuity(oldPosition: Player.PositionInfo, newPosition: Player.PositionInfo, reason: Int) {
      if (reason == Player.DISCONTINUITY_REASON_SEEK && fader != null && !ownSkip) endCrossfade(true)
    }

    override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
      if (!playWhenReady && fader != null) endCrossfade(true)
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
      NowPlayingWidget.refresh(this@PlaybackService, player)
      if (!isPlaying) QueueStore.save(this@PlaybackService, player)
    }

    override fun onTimelineChanged(timeline: androidx.media3.common.Timeline, reason: Int) {
      if (reason == Player.TIMELINE_CHANGE_REASON_PLAYLIST_CHANGED) {
        QueueStore.save(this@PlaybackService, player)
        if (player.mediaItemCount == 0) NowPlayingWidget.refresh(this@PlaybackService, player)
      }
    }

    override fun onPlayerError(error: PlaybackException) {
      val item = player.currentMediaItem
      val title = item?.mediaMetadata?.title?.toString() ?: "this song"
      val http = generateSequence(error.cause) { it.cause }.filterIsInstance<HttpDataSource.InvalidResponseCodeException>().firstOrNull()
      Log.w(TAG, "playback error ${error.errorCodeName} http=${http?.responseCode}", error)

      if (http?.responseCode == 401 && authRetries < 2) {
        authRetries++
        val failed = http.dataSpec.httpRequestHeaders["Authorization"]?.removePrefix("Bearer ")
        Core.io.execute {
          val token = AuthStore.refreshAfter(this@PlaybackService, failed)
          main.post {
            if (token != null) player.prepare()
            else onError?.invoke("You've been signed out.", item?.mediaId)
          }
        }
        return
      }

      val network = error.errorCode == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED ||
        error.errorCode == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT
      if (network) {
        player.pause() // stays at the same spot; play tries again
        onError?.invoke("Can't reach the server. Check your connection.", item?.mediaId)
        return
      }

      onError?.invoke("Couldn't play $title.", item?.mediaId)
      // Every source failed: move on (the API docs suggest skipping), unless the person picks something first.
      main.removeCallbacks(skipAfterError)
      if (player.hasNextMediaItem()) main.postDelayed(skipAfterError, 600)
    }
  }

  private inner class SessionCallback : MediaLibrarySession.Callback {
    override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult {
      return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
        .setAvailableSessionCommands(
          MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon().add(likeCommand).build()
        )
        .build()
    }

    override fun onCustomCommand(
      session: MediaSession,
      controller: MediaSession.ControllerInfo,
      customCommand: SessionCommand,
      args: Bundle,
    ): ListenableFuture<SessionResult> {
      if (customCommand.customAction == ACTION_LIKE) {
        shownPlayer.currentMediaItem?.mediaId?.let { Core.toggleLikeRemotely(it) }
        refreshButtons()
        return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
      }
      return super.onCustomCommand(session, controller, customCommand, args)
    }

    // --- Android Auto and other media browsers ---

    override fun onGetLibraryRoot(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      params: LibraryParams?,
    ): ListenableFuture<LibraryResult<MediaItem>> = Futures.immediateFuture(LibraryResult.ofItem(Library.root(), params))

    override fun onGetChildren(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      parentId: String,
      page: Int,
      pageSize: Int,
      params: LibraryParams?,
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> = background.submit<LibraryResult<ImmutableList<MediaItem>>> {
      val all = Library.children(parentId)
      val from = (page * pageSize).coerceAtMost(all.size)
      LibraryResult.ofItemList(ImmutableList.copyOf(all.subList(from, minOf(all.size, from + pageSize))), params)
    }

    override fun onGetItem(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      mediaId: String,
    ): ListenableFuture<LibraryResult<MediaItem>> {
      val item = Library.item(mediaId)
      return Futures.immediateFuture(if (item != null) LibraryResult.ofItem(item, null) else LibraryResult.ofError(SessionError.ERROR_BAD_VALUE))
    }

    private val searches = java.util.concurrent.ConcurrentHashMap<String, List<MediaItem>>()

    override fun onSearch(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      query: String,
      params: LibraryParams?,
    ): ListenableFuture<LibraryResult<Void>> = background.submit<LibraryResult<Void>> {
      val results = Library.search(query)
      searches[query] = results
      session.notifySearchResultChanged(browser, query, results.size, params)
      LibraryResult.ofVoid()
    }

    override fun onGetSearchResult(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      query: String,
      page: Int,
      pageSize: Int,
      params: LibraryParams?,
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
      val all = searches[query] ?: emptyList()
      val from = (page * pageSize).coerceAtMost(all.size)
      return Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.copyOf(all.subList(from, minOf(all.size, from + pageSize))), params))
    }

    /** Playing one song from a browsed list queues the whole list from there. */
    override fun onSetMediaItems(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
      mediaItems: MutableList<MediaItem>,
      startIndex: Int,
      startPositionMs: Long,
    ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
      val expanded = Library.expand(mediaItems)
      if (expanded != null) {
        return Futures.immediateFuture(MediaSession.MediaItemsWithStartPosition(expanded.first, expanded.second, 0))
      }
      val resolved = mediaItems.map { if (it.mediaId.startsWith("aa|")) Library.item(it.mediaId) ?: it else Core.resolve(it) }
      return Futures.immediateFuture(MediaSession.MediaItemsWithStartPosition(resolved, startIndex, startPositionMs))
    }

    override fun onAddMediaItems(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
      mediaItems: MutableList<MediaItem>,
    ): ListenableFuture<MutableList<MediaItem>> =
      Futures.immediateFuture(mediaItems.map { if (it.mediaId.startsWith("aa|")) Library.item(it.mediaId) ?: it else Core.resolve(it) }.toMutableList())

    @Deprecated("Media3 keeps calling this for older controllers")
    override fun onPlaybackResumption(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
    ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
      val saved = QueueStore.load(this@PlaybackService)
      if (saved == null || AuthStore.get(this@PlaybackService) == null) {
        return Futures.immediateFailedFuture(UnsupportedOperationException("Nothing to resume"))
      }
      player.repeatMode = saved.repeat
      return Futures.immediateFuture(
        MediaSession.MediaItemsWithStartPosition(Core.itemsFor(saved.queueJson), saved.index, saved.positionMs)
      )
    }
  }
}

internal fun JSONObject.optStringOrNull(key: String): String? = if (has(key) && !isNull(key)) optString(key) else null
