package expo.modules.launcher

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import java.io.File
import java.io.FileOutputStream
import kotlin.math.min

/**
 * Copies a photo the user picked into app storage, downscaled to about screen size and
 * rotated upright, so it loads (and blurs) quickly as a launcher wallpaper.
 */
internal object WallpaperPhoto {
  fun save(context: Context, uri: Uri, maxShortSide: Int): String {
    val resolver = context.contentResolver
    val target = maxShortSide.coerceIn(480, 2160)

    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw IllegalArgumentException("That file isn't a picture")

    var sample = 1
    while (min(bounds.outWidth, bounds.outHeight) / (sample * 2) >= target) sample *= 2
    val options = BitmapFactory.Options().apply { inSampleSize = sample }
    var bitmap = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
      ?: throw IllegalArgumentException("Couldn't read that picture")

    val rotation = try {
      resolver.openInputStream(uri)?.use { stream ->
        when (ExifInterface(stream).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
          ExifInterface.ORIENTATION_ROTATE_90 -> 90f
          ExifInterface.ORIENTATION_ROTATE_180 -> 180f
          ExifInterface.ORIENTATION_ROTATE_270 -> 270f
          else -> 0f
        }
      } ?: 0f
    } catch (e: Exception) {
      0f
    }

    val shortSide = min(bitmap.width, bitmap.height)
    val scale = if (shortSide > target) target.toFloat() / shortSide else 1f
    if (rotation != 0f || scale < 1f) {
      val matrix = Matrix().apply {
        postScale(scale, scale)
        postRotate(rotation)
      }
      val transformed = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
      if (transformed != bitmap) bitmap.recycle()
      bitmap = transformed
    }

    val dir = File(context.filesDir, "wallpapers").apply { mkdirs() }
    // Only the current photo wallpaper is kept.
    dir.listFiles()?.forEach { it.delete() }
    val file = File(dir, "photo-${System.currentTimeMillis()}.jpg")
    FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it) }
    bitmap.recycle()
    return Uri.fromFile(file).toString()
  }
}
