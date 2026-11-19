package com.ceccun.harmoni.player

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Updates from GitHub Releases, for people who installed the APK themselves. JS finds the
 * release; this downloads its APK (resuming where it left off, checking the SHA-256 GitHub
 * publishes) and gives it to Android's package installer, which replaces the app in place.
 */
object Updater {
  const val ACTION_STATUS = "com.ceccun.harmoni.player.UPDATE_STATUS"
  private const val PREFS = "harmoni_updater"
  private const val CHANNEL = "updates"
  private const val NOTIFICATION_ID = 0x4d0e

  /** Progress and results, for JS. Called from any thread. */
  @Volatile var onEvent: ((Map<String, Any?>) -> Unit)? = null

  /** The latest event, so a screen that opens mid-download knows where things are. */
  @Volatile var last: Map<String, Any?> = mapOf("state" to "idle")
    private set

  private val lock = Any()
  private var worker: Thread? = null
  private var workerVersion: String? = null
  @Volatile private var stopped = false

  private fun emit(e: Map<String, Any?>) {
    last = e
    onEvent?.invoke(e)
  }

  private fun dir(ctx: Context) = File(ctx.cacheDir, "updates").apply { mkdirs() }
  private fun apk(ctx: Context, version: String) = File(dir(ctx), "harmoni-$version.apk")

  /** The downloaded APK for `version`, if it's here. Only a checked download gets this name. */
  fun ready(ctx: Context, version: String): String? = apk(ctx, version).takeIf { it.isFile }?.absolutePath

  /** Whether the connection costs money (mobile data, a hotspot): downloads wait for Wi-Fi then. */
  fun metered(ctx: Context): Boolean =
    ctx.getSystemService(ConnectivityManager::class.java)?.isActiveNetworkMetered ?: true

  /** The app that installed Harmoni (a store, Obtainium, the package installer), or null. */
  fun installer(ctx: Context): String? = runCatching {
    if (Build.VERSION.SDK_INT >= 30) ctx.packageManager.getInstallSourceInfo(ctx.packageName).installingPackageName
    else @Suppress("DEPRECATION") ctx.packageManager.getInstallerPackageName(ctx.packageName)
  }.getOrNull()

  fun download(ctx: Context, url: String, version: String, sha256: String?, size: Long) {
    synchronized(lock) {
      val previous = worker
      if (previous?.isAlive == true) {
        if (workerVersion == version) return
        stopped = true
      }
      workerVersion = version
      worker = Thread({
        previous?.join()
        stopped = false
        run(ctx.applicationContext, url, version, sha256, size)
      }, "harmoni-update").apply {
        priority = Thread.MIN_PRIORITY
        start()
      }
    }
  }

  fun cancel() {
    stopped = true
  }

  private fun run(ctx: Context, url: String, version: String, sha256: String?, size: Long) {
    val out = apk(ctx, version)
    if (out.isFile) return emit(mapOf("state" to "ready", "version" to version, "path" to out.absolutePath))
    val part = File(dir(ctx), "harmoni-$version.apk.part")
    // Only this version's partial download is worth keeping.
    dir(ctx).listFiles()?.forEach { if (it.name != part.name) it.delete() }

    var attempt = 0
    while (true) {
      try {
        if (!(size > 0 && part.length() == size)) fetch(url, part, size, version)
        break
      } catch (e: Exception) {
        if (stopped) return emit(mapOf("state" to "idle"))
        if (++attempt >= 4) {
          return emit(mapOf("state" to "failed", "version" to version, "message" to "Couldn't download the update. Check your connection and try again."))
        }
        SystemClock.sleep(2_000L * attempt)
      }
    }
    if (stopped) return emit(mapOf("state" to "idle"))

    emit(mapOf("state" to "verifying", "version" to version))
    val digest = runCatching { sha256Of(part) }.getOrNull()
    if (digest == null || (sha256 != null && !digest.equals(sha256, ignoreCase = true))) {
      part.delete()
      return emit(mapOf("state" to "failed", "version" to version, "message" to "The download came through damaged. Try again."))
    }
    if (!part.renameTo(out)) {
      return emit(mapOf("state" to "failed", "version" to version, "message" to "Couldn't save the update. Is your phone's storage full?"))
    }
    emit(mapOf("state" to "ready", "version" to version, "path" to out.absolutePath))
  }

