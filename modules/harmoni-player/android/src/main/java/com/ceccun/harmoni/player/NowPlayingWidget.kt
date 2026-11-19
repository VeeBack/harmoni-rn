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
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.os.Build
import android.os.Bundle
import android.util.LruCache
import android.util.SizeF
import android.view.KeyEvent
import android.view.View
import android.widget.RemoteViews
import androidx.media3.common.Player
import java.net.HttpURLConnection
import java.net.URL

/**
 * Home screen widget. The album art is the widget: full bleed, melting into a
 * blurred, darkened copy of itself behind the title, with one play/pause button.
 * When it's wide, the blurred art fills it and the sharp cover sits on the left.
 * Play goes through Media3's MediaButtonReceiver, so it works with the app closed
 * (it resumes the saved queue).
 */
class NowPlayingWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    Core.init(context)
    lastShown = null
    refresh(context, PlaybackService.instance?.shownPlayer)
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, newOptions: Bundle) {
    Core.init(context)
    lastShown = null
    refresh(context, PlaybackService.instance?.shownPlayer)
  }

  companion object {
    private data class Shown(val title: String, val artist: String, val art: String?, val playing: Boolean, val hasSong: Boolean)

    /** Everything drawn from one cover: a full-bleed square, a wide backdrop and the rounded inset. */
    private class Art(val square: Bitmap, val wide: Bitmap, val inset: Bitmap)

    private val artCache = LruCache<String, Art>(4)
    @Volatile private var lastShown: Shown? = null

    fun refresh(context: Context, player: Player?) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, NowPlayingWidget::class.java))
      if (ids.isEmpty()) return

      val shown = if (player != null && player.mediaItemCount > 0) {
        val m = player.currentMediaItem?.mediaMetadata
        Shown(m?.title?.toString() ?: "", m?.artist?.toString() ?: "", m?.artworkUri?.toString(), player.playWhenReady, true)
      } else {
        val saved = QueueStore.load(context)
        val song = saved?.let { runCatching { org.json.JSONArray(it.queueJson).getJSONObject(it.index) }.getOrNull() }
        if (song != null) Shown(Core.songTitle(song), Core.songArtists(song), song.optStringOrNull("artworkUrl"), false, true)
        else Shown("Harmoni", "Tap to start listening", null, false, false)
      }
      if (shown == lastShown) return
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
      val views = if (Build.VERSION.SDK_INT >= 31) {
        RemoteViews(
          mapOf(
            // The launcher picks the biggest size that fits: covers for square-ish shapes, the wide layout for wide ones.
            SizeF(100f, 100f) to cover(context, s, art, compact = true),
            SizeF(170f, 170f) to cover(context, s, art, compact = false),
            SizeF(230f, 100f) to wide(context, s, art),
            SizeF(290f, 140f) to wide(context, s, art),
            SizeF(280f, 280f) to cover(context, s, art, compact = false),
          )
        )
      } else wide(context, s, art)
      for (id in ids) manager.updateAppWidget(id, views)
    }

    /** Square-ish sizes: the cover fills the widget. */
    private fun cover(context: Context, s: Shown, art: Art?, compact: Boolean): RemoteViews {
      val v = RemoteViews(context.packageName, R.layout.harmoni_widget_cover)
      if (art != null) v.setImageViewBitmap(R.id.harmoni_widget_bg, art.square) else v.setImageViewResource(R.id.harmoni_widget_bg, R.drawable.harmoni_widget_empty)
      common(context, v, s)
      v.setViewVisibility(R.id.harmoni_widget_artist, if (compact) View.GONE else View.VISIBLE)
      v.setTextViewTextSize(R.id.harmoni_widget_title, android.util.TypedValue.COMPLEX_UNIT_SP, if (compact) 14f else 17f)
      return v
    }

    /** Wide sizes: blurred cover behind, the sharp cover on the left. */
    private fun wide(context: Context, s: Shown, art: Art?): RemoteViews {
      val v = RemoteViews(context.packageName, R.layout.harmoni_widget_wide)
      if (art != null) {
        v.setImageViewBitmap(R.id.harmoni_widget_bg, art.wide)
        v.setImageViewBitmap(R.id.harmoni_widget_art, art.inset)
      } else {
        v.setImageViewResource(R.id.harmoni_widget_bg, R.drawable.harmoni_widget_empty)
        v.setImageViewResource(R.id.harmoni_widget_art, R.drawable.harmoni_widget_placeholder)
      }
      common(context, v, s)
      return v
    }

    private fun common(context: Context, v: RemoteViews, s: Shown) {
      v.setTextViewText(R.id.harmoni_widget_title, s.title)
      v.setTextViewText(R.id.harmoni_widget_artist, s.artist)
      v.setImageViewResource(R.id.harmoni_widget_play, if (s.playing) R.drawable.harmoni_pause else R.drawable.harmoni_play)
      v.setContentDescription(R.id.harmoni_widget_play, if (s.playing) "Pause" else "Play")
      v.setOnClickPendingIntent(R.id.harmoni_widget_play, button(context, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE))
      context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { launch ->
        launch.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        if (s.hasSong) launch.putExtra("harmoni.openPlayer", true)
        v.setOnClickPendingIntent(
          R.id.harmoni_widget_root,
          PendingIntent.getActivity(context, 10, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT),
        )
      }
    }

    private fun button(context: Context, keyCode: Int): PendingIntent {
      val intent = Intent(Intent.ACTION_MEDIA_BUTTON)
        .setComponent(ComponentName(context, androidx.media3.session.MediaButtonReceiver::class.java))
        .putExtra(Intent.EXTRA_KEY_EVENT, KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
      return PendingIntent.getBroadcast(context, keyCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun load(url: String): Art? = runCatching {
      val c = URL(Core.sizedArtwork(url, 600)).openConnection() as HttpURLConnection
      c.connectTimeout = 15_000
      c.readTimeout = 15_000
      c.setRequestProperty("User-Agent", Core.USER_AGENT)
      val bytes = c.inputStream.use { it.readBytes() }
      c.disconnect()
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
      var sample = 1
      while (bounds.outWidth / (sample * 2) >= 512) sample *= 2
      val raw = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
      val side = minOf(raw.width, raw.height, 512)
      val sharp = Bitmap.createScaledBitmap(centerCrop(raw), side, side, true)
      val blurred = blur(sharp)
      Art(square = coverComposite(sharp, blurred), wide = wideBackdrop(blurred), inset = round(Bitmap.createScaledBitmap(sharp, 300, 300, true), 300 * 0.1f))
    }.getOrNull()

    /** The full-bleed cover: sharp at the top, melting into its blurred, darker self behind the text. */
    private fun coverComposite(sharp: Bitmap, blurred: Bitmap): Bitmap {
      val s = sharp.width
      val out = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888)
      val c = Canvas(out)
      c.drawBitmap(sharp, 0f, 0f, null)
      // The blurred band, faded in from 40% to 66% of the height.
      val layer = c.saveLayer(0f, 0f, s.toFloat(), s.toFloat(), null)
      c.drawBitmap(blurred, null, Rect(0, 0, s, s), Paint(Paint.FILTER_BITMAP_FLAG))
      val mask = Paint().apply {
        shader = LinearGradient(0f, s * 0.40f, 0f, s * 0.66f, Color.TRANSPARENT, Color.BLACK, Shader.TileMode.CLAMP)
        xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN)
      }
      c.drawRect(0f, 0f, s.toFloat(), s.toFloat(), mask)
      c.restoreToCount(layer)
      // Deepen the bottom so white text always reads.
      c.drawRect(0f, 0f, s.toFloat(), s.toFloat(), Paint().apply {
        shader = LinearGradient(0f, s * 0.45f, 0f, s.toFloat(), Color.TRANSPARENT, Color.argb(150, 0, 0, 0), Shader.TileMode.CLAMP)
      })
      return out
    }

    /** The wide backdrop: the blurred cover cropped wide and dimmed a little. */
    private fun wideBackdrop(blurred: Bitmap): Bitmap {
      val w = 640
      val h = 280
      val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
      val c = Canvas(out)
      val bh = blurred.width * h / w
      val top = (blurred.height - bh) / 2
      c.drawBitmap(blurred, Rect(0, top, blurred.width, top + bh), Rect(0, 0, w, h), Paint(Paint.FILTER_BITMAP_FLAG))
      c.drawColor(Color.argb(60, 0, 0, 0))
      return out
    }

    /**
     * A soft blur without RenderScript: three box-blur passes (close to a Gaussian)
     * on a small copy, grown back with filtering. Saturation up and brightness down,
     * like iOS materials.
     */
    private fun blur(b: Bitmap): Bitmap {
      val n = 64
      val small = Bitmap.createScaledBitmap(b, n, n, true)
      val px = IntArray(n * n)
      small.getPixels(px, 0, n, 0, 0, n, n)
      repeat(3) { boxBlur(px, n, 5) }
      val blurredSmall = Bitmap.createBitmap(px, n, n, Bitmap.Config.ARGB_8888)
      val big = Bitmap.createScaledBitmap(blurredSmall, b.width, b.height, true)
      val out = Bitmap.createBitmap(b.width, b.height, Bitmap.Config.ARGB_8888)
      val m = ColorMatrix().apply { setSaturation(1.5f) }
      m.postConcat(ColorMatrix(floatArrayOf(0.72f, 0f, 0f, 0f, 0f, 0f, 0.72f, 0f, 0f, 0f, 0f, 0f, 0.72f, 0f, 0f, 0f, 0f, 0f, 1f, 0f)))
      Canvas(out).drawBitmap(big, 0f, 0f, Paint(Paint.FILTER_BITMAP_FLAG).apply { colorFilter = ColorMatrixColorFilter(m) })
      return out
    }

    /** One horizontal + vertical box blur pass, clamping at the edges. */
    private fun boxBlur(px: IntArray, n: Int, r: Int) {
      val tmp = IntArray(px.size)
      val d = 2 * r + 1
      for (pass in 0..1) {
        val src = if (pass == 0) px else tmp
        val dst = if (pass == 0) tmp else px
        for (line in 0 until n) {
          var ra = 0; var rr = 0; var rg = 0; var rb = 0
          for (k in -r..r) {
            val i = k.coerceIn(0, n - 1)
            val c = if (pass == 0) src[line * n + i] else src[i * n + line]
            ra += c ushr 24; rr += (c shr 16) and 0xff; rg += (c shr 8) and 0xff; rb += c and 0xff
          }
          for (i in 0 until n) {
            val idx = if (pass == 0) line * n + i else i * n + line
            dst[idx] = ((ra / d) shl 24) or ((rr / d) shl 16) or ((rg / d) shl 8) or (rb / d)
            val outI = (i - r).coerceIn(0, n - 1)
            val inI = (i + r + 1).coerceIn(0, n - 1)
            val co = if (pass == 0) src[line * n + outI] else src[outI * n + line]
            val ci = if (pass == 0) src[line * n + inI] else src[inI * n + line]
            ra += (ci ushr 24) - (co ushr 24)
            rr += ((ci shr 16) and 0xff) - ((co shr 16) and 0xff)
            rg += ((ci shr 8) and 0xff) - ((co shr 8) and 0xff)
            rb += (ci and 0xff) - (co and 0xff)
          }
        }
      }
    }

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

    /** The web app's artwork colour: a saturation-weighted mean of a 24×24 thumbnail. */
    fun weightedMean(b: Bitmap): Int {
      val small = Bitmap.createScaledBitmap(b, 24, 24, true)
      var rs = 0.0; var gs = 0.0; var bs = 0.0; var ws = 0.0
      for (y in 0 until 24) for (x in 0 until 24) {
        val c = small.getPixel(x, y)
        val r = (c shr 16) and 0xff; val g = (c shr 8) and 0xff; val bl = c and 0xff
        val max = maxOf(r, g, bl); val min = minOf(r, g, bl)
        val sat = if (max == 0) 0.0 else (max - min).toDouble() / max
        val w = 0.15 + sat * sat
        rs += r * w; gs += g * w; bs += bl * w; ws += w
      }
      return Color.rgb((rs / ws).toInt(), (gs / ws).toInt(), (bs / ws).toInt())
    }
  }
}
