@file:OptIn(UnstableApi::class)

package com.ceccun.harmoni.player

import android.net.Uri
import android.os.Bundle
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.offline.Download
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * The library as Android Auto (and other media browsers) see it: Recently
 * Played, Liked Songs, Playlists and Downloads. Calls are blocking; the
 * service runs them off the main thread.
 */
object Library {
  const val ROOT = "root"
  private const val RECENT = "recent"
  private const val LIKED = "liked"
  private const val PLAYLISTS = "playlists"
  private const val DOWNLOADS = "downloads"
  private const val PLAYLIST = "playlist:"
  /** Playable browse items: "aa|<parent>|<index>". Resolved to the whole list when played. */
  private const val SONG = "aa|"

  /** The songs last listed for each parent, so tapping one can queue the rest. */
  private val lists = ConcurrentHashMap<String, List<JSONObject>>()

  fun root(): MediaItem = folder(ROOT, "Harmoni", MediaMetadata.MEDIA_TYPE_FOLDER_MIXED)

  private fun folder(id: String, title: String, type: Int, art: String? = null, subtitle: String? = null): MediaItem =
    MediaItem.Builder()
      .setMediaId(id)
      .setMediaMetadata(
        MediaMetadata.Builder()
          .setTitle(title)
          .setSubtitle(subtitle)
          .setArtworkUri(art?.let { Uri.parse(it) })
          .setIsBrowsable(true)
          .setIsPlayable(false)
          .setMediaType(type)
          .build()
      )
      .build()

  private fun songItem(parent: String, index: Int, song: JSONObject): MediaItem {
    val base = Core.itemFor(song)
    return MediaItem.Builder()
      .setMediaId("$SONG$parent|$index")
      .setMediaMetadata(base.mediaMetadata)
      .build()
  }

  fun item(id: String): MediaItem? = when {
    id == ROOT -> root()
    id.startsWith(SONG) -> resolveOne(id)
    else -> null
  }

  fun children(parent: String): List<MediaItem> {
    if (AuthStore.get(Core.app) == null) return emptyList()
    return when {
      parent == ROOT -> listOf(
        folder(RECENT, "Recently Played", MediaMetadata.MEDIA_TYPE_FOLDER_MIXED),
        folder(LIKED, "Liked Songs", MediaMetadata.MEDIA_TYPE_FOLDER_PLAYLISTS),
        folder(PLAYLISTS, "Playlists", MediaMetadata.MEDIA_TYPE_FOLDER_PLAYLISTS),
        folder(DOWNLOADS, "Downloads", MediaMetadata.MEDIA_TYPE_FOLDER_MIXED),
      )
      parent == RECENT -> songs(parent, fetchSongs("/plays?limit=50"))
      parent == LIKED -> songs(parent, fetchSongs("/likes").take(300))
      parent == DOWNLOADS -> songs(parent, downloaded())
      parent == PLAYLISTS -> {
        val (code, body) = Core.api("GET", "/playlists")
        if (code != 200) emptyList()
        else JSONArray(body).let { a ->
          (0 until a.length()).map { i ->
            val p = a.getJSONObject(i)
            val arts = p.optJSONArray("artworks")
            folder(
              PLAYLIST + p.getString("id"),
              p.optString("name"),
              MediaMetadata.MEDIA_TYPE_PLAYLIST,
              if (arts != null && arts.length() > 0) arts.getString(0) else null,
              "${p.optInt("count")} songs",
            )
          }
        }
      }
      parent.startsWith(PLAYLIST) -> {
        val (code, body) = Core.api("GET", "/playlists/${parent.removePrefix(PLAYLIST)}")
        if (code != 200) emptyList()
        else {
          val items = JSONObject(body).optJSONArray("items") ?: JSONArray()
          songs(parent, (0 until items.length()).mapNotNull { items.getJSONObject(it).optJSONObject("song") })
        }
      }
      else -> emptyList()
    }
  }

  fun search(query: String): List<MediaItem> {
    val (code, body) = Core.api("GET", "/search?q=${Uri.encode(query)}")
    if (code != 200) return emptyList()
    val results = JSONObject(body).optJSONArray("results") ?: return emptyList()
    return songs("search", (0 until results.length()).map { results.getJSONObject(it) })
  }

  private fun songs(parent: String, list: List<JSONObject>): List<MediaItem> {
    lists[parent] = list
    return list.mapIndexed { i, s -> songItem(parent, i, s) }
  }

  private fun fetchSongs(path: String): List<JSONObject> {
    val (code, body) = Core.api("GET", path)
    if (code != 200) return emptyList()
    val a = JSONArray(body)
    return (0 until a.length()).map { a.getJSONObject(it) }
  }

  private fun downloaded(): List<JSONObject> = runCatching {
    val out = mutableListOf<Pair<Long, JSONObject>>()
    Downloads.manager.downloadIndex.getDownloads(Download.STATE_COMPLETED).use { c ->
      while (c.moveToNext()) {
        val d = c.download
        runCatching { JSONObject(String(d.request.data)) }.getOrNull()?.let { out += d.updateTimeMs to it }
      }
    }
    out.sortedByDescending { it.first }.map { it.second }
  }.getOrDefault(emptyList())

  private fun parse(id: String): Pair<String, Int>? {
    val rest = id.removePrefix(SONG)
    val cut = rest.lastIndexOf('|')
    if (cut < 0) return null
    return rest.substring(0, cut) to (rest.substring(cut + 1).toIntOrNull() ?: return null)
  }

  private fun resolveOne(id: String): MediaItem? {
    val (parent, index) = parse(id) ?: return null
    val song = lists[parent]?.getOrNull(index) ?: return null
    return Core.itemFor(song)
  }

  /**
   * When a browser plays one song from a list, queue the whole list from there.
   * Returns null for anything that isn't one of our browse items.
   */
  fun expand(items: List<MediaItem>): Pair<List<MediaItem>, Int>? {
    if (items.size != 1 || !items[0].mediaId.startsWith(SONG)) return null
    val (parent, index) = parse(items[0].mediaId) ?: return null
    val list = lists[parent] ?: return null
    if (index !in list.indices) return null
    // Keep it to the same 500-song window the app uses.
    val from = maxOf(0, minOf(index - 20, list.size - 500))
    val window = list.subList(from, minOf(list.size, from + 500))
    return window.map { Core.itemFor(it) } to (index - from)
  }

  fun extras(): Bundle = Bundle()
}
