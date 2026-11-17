@file:OptIn(UnstableApi::class)

package com.ceccun.harmoni.player

import android.app.PendingIntent
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
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
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import org.json.JSONObject

class PlaybackService : MediaSessionService() {
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
  }

  lateinit var player: ExoPlayer
    private set
  private var session: MediaSession? = null
  private val main = Handler(Looper.getMainLooper())
  private var authRetries = 0
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
    val builder = MediaSession.Builder(this, player).setCallback(SessionCallback())
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
    main.postDelayed(saver, 10_000)
    playerListeners.toList().forEach { it(player) }
    refreshButtons()
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

  override fun onTaskRemoved(rootIntent: Intent?) {
    if (!isPlaybackOngoing) pauseAllPlayersAndStopSelf()
  }

  override fun onDestroy() {
    if (::player.isInitialized && player.mediaItemCount > 0) QueueStore.save(this, player)
    instance = null
    main.removeCallbacks(saver)
    session?.release()
    session = null
    player.release()
    NowPlayingWidget.refresh(this, null)
    super.onDestroy()
  }

  /** The heart in the notification and on the lock screen. */
  fun refreshButtons() {
    val s = session ?: return
    val id = player.currentMediaItem?.mediaId
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
      refreshButtons()
      QueueStore.save(this@PlaybackService, player)
      NowPlayingWidget.refresh(this@PlaybackService, player)
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
        onError?.invoke("Can't reach the server. Check your connection.", item?.mediaId)
        return // stays paused at the same spot; play tries again
      }

      onError?.invoke("Couldn't play $title.", item?.mediaId)
      if (player.hasNextMediaItem()) {
        main.postDelayed({
          player.seekToNextMediaItem()
          player.prepare()
          player.play()
        }, 600)
      }
    }
  }

  private inner class SessionCallback : MediaSession.Callback {
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
        player.currentMediaItem?.mediaId?.let { Core.toggleLikeRemotely(it) }
        refreshButtons()
        return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
      }
      return super.onCustomCommand(session, controller, customCommand, args)
    }

    override fun onAddMediaItems(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
      mediaItems: MutableList<MediaItem>,
    ): ListenableFuture<MutableList<MediaItem>> =
      Futures.immediateFuture(mediaItems.map { Core.resolve(it) }.toMutableList())

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
