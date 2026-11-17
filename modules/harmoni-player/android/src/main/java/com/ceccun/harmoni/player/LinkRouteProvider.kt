package com.ceccun.harmoni.player

import android.media.MediaRoute2Info
import android.media.MediaRoute2ProviderService
import android.media.RoutingSessionInfo
import android.os.Build
import android.os.Bundle
import androidx.annotation.RequiresApi

/**
 * Publishes Harmoni Link devices to Android's output switcher (the chip in the
 * media controls that usually says "This phone"). While another device plays,
 * there's a routing session for it, so the chip shows that device's name; and
 * picking a device in the switcher moves playback there.
 */
@RequiresApi(Build.VERSION_CODES.R)
class LinkRouteProvider : MediaRoute2ProviderService() {
  data class Device(val id: String, val name: String, val kind: String)

  companion object {
    const val FEATURE = "com.ceccun.harmoni.LINK"

    @Volatile var instance: LinkRouteProvider? = null
      private set

    /** Other online devices of this account. */
    @Volatile var devices: List<Device> = emptyList()

    /** The device playing, when it isn't this phone. */
    @Volatile var active: String? = null

    /** Its volume, 0–100 (the switcher's slider). */
    @Volatile var volume: Int = 100

    /** The switcher's volume slider moved: 0–100. */
    @Volatile var onVolume: ((Int) -> Unit)? = null

    /** A routing session for this device now exists (so the media session can point at it). */
    @Volatile var onSessionReady: ((String?) -> Unit)? = null

    /** The device whose routing session exists right now. */
    @Volatile var sessionFor: String? = null
      private set

    /** Asked to move playback: a device id, or null for this phone. */
    @Volatile var onTransfer: ((String?) -> Unit)? = null

    fun sessionId(deviceId: String) = "harmoni-link-$deviceId"

    /**
     * The id Android gives our session ("<provider>:<our id>"). A remote media session must
     * name this one as its volume control id for the system to find it and show its name.
     */
    fun uniqueSessionId(context: android.content.Context, deviceId: String): String {
      val ours = sessionId(deviceId)
      runCatching {
        android.media.MediaRouter2.getInstance(context).controllers.firstOrNull { it.id.endsWith(":$ours") }?.let { return it.id }
      }
      val provider = android.content.ComponentName(context, LinkRouteProvider::class.java).flattenToShortString()
      return "$provider:$ours"
    }

    fun update(devices: List<Device>, active: String?, volume: Int = this.volume) {
      this.devices = devices
      this.active = active
      this.volume = volume
      instance?.let { p -> p.mainExecutor.execute { p.publish() } }
    }
  }

  private var current: String? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    publish()
  }

  override fun onDestroy() {
    instance = null
    super.onDestroy()
  }

  private fun route(d: Device): MediaRoute2Info {
    val b = MediaRoute2Info.Builder(d.id, d.name)
      .addFeature(FEATURE)
      .addFeature(MediaRoute2Info.FEATURE_REMOTE_PLAYBACK)
      .setVolumeHandling(if (d.id == active) MediaRoute2Info.PLAYBACK_VOLUME_VARIABLE else MediaRoute2Info.PLAYBACK_VOLUME_FIXED)
      .setVolumeMax(100)
      .setVolume(if (d.id == active) volume else 0)
      .setDescription(if (d.id == active) "Playing" else "Harmoni Link")
      .setConnectionState(if (d.id == active) MediaRoute2Info.CONNECTION_STATE_CONNECTED else MediaRoute2Info.CONNECTION_STATE_DISCONNECTED)
    if (Build.VERSION.SDK_INT >= 34) {
      b.setType(if (d.kind == "computer") MediaRoute2Info.TYPE_REMOTE_COMPUTER else if (d.kind == "tablet") MediaRoute2Info.TYPE_REMOTE_TABLET else MediaRoute2Info.TYPE_REMOTE_SPEAKER)
    }
    return b.build()
  }

  private fun session(d: Device): RoutingSessionInfo =
    RoutingSessionInfo.Builder(sessionId(d.id), packageName)
      .addSelectedRoute(d.id)
      .setName(d.name)
      .setVolumeHandling(MediaRoute2Info.PLAYBACK_VOLUME_VARIABLE)
      .setVolumeMax(100)
      .setVolume(volume)
      .apply { devices.filter { it.id != d.id }.forEach { addTransferableRoute(it.id) } }
      .build()

  fun publish() {
    val list = devices
    notifyRoutes(list.map { route(it) })
    val playing = active?.let { id -> list.find { it.id == id } }
    val was = current
    if (playing == null) {
      if (was != null) notifySessionReleased(sessionId(was))
      current = null
      sessionFor = null
      onSessionReady?.invoke(null)
      return
    }
    if (was != null && was != playing.id) notifySessionReleased(sessionId(was))
    if (was != playing.id) notifySessionCreated(REQUEST_ID_NONE, session(playing)) else notifySessionUpdated(session(playing))
    current = playing.id
    if (sessionFor != playing.id) {
      sessionFor = playing.id
      onSessionReady?.invoke(playing.id)
    }
  }

  override fun onCreateSession(requestId: Long, packageName: String, routeId: String, sessionHints: Bundle?) {
    val d = devices.find { it.id == routeId }
    if (d == null) {
      notifyRequestFailed(requestId, REASON_ROUTE_NOT_AVAILABLE)
      return
    }
    onTransfer?.invoke(routeId)
    current?.takeIf { it != routeId }?.let { notifySessionReleased(sessionId(it)) }
    current = routeId
    notifySessionCreated(requestId, session(d))
    sessionFor = routeId
    onSessionReady?.invoke(routeId)
  }

  override fun onReleaseSession(requestId: Long, sessionId: String) {
    val was = current
    current = null
    notifySessionReleased(sessionId)
    // Back to "This phone" in the switcher: play here.
    if (was != null && sessionId == sessionId(was)) onTransfer?.invoke(null)
  }

  override fun onTransferToRoute(requestId: Long, sessionId: String, routeId: String) {
    val d = devices.find { it.id == routeId }
    if (d == null) {
      notifyRequestFailed(requestId, REASON_ROUTE_NOT_AVAILABLE)
      return
    }
    onTransfer?.invoke(routeId)
  }

  override fun onSelectRoute(requestId: Long, sessionId: String, routeId: String) = notifyRequestFailed(requestId, REASON_INVALID_COMMAND)

  override fun onDeselectRoute(requestId: Long, sessionId: String, routeId: String) = notifyRequestFailed(requestId, REASON_INVALID_COMMAND)

  override fun onSetRouteVolume(requestId: Long, routeId: String, volume: Int) {
    if (routeId == active) setVolume(volume)
  }

  override fun onSetSessionVolume(requestId: Long, sessionId: String, volume: Int) = setVolume(volume)

  private fun setVolume(v: Int) {
    volume = v.coerceIn(0, 100)
    onVolume?.invoke(volume)
    publish()
  }
}
