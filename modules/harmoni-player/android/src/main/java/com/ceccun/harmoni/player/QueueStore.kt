package com.ceccun.harmoni.player

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Remembers the queue on disk so playback can resume without the app open
 * (widget, headset button, the system's "resume" card after a reboot).
 */
object QueueStore {
  data class Saved(val queueJson: String, val index: Int, val positionMs: Long, val repeat: Int)

  private fun file(context: Context) = File(context.filesDir, "queue.json")

  @Volatile private var lastQueueJson: String? = null

  /** Snapshot on the main thread, write in the background. */
  fun save(context: Context, player: Player) {
    val items = (0 until player.mediaItemCount).map { player.getMediaItemAt(it) }
    val queue = queueJson(items)
    val index = player.currentMediaItemIndex
    val pos = player.currentPosition
    val repeat = player.repeatMode
    lastQueueJson = queue
    Core.io.execute {
      runCatching {
        val o = JSONObject().put("queue", JSONArray(queue)).put("index", index).put("positionMs", pos).put("repeat", repeat)
        val f = file(context)
        val tmp = File(f.path + ".tmp")
        tmp.writeText(o.toString())
        tmp.renameTo(f)
      }
    }
  }

  fun queueJson(items: List<MediaItem>): String =
    items.mapNotNull { Core.songJson(it) }.joinToString(",", "[", "]")

  fun load(context: Context): Saved? = runCatching {
    val o = JSONObject(file(context).readText())
    val q = o.getJSONArray("queue")
    if (q.length() == 0) null
    else Saved(q.toString(), o.optInt("index", 0).coerceIn(0, q.length() - 1), o.optLong("positionMs", 0), o.optInt("repeat", 0))
  }.getOrNull()

  fun clear(context: Context) {
    lastQueueJson = null
    file(context).delete()
  }
}
