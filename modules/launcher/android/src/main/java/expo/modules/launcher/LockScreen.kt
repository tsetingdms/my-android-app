package expo.modules.launcher

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.MediaStore
import android.view.View
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactActivityDelegate
import java.lang.ref.WeakReference

/**
 * Optional Lumo lock screen. When enabled, the screen-off broadcast starts [LockScreenActivity],
 * which shows over Android's own lock (keyguard). Unlocking still goes through the real keyguard
 * (PIN / pattern / fingerprint) via requestDismissKeyguard, so device security is unchanged.
 */
internal object LockScreen {
  private const val PREFS = "lumo_lock_screen"
  private const val KEY_ENABLED = "enabled"

  private var screenOffReceiver: BroadcastReceiver? = null

  fun isEnabled(context: Context): Boolean =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, false)

  fun setEnabled(context: Context, enabled: Boolean) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_ENABLED, enabled).apply()
    if (enabled) register(context) else unregister(context)
  }

  fun register(context: Context) {
    if (screenOffReceiver != null) return
    val app = context.applicationContext
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(c: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_SCREEN_OFF) show(c)
      }
    }
    val filter = IntentFilter(Intent.ACTION_SCREEN_OFF)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        app.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
      } else {
        app.registerReceiver(receiver, filter)
      }
      screenOffReceiver = receiver
    } catch (e: Exception) {
      screenOffReceiver = null
    }
  }

  fun unregister(context: Context) {
    val receiver = screenOffReceiver ?: return
    try {
      context.applicationContext.unregisterReceiver(receiver)
    } catch (e: Exception) {
      // Already gone.
    }
    screenOffReceiver = null
  }

  fun show(context: Context) {
    if (!isEnabled(context) || LockScreenActivity.isShowing) return
    // Never cover an ongoing or ringing call.
    val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    if (audio.mode == AudioManager.MODE_IN_CALL ||
      audio.mode == AudioManager.MODE_IN_COMMUNICATION ||
      audio.mode == AudioManager.MODE_RINGTONE
    ) {
      return
    }
    val intent = Intent(context, LockScreenActivity::class.java).addFlags(
      Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
    )
    try {
      // Allowed from the background because the default home app may start activities.
      context.applicationContext.startActivity(intent)
    } catch (e: Exception) {
      // The system lock screen still protects the phone.
    }
  }
}

/** Hosts the React Native "lock" component above the keyguard. */
class LockScreenActivity : ReactActivity() {
  companion object {
    @Volatile
    var isShowing = false
      private set

    private var current: WeakReference<LockScreenActivity>? = null

    fun unlock(): Boolean {
      val activity = current?.get() ?: return false
      activity.runOnUiThread { activity.requestUnlock() }
      return true
    }

    fun openCamera(): Boolean {
      val activity = current?.get() ?: return false
      activity.runOnUiThread { activity.launchCamera() }
      return true
    }
  }

  private var userPresentReceiver: BroadcastReceiver? = null

  override fun getMainComponentName(): String = "lock"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
    DefaultReactActivityDelegate(this, "lock", DefaultNewArchitectureEntryPoint.fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(false)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
    }
    super.onCreate(null)
    drawEdgeToEdge()
    isShowing = true
    current = WeakReference(this)

    // Fingerprint / face unlock dismisses the keyguard without our swipe: leave with it.
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(c: Context, intent: Intent) {
        val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        if (keyguard.isKeyguardSecure && !keyguard.isKeyguardLocked) finishLock()
      }
    }
    try {
      val filter = IntentFilter(Intent.ACTION_USER_PRESENT)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
      } else {
        registerReceiver(receiver, filter)
      }
      userPresentReceiver = receiver
    } catch (e: Exception) {
      userPresentReceiver = null
    }
  }

  private fun drawEdgeToEdge() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      window.setDecorFitsSystemWindows(false)
    } else {
      @Suppress("DEPRECATION")
      window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
        View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
        View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
    }
  }

  fun requestUnlock() {
    val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    if (keyguard.isKeyguardLocked && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      // Shows the real PIN / pattern / fingerprint prompt when the phone is secured.
      keyguard.requestDismissKeyguard(
        this,
        object : KeyguardManager.KeyguardDismissCallback() {
          override fun onDismissSucceeded() = finishLock()

          override fun onDismissError() = finishLock()
        }
      )
    } else {
      finishLock()
    }
  }

  fun launchCamera() {
    val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    val action = if (keyguard.isKeyguardLocked) {
      MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA_SECURE
    } else {
      MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA
    }
    try {
      startActivity(Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (e: Exception) {
      // No camera app.
    }
  }

  private fun finishLock() {
    if (isFinishing) return
    finish()
    @Suppress("DEPRECATION")
    overridePendingTransition(0, android.R.anim.fade_out)
  }

  override fun onStop() {
    super.onStop()
    // Leave when the user navigates away (camera, home…), but not when the screen just turns off.
    val power = getSystemService(Context.POWER_SERVICE) as PowerManager
    if (power.isInteractive && !isChangingConfigurations) finishLock()
  }

  // Back must not skip the lock screen.
  override fun invokeDefaultOnBackPressed() = Unit

  override fun onDestroy() {
    userPresentReceiver?.let {
      try {
        unregisterReceiver(it)
      } catch (e: Exception) {
        // Ignore.
      }
    }
    userPresentReceiver = null
    if (current?.get() === this) {
      current = null
      isShowing = false
    }
    super.onDestroy()
  }
}
