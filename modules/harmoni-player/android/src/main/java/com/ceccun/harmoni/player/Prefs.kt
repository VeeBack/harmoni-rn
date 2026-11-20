package com.ceccun.harmoni.player

import android.content.Context

/**
 * Settings picked in the app that the player and downloads need even when the
 * app isn't running (a widget or Bluetooth resume, Android Auto, downloads in
 * the background), so they live here rather than in JS.
 */
object Prefs {
  private val sp by lazy { Core.app.getSharedPreferences("harmoni.settings", Context.MODE_PRIVATE) }

  /** Each setting and what it is until the person changes it. */
  val DEFAULTS = mapOf(
    "wifiOnlyDownloads" to true,
    "skipSilence" to false,
    "playAlongside" to false,
    "stopOnSwipe" to false,
    "mediaHeart" to true,
  )

  fun get(key: String): Boolean = sp.getBoolean(key, DEFAULTS[key] ?: false)
  fun set(key: String, on: Boolean) = sp.edit().putBoolean(key, on).apply()

  val wifiOnlyDownloads get() = get("wifiOnlyDownloads")
  val skipSilence get() = get("skipSilence")
  val playAlongside get() = get("playAlongside")
  val stopOnSwipe get() = get("stopOnSwipe")
  val mediaHeart get() = get("mediaHeart")
}
