@file:OptIn(UnstableApi::class)

package com.ceccun.harmoni.player

import android.app.Notification
import android.content.Context
import android.os.Handler
import android.os.Looper
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

/**
 * Songs saved for offline listening, in the same cache playback reads from.
 *
 * Media3 starts queued downloads in the order they were added, but a playlist is added
 * within a millisecond or two and that order doesn't survive a restart. So the queue is
 * kept here: every waiting song is held (stop reason [HOLD]) and has a place in line
 * ([seqs], saved in its own table), and only the next few are let go at a time. Asking
 * for songs puts them at the front, in the order asked, so whatever is on screen saves
 * top to bottom.
 */
object Downloads {
  const val CHANNEL = "downloads"
  const val NOTIFICATION_ID = 0x4d0d

  /** Waiting its turn (not stopped by anyone). */
  const val HOLD = 0x484f4c44
  private const val PARALLEL = 3
  /** Let go at once: the ones downloading and one ready to start, so the manager never idles. */
  private const val WINDOW = PARALLEL + 1

  val manager: DownloadManager by lazy {
    DownloadManager(Core.app, Core.databaseProvider, Core.downloadCache, Core.authedHttp, Executors.newFixedThreadPool(3)).apply {
      maxParallelDownloads = PARALLEL
      minRetryCount = 5
      requirements = Requirements(Requirements.NETWORK)
      addListener(lineListener)
    }
  }

  val notifications by lazy { DownloadNotificationHelper(Core.app, CHANNEL) }

  // The batch the notification counts: songs asked for since the queue was last empty.
  @Volatile var batchTotal = 0
  @Volatile var batchDone = 0
  @Volatile var batchFailed = 0

  // --- the line ---

  private const val TABLE = "HarmoniDownloadOrder"
  private val seqs = HashMap<String, Long>()
  private var front = -1L
  @Volatile private var loaded = false
  private val main = Handler(Looper.getMainLooper())

  private fun db() = Core.databaseProvider.writableDatabase

  private fun load() {
    if (loaded) return
    synchronized(seqs) {
      if (loaded) return
      runCatching {
        val d = db()
        d.execSQL("CREATE TABLE IF NOT EXISTS $TABLE (id TEXT PRIMARY KEY NOT NULL, seq INTEGER NOT NULL)")
        d.rawQuery("SELECT id, seq FROM $TABLE", null).use { c ->
          while (c.moveToNext()) seqs[c.getString(0)] = c.getLong(1)
        }
      }
      front = (seqs.values.minOrNull() ?: 0L) - 1
      loaded = true
    }
  }

  /** Puts `ids` at the front of the line, in this order. Returns their new places, to save. */
  private fun toFront(ids: List<String>): List<Pair<String, Long>> = synchronized(seqs) {
    val seen = LinkedHashSet(ids)
    var s = front - seen.size + 1
    front -= seen.size
    seen.map { id -> (id to s++).also { seqs[id] = it.second } }
  }

  private fun save(places: List<Pair<String, Long>>) {
    if (places.isEmpty()) return
    runCatching {
      val d = db()
      d.beginTransaction()
      try {
        val st = d.compileStatement("INSERT OR REPLACE INTO $TABLE (id, seq) VALUES (?, ?)")
        for ((id, seq) in places) {
          st.bindString(1, id)
          st.bindLong(2, seq)
          st.executeInsert()
          st.clearBindings()
        }
        d.setTransactionSuccessful()
      } finally {
        d.endTransaction()
      }
    }
  }

  private fun forget(id: String) {
    synchronized(seqs) { seqs.remove(id) }
    Core.io.execute { runCatching { db().delete(TABLE, "id = ?", arrayOf(id)) } }
  }

  private fun place(d: Download): Long = synchronized(seqs) { seqs[d.request.id] } ?: (Long.MAX_VALUE / 2 + d.startTimeMs)

  private fun waiting(d: Download) =
    d.state == Download.STATE_QUEUED || (d.state == Download.STATE_STOPPED && d.stopReason == HOLD)

