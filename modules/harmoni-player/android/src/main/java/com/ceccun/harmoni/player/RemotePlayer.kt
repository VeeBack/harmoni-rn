@file:OptIn(UnstableApi::class)

package com.ceccun.harmoni.player

import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.DeviceInfo
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.util.UnstableApi
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import org.json.JSONArray
import org.json.JSONObject

/**
 * Harmoni Link playback on another device, as a Media3 player. The media session
 * switches to this while another device plays, so the notification, lock screen,
 * widget, headset and car show that device's song and control it. It plays no
 * audio: every control goes to JS as a Link command for the playing device.
 */
class RemotePlayer(looper: Looper, private val send: (JSONObject) -> Unit) : SimpleBasePlayer(looper) {
  data class Remote(
    val deviceId: String,
    val deviceName: String,
    val items: List<MediaItemData>,
    val index: Int,
    val playing: Boolean,
    val buffering: Boolean,
    val positionMs: Long,
    val durationMs: Long,
    val repeat: Int,
    val shuffle: Boolean,
    val volume: Int,
    val muted: Boolean,
  )

  @Volatile var remote: Remote? = null
    private set

  val deviceName: String? get() = remote?.deviceName

  /** The routing session this playback belongs to, so Android shows the device's name. */
  var routingId: String? = null
    set(value) {
      if (field == value) return
      field = value
      invalidateState()
    }

  private val commands = Player.Commands.Builder()
    .addAll(
      COMMAND_PLAY_PAUSE,
      COMMAND_SEEK_TO_NEXT,
      COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
      COMMAND_SEEK_TO_PREVIOUS,
      COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM,
      COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM,
      COMMAND_SEEK_TO_MEDIA_ITEM,
      COMMAND_SET_REPEAT_MODE,
      COMMAND_SET_SHUFFLE_MODE,
      COMMAND_GET_CURRENT_MEDIA_ITEM,
      COMMAND_GET_TIMELINE,
      COMMAND_GET_METADATA,
      COMMAND_GET_DEVICE_VOLUME,
      COMMAND_SET_DEVICE_VOLUME_WITH_FLAGS,
      COMMAND_ADJUST_DEVICE_VOLUME_WITH_FLAGS,
      COMMAND_STOP,
    )
    .build()

  /** Updates what the other device is doing (from JS, on every Link state change). */
  fun update(json: JSONObject) {
    val queue = json.optJSONArray("queue") ?: JSONArray()
    val items = (0 until queue.length()).mapNotNull { i ->
      val song = queue.optJSONObject(i) ?: return@mapNotNull null
      val item = runCatching { Core.itemFor(song) }.getOrNull() ?: return@mapNotNull null
      val dur = song.optLong("durationMs", 0)
      MediaItemData.Builder("$i:${item.mediaId}")
        .setMediaItem(item)
        .setDurationUs(if (dur > 0) dur * 1000 else C.TIME_UNSET)
        .setIsSeekable(true)
        .build()
    }
    remote = Remote(
      deviceId = json.optString("deviceId"),
      deviceName = json.optString("deviceName", "another device"),
      items = items,
      index = json.optInt("index", 0).coerceIn(0, maxOf(0, items.size - 1)),
      playing = json.optBoolean("playing"),
      buffering = json.optBoolean("buffering"),
      positionMs = json.optLong("positionMs", 0).coerceAtLeast(0),
      durationMs = json.optLong("durationMs", 0),
      repeat = when (json.optString("repeat")) { "all" -> REPEAT_MODE_ALL; "one" -> REPEAT_MODE_ONE; else -> REPEAT_MODE_OFF },
      shuffle = json.optBoolean("shuffle"),
      volume = (json.optDouble("volume", 1.0) * 100).toInt().coerceIn(0, 100),
      muted = json.optBoolean("muted"),
    )
    invalidateState()
  }

