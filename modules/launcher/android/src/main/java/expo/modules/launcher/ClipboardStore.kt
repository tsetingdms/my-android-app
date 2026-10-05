package expo.modules.launcher

import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import android.text.Html
import android.util.AtomicFile
import androidx.core.content.FileProvider
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.math.max

/** Hands clipboard pictures to other apps, one grant per send/copy (never exported). */
class ClipFileProvider : FileProvider()

/**
 * Clipboard history for the edge panel, kept only on this phone (files/clipboard, excluded from backups).
 *
 * Android 10+ lets an app read the clipboard only while it has focus, so the launcher saves the
 * current clip whenever the home screen comes back to the front (and when the clip changes while
 * it's in front). Pictures arrive as content URIs that stop working once the clip changes, so they
 * are copied right away. Apps can also send text and pictures here with Share → "Lumo clipboard"
 * ([ClipShareActivity]).
 */
internal object ClipboardStore {
  private const val PREFS = "lumo_clipboard"
  private const val KEY_ENABLED = "enabled"
  private const val KEY_KEEP_HOURS = "keep_hours"
  private const val KEY_STAMP = "last_stamp"
  private const val INDEX = "index.json"
  private const val MAX_ITEMS = 30
  private const val MAX_TEXT = 100_000
  private const val MAX_READ_BYTES = 40L * 1024 * 1024
  private const val MAX_RAW_BYTES = 8L * 1024 * 1024
  private const val MAX_RAW_SIDE = 4096
  private const val SCALED_SIDE = 2560

  // ClipDescription.EXTRA_IS_SENSITIVE (Android 13+): set by password managers and other apps for secrets.
  private const val EXTRA_IS_SENSITIVE = "android.content.extra.IS_SENSITIVE"

  class Clip(
    val id: String,
    val kind: String,
    var text: String?,
    val file: String?,
    val width: Int,
    val height: Int,
    val hash: String?,
    var time: Long,
    var pinned: Boolean,
  )

  private val io = Executors.newSingleThreadExecutor()
  private var items: MutableList<Clip>? = null

  /** Called from any thread whenever the list changes. */
  @Volatile
  var onChange: (() -> Unit)? = null

  fun authority(context: Context) = "${context.packageName}.clipfiles"

  private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun dir(c: Context) = File(c.filesDir, "clipboard").apply { mkdirs() }

  fun isEnabled(context: Context) = prefs(context).getBoolean(KEY_ENABLED, false)

  private fun keepMillis(c: Context): Long {
    val hours = prefs(c).getInt(KEY_KEEP_HOURS, 24)
    return if (hours <= 0) 0L else hours * 3_600_000L
  }

  private fun notifyChanged() {
    try {
      onChange?.invoke()
    } catch (e: Exception) {
      // The JS side may be reloading.
    }
  }

  fun setOptions(context: Context, enabled: Boolean, keepHours: Int) {
    val c = context.applicationContext
    prefs(c).edit().putBoolean(KEY_ENABLED, enabled).putInt(KEY_KEEP_HOURS, keepHours).apply()
    // "Lumo clipboard" shows up in the Share menu only while the feature is on.
    try {
      val pm = c.packageManager
      val component = ComponentName(c, ClipShareActivity::class.java)
      val state = if (enabled) {
        PackageManager.COMPONENT_ENABLED_STATE_DEFAULT
      } else {
        PackageManager.COMPONENT_ENABLED_STATE_DISABLED
      }
      if (pm.getComponentEnabledSetting(component) != state) {
        pm.setComponentEnabledSetting(component, state, PackageManager.DONT_KILL_APP)
      }
    } catch (e: Exception) {
      // Not fatal: the share entry just stays as it was.
    }
    io.execute {
      // Turning the clipboard off deletes what it saved; pinned items stay.
      if (!enabled) {
        clear(c)
      } else if (prune(c)) {
        notifyChanged()
      }
      cleanup(c)
    }
  }

  // region Capture