  private fun fetch(url: String, part: File, size: Long, version: String) {
    var have = if (part.isFile) part.length() else 0L
    if (size > 0 && have > size) {
      part.delete()
      have = 0
    }
    val c = (URL(url).openConnection() as HttpURLConnection).apply {
      connectTimeout = 15_000
      readTimeout = 30_000
      instanceFollowRedirects = true
      setRequestProperty("Accept", "application/octet-stream")
      if (have > 0) setRequestProperty("Range", "bytes=$have-")
    }
    try {
      val code = c.responseCode
      if (code !in 200..299) throw IOException("HTTP $code")
      val append = code == 206
      if (!append) have = 0
      val length = c.contentLengthLong
      val total = if (length > 0) (if (append) have + length else length) else size
      c.inputStream.use { input ->
        FileOutputStream(part, append).use { output ->
          val buf = ByteArray(64 * 1024)
          var lastEmit = 0L
          while (true) {
            if (stopped) throw IOException("Stopped")
            val n = input.read(buf)
            if (n < 0) break
            output.write(buf, 0, n)
            have += n
            val now = SystemClock.elapsedRealtime()
            if (now - lastEmit >= 200) {
              lastEmit = now
              emit(mapOf("state" to "downloading", "version" to version, "received" to have.toDouble(), "total" to total.toDouble()))
            }
          }
        }
      }
      emit(mapOf("state" to "downloading", "version" to version, "received" to have.toDouble(), "total" to total.toDouble()))
      if (total > 0 && have < total) throw IOException("Connection closed early")
    } finally {
      c.disconnect()
    }
  }

  private fun sha256Of(file: File): String {
    val md = MessageDigest.getInstance("SHA-256")
    FileInputStream(file).use { input ->
      val buf = ByteArray(256 * 1024)
      while (true) {
        val n = input.read(buf)
        if (n < 0) break
        md.update(buf, 0, n)
      }
    }
    return md.digest().joinToString("") { "%02x".format(it) }
  }

  // --- installing ---

  /** Whether Android lets Harmoni install apps ("Install unknown apps", asked once). */
  fun canInstall(ctx: Context) = ctx.packageManager.canRequestPackageInstalls()

  /**
   * Opens the "Install unknown apps" switch for Harmoni. From the activity when there is one,
   * so Back comes back to Harmoni rather than to wherever Android's Settings app was left.
   */
  fun openInstallPermission(ctx: Context): Boolean = try {
    val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}"))
    if (ctx !is android.app.Activity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    ctx.startActivity(intent)
    true
  } catch (_: Exception) {
    false
  }

