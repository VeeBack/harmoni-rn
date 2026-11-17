package com.ceccun.harmoni.player

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The signed-in session, kept natively so playback, downloads and the widget can
 * get a fresh token without the JS side being awake. Tokens are encrypted with
 * an Android Keystore key. Refreshes are serialised (one at a time) and the
 * rotated refresh token is written (commit, not apply) before it's handed out.
 */
object AuthStore {
  private const val TAG = "HarmoniAuth"
  private const val PREFS = "harmoni_session"
  private const val KEY = "session"
  private const val ALIAS = "harmoni_session_key"

  data class Session(
    val server: String,
    val issuer: String,
    val apiBase: String,
    val tokenEndpoint: String,
    val revocationEndpoint: String,
    val clientId: String,
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: Long,
  ) {
    fun toJson(): JSONObject = JSONObject()
      .put("server", server).put("issuer", issuer).put("apiBase", apiBase)
      .put("tokenEndpoint", tokenEndpoint).put("revocationEndpoint", revocationEndpoint)
      .put("clientId", clientId).put("accessToken", accessToken)
      .put("refreshToken", refreshToken).put("expiresAt", expiresAt)

    companion object {
      fun fromJson(o: JSONObject) = Session(
        server = o.getString("server"),
        issuer = o.getString("issuer"),
        apiBase = o.getString("apiBase").trimEnd('/'),
        tokenEndpoint = o.getString("tokenEndpoint"),
        revocationEndpoint = o.optString("revocationEndpoint", ""),
        clientId = o.getString("clientId"),
        accessToken = o.getString("accessToken"),
        refreshToken = o.getString("refreshToken"),
        expiresAt = o.getLong("expiresAt"),
      )
    }
  }

  @Volatile private var session: Session? = null
  @Volatile private var loaded = false
  private val lock = Any()

  /** Called (on any thread) when the server says the sign-in is over. */
  @Volatile var onSignedOut: (() -> Unit)? = null

  fun get(context: Context): Session? {
    if (!loaded) synchronized(lock) {
      if (!loaded) {
        session = read(context)
        loaded = true
      }
    }
    return session
  }

  fun set(context: Context, s: Session) = synchronized(lock) {
    write(context, s)
    session = s
    loaded = true
  }

  fun clear(context: Context) = synchronized(lock) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit()
    session = null
    loaded = true
  }

  /** A token that's good for at least another minute, refreshing if needed. Blocking. */
  fun freshToken(context: Context): String? {
    val s = get(context) ?: return null
    if (s.expiresAt - System.currentTimeMillis() > 60_000) return s.accessToken
    return synchronized(lock) {
      val now = session ?: return null
      if (now.expiresAt - System.currentTimeMillis() > 60_000) now.accessToken else refreshLocked(context, now)
    }
  }

  /** After a 401: refresh unless someone already replaced the token that failed. Blocking. */
  fun refreshAfter(context: Context, failed: String?): String? {
    get(context) ?: return null
    return synchronized(lock) {
      val now = session ?: return null
      if (failed != null && now.accessToken != failed) now.accessToken else refreshLocked(context, now)
    }
  }

  private fun refreshLocked(context: Context, s: Session): String? {
    try {
      val body = form("grant_type" to "refresh_token", "refresh_token" to s.refreshToken, "client_id" to s.clientId)
      val (code, text) = post(s.tokenEndpoint, body)
      if (code == 200) {
        val t = JSONObject(text)
        val next = s.copy(
          accessToken = t.getString("access_token"),
          refreshToken = t.optString("refresh_token", s.refreshToken),
          expiresAt = System.currentTimeMillis() + t.optLong("expires_in", 3600) * 1000,
        )
        write(context, next) // the rotated refresh token is saved before anything else
        session = next
        return next.accessToken
      }
      val error = runCatching { JSONObject(text).optString("error") }.getOrNull()
      if (code == 400 && (error == "invalid_grant" || error == "invalid_client")) {
        Log.w(TAG, "refresh refused ($error): signed out")
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit()
        session = null
        onSignedOut?.invoke()
        return null
      }
      Log.w(TAG, "refresh failed: $code $text")
    } catch (e: Exception) {
      Log.w(TAG, "refresh failed", e)
    }
    return s.accessToken // offline or server trouble: keep what we have
  }

  /** Revokes the sign-in (best effort) and forgets it. Blocking. */
  fun revoke(context: Context) {
    val s = get(context)
    clear(context)
    if (s == null || s.revocationEndpoint.isEmpty()) return
    runCatching { post(s.revocationEndpoint, form("token" to s.refreshToken, "client_id" to s.clientId)) }
  }

  private fun form(vararg pairs: Pair<String, String>) =
    pairs.joinToString("&") { (k, v) -> "$k=${URLEncoder.encode(v, "UTF-8")}" }

  private fun post(url: String, body: String): Pair<Int, String> {
    val c = URL(url).openConnection() as HttpURLConnection
    try {
      c.requestMethod = "POST"
      c.connectTimeout = 20_000
      c.readTimeout = 20_000
      c.doOutput = true
      c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
      c.setRequestProperty("Accept", "application/json")
      c.outputStream.use { it.write(body.toByteArray()) }
      val code = c.responseCode
      val stream = if (code in 200..299) c.inputStream else c.errorStream
      val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
      return code to text
    } finally {
      c.disconnect()
    }
  }

  // --- encrypted storage ---

  private fun key(): SecretKey {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (ks.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
    val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    gen.init(
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build()
    )
    return gen.generateKey()
  }

  private fun write(context: Context, s: Session) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key())
    val ct = cipher.doFinal(s.toJson().toString().toByteArray())
    val value = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP)
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, value).commit()
  }

  private fun read(context: Context): Session? = try {
    val value = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
    if (value == null) null else {
      val (iv, ct) = value.split(":").map { Base64.decode(it, Base64.NO_WRAP) }
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
      Session.fromJson(JSONObject(String(cipher.doFinal(ct))))
    }
  } catch (e: Exception) {
    Log.w(TAG, "couldn't read the saved session", e)
    null
  }
}
