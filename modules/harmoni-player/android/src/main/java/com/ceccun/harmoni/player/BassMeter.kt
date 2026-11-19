@file:OptIn(UnstableApi::class)

package com.ceccun.harmoni.player

import android.os.SystemClock
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.ForwardingAudioSink
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * How hard the bass is hitting right now, for the Now Playing backdrop.
 *
 * Sits between the audio renderer and the real sink. Every decoded buffer is measured
 * once as it goes by (low-passed at 150 Hz, RMS every 1/60 s) and kept with its
 * presentation time; the sink's own clock then says which of those is coming out of
 * the speaker now, so the backdrop moves with what you hear, not with what was
 * decoded half a second earlier. Unlike Visualizer it needs no microphone permission.
 */
class BassMeter(sink: AudioSink) : ForwardingAudioSink(sink) {
  companion object {
    /** The main player's meter (the crossfade's outgoing player has none). */
    @Volatile var current: BassMeter? = null
      private set
    private const val SIZE = 1024
    private const val CUTOFF = 150.0
  }

  private val lock = Any()
  private val times = LongArray(SIZE)
  private val values = FloatArray(SIZE)
  private var head = 0
  private var count = 0

  @Volatile private var nowUs = Long.MIN_VALUE
  @Volatile private var nowAtUs = 0L
  @Volatile private var playing = false

  private var rate = 44100
  private var channels = 2
  private var encoding = C.ENCODING_PCM_16BIT
  private var lastPts = Long.MIN_VALUE

  // A two-pole Butterworth low-pass, transposed direct form II.
  private var b0 = 0.0
  private var b1 = 0.0
  private var b2 = 0.0
  private var a1 = 0.0
  private var a2 = 0.0
  private var z1 = 0.0
  private var z2 = 0.0

  // The current window, and the loudest the bass has been lately (to scale to 0..1).
  private var acc = 0.0
  private var accN = 0
  private var hop = 735
  private var windowStartUs = 0L
  private var peak = 0.02

  init {
    current = this
  }

  override fun configure(config: AudioSink.AudioSinkConfig) {
    val f = config.format
    if (f.sampleRate > 0) rate = f.sampleRate
    if (f.channelCount > 0) channels = f.channelCount
    encoding = f.pcmEncoding
    hop = max(64, rate / 60)
    design()
    reset0()
    super.configure(config)
  }

  private fun design() {
    val w0 = 2 * PI * CUTOFF / rate
    val alpha = sin(w0) / (2 * 0.7071)
    val c = cos(w0)
    val a0 = 1 + alpha
    b0 = (1 - c) / 2 / a0
    b1 = (1 - c) / a0
    b2 = (1 - c) / 2 / a0
    a1 = -2 * c / a0
    a2 = (1 - alpha) / a0
  }

  private fun reset0() {
    z1 = 0.0
    z2 = 0.0
    acc = 0.0
    accN = 0
    lastPts = Long.MIN_VALUE
    synchronized(lock) {
      head = 0
      count = 0
    }
  }

  override fun handleBuffer(buffer: ByteBuffer, presentationTimeUs: Long, encodedAccessUnitCount: Int): Boolean {
    // The renderer hands the same buffer over again until the sink has taken all of it.
    if (presentationTimeUs != lastPts) {
      lastPts = presentationTimeUs
      try {
        measure(buffer, presentationTimeUs)
      } catch (_: Throwable) {
        // Never let the meter get in the way of playback.
      }
    }
    return super.handleBuffer(buffer, presentationTimeUs, encodedAccessUnitCount)
  }

  private fun measure(buffer: ByteBuffer, ptsUs: Long) {
    val bytes = when (encoding) {
      C.ENCODING_PCM_16BIT -> 2
      C.ENCODING_PCM_FLOAT -> 4
      else -> return
    }
    val b = buffer.duplicate().order(ByteOrder.nativeOrder())
    val start = b.position()
    val frameBytes = bytes * channels
    val frames = (b.limit() - start) / frameBytes
    if (frames <= 0) return
    windowStartUs = ptsUs
    var frameInWindow = 0
    for (i in 0 until frames) {
      var x = 0.0
      val at = start + i * frameBytes
      for (ch in 0 until channels) {
        x += if (bytes == 2) b.getShort(at + ch * 2) / 32768.0 else b.getFloat(at + ch * 4).toDouble()
      }
      x /= channels
      val y = b0 * x + z1
      z1 = b1 * x - a1 * y + z2
      z2 = b2 * x - a2 * y
      acc += y * y
      accN++
      frameInWindow++
      if (accN >= hop) {
        val rms = sqrt(acc / accN)
        peak = max(rms, max(0.02, peak * 0.9985))
        val t = windowStartUs + (frameInWindow - accN).toLong() * 1_000_000L / rate
        push(t, min(1.0, rms / peak).toFloat())
        acc = 0.0
        accN = 0
      }
    }
  }

  private fun push(t: Long, v: Float) {
    synchronized(lock) {
      times[head] = t
      values[head] = v
      head = (head + 1) % SIZE
      if (count < SIZE) count++
    }
  }

  /** 0..1: the bass coming out of the speaker now; 0 when paused or not playing here. */
  fun level(): Float {
    if (!playing || nowUs == Long.MIN_VALUE) return 0f
    val ahead = min(250_000L, SystemClock.elapsedRealtimeNanos() / 1000 - nowAtUs)
    val t = nowUs + max(0L, ahead)
    synchronized(lock) {
      var i = (head - 1 + SIZE) % SIZE
      for (n in 0 until count) {
        if (times[i] <= t) return if (t - times[i] < 120_000L) values[i] else 0f
        i = (i - 1 + SIZE) % SIZE
      }
    }
    return 0f
  }

  /**
   * The bass for the next `n` steps of `stepUs` from now, as it will come out of the speaker:
   * the UI can play it out frame by frame however rarely it asks. -1 past what's decoded yet;
   * all 0 when paused.
   */
  fun window(n: Int, stepUs: Long): FloatArray {
    val out = FloatArray(n)
    if (!playing || nowUs == Long.MIN_VALUE) return out
    val ahead = min(250_000L, SystemClock.elapsedRealtimeNanos() / 1000 - nowAtUs)
    val t0 = nowUs + max(0L, ahead)
    synchronized(lock) {
      if (count == 0) return out
      var idx = (head - count + SIZE) % SIZE
      var j = 0
      for (k in 0 until n) {
        val t = t0 + k * stepUs
        while (j + 1 < count && times[(idx + 1) % SIZE] <= t) {
          idx = (idx + 1) % SIZE
          j++
        }
        out[k] = when {
          times[idx] > t -> 0f
          t - times[idx] < 120_000L -> values[idx]
          j == count - 1 -> -1f
          else -> 0f
        }
      }
    }
    return out
  }

  override fun getCurrentPositionUs(sourceEnded: Boolean): Long {
    val p = super.getCurrentPositionUs(sourceEnded)
    if (p != AudioSink.CURRENT_POSITION_NOT_SET) {
      nowUs = p
      nowAtUs = SystemClock.elapsedRealtimeNanos() / 1000
    }
    return p
  }

  override fun play() {
    playing = true
    super.play()
  }

  override fun pause() {
    playing = false
    super.pause()
  }

  override fun flush() {
    reset0()
    nowUs = Long.MIN_VALUE
    super.flush()
  }

  override fun reset() {
    playing = false
    reset0()
    super.reset()
  }

  override fun release() {
    if (current === this) current = null
    super.release()
  }
}
