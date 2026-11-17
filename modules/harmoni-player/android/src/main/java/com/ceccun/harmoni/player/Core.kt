@file:OptIn(UnstableApi::class)

package com.ceccun.harmoni.player

import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.NoOpCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.Collections
import java.util.concurrent.Executors

/** Process-wide pieces shared by the module, the playback service, downloads and the widget. */
object Core {
  private const val TAG = "HarmoniCore"
  const val USER_AGENT = "Harmoni-Android/1.0"

  lateinit var app: Context
    private set

  val io = Executors.newFixedThreadPool(3)
  /** Token and small JS-facing calls, so they never wait behind slow network work on [io]. */
  val quick = Executors.newCachedThreadPool()

  fun init(context: Context) {
    if (!::app.isInitialized) app = context.applicationContext
  }

  val databaseProvider by lazy { StandaloneDatabaseProvider(app) }

  /** Downloaded songs live here, keyed by song id, never evicted. */
  val downloadCache by lazy { SimpleCache(File(app.filesDir, "downloads"), NoOpCacheEvictor(), databaseProvider) }

  fun apiBase(): String? = AuthStore.get(app)?.apiBase

  fun playUri(songId: String): Uri = Uri.parse("${apiBase() ?: ""}/play/$songId")

  private val http by lazy {
    DefaultHttpDataSource.Factory()
      .setUserAgent(USER_AGENT)
      .setConnectTimeoutMs(30_000)
      .setReadTimeoutMs(30_000)
      .setAllowCrossProtocolRedirects(false)
  }

  /** HTTP with a fresh bearer token added to every request to this server. */
  val authedHttp: DataSource.Factory by lazy {
    ResolvingDataSource.Factory(http) { spec ->
      val base = apiBase()
      if (base != null && spec.uri.toString().startsWith(base)) {
        val token = AuthStore.freshToken(app)
        if (token != null) spec.withAdditionalHeaders(mapOf("Authorization" to "Bearer $token")) else spec
      } else spec
    }
  }

  /** Playback reads downloaded songs from disk first, then streams from the server. */
  val playbackDataSource: DataSource.Factory by lazy {
    CacheDataSource.Factory()
      .setCache(downloadCache)
      .setUpstreamDataSourceFactory(authedHttp)
      .setCacheWriteDataSinkFactory(null)
      .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
  }

  fun isDownloaded(songId: String): Boolean = runCatching {
    Downloads.manager.downloadIndex.getDownload(songId)?.state == androidx.media3.exoplayer.offline.Download.STATE_COMPLETED
  }.getOrDefault(false)

  // --- songs as media items ---

  fun songTitle(o: JSONObject) = o.optString("title", "")

  fun songArtists(o: JSONObject): String {
    val a = o.optJSONArray("artists") ?: return ""
    return (0 until a.length()).mapNotNull { a.optJSONObject(it)?.optString("name") }.filter { it.isNotEmpty() }.joinToString(", ")
  }

  fun itemFor(song: JSONObject): MediaItem {
    val id = song.getString("id")
    val raw = song.toString()
    val art = song.optString("artworkUrl", "")
    val meta = MediaMetadata.Builder()
      .setTitle(songTitle(song))
      .setArtist(songArtists(song))
      .setAlbumTitle(song.optJSONObject("album")?.optString("title"))
      .setArtworkUri(if (art.isNotEmpty()) Uri.parse(art) else null)
      .setDurationMs(if (song.has("durationMs")) song.optLong("durationMs") else null)
      .setIsPlayable(true)
      .setIsBrowsable(false)
      .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
      .setExtras(Bundle().apply { putString("song", raw) })
      .build()
    return MediaItem.Builder()
      .setMediaId(id)
      .setUri(playUri(id))
      .setCustomCacheKey(id)
      .setMediaMetadata(meta)
      .build()
  }

