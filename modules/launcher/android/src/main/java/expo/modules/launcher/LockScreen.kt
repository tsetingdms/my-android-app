package expo.modules.launcher

import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.MediaStore
import android.provider.Settings
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
 *
 * Android blocks most background activity starts, so showing it is tried in order:
 *  1. a direct start (allowed for the current home app on some Android versions, or when the user
 *     granted "Display over other apps");
 *  2. if nothing opened shortly after, a full-screen-intent notification — the mechanism alarm
 *     clocks use to appear over the lock screen. The notification is removed as soon as it opens.
 *     Once a phone is seen blocking the direct start, the notification is posted right away on
 *     the next screen-off instead of waiting to find out again (much faster on such phones).
 * The last attempt is recorded so Customize can show whether it worked.
 */
internal object LockScreen {
  private const val PREFS = "lumo_lock_screen"
  private const val KEY_ENABLED = "enabled"
  private const val KEY_LAST_ATTEMPT = "last_attempt"
  private const val KEY_LAST_SHOWN = "last_shown"
  private const val KEY_LAST_VIA = "last_via"
  private const val KEY_DIRECT_BLOCKED = "direct_blocked"
  private const val CHANNEL_ID = "lumo_lock_screen"
  private const val NOTIFICATION_ID = 7071
  private const val FALLBACK_DELAY_MS = 600L
  const val EXTRA_VIA = "lumo_via"

  private var screenOffReceiver: BroadcastReceiver? = null
  private val main = Handler(Looper.getMainLooper())

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun isEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_ENABLED, false)

  fun setEnabled(context: Context, enabled: Boolean) {
    prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply()
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
    val app = context.applicationContext
    val attempt = System.currentTimeMillis()
    val p = prefs(app)
    p.edit().putLong(KEY_LAST_ATTEMPT, attempt).apply()
    try {
      app.startActivity(activityIntent(app, "direct"))
    } catch (e: Exception) {
      // Fall through to the notification below.
    }
    // Known to be blocked here (and no "Display over other apps"): don't wait, notify now.
    // If the direct start works after all, the activity is single-instance, so nothing doubles up.
    if (p.getBoolean(KEY_DIRECT_BLOCKED, false) && !Settings.canDrawOverlays(app)) {
      showViaNotification(app)
      return
    }
    // A blocked background start fails silently, so check whether the screen actually opened.
    main.postDelayed({
      if (!LockScreenActivity.isShowing && lastShown(app) < attempt) {
        prefs(app).edit().putBoolean(KEY_DIRECT_BLOCKED, true).apply()
        showViaNotification(app)
      }
    }, FALLBACK_DELAY_MS)
  }

  /** Opens the lock screen right now (from the foreground), to preview it from Customize. */
  fun test(context: Context): Boolean {
    return try {
      context.startActivity(activityIntent(context, "test"))
      true
    } catch (e: Exception) {
      false
    }
  }

  fun markShown(context: Context, via: String) {
    val edit = prefs(context).edit().putLong(KEY_LAST_SHOWN, System.currentTimeMillis()).putString(KEY_LAST_VIA, via)
    // A direct start worked (e.g. after "Display over other apps" was allowed): use it again next time.
    if (via == "direct") edit.putBoolean(KEY_DIRECT_BLOCKED, false)
    edit.apply()
    try {
      (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(NOTIFICATION_ID)
    } catch (e: Exception) {
      // Nothing to cancel.
    }
  }

  private fun lastShown(context: Context) = prefs(context).getLong(KEY_LAST_SHOWN, 0L)

  fun status(context: Context): Map<String, Any?> {
    val p = prefs(context)
    val notifications = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    return mapOf(
      "enabled" to isEnabled(context),
      "listening" to (screenOffReceiver != null),
      "lastAttempt" to p.getLong(KEY_LAST_ATTEMPT, 0L).toDouble(),
      "lastShown" to p.getLong(KEY_LAST_SHOWN, 0L).toDouble(),
      "lastVia" to p.getString(KEY_LAST_VIA, null),
      "canDrawOverlays" to Settings.canDrawOverlays(context),
      "notificationsEnabled" to notifications.areNotificationsEnabled(),
    )
  }

  private fun activityIntent(context: Context, via: String): Intent =
    Intent(context, LockScreenActivity::class.java)
      .putExtra(EXTRA_VIA, via)
      .addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
      )

  private fun showViaNotification(context: Context) {
    try {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val channel = NotificationChannel(CHANNEL_ID, "Lock screen", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Opens the Lumo lock screen when the screen turns off"
          setSound(null, null)
          enableVibration(false)
          enableLights(false)
          setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
      }
      val pending = PendingIntent.getActivity(
        context,
        NOTIFICATION_ID,
        activityIntent(context, "notification"),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Notification.Builder(context, CHANNEL_ID)
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(context).setPriority(Notification.PRIORITY_MAX)
      }
      builder
        .setSmallIcon(android.R.drawable.ic_lock_lock)
        .setContentTitle("Lumo lock screen")
        .setCategory(Notification.CATEGORY_ALARM)
        .setOngoing(false)
        .setAutoCancel(true)
        .setFullScreenIntent(pending, true)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) builder.setTimeoutAfter(10_000)
      manager.notify(NOTIFICATION_ID, builder.build())
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
    LockScreen.markShown(this, intent?.getStringExtra(LockScreen.EXTRA_VIA) ?: "direct")

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
