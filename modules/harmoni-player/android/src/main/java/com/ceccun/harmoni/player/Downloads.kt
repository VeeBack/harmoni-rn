@file:OptIn(UnstableApi::class)

package com.ceccun.harmoni.player

import android.app.Notification
import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadNotificationHelper
import androidx.media3.exoplayer.offline.DownloadRequest
import androidx.media3.exoplayer.offline.DownloadService
import androidx.media3.exoplayer.scheduler.Requirements
import androidx.media3.exoplayer.scheduler.Scheduler
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/** Songs saved for offline listening, in the same cache playback reads from. */
object Downloads {
  const val CHANNEL = "downloads"
  const val NOTIFICATION_ID = 0x4d0d

  val manager: DownloadManager by lazy {
    DownloadManager(Core.app, Core.databaseProvider, Core.downloadCache, Core.authedHttp, Executors.newFixedThreadPool(3)).apply {
      maxParallelDownloads = 3
      minRetryCount = 5
      requirements = Requirements(Requirements.NETWORK)
    }
  }

  val notifications by lazy { DownloadNotificationHelper(Core.app, CHANNEL) }

  // The batch the notification counts: songs asked for since the queue was last empty.
  @Volatile var batchTotal = 0
  @Volatile var batchDone = 0
  @Volatile var batchFailed = 0

  /** Adds many songs at once: straight to the manager (no intent per song), then starts the service once. */
  fun addAll(context: Context, songs: List<JSONObject>) {
    if (songs.isEmpty()) return
    val known = HashSet<String>()
    runCatching {
      manager.downloadIndex.getDownloads().use { c ->
        while (c.moveToNext()) {
          val d = c.download
          if (d.state != Download.STATE_FAILED && d.state != Download.STATE_STOPPED) known += d.request.id
        }
      }
    }
    var added = 0
    for (song in songs) {
      val id = song.optString("id")
      if (id.isEmpty() || !known.add(id)) continue
      val request = DownloadRequest.Builder(id, Core.playUri(id))
        .setCustomCacheKey(id)
        .setData(song.toString().toByteArray())
        .build()
      manager.addDownload(request)
      added++
    }
    if (added == 0) return
    synchronized(this) {
      if (manager.currentDownloads.none { it.state == Download.STATE_DOWNLOADING || it.state == Download.STATE_QUEUED }) {
        batchTotal = 0; batchDone = 0; batchFailed = 0
      }
      batchTotal += added
    }
    runCatching { DownloadService.start(context, HarmoniDownloadService::class.java) }
      .onFailure { runCatching { DownloadService.startForeground(context, HarmoniDownloadService::class.java) } }
  }

  fun remove(context: Context, id: String) =
    DownloadService.sendRemoveDownload(context, HarmoniDownloadService::class.java, id, false)

  fun removeAll(context: Context) =
    DownloadService.sendRemoveAllDownloads(context, HarmoniDownloadService::class.java, false)

  fun stateName(state: Int) = when (state) {
    Download.STATE_QUEUED -> "queued"
    Download.STATE_DOWNLOADING -> "downloading"
    Download.STATE_COMPLETED -> "done"
    Download.STATE_FAILED -> "failed"
    Download.STATE_REMOVING -> "removing"
    Download.STATE_RESTARTING -> "queued"
    Download.STATE_STOPPED -> "stopped"
    else -> "queued"
  }

  fun describe(d: Download, withSong: Boolean): JSONObject = JSONObject()
    .put("id", d.request.id)
    .put("state", stateName(d.state))
    .put("percent", if (d.percentDownloaded >= 0) d.percentDownloaded.toDouble() else 0.0)
    .put("bytes", d.bytesDownloaded)
    .put("updatedAt", d.updateTimeMs)
    .apply { if (withSong) put("song", runCatching { JSONObject(String(d.request.data)) }.getOrNull()) }

  fun all(): String {
    val out = JSONArray()
    manager.downloadIndex.getDownloads().use { c ->
      while (c.moveToNext()) out.put(describe(c.download, true))
    }
    return out.toString()
  }

  fun active(): List<Download> = manager.currentDownloads
}

class HarmoniDownloadService : DownloadService(
  Downloads.NOTIFICATION_ID,
  DEFAULT_FOREGROUND_NOTIFICATION_UPDATE_INTERVAL,
  Downloads.CHANNEL,
  R.string.harmoni_downloads_channel,
  0,
) {
  override fun onCreate() {
    Core.init(this)
    super.onCreate()
    Downloads.manager.addListener(counter)
  }

  override fun onDestroy() {
    Downloads.manager.removeListener(counter)
    super.onDestroy()
  }

  private val counter = object : DownloadManager.Listener {
    override fun onDownloadChanged(manager: DownloadManager, download: Download, finalException: Exception?) {
      when (download.state) {
        Download.STATE_COMPLETED -> Downloads.batchDone++
        Download.STATE_FAILED -> { Downloads.batchDone++; Downloads.batchFailed++ }
      }
    }
  }

  override fun getDownloadManager(): DownloadManager = Downloads.manager

  override fun getScheduler(): Scheduler? = null

  private val countFormat = java.text.NumberFormat.getIntegerInstance()

  /**
   * One steady progress bar for the whole batch: songs finished out of songs asked for,
   * plus how far the ones in flight have got. (Media3's default averages only the
   * downloads in flight, so it jumps around and sits near 0% for big batches.)
   */
  override fun getForegroundNotification(downloads: MutableList<Download>, notMetRequirements: Int): Notification {
    val inFlight = downloads.filter { it.state == Download.STATE_DOWNLOADING }
    val waiting = downloads.count { it.state == Download.STATE_QUEUED || it.state == Download.STATE_RESTARTING }
    val remaining = inFlight.size + waiting
    val total = maxOf(Downloads.batchTotal, Downloads.batchDone + remaining)
    val done = (total - remaining).coerceAtLeast(0)
    val partial = inFlight.sumOf { (it.percentDownloaded.coerceIn(0f, 100f) / 100f).toDouble() }
    val fraction = if (total > 0) ((done + partial) / total).coerceIn(0.0, 1.0) else 0.0
    val title = if (total == 1) "Saving 1 song for offline" else "Saving songs for offline"
    val text = when {
      notMetRequirements != 0 -> "Waiting for a connection"
      total > 1 -> "${countFormat.format(done)} of ${countFormat.format(total)}"
      else -> inFlight.firstOrNull()?.let { runCatching { org.json.JSONObject(String(it.request.data)).optString("title") }.getOrNull() } ?: ""
    }
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      android.app.PendingIntent.getActivity(this, 2, it, android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT)
    }
    return androidx.core.app.NotificationCompat.Builder(this, Downloads.CHANNEL)
      .setSmallIcon(R.drawable.harmoni_stat)
      .setContentTitle(title)
      .setContentText(text)
      .setProgress(1000, (fraction * 1000).toInt(), total == 0 || (done == 0 && partial == 0.0 && inFlight.isEmpty()))
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setSilent(true)
      .setCategory(androidx.core.app.NotificationCompat.CATEGORY_PROGRESS)
      .setForegroundServiceBehavior(androidx.core.app.NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .setContentIntent(open)
      .build()
  }
}
