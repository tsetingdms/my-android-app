package expo.modules.launcher

import android.app.NotificationManager
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.location.LocationManager
import android.media.AudioManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.KeyEvent
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sqrt

/** Quick-settings style reads and writes that need no runtime permission (WRITE_SETTINGS is opt-in). */
internal object SystemControls {
  @Volatile
  var torchOn = false
    private set

  private var torchCallback: CameraManager.TorchCallback? = null

  fun state(context: Context): Map<String, Any?> {
    val resolver = context.contentResolver
    val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val musicMax = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
    val rawBrightness = Settings.System.getInt(resolver, Settings.System.SCREEN_BRIGHTNESS, 128)

    return mapOf(
      "wifi" to safe { (context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager).isWifiEnabled },
      "mobileData" to safe { isOnCellular(context) },
      "bluetooth" to safe {
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter?.isEnabled
      },
      "airplane" to (Settings.Global.getInt(resolver, Settings.Global.AIRPLANE_MODE_ON, 0) == 1),
      "location" to safe {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
          (context.getSystemService(Context.LOCATION_SERVICE) as LocationManager).isLocationEnabled
        } else {
          null
        }
      },
      "autoRotate" to (Settings.System.getInt(resolver, Settings.System.ACCELEROMETER_ROTATION, 0) == 1),
      "autoBrightness" to (
        Settings.System.getInt(resolver, Settings.System.SCREEN_BRIGHTNESS_MODE, 0) ==
          Settings.System.SCREEN_BRIGHTNESS_MODE_AUTOMATIC
        ),
      // Perceptual (gamma-ish) position so the slider feels linear.
      "brightness" to sqrt((rawBrightness / 255.0).coerceIn(0.0, 1.0)),
      "volume" to audio.getStreamVolume(AudioManager.STREAM_MUSIC).toDouble() / musicMax,
      "ringer" to when (audio.ringerMode) {
        AudioManager.RINGER_MODE_SILENT -> "silent"
        AudioManager.RINGER_MODE_VIBRATE -> "vibrate"
        else -> "normal"
      },
      "musicActive" to audio.isMusicActive,
      "torch" to torchOn,
      "canWriteSettings" to canWriteSettings(context),
    )
  }

  fun canWriteSettings(context: Context): Boolean = Settings.System.canWrite(context)

  fun requestWriteSettingsIntent(context: Context): Intent =
    Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:${context.packageName}"))

  fun setVolume(context: Context, fraction: Double): Boolean {
    return try {
      val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
      audio.setStreamVolume(AudioManager.STREAM_MUSIC, (fraction.coerceIn(0.0, 1.0) * max).roundToInt(), 0)
      true
    } catch (e: Exception) {
      false
    }
  }

  fun setBrightness(context: Context, fraction: Double): Boolean {
    if (!canWriteSettings(context)) return false
    return try {
      val resolver = context.contentResolver
      Settings.System.putInt(resolver, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL)
      val raw = (fraction.coerceIn(0.0, 1.0).pow(2) * 255).roundToInt().coerceIn(1, 255)
      Settings.System.putInt(resolver, Settings.System.SCREEN_BRIGHTNESS, raw)
      true
    } catch (e: Exception) {
      false
    }
  }

  fun setAutoBrightness(context: Context, on: Boolean): Boolean {
    if (!canWriteSettings(context)) return false
    return try {
      Settings.System.putInt(
        context.contentResolver,
        Settings.System.SCREEN_BRIGHTNESS_MODE,
        if (on) Settings.System.SCREEN_BRIGHTNESS_MODE_AUTOMATIC else Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL,
      )
      true
    } catch (e: Exception) {
      false
    }
  }

  fun setAutoRotate(context: Context, on: Boolean): Boolean {
    if (!canWriteSettings(context)) return false
    return try {
      Settings.System.putInt(context.contentResolver, Settings.System.ACCELEROMETER_ROTATION, if (on) 1 else 0)
      true
    } catch (e: Exception) {
      false
    }
  }

  /** Sound → vibrate → (silent, only with Do Not Disturb access) → sound. Returns the new mode. */
  fun cycleRinger(context: Context): String {
    val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val notifications = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val silentAllowed = notifications.isNotificationPolicyAccessGranted
    val next = when (audio.ringerMode) {
      AudioManager.RINGER_MODE_NORMAL -> AudioManager.RINGER_MODE_VIBRATE
      AudioManager.RINGER_MODE_VIBRATE -> if (silentAllowed) AudioManager.RINGER_MODE_SILENT else AudioManager.RINGER_MODE_NORMAL
      else -> AudioManager.RINGER_MODE_NORMAL
    }
    try {
      audio.ringerMode = next
    } catch (e: Exception) {
      // Some modes need Do Not Disturb access; leave it unchanged.
    }
    return when (audio.ringerMode) {
      AudioManager.RINGER_MODE_SILENT -> "silent"
      AudioManager.RINGER_MODE_VIBRATE -> "vibrate"
      else -> "normal"
    }
  }

  /** Controls whatever app is playing media, without needing notification access. */
  fun mediaKey(context: Context, action: String): Boolean {
    val code = when (action) {
      "next" -> KeyEvent.KEYCODE_MEDIA_NEXT
      "previous" -> KeyEvent.KEYCODE_MEDIA_PREVIOUS
      else -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
    }
    return try {
      val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, code))
      audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, code))
      true
    } catch (e: Exception) {
      false
    }
  }

  fun setTorch(context: Context, on: Boolean): Boolean {
    return try {
      val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
      val id = flashCameraId(manager) ?: return false
      manager.setTorchMode(id, on)
      torchOn = on
      true
    } catch (e: Exception) {
      false
    }
  }

  /** Keeps [torchOn] in sync when the torch is switched elsewhere (e.g. the system shade). */
  fun watchTorch(context: Context, onChange: (Boolean) -> Unit) {
    if (torchCallback != null) return
    try {
      val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
      val flashId = flashCameraId(manager) ?: return
      val callback = object : CameraManager.TorchCallback() {
        override fun onTorchModeChanged(cameraId: String, enabled: Boolean) {
          if (cameraId == flashId && enabled != torchOn) {
            torchOn = enabled
            onChange(enabled)
          }
        }
      }
      manager.registerTorchCallback(callback, Handler(Looper.getMainLooper()))
      torchCallback = callback
    } catch (e: Exception) {
      torchCallback = null
    }
  }

  fun unwatchTorch(context: Context) {
    val callback = torchCallback ?: return
    try {
      (context.getSystemService(Context.CAMERA_SERVICE) as CameraManager).unregisterTorchCallback(callback)
    } catch (e: Exception) {
      // Ignore.
    }
    torchCallback = null
  }

  private fun flashCameraId(manager: CameraManager): String? =
    manager.cameraIdList.firstOrNull {
      manager.getCameraCharacteristics(it).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
    }

  private fun isOnCellular(context: Context): Boolean {
    val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val network = connectivity.activeNetwork ?: return false
    val caps = connectivity.getNetworkCapabilities(network) ?: return false
    return caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
  }

  private inline fun <T> safe(block: () -> T): T? = try {
    block()
  } catch (e: Exception) {
    null
  }
}
