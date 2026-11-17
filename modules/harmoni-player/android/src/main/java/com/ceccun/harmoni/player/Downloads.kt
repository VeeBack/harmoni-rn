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

  fun add(context: Context, song: JSONObject) {
    val id = song.getString("id")
    val request = DownloadRequest.Builder(id, Core.playUri(id))
      .setCustomCacheKey(id)
      .setData(song.toString().toByteArray())
      .build()
    DownloadService.sendAddDownload(context, HarmoniDownloadService::class.java, request, false)
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
  }

  override fun getDownloadManager(): DownloadManager = Downloads.manager

  override fun getScheduler(): Scheduler? = null

  override fun getForegroundNotification(downloads: MutableList<Download>, notMetRequirements: Int): Notification {
    val n = downloads.count { it.state == Download.STATE_DOWNLOADING || it.state == Download.STATE_QUEUED }
    val message = if (n == 1) "Saving 1 song" else "Saving $n songs"
    return Downloads.notifications.buildProgressNotification(
      this, R.drawable.harmoni_stat, null, message, downloads, notMetRequirements
    )
  }
}
