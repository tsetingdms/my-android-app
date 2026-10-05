package expo.modules.launcher

import android.app.WallpaperManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.net.Uri
import android.util.DisplayMetrics
import android.view.WindowManager
import org.json.JSONObject
import java.io.File
import java.io.InputStream
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Optional: makes the phone's own wallpaper match Lumo's (theme picture, the user's photo or a
 * gradient, with the same blur and dim), so app switching, Recents and the lock screen show the same
 * picture as the home screen. Android doesn't let Lumo read the previous wallpaper, so it can't be
 * put back from here (the user can pick one again in the phone's wallpaper settings).
 */
internal object PhoneWallpaper {
  private const val PREFS = "lumo_wallpaper"
  private const val KEY_LAST = "last_spec"

  /**
   * [specJson]: {kind: "image" | "gradient", source?, colors?, blur (dp), dim (0–1), dimColor,
   * which: "home" | "both"}. The same spec twice in a row is skipped. Call off the main thread.
   */
  fun apply(context: Context, specJson: String): Boolean {
    val c = context.applicationContext
    val prefs = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (prefs.getString(KEY_LAST, null) == specJson) return true
    val manager = WallpaperManager.getInstance(c)
    if (!manager.isWallpaperSupported || !manager.isSetWallpaperAllowed) return false

    var bitmap: Bitmap? = null
    try {
      val spec = JSONObject(specJson)
      val (width, height) = screenSize(c)
      val density = c.resources.displayMetrics.density
      var picture = when (spec.optString("kind")) {
        "image" -> decodeCover(c, spec.optString("source"), width, height)
        "gradient" -> drawGradient(spec, width, height, density)
        else -> null
      } ?: return false
      bitmap = picture

      val blur = spec.optDouble("blur", 0.0)
      if (blur > 0) {
        picture = softBlur(picture, (blur * density).toFloat())
        bitmap = picture
      }
      val dim = spec.optDouble("dim", 0.0)
      if (dim > 0) {
        if (!picture.isMutable) {
          val copy: Bitmap = picture.copy(Bitmap.Config.ARGB_8888, true) ?: return false
          picture.recycle()
          picture = copy
          bitmap = copy
        }
        val tint = parseColor(spec.optString("dimColor"), Color.BLACK)
        val alpha = (dim * 255).roundToInt().coerceIn(0, 255)
        Canvas(picture).drawColor(Color.argb(alpha, Color.red(tint), Color.green(tint), Color.blue(tint)))
      }

      val which = if (spec.optString("which") == "home") {
        WallpaperManager.FLAG_SYSTEM
      } else {
        WallpaperManager.FLAG_SYSTEM or WallpaperManager.FLAG_LOCK
      }
      manager.setBitmap(picture, null, true, which)
      prefs.edit().putString(KEY_LAST, specJson).apply()
      return true
    } catch (e: Throwable) {
      return false
    } finally {
      bitmap?.recycle()
    }
  }

  private fun screenSize(c: Context): Pair<Int, Int> {
    val metrics = DisplayMetrics()
    val wm = c.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    @Suppress("DEPRECATION")
    wm.defaultDisplay.getRealMetrics(metrics)
    val width = min(metrics.widthPixels, metrics.heightPixels).coerceAtLeast(1)
    val height = max(metrics.widthPixels, metrics.heightPixels).coerceAtLeast(1)
    return Pair(width, height)
  }

  private fun parseColor(value: String?, fallback: Int): Int {
    return try {
      if (value.isNullOrEmpty()) fallback else Color.parseColor(value)
    } catch (e: Exception) {
      fallback
    }
  }

  /**
   * A theme picture (bundled by React Native as a drawable named after its path, e.g.
   * "assets_wallpapers_aurora") or Lumo's saved photo (a file:// URI inside Lumo's own files),
   * scaled to cover the screen and cropped in the middle like the home screen.
   */
  private fun decodeCover(c: Context, source: String, width: Int, height: Int): Bitmap? {
    var file: File? = null
    var resId = 0
    if (source.startsWith("file://")) {
      val candidate = File(Uri.parse(source).path ?: return null)
      // Only Lumo's own files, never an arbitrary path.
      if (!candidate.canonicalPath.startsWith(c.filesDir.canonicalPath + File.separator)) return null
      file = candidate
    } else if (source.matches(Regex("^[a-z0-9_]+$"))) {
      resId = c.resources.getIdentifier(source, "drawable", c.packageName)
      if (resId == 0) return null
    } else {
      return null
    }
    val picked = file
    fun open(): InputStream = if (picked != null) picked.inputStream() else c.resources.openRawResource(resId)

    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    open().use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (bounds.outWidth / (sample * 2) >= width && bounds.outHeight / (sample * 2) >= height) sample *= 2
    val decoded = open().use {
      BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
    } ?: return null

    val scale = max(width.toFloat() / decoded.width, height.toFloat() / decoded.height)
    val drawnWidth = decoded.width * scale
    val drawnHeight = decoded.height * scale
    val left = (width - drawnWidth) / 2f
    val top = (height - drawnHeight) / 2f
    val out = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    Canvas(out).drawBitmap(decoded, null, RectF(left, top, left + drawnWidth, top + drawnHeight), Paint(Paint.FILTER_BITMAP_FLAG))
    decoded.recycle()
    return out
  }

  /** Same gradient and soft light "orbs" as Wallpaper.tsx. */
  private fun drawGradient(spec: JSONObject, width: Int, height: Int, density: Float): Bitmap? {
    val array = spec.optJSONArray("colors") ?: return null
    if (array.length() < 2) return null
    val colors = IntArray(array.length()) { parseColor(array.optString(it), Color.BLACK) }
    val out = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val w = width.toFloat()
    val h = height.toFloat()
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.shader = LinearGradient(0.1f * w, 0f, 0.9f * w, h, colors, null, Shader.TileMode.CLAMP)
    canvas.drawRect(0f, 0f, w, h, paint)

    val size = 340 * density
    val clearWhite = Color.argb(0, 255, 255, 255)
    orb(canvas, w + 110 * density - size, -90 * density, size, Color.argb(56, 255, 255, 255), clearWhite)
    orb(canvas, -150 * density, h - 80 * density - size, size, clearWhite, Color.argb(36, 255, 255, 255))
    return out
  }

  private fun orb(canvas: Canvas, left: Float, top: Float, size: Float, from: Int, to: Int) {
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.shader = LinearGradient(
      left + 0.2f * size, top + 0.1f * size, left + 0.8f * size, top + 0.9f * size, from, to, Shader.TileMode.CLAMP
    )
    canvas.drawCircle(left + size / 2f, top + size / 2f, size / 2f, paint)
  }

  /** Cheap blur for "Blur wallpaper": shrink in halves, then scale back up smoothly. Recycles [source]. */
  private fun softBlur(source: Bitmap, radiusPx: Float): Bitmap {
    val factor = (radiusPx / 2f).coerceIn(2f, 40f)
    val targetWidth = max(1, (source.width / factor).roundToInt())
    val targetHeight = max(1, (source.height / factor).roundToInt())
    var small = source
    while (small.width / 2 >= targetWidth && small.height / 2 >= targetHeight) {
      val half = Bitmap.createScaledBitmap(small, small.width / 2, small.height / 2, true)
      if (small !== source) small.recycle()
      small = half
    }
    val out = Bitmap.createScaledBitmap(small, source.width, source.height, true)
    if (small !== source && small !== out) small.recycle()
    if (out !== source) source.recycle()
    return out
  }
}