  override fun getState(): State {
    val r = remote
    val device = DeviceInfo.Builder(DeviceInfo.PLAYBACK_TYPE_REMOTE)
      .setMinVolume(0)
      .setMaxVolume(100)
      .apply { routingId?.let { setRoutingControllerId(it) } }
      .build()
    val b = State.Builder()
      .setAvailableCommands(commands)
      .setDeviceInfo(device)
    if (r == null || r.items.isEmpty()) {
      return b.setPlaybackState(STATE_IDLE).setPlaylist(emptyList()).build()
    }
    return b
      .setPlaylist(r.items)
      .setCurrentMediaItemIndex(r.index)
      .setPlayWhenReady(r.playing, PLAY_WHEN_READY_CHANGE_REASON_REMOTE)
      .setPlaybackState(if (r.buffering && r.playing) STATE_BUFFERING else STATE_READY)
      .setContentPositionMs(if (r.playing) PositionSupplier.getExtrapolating(r.positionMs, 1f) else PositionSupplier.getConstant(r.positionMs))
      .setRepeatMode(r.repeat)
      .setShuffleModeEnabled(r.shuffle)
      .setDeviceVolume(r.volume)
      .setIsDeviceMuted(r.muted)
      .build()
  }

  private fun command(type: String, extra: JSONObject.() -> Unit = {}): ListenableFuture<*> {
    send(JSONObject().put("type", type).apply(extra))
    return Futures.immediateVoidFuture()
  }

  /** Optimistic: show the change straight away; the next Link state confirms or corrects it. */
  private fun patch(f: (Remote) -> Remote) {
    remote = remote?.let(f)
    invalidateState()
  }

  override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
    val r = remote ?: return Futures.immediateVoidFuture()
    if (r.playing == playWhenReady) return Futures.immediateVoidFuture()
    patch { it.copy(playing = playWhenReady, positionMs = currentPosition) }
    return command("toggle")
  }

  override fun handleSeek(mediaItemIndex: Int, positionMs: Long, seekCommand: Int): ListenableFuture<*> {
    val r = remote ?: return Futures.immediateVoidFuture()
    return when (seekCommand) {
      COMMAND_SEEK_TO_NEXT, COMMAND_SEEK_TO_NEXT_MEDIA_ITEM -> command("next")
      COMMAND_SEEK_TO_PREVIOUS, COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> command("prev")
      COMMAND_SEEK_TO_MEDIA_ITEM -> if (mediaItemIndex != r.index && mediaItemIndex in r.items.indices) {
        patch { it.copy(index = mediaItemIndex, positionMs = 0) }
        command("jumpTo") { put("index", mediaItemIndex) }
      } else {
        patch { it.copy(positionMs = positionMs.coerceAtLeast(0)) }
        command("seek") { put("positionMs", positionMs.coerceAtLeast(0)) }
      }
      else -> {
        patch { it.copy(positionMs = positionMs.coerceAtLeast(0)) }
        command("seek") { put("positionMs", positionMs.coerceAtLeast(0)) }
      }
    }
  }

  override fun handleSetRepeatMode(repeatMode: Int): ListenableFuture<*> = command("repeat") {
    put("mode", when (repeatMode) { REPEAT_MODE_ALL -> "all"; REPEAT_MODE_ONE -> "one"; else -> "off" })
  }

  override fun handleSetShuffleModeEnabled(shuffleModeEnabled: Boolean): ListenableFuture<*> {
    patch { it.copy(shuffle = shuffleModeEnabled) }
    return command("shuffle") { put("on", shuffleModeEnabled) }
  }

  override fun handleSetDeviceVolume(deviceVolume: Int, flags: Int): ListenableFuture<*> {
    val v = deviceVolume.coerceIn(0, 100)
    patch { it.copy(volume = v, muted = false) }
    return command("volume") { put("volume", v / 100.0) }
  }

  override fun handleIncreaseDeviceVolume(flags: Int): ListenableFuture<*> = handleSetDeviceVolume((remote?.volume ?: 0) + 5, flags)

  override fun handleDecreaseDeviceVolume(flags: Int): ListenableFuture<*> = handleSetDeviceVolume((remote?.volume ?: 0) - 5, flags)

  override fun handleSetDeviceMuted(muted: Boolean, flags: Int): ListenableFuture<*> {
    patch { it.copy(muted = muted) }
    return command("mute") { put("muted", muted) }
  }

  override fun handleStop(): ListenableFuture<*> {
    // "Stop" from the notification pauses the other device rather than ending its playback.
    if (remote?.playing == true) return handleSetPlayWhenReady(false)
    return Futures.immediateVoidFuture()
  }

  override fun handleRelease(): ListenableFuture<*> = Futures.immediateVoidFuture()
}