  /** Songs from JSON; entries that aren't songs (no id) are skipped rather than crashing. */
  fun itemsFor(json: String): List<MediaItem> {
    val a = JSONArray(json)
    return (0 until a.length()).mapNotNull { i ->
      runCatching { itemFor(a.getJSONObject(i)) }.getOrNull()
    }
  }

  /** Gives an item that came through a MediaController (which strips the URI) its URI back. */
  fun resolve(item: MediaItem): MediaItem {
    if (item.localConfiguration != null) return item
    val raw = item.mediaMetadata.extras?.getString("song")
    if (raw != null) return itemFor(JSONObject(raw))
    return item.buildUpon().setUri(playUri(item.mediaId)).setCustomCacheKey(item.mediaId).build()
  }

  fun songJson(item: MediaItem?): String? = item?.mediaMetadata?.extras?.getString("song")

  // --- likes, for the notification's heart ---

  val liked: MutableSet<String> = Collections.synchronizedSet(HashSet())
  @Volatile var onLikedChanged: ((String, Boolean) -> Unit)? = null

  /** Like or unlike from outside the app (notification). Calls the server itself. */
  fun toggleLikeRemotely(songId: String) {
    val nowLiked = !liked.contains(songId)
    if (nowLiked) liked.add(songId) else liked.remove(songId)
    onLikedChanged?.invoke(songId, nowLiked)
    io.execute {
      val (code, body) = api(if (nowLiked) "PUT" else "DELETE", "/likes/$songId")
      if (code !in 200..299) {
        Log.w(TAG, "like failed: $code $body")
        if (nowLiked) liked.remove(songId) else liked.add(songId)
        onLikedChanged?.invoke(songId, !nowLiked)
      }
    }
  }

  /** A small blocking JSON API call with auth and one retry after a 401. */
  fun api(method: String, path: String, body: String? = null, extraHeaders: Map<String, String> = emptyMap()): Pair<Int, String> {
    val base = apiBase() ?: return 0 to ""
    var token = AuthStore.freshToken(app) ?: return 401 to ""
    repeat(2) { attempt ->
      val c = URL(base + path).openConnection() as HttpURLConnection
      try {
        c.requestMethod = method
        c.connectTimeout = 20_000
        c.readTimeout = 30_000
        c.setRequestProperty("Authorization", "Bearer $token")
        c.setRequestProperty("User-Agent", USER_AGENT)
        extraHeaders.forEach { (k, v) -> c.setRequestProperty(k, v) }
        if (body != null) {
          c.doOutput = true
          c.setRequestProperty("Content-Type", "application/json")
          c.outputStream.use { it.write(body.toByteArray()) }
        }
        val code = c.responseCode
        if (code == 401 && attempt == 0) {
          token = AuthStore.refreshAfter(app, token) ?: return 401 to ""
          return@repeat
        }
        val stream = if (code in 200..299) c.inputStream else c.errorStream
        val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
        return code to text
      } catch (e: Exception) {
        return 0 to (e.message ?: "")
      } finally {
        c.disconnect()
      }
    }
    return 401 to ""
  }

  /** Asks the server to fetch and cache a song ahead of time (one byte back). */
  fun warm(songId: String) {
    if (isDownloaded(songId)) return
    val base = apiBase() ?: return
    io.execute {
      runCatching {
        val token = AuthStore.freshToken(app) ?: return@runCatching
        val c = URL("$base/play/$songId").openConnection() as HttpURLConnection
        try {
          c.connectTimeout = 20_000
          c.readTimeout = 30_000
          c.setRequestProperty("Authorization", "Bearer $token")
          c.setRequestProperty("User-Agent", USER_AGENT)
          c.setRequestProperty("Range", "bytes=0-0")
          // One byte is enough; the server caches the rest. Some answers send the whole song, so don't read it.
          if (c.responseCode in 200..299) c.inputStream.use { it.read() }
        } finally {
          c.disconnect()
        }
      }
    }
  }
}