  private val pumpNow = Runnable {
    if (!manager.isInitialized) return@Runnable
    load()
    val current = manager.currentDownloads
    val busy = current.count { it.state == Download.STATE_DOWNLOADING }
    val slots = (WINDOW - busy).coerceAtLeast(0)
    current.filter(::waiting).sortedBy(::place).forEachIndexed { i, d ->
      val want = if (i < slots) Download.STOP_REASON_NONE else HOLD
      if (d.stopReason != want) manager.setStopReason(d.request.id, want)
    }
  }

  /** Lets the next songs in line go (and holds back any let go out of turn). Settles, so calling it often is fine. */
  fun pump() {
    main.removeCallbacks(pumpNow)
    main.postDelayed(pumpNow, 40)
  }

  private val lineListener = object : DownloadManager.Listener {
    override fun onInitialized(downloadManager: DownloadManager) = pump()

    override fun onDownloadChanged(downloadManager: DownloadManager, download: Download, finalException: Exception?) {
      if (download.state == Download.STATE_COMPLETED || download.state == Download.STATE_FAILED) forget(download.request.id)
      // Also when one is added (held), or something else moved: the next pass lines it up.
      pump()
    }

    override fun onDownloadRemoved(downloadManager: DownloadManager, download: Download) {
      forget(download.request.id)
      pump()
    }
  }

  /** Moves these songs, if they're waiting, to the front of the line in this order (what's on screen). */
  fun prioritize(ids: List<String>) {
    if (ids.isEmpty()) return
    load()
    main.post {
      val waitingIds = manager.currentDownloads.filter(::waiting).mapTo(HashSet()) { it.request.id }
      val mine = ids.filter { it in waitingIds }
      if (mine.isEmpty()) return@post
      val places = toFront(mine)
      Core.io.execute { save(places) }
      pump()
    }
  }

  /**
   * Adds songs, held, and puts them (and any of them already waiting) at the front of the
   * line in the order given. Big lists come in chunks, last chunk first, so they line up.
   */
  fun addAll(context: Context, songs: List<JSONObject>) {
    if (songs.isEmpty()) return
    load()
    val known = HashSet<String>()
    val waitingIds = HashSet<String>()
    runCatching {
      manager.downloadIndex.getDownloads().use { c ->
        while (c.moveToNext()) {
          val d = c.download
          val stopped = d.state == Download.STATE_STOPPED && d.stopReason != HOLD
          if (d.state != Download.STATE_FAILED && !stopped) known += d.request.id
          if (waiting(d)) waitingIds += d.request.id
        }
      }
    }
    var added = 0
    val ids = ArrayList<String>(songs.size)
    for (song in songs) {
      val id = song.optString("id")
      if (id.isEmpty()) continue
      if (!known.add(id)) {
        if (id in waitingIds) ids += id
        continue
      }
      ids += id
      val request = DownloadRequest.Builder(id, Core.playUri(id))
        .setCustomCacheKey(id)
        .setData(song.toString().toByteArray())
        .build()
      manager.addDownload(request, HOLD)
      added++
    }
    // New ones and ones already waiting go to the front (saved or downloading ones need no place).
    save(toFront(ids))
    pump()
    if (added == 0) return
    synchronized(this) {
      if (manager.currentDownloads.none { it.state == Download.STATE_DOWNLOADING || waiting(it) }) {
        batchTotal = 0; batchDone = 0; batchFailed = 0
      }
      batchTotal += added
    }
    runCatching { DownloadService.start(context, HarmoniDownloadService::class.java) }
      .onFailure { runCatching { DownloadService.startForeground(context, HarmoniDownloadService::class.java) } }
  }

  fun remove(context: Context, id: String) =
    DownloadService.sendRemoveDownload(context, HarmoniDownloadService::class.java, id, false)

  fun removeAll(context: Context) {
    synchronized(seqs) { seqs.clear(); front = -1L }
    Core.io.execute { runCatching { db().delete(TABLE, null, null) } }
    DownloadService.sendRemoveAllDownloads(context, HarmoniDownloadService::class.java, false)
  }

  /** A held download is just queued, to everyone outside. */
  fun stateOf(d: Download) = if (d.state == Download.STATE_STOPPED && d.stopReason == HOLD) "queued" else stateName(d.state)

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
    .put("state", stateOf(d))
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
    val waiting = downloads.count {
      it.state == Download.STATE_QUEUED || it.state == Download.STATE_RESTARTING || (it.state == Download.STATE_STOPPED && it.stopReason == Downloads.HOLD)
    }
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
