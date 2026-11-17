package com.ceccun.harmoni.player

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RectF
import android.os.Build
import android.os.Bundle
import android.util.LruCache
import android.util.SizeF
import android.view.KeyEvent
import android.widget.RemoteViews
import androidx.media3.common.Player
import androidx.palette.graphics.Palette
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Home screen widget: artwork, title, artist and transport controls, tinted
 * with a colour from the artwork. Buttons go through Media3's
 * MediaButtonReceiver, so play works even when the app isn't running (it
 * resumes the saved queue).
 */
class NowPlayingWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    Core.init(context)
    refresh(context, PlaybackService.instance?.player)
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, newOptions: Bundle) {
    Core.init(context)
    refresh(context, PlaybackService.instance?.player)
  }

  companion object {
    private data class Shown(val title: String, val artist: String, val art: String?, val playing: Boolean, val hasSong: Boolean)
    private data class Art(val bitmap: Bitmap, val tint: Int)

    private val artCache = LruCache<String, Art>(8)
    @Volatile private var lastShown: Shown? = null

    fun refresh(context: Context, player: Player?) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, NowPlayingWidget::class.java))
      if (ids.isEmpty()) return

      val shown = if (player != null && player.mediaItemCount > 0) {
        val m = player.currentMediaItem?.mediaMetadata
        Shown(
          m?.title?.toString() ?: "",
          m?.artist?.toString() ?: "",
          m?.artworkUri?.toString(),
          player.playWhenReady,
          true,
        )
      } else {
        val saved = QueueStore.load(context)
        val song = saved?.let { runCatching { org.json.JSONArray(it.queueJson).getJSONObject(it.index) }.getOrNull() }
        if (song != null) Shown(Core.songTitle(song), Core.songArtists(song), song.optStringOrNull("artworkUrl"), false, true)
        else Shown("Harmoni", "Tap to start listening", null, false, false)
      }
      if (shown == lastShown && player != null) return
      lastShown = shown

      val cached = shown.art?.let { artCache.get(it) }
      render(context, manager, ids, shown, cached)
      if (shown.art != null && cached == null) {
        Core.io.execute {
          val art = load(shown.art) ?: return@execute
          artCache.put(shown.art, art)
          if (lastShown == shown) render(context, manager, ids, shown, art)
        }
      }
    }

    private fun render(context: Context, manager: AppWidgetManager, ids: IntArray, s: Shown, art: Art?) {
      val wide = views(context, R.layout.harmoni_widget_wide, s, art)
      val views = if (Build.VERSION.SDK_INT >= 31) {
        val small = views(context, R.layout.harmoni_widget_small, s, art)
        RemoteViews(mapOf(SizeF(100f, 100f) to small, SizeF(220f, 100f) to wide))
      } else wide
      for (id in ids) manager.updateAppWidget(id, views)
    }

    private fun views(context: Context, layout: Int, s: Shown, art: Art?): RemoteViews {
      val v = RemoteViews(context.packageName, layout)
      v.setTextViewText(R.id.harmoni_widget_title, s.title)
      v.setTextViewText(R.id.harmoni_widget_artist, s.artist)
      if (art != null) v.setImageViewBitmap(R.id.harmoni_widget_art, art.bitmap)
      else v.setImageViewResource(R.id.harmoni_widget_art, R.drawable.harmoni_widget_placeholder)
      v.setInt(R.id.harmoni_widget_bg, "setColorFilter", art?.tint ?: Color.parseColor("#1b1b1b"))
      v.setImageViewResource(R.id.harmoni_widget_play, if (s.playing) R.drawable.harmoni_pause else R.drawable.harmoni_play)
      v.setContentDescription(R.id.harmoni_widget_play, if (s.playing) "Pause" else "Play")

      v.setOnClickPendingIntent(R.id.harmoni_widget_play, button(context, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE))
      v.setOnClickPendingIntent(R.id.harmoni_widget_next, button(context, KeyEvent.KEYCODE_MEDIA_NEXT))
      v.setOnClickPendingIntent(R.id.harmoni_widget_prev, button(context, KeyEvent.KEYCODE_MEDIA_PREVIOUS))
      context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { launch ->
        launch.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        if (s.hasSong) launch.putExtra("harmoni.openPlayer", true)
        v.setOnClickPendingIntent(
          R.id.harmoni_widget_root,
          PendingIntent.getActivity(context, 10, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT),
        )
      }
      return v
    }

    private fun button(context: Context, keyCode: Int): PendingIntent {
      val intent = Intent(Intent.ACTION_MEDIA_BUTTON)
        .setComponent(ComponentName(context, androidx.media3.session.MediaButtonReceiver::class.java))
        .putExtra(Intent.EXTRA_KEY_EVENT, KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
      return PendingIntent.getBroadcast(context, keyCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun load(url: String): Art? = runCatching {
      val c = URL(url).openConnection() as HttpURLConnection
      c.connectTimeout = 15_000
      c.readTimeout = 15_000
      c.setRequestProperty("User-Agent", Core.USER_AGENT)
      val bytes = c.inputStream.use { it.readBytes() }
      c.disconnect()
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
      var sample = 1
      while (bounds.outWidth / (sample * 2) >= 320) sample *= 2
      val raw = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
        ?: return null
      val size = minOf(raw.width, raw.height, 320)
      val square = Bitmap.createScaledBitmap(centerCrop(raw), size, size, true)
      val palette = Palette.from(square).generate()
      val swatch = palette.darkMutedSwatch ?: palette.mutedSwatch ?: palette.darkVibrantSwatch ?: palette.dominantSwatch
      Art(round(square, size * 0.09f), darken(swatch?.rgb ?: Color.parseColor("#1b1b1b")))
    }.getOrNull()

    private fun centerCrop(b: Bitmap): Bitmap {
      val s = minOf(b.width, b.height)
      return Bitmap.createBitmap(b, (b.width - s) / 2, (b.height - s) / 2, s, s)
    }

    private fun round(b: Bitmap, r: Float): Bitmap {
      val out = Bitmap.createBitmap(b.width, b.height, Bitmap.Config.ARGB_8888)
      val c = Canvas(out)
      val p = Paint(Paint.ANTI_ALIAS_FLAG)
      c.drawRoundRect(RectF(0f, 0f, b.width.toFloat(), b.height.toFloat()), r, r, p)
      p.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
      c.drawBitmap(b, 0f, 0f, p)
      return out
    }

    /** Keeps the tint dark enough for the cream text on it. */
    private fun darken(color: Int): Int {
      val hsv = FloatArray(3)
      Color.colorToHSV(color, hsv)
      hsv[2] = minOf(hsv[2], 0.32f)
      hsv[1] = minOf(hsv[1], 0.55f)
      return Color.HSVToColor(hsv)
    }
  }
}