  /**
   * Hands the APK to the package installer. Android asks the person to confirm (unless
   * Harmoni installed the version on the phone itself, from Android 12), then closes the
   * app, replaces it and keeps everything in it: sign-in, downloads, settings.
   */
  fun install(ctx: Context, path: String, version: String): String {
    val file = File(path)
    if (!file.isFile) return "missing"
    if (!canInstall(ctx)) return "permission"
    emit(mapOf("state" to "installing", "version" to version, "path" to path))
    val installer = ctx.packageManager.packageInstaller
    // Sessions from an earlier try that never finished.
    installer.mySessions.forEach { runCatching { installer.abandonSession(it.sessionId) } }
    val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
      setAppPackageName(ctx.packageName)
      setSize(file.length())
      setInstallReason(PackageManager.INSTALL_REASON_USER)
      if (Build.VERSION.SDK_INT >= 31) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
    }
    val id = installer.createSession(params)
    return try {
      installer.openSession(id).use { session ->
        FileInputStream(file).use { input ->
          session.openWrite("base.apk", 0, file.length()).use { output ->
            input.copyTo(output, 256 * 1024)
            session.fsync(output)
          }
        }
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("installing", version).apply()
        val status = Intent(ctx, UpdateReceiver::class.java).setAction(ACTION_STATUS).putExtra("version", version).putExtra("path", path)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
        session.commit(PendingIntent.getBroadcast(ctx, id, status, flags).intentSender)
      }
      "started"
    } catch (e: Exception) {
      runCatching { installer.abandonSession(id) }
      emit(mapOf("state" to "failed", "version" to version, "path" to path, "message" to "Couldn't start the update: ${e.message ?: "unknown error"}"))
      "failed"
    }
  }

  internal fun onStatus(ctx: Context, intent: Intent) {
    val version = intent.getStringExtra("version")
    val path = intent.getStringExtra("path")
    when (val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
      PackageInstaller.STATUS_PENDING_USER_ACTION -> {
        val confirm = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
        else @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_INTENT)
        if (confirm != null) {
          confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          runCatching { ctx.startActivity(confirm) }
        }
        emit(mapOf("state" to "confirming", "version" to version, "path" to path))
      }
      PackageInstaller.STATUS_SUCCESS -> emit(mapOf("state" to "installed", "version" to version))
      else -> {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove("installing").apply()
        if (status == PackageInstaller.STATUS_FAILURE_ABORTED) {
          // They tapped Cancel: the download is still here for later.
          emit(mapOf("state" to "ready", "version" to version, "path" to path, "cancelled" to true))
        } else {
          val message = when (status) {
            PackageInstaller.STATUS_FAILURE_CONFLICT -> "This update is signed differently from the Harmoni on your phone, so Android won't install it over it."
            PackageInstaller.STATUS_FAILURE_INCOMPATIBLE -> "This update doesn't work on your phone."
            PackageInstaller.STATUS_FAILURE_STORAGE -> "There isn't enough space on your phone for the update."
            PackageInstaller.STATUS_FAILURE_BLOCKED -> "Your phone blocked the update."
            else -> "The update didn't install."
          }
          emit(mapOf("state" to "failed", "version" to version, "path" to path, "message" to message, "detail" to intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)))
        }
      }
    }
  }

  /**
   * Runs in the new version, straight after Android replaced the app. Installing closes
   * Harmoni and Android doesn't reopen it, so when the update came from here, say it's
   * done with a notification that opens the app.
   */
  internal fun onReplaced(ctx: Context) {
    val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val wanted = prefs.getString("installing", null) ?: return
    prefs.edit().remove("installing").putString("updated", wanted).apply()
    runCatching { dir(ctx).deleteRecursively() }
    val nm = NotificationManagerCompat.from(ctx)
    if (!nm.areNotificationsEnabled()) return
    val version = runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull() ?: wanted
    ctx.getSystemService(NotificationManager::class.java)?.createNotificationChannel(
      NotificationChannel(CHANNEL, "Updates", NotificationManager.IMPORTANCE_HIGH).apply { description = "When Harmoni has updated itself" },
    )
    val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) ?: return
    val open = PendingIntent.getActivity(ctx, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val n = NotificationCompat.Builder(ctx, CHANNEL)
      .setSmallIcon(R.drawable.harmoni_stat)
      .setContentTitle("Harmoni is up to date")
      .setContentText("Version $version is ready. Tap to open.")
      .setContentIntent(open)
      .setAutoCancel(true)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setTimeoutAfter(10 * 60_000L)
      .build()
    runCatching { nm.notify(NOTIFICATION_ID, n) }
  }

  /** The version this app updated itself to, once (for a "you're up to date" note on the next launch). */
  fun takeUpdated(ctx: Context): String? {
    val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val current = runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull()
    // "installing" too, in case Android didn't tell the new version it had replaced the old one.
    // Either way both go: an install that hadn't happened by the time the app starts again didn't happen.
    val v = prefs.getString("updated", null) ?: prefs.getString("installing", null)?.takeIf { it == current }
    prefs.edit().remove("updated").remove("installing").apply()
    if (v == null) return null
    NotificationManagerCompat.from(ctx).cancel(NOTIFICATION_ID)
    return v
  }
}

class UpdateReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Updater.ACTION_STATUS -> Updater.onStatus(context, intent)
      Intent.ACTION_MY_PACKAGE_REPLACED -> Updater.onReplaced(context)
    }
  }
}