  /** Saves the current clip if it is new. Must run while the launcher window has focus. */
  fun capture(context: Context) {
    val c = context.applicationContext
    if (!isEnabled(c)) return
    val manager = c.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
    // The description doesn't trigger Android 12+'s "pasted from your clipboard" notice, so it
    // is used to skip clips that were already saved.
    val description = try {
      manager.primaryClipDescription
    } catch (e: Exception) {
      null
    } ?: return
    val stamp = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) description.timestamp else 0L
    val p = prefs(c)
    if (stamp != 0L && stamp == p.getLong(KEY_STAMP, 0L)) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N &&
      description.extras?.getBoolean(EXTRA_IS_SENSITIVE, false) == true
    ) {
      p.edit().putLong(KEY_STAMP, stamp).apply()
      return
    }
    val clip = try {
      manager.primaryClip
    } catch (e: Exception) {
      null
    } ?: return
    p.edit().putLong(KEY_STAMP, stamp).apply()
    if (clip.itemCount == 0) return
    val item = clip.getItemAt(0)

    val uri = item.uri
    if (uri != null) {
      val type = try {
        c.contentResolver.getType(uri)
      } catch (e: Exception) {
        null
      }
      if (type?.startsWith("image/") == true || description.hasMimeType("image/*")) {
        io.execute { addImage(c, uri) }
        return
      }
    }
    val text = item.text?.toString() ?: item.htmlText?.let { htmlToText(it) }
    if (!text.isNullOrBlank() && !looksSecret(text)) io.execute { addText(c, text) }
  }

  /**
   * Copied passwords, PINs and one-time codes are never saved (most password apps only mark their
   * copies as sensitive on Android 13+). Secret-looking means: a 4–8 digit code (spaces or a dash
   * allowed), or 8–64 characters without spaces mixing at least three of lower case, upper case,
   * digits and symbols — except links, e-mail addresses, @handles and #tags. Sharing something to
   * "Lumo clipboard" on purpose still saves it.
   */
  fun looksSecret(raw: String): Boolean {
    val text = raw.trim()
    if (text.length <= 10) {
      val compact = text.filter { it != ' ' && it != '-' }
      if (compact.length in 4..8 && compact.all { it in '0'..'9' }) return true
    }
    if (text.length !in 8..64 || text.any { it.isWhitespace() }) return false
    if (text.contains("://") || text.startsWith("www.", ignoreCase = true)) return false
    if (text.startsWith("@") || text.startsWith("#")) return false
    if (EMAIL.matches(text)) return false
    var kinds = 0
    if (text.any { it.isLowerCase() }) kinds++
    if (text.any { it.isUpperCase() }) kinds++
    if (text.any { it.isDigit() }) kinds++
    if (text.any { !it.isLetterOrDigit() }) kinds++
    return kinds >= 3
  }

  private val EMAIL = Regex("^[^@\\s]+@[^@\\s]+\\.[A-Za-z]{2,}$")

  private fun htmlToText(html: String): String {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      Html.fromHtml(html, Html.FROM_HTML_MODE_LEGACY).toString().trim()
    } else {
      @Suppress("DEPRECATION")
      Html.fromHtml(html).toString().trim()
    }
  }

  fun addText(context: Context, raw: String): Boolean {
    val c = context.applicationContext
    val text = raw.take(MAX_TEXT)
    if (text.isBlank()) return false
    synchronized(this) {
      val list = load(c)
      val existing = list.firstOrNull { it.kind == "text" && it.text == text }
      if (existing != null) {
        moveToTop(existing)
      } else {
        list.add(0, Clip(newId(), "text", text, null, 0, 0, null, System.currentTimeMillis(), false))
      }
      save(c)
    }
    prune(c)
    notifyChanged()
    return true
  }

  /** Copies a picture into the clipboard folder. Call off the main thread. */
  fun addImage(context: Context, uri: Uri): Boolean {
    val c = context.applicationContext
    // Only content URIs (with a grant from the sending app); never file paths.
    if (uri.scheme != "content") return false
    // "10@authority" addresses the same provider (for that Android user), so judge the bare authority.
    val authority = uri.authority?.substringAfterLast('@') ?: return false
    if (authority == authority(c)) {
      // One of our own items coming back (after "Copy").
      val name = uri.lastPathSegment ?: return false
      return touchFile(c, name)
    }
    // Never read our own providers on someone else's behalf: they could point at private files.
    if (authority == c.packageName || authority.startsWith("${c.packageName}.")) return false
    val owner = try {
      c.packageManager.resolveContentProvider(authority, 0)?.packageName
    } catch (e: Exception) {
      null
    }
    if (owner == c.packageName) return false

    val dir = dir(c)
    val tmp = File(dir, "incoming-${System.nanoTime()}.tmp")
    try {
      val digest = MessageDigest.getInstance("SHA-1")
      var size = 0L
      val input = c.contentResolver.openInputStream(uri) ?: return false
      input.use { stream ->
        FileOutputStream(tmp).use { out ->
          val buffer = ByteArray(64 * 1024)
          while (true) {
            val n = stream.read(buffer)
            if (n < 0) break
            size += n
            if (size > MAX_READ_BYTES) throw IllegalArgumentException("Picture is too big")
            digest.update(buffer, 0, n)
            out.write(buffer, 0, n)
          }
        }
      }
      val hash = digest.digest().joinToString("") { "%02x".format(it) }

      // The same picture again: just bring it to the top.
      val duplicate = synchronized(this) {
        load(c).firstOrNull { it.hash == hash }?.also {
          moveToTop(it)
          save(c)
        }
      }
      if (duplicate != null) {
        tmp.delete()
        notifyChanged()
        return true
      }

      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(tmp.path, bounds)
      if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
        tmp.delete()
        return false
      }
      val ext = when (bounds.outMimeType) {
        "image/jpeg" -> "jpg"
        "image/png" -> "png"
        "image/webp" -> "webp"
        else -> null
      }
      val id = newId()
      val file: File
      val width: Int
      val height: Int
      val keepOriginal = ext != null &&
        exifRotation(tmp) == 0 &&
        size <= MAX_RAW_BYTES &&
        max(bounds.outWidth, bounds.outHeight) <= MAX_RAW_SIDE
      if (keepOriginal) {
        // Keep the exact bytes (best quality when sending it on).
        file = File(dir, "$id.$ext")
        if (!tmp.renameTo(file)) {
          tmp.copyTo(file, overwrite = true)
          tmp.delete()
        }
        width = bounds.outWidth
        height = bounds.outHeight
      } else {
        // Huge, rotated or unusual formats (HEIC, GIF…): store an upright, screen-friendly copy.
        val bitmap = decodeUpright(tmp, SCALED_SIDE)
        tmp.delete()
        if (bitmap == null) return false
        file = File(dir, if (bitmap.hasAlpha()) "$id.png" else "$id.jpg")
        writeImage(bitmap, file)
        width = bitmap.width
        height = bitmap.height
        bitmap.recycle()
      }
      synchronized(this) {
        load(c).add(0, Clip(id, "image", null, file.name, width, height, hash, System.currentTimeMillis(), false))
        save(c)
      }
      prune(c)
      notifyChanged()
      return true
    } catch (e: Throwable) {
      tmp.delete()
      return false
    }
  }

  private fun touchFile(c: Context, name: String): Boolean {
    val found = synchronized(this) {
      load(c).firstOrNull { it.file == name }?.also {
        moveToTop(it)
        save(c)
      }
    }
    if (found != null) notifyChanged()
    return found != null
  }

  // endregion

  // region List & edits

  fun list(context: Context): List<Map<String, Any?>> {
    val c = context.applicationContext
    prune(c)
    val dir = dir(c)
    return synchronized(this) { load(c).map { toMap(it, dir) } }
  }

  private fun toMap(clip: Clip, dir: File): Map<String, Any?> = mapOf(
    "id" to clip.id,
    "kind" to clip.kind,
    "text" to clip.text,
    "uri" to clip.file?.let { Uri.fromFile(File(dir, it)).toString() },
    "width" to clip.width,
    "height" to clip.height,
    "time" to clip.time.toDouble(),
    "pinned" to clip.pinned,
  )

  private fun find(c: Context, id: String): Clip? = synchronized(this) { load(c).firstOrNull { it.id == id } }

  private fun mutate(context: Context, id: String, change: (Clip) -> Unit): Boolean {
    val c = context.applicationContext
    val found = synchronized(this) {
      load(c).firstOrNull { it.id == id }?.also {
        change(it)
        save(c)
      }
    }
    if (found != null) notifyChanged()
    return found != null
  }

  fun setPinned(context: Context, id: String, pinned: Boolean) = mutate(context, id) { it.pinned = pinned }

  fun updateText(context: Context, id: String, text: String): Boolean {
    if (text.isBlank()) return false
    return mutate(context, id) { if (it.kind == "text") it.text = text.take(MAX_TEXT) }
  }

  fun remove(context: Context, id: String): Boolean {
    val c = context.applicationContext
    val clip = synchronized(this) {
      load(c).firstOrNull { it.id == id }?.also {
        items?.remove(it)
        save(c)
      }
    } ?: return false
    deleteFile(c, clip)
    notifyChanged()
    return true
  }

  /** Removes everything except pinned items. */
  fun clear(context: Context): Boolean {
    val c = context.applicationContext
    val removed = synchronized(this) {
      val list = load(c)
      val gone = list.filter { !it.pinned }
      list.removeAll(gone)
      save(c)
      gone
    }
    removed.forEach { deleteFile(c, it) }
    notifyChanged()
    return removed.isNotEmpty()
  }

  /** Renders an edited copy of a picture (drawings, text, crop) as a new item. Returns its id. */
  fun saveEdit(context: Context, id: String, edit: String): String? {
    val c = context.applicationContext
    val source = find(c, id)?.file ?: return null
    val newId = newId()
    val rendered = ClipEditor.render(File(dir(c), source), edit, dir(c), newId) ?: return null
    synchronized(this) {
      load(c).add(
        0,
        Clip(newId, "image", null, rendered.file.name, rendered.width, rendered.height, null, System.currentTimeMillis(), false)
      )
      save(c)
    }
    prune(c)
    notifyChanged()
    return newId
  }

  // endregion

  // region Copy & send

  /** Puts an item back on the system clipboard, ready to paste anywhere. */
  fun copy(context: Context, id: String): Boolean {
    val c = context.applicationContext
    val clip = find(c, id) ?: return false
    val manager = c.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return false
    val data = if (clip.kind == "text") {
      ClipData.newPlainText("Lumo", clip.text ?: return false)
    } else {
      val uri = contentUri(c, clip) ?: return false
      ClipData.newUri(c.contentResolver, "Picture", uri)
    }
    return try {
      manager.setPrimaryClip(data)
      true
    } catch (e: Exception) {
      false
    }
  }

  /** A share intent for an item; the receiving app gets read access to that one picture only. */
  fun shareIntent(context: Context, id: String): Intent? {
    val c = context.applicationContext
    val clip = find(c, id) ?: return null
    val send = Intent(Intent.ACTION_SEND)
    if (clip.kind == "text") {
      send.type = "text/plain"
      send.putExtra(Intent.EXTRA_TEXT, clip.text ?: return null)
    } else {
      val uri = contentUri(c, clip) ?: return null
      send.type = mimeType(clip.file)
      send.putExtra(Intent.EXTRA_STREAM, uri)
      send.clipData = ClipData.newRawUri("", uri)
      send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    return send
  }

  private fun contentUri(c: Context, clip: Clip): Uri? {
    val name = clip.file ?: return null
    return try {
      FileProvider.getUriForFile(c, authority(c), File(dir(c), name))
    } catch (e: Exception) {
      null
    }
  }

  private fun mimeType(name: String?): String = when {
    name == null -> "image/*"
    name.endsWith(".png") -> "image/png"
    name.endsWith(".webp") -> "image/webp"
    else -> "image/jpeg"
  }

  // endregion

  // region Storage

  private fun newId() = UUID.randomUUID().toString().replace("-", "").substring(0, 16)

  /** Call with the lock held. */
  private fun moveToTop(clip: Clip) {
    val list = items ?: return
    list.remove(clip)
    clip.time = System.currentTimeMillis()
    list.add(0, clip)
  }

  /** Drops expired items and keeps at most [MAX_ITEMS] unpinned ones. Returns true if anything went. */
  fun prune(context: Context): Boolean {
    val c = context.applicationContext
    val keep = keepMillis(c)
    val now = System.currentTimeMillis()
    val removed = ArrayList<Clip>()
    synchronized(this) {
      var unpinned = 0
      val iterator = load(c).iterator()
      while (iterator.hasNext()) {
        val clip = iterator.next()
        if (clip.pinned) continue
        unpinned++
        if ((keep > 0 && now - clip.time > keep) || unpinned > MAX_ITEMS) {
          iterator.remove()
          removed.add(clip)
        }
      }
      if (removed.isNotEmpty()) save(c)
    }
    removed.forEach { deleteFile(c, it) }
    return removed.isNotEmpty()
  }

  /** Deletes picture files that no item points to (e.g. after a crash mid-copy). */
  private fun cleanup(c: Context) {
    val referenced = synchronized(this) { load(c).mapNotNull { it.file }.toHashSet() }
    val cutoff = System.currentTimeMillis() - 60_000
    dir(c).listFiles()?.forEach { file ->
      if (file.name.startsWith(INDEX) || file.name in referenced) return@forEach
      if (file.lastModified() < cutoff) file.delete()
    }
  }

  private fun deleteFile(c: Context, clip: Clip) {
    clip.file?.let { File(dir(c), it).delete() }
  }

  @Synchronized
  private fun load(c: Context): MutableList<Clip> {
    items?.let { return it }
    val list = ArrayList<Clip>()
    try {
      val json = JSONArray(String(AtomicFile(File(dir(c), INDEX)).readFully(), Charsets.UTF_8))
      for (i in 0 until json.length()) {
        val o = json.getJSONObject(i)
        list.add(
          Clip(
            id = o.getString("id"),
            kind = o.getString("kind"),
            text = o.str("text"),
            file = o.str("file"),
            width = o.optInt("w", 0),
            height = o.optInt("h", 0),
            hash = o.str("hash"),
            time = o.optLong("time", 0L),
            pinned = o.optBoolean("pinned", false),
          )
        )
      }
    } catch (e: Exception) {
      // Nothing saved yet (or unreadable): start empty.
    }
    items = list
    return list
  }

  @Synchronized
  private fun save(c: Context) {
    val list = items ?: return
    val array = JSONArray()
    for (clip in list) {
      array.put(
        JSONObject().apply {
          put("id", clip.id)
          put("kind", clip.kind)
          put("text", clip.text ?: JSONObject.NULL)
          put("file", clip.file ?: JSONObject.NULL)
          put("w", clip.width)
          put("h", clip.height)
          put("hash", clip.hash ?: JSONObject.NULL)
          put("time", clip.time)
          put("pinned", clip.pinned)
        }
      )
    }
    val file = AtomicFile(File(dir(c), INDEX))
    var out: FileOutputStream? = null
    try {
      out = file.startWrite()
      out.write(array.toString().toByteArray(Charsets.UTF_8))
      file.finishWrite(out)
    } catch (e: Exception) {
      if (out != null) file.failWrite(out)
    }
  }

  private fun JSONObject.str(name: String): String? = if (has(name) && !isNull(name)) getString(name) else null

  // endregion

  // region Pictures

  /** Decodes a picture upright (EXIF rotation applied) with its long side at most [maxSide]. */
  fun decodeUpright(file: File, maxSide: Int): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.path, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide * 3 / 4) sample *= 2
    var bitmap = BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
    val rotation = exifRotation(file)
    val longSide = max(bitmap.width, bitmap.height)
    val scale = if (longSide > maxSide) maxSide.toFloat() / longSide else 1f
    if (rotation != 0 || scale < 1f) {
      val matrix = Matrix().apply {
        postScale(scale, scale)
        postRotate(rotation.toFloat())
      }
      val turned = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
      if (turned != bitmap) bitmap.recycle()
      bitmap = turned
    }
    return bitmap
  }

  private fun exifRotation(file: File): Int {
    return try {
      when (ExifInterface(file.path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
        ExifInterface.ORIENTATION_ROTATE_90 -> 90
        ExifInterface.ORIENTATION_ROTATE_180 -> 180
        ExifInterface.ORIENTATION_ROTATE_270 -> 270
        else -> 0
      }
    } catch (e: Exception) {
      0
    }
  }

  fun writeImage(bitmap: Bitmap, target: File) {
    FileOutputStream(target).use { out ->
      if (target.name.endsWith(".png")) {
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
      } else {
        bitmap.compress(Bitmap.CompressFormat.JPEG, 92, out)
      }
    }
  }

  // endregion
}
