package expo.modules.launcher

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import org.json.JSONObject
import java.io.File

/**
 * Draws the picture editor's changes onto the full picture. Every position and size arrives as a
 * fraction of the picture (x and widths of its width, y of its height), so the result matches what
 * was shown on the phone's smaller preview. Keep the constants in sync with ImageEditor.tsx.
 */
internal object ClipEditor {
  private const val MAX_SIDE = 2560
  private const val LINE_HEIGHT = 1.25f
  private const val PAD_X = 0.35f
  private const val PAD_Y = 0.18f
  private const val BOX_RADIUS = 0.3f

  class Rendered(val file: File, val width: Int, val height: Int)

  fun render(source: File, editJson: String, dir: File, id: String): Rendered? {
    val decoded = try {
      ClipboardStore.decodeUpright(source, MAX_SIDE)
    } catch (e: Throwable) {
      null
    } ?: return null
    val image: Bitmap = if (decoded.isMutable) {
      decoded
    } else {
      val copy: Bitmap? = try {
        decoded.copy(Bitmap.Config.ARGB_8888, true)
      } catch (e: Throwable) {
        null
      }
      decoded.recycle()
      copy ?: return null
    }

    var cropped: Bitmap? = null
    try {
      val edit = JSONObject(editJson)
      val canvas = Canvas(image)
      val w = image.width.toFloat()
      val h = image.height.toFloat()

      val strokes = edit.optJSONArray("strokes")
      if (strokes != null) {
        for (i in 0 until strokes.length()) drawStroke(canvas, strokes.getJSONObject(i), w, h)
      }
      val texts = edit.optJSONArray("texts")
      if (texts != null) {
        for (i in 0 until texts.length()) drawText(canvas, texts.getJSONObject(i), w, h)
      }

      val crop = edit.optJSONObject("crop")
      if (crop != null) {
        val x = (crop.optDouble("x", 0.0) * w).toInt().coerceIn(0, image.width - 1)
        val y = (crop.optDouble("y", 0.0) * h).toInt().coerceIn(0, image.height - 1)
        val cw = (crop.optDouble("w", 1.0) * w).toInt().coerceIn(1, image.width - x)
        val ch = (crop.optDouble("h", 1.0) * h).toInt().coerceIn(1, image.height - y)
        if (cw < image.width || ch < image.height) cropped = Bitmap.createBitmap(image, x, y, cw, ch)
      }

      val result = cropped ?: image
      val file = File(dir, if (result.hasAlpha()) "$id.png" else "$id.jpg")
      ClipboardStore.writeImage(result, file)
      return Rendered(file, result.width, result.height)
    } catch (e: Throwable) {
      return null
    } finally {
      val extra = cropped
      if (extra != null && extra !== image) extra.recycle()
      image.recycle()
    }
  }

  private fun parseColorOr(value: String?, fallback: Int): Int {
    return try {
      if (value.isNullOrEmpty()) fallback else Color.parseColor(value)
    } catch (e: Exception) {
      fallback
    }
  }

  /** Same smoothing as the preview: quadratic curves through the midpoints of the samples. */
  private fun drawStroke(canvas: Canvas, stroke: JSONObject, w: Float, h: Float) {
    val points = stroke.optJSONArray("points") ?: return
    val count = points.length() / 2
    if (count == 0) return
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = parseColorOr(stroke.optString("color"), Color.RED)
      strokeWidth = (stroke.optDouble("width", 0.01) * w).toFloat().coerceAtLeast(1f)
      strokeCap = Paint.Cap.ROUND
      strokeJoin = Paint.Join.ROUND
    }
    fun px(i: Int) = (points.getDouble(i * 2) * w).toFloat()
    fun py(i: Int) = (points.getDouble(i * 2 + 1) * h).toFloat()

    if (count == 1) {
      paint.style = Paint.Style.FILL
      canvas.drawCircle(px(0), py(0), paint.strokeWidth / 2f, paint)
      return
    }
    paint.style = Paint.Style.STROKE
    val path = Path()
    path.moveTo(px(0), py(0))
    for (i in 1 until count - 1) {
      path.quadTo(px(i), py(i), (px(i) + px(i + 1)) / 2f, (py(i) + py(i + 1)) / 2f)
    }
    path.lineTo(px(count - 1), py(count - 1))
    canvas.drawPath(path, paint)
  }

  private fun drawText(canvas: Canvas, mark: JSONObject, w: Float, h: Float) {
    val text = mark.optString("text")
    if (text.isBlank()) return
    val size = (mark.optDouble("size", 0.06) * w).toFloat()
    val chosen = parseColorOr(mark.optString("color"), Color.WHITE)
    val boxed = mark.optBoolean("box", false)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      textSize = size
      typeface = Typeface.DEFAULT_BOLD
      color = if (boxed) contrastOn(chosen) else chosen
    }
    val lines = text.split('\n')
    val lineHeight = size * LINE_HEIGHT
    val padX = size * PAD_X
    val padY = size * PAD_Y
    val left = (mark.optDouble("x", 0.0) * w).toFloat()
    val top = (mark.optDouble("y", 0.0) * h).toFloat()

    if (boxed) {
      val textWidth = lines.maxOf { paint.measureText(it) }
      val box = RectF(left, top, left + textWidth + padX * 2, top + lineHeight * lines.size + padY * 2)
      val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = chosen }
      canvas.drawRoundRect(box, size * BOX_RADIUS, size * BOX_RADIUS, fill)
    } else {
      paint.setShadowLayer(size * 0.12f, 0f, size * 0.04f, 0x99000000.toInt())
    }

    val metrics = paint.fontMetrics
    lines.forEachIndexed { i, line ->
      val lineTop = top + padY + i * lineHeight
      val baseline = lineTop + (lineHeight - (metrics.descent - metrics.ascent)) / 2f - metrics.ascent
      canvas.drawText(line, left + padX, baseline, paint)
    }
  }

  /** Black or white, whichever reads better on [color]. */
  private fun contrastOn(color: Int): Int {
    val luminance = (0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color)) / 255
    return if (luminance > 0.6) Color.BLACK else Color.WHITE
  }
}
