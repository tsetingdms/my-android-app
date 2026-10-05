package expo.modules.launcher

import android.annotation.SuppressLint
import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.RectF
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactActivityDelegate
import java.lang.ref.WeakReference
import kotlin.math.abs

/**
 * Edge panel over other apps (opt-in). A small bar floats on the right edge of every app (a
 * "Display over other apps" window that draws nothing else and reads nothing on screen); tapping
 * or swiping it opens [EdgeActivity], a see-through Lumo screen showing the same edge panel on top
 * of the current app. The bar hides while Lumo's home screen (it has its own bar), the panel or the
 * Lumo lock screen is in front.
 *
 * Other apps can't be tilted in 3D like the home screen: only the system can transform another
 * app's window, so the panel dims the app behind instead.
 */
internal object EdgeOverlay {
  private val main = Handler(Looper.getMainLooper())
  private var app: Context? = null
  private var registered = false
  private var handle: HandleView? = null

  private var enabled = false
  private var position = "upper"
  private var dark = true

  // The launcher starts on its home screen, so the bar starts hidden.
  private var homeVisible = true
  private var panelVisible = false
  private var lockVisible = false

  private val lifecycle = object : Application.ActivityLifecycleCallbacks {
    override fun onActivityResumed(activity: Activity) {
      when (activity) {
        is EdgeActivity -> panelVisible = true
        is LockScreenActivity -> lockVisible = true
        is ClipShareActivity -> return
        else -> homeVisible = true
      }
      update()
    }

    override fun onActivityPaused(activity: Activity) {
      when (activity) {
        is EdgeActivity -> panelVisible = false
        is LockScreenActivity -> lockVisible = false
        is ClipShareActivity -> return
        else -> homeVisible = false
      }
      update()
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit

    override fun onActivityStarted(activity: Activity) = Unit

    override fun onActivityStopped(activity: Activity) = Unit

    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit

    override fun onActivityDestroyed(activity: Activity) = Unit
  }

  /** Starts following which Lumo screen is in front. Safe to call more than once. */
  fun init(context: Context) {
    val application = context.applicationContext as? Application ?: return
    app = application
    if (!registered) {
      application.registerActivityLifecycleCallbacks(lifecycle)
      registered = true
    }
  }

  fun configure(context: Context, enabled: Boolean, position: String, dark: Boolean) {
    init(context)
    this.enabled = enabled
    this.position = position
    this.dark = dark
    update()
  }

  private fun update() {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      main.post { update() }
      return
    }
    val context = app ?: return
    val show = enabled && !homeVisible && !panelVisible && !lockVisible && Settings.canDrawOverlays(context)
    if (show) show(context) else hide(context)
  }

  private fun fraction(position: String) = when (position) {
    "middle" -> 0.4f
    "lower" -> 0.6f
    else -> 0.2f
  }

  private fun show(context: Context) {
    val wm = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return
    val metrics = context.resources.displayMetrics
    val top = (metrics.heightPixels * fraction(position)).toInt()
    val existing = handle
    if (existing != null) {
      existing.setDark(dark)
      val params = existing.layoutParams as? WindowManager.LayoutParams
      if (params != null && params.y != top) {
        params.y = top
        try {
          wm.updateViewLayout(existing, params)
        } catch (e: Exception) {
          // The window is being removed.
        }
      }
      return
    }
    val view = HandleView(context, dark) { openPanel(context) }
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }
    val params = WindowManager.LayoutParams(
      (22 * metrics.density).toInt(),
      (110 * metrics.density).toInt(),
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.END
      y = top
      title = "Lumo edge bar"
    }
    try {
      wm.addView(view, params)
      handle = view
    } catch (e: Exception) {
      // Permission withdrawn in the meantime.
      handle = null
    }
  }

  private fun hide(context: Context) {
    val view = handle ?: return
    handle = null
    try {
      (context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager)?.removeView(view)
    } catch (e: Exception) {
      // Already gone.
    }
  }

  private fun openPanel(context: Context) {
    val intent = Intent(context, EdgeActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)
    try {
      // Allowed from the background because the user granted "Display over other apps" and the
      // bar (our window) is on screen.
      context.startActivity(intent)
    } catch (e: Exception) {
      // Blocked: nothing to do.
    }
  }
}

/** The bar itself: same look as the home screen's edge bar. Tap or swipe left to open. */
@SuppressLint("ViewConstructor")
private class HandleView(context: Context, private var dark: Boolean, private val onOpen: () -> Unit) : View(context) {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val bar = RectF()
  private var downX = 0f
  private var downY = 0f
  private var pressed = false

  init {
    contentDescription = "Open the Lumo edge panel"
  }

  fun setDark(value: Boolean) {
    if (dark != value) {
      dark = value
      invalidate()
    }
  }

  override fun onDraw(canvas: Canvas) {
    val density = resources.displayMetrics.density
    val barWidth = 5 * density
    val barHeight = (if (pressed) 72 else 64) * density
    val right = width - 2 * density
    bar.set(right - barWidth, (height - barHeight) / 2f, right, (height + barHeight) / 2f)
    paint.color = when {
      pressed && dark -> Color.WHITE
      pressed -> Color.argb(170, 20, 20, 24)
      dark -> Color.argb(178, 255, 255, 255)
      else -> Color.argb(115, 20, 20, 24)
    }
    canvas.drawRoundRect(bar, barWidth / 2, barWidth / 2, paint)
  }

  @SuppressLint("ClickableViewAccessibility")
  override fun onTouchEvent(event: MotionEvent): Boolean {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        downX = event.rawX
        downY = event.rawY
        pressed = true
        invalidate()
      }
      MotionEvent.ACTION_UP -> {
        pressed = false
        invalidate()
        val slop = 12 * resources.displayMetrics.density
        val dx = event.rawX - downX
        val dy = event.rawY - downY
        val tap = abs(dx) < slop && abs(dy) < slop
        if (tap || dx < -slop * 2) {
          performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
          onOpen()
        }
      }
      MotionEvent.ACTION_CANCEL -> {
        pressed = false
        invalidate()
      }
    }
    return true
  }
}

/**
 * See-through screen that shows the edge panel (the React Native "edge" component) on top of
 * whatever app is open. It leaves as soon as anything else comes to the front.
 */
class EdgeActivity : ReactActivity() {
  companion object {
    private var current: WeakReference<EdgeActivity>? = null

    /** Called by JS once the panel's closing animation has finished. */
    fun close(): Boolean {
      val activity = current?.get() ?: return false
      activity.runOnUiThread { activity.finishPanel() }
      return true
    }
  }

  override fun getMainComponentName(): String = "edge"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
    DefaultReactActivityDelegate(this, "edge", DefaultNewArchitectureEntryPoint.fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      window.setDecorFitsSystemWindows(false)
    } else {
      @Suppress("DEPRECATION")
      window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
        View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
        View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
    }
    current = WeakReference(this)
  }

  fun finishPanel() {
    if (isFinishing) return
    finish()
    @Suppress("DEPRECATION")
    overridePendingTransition(0, 0)
  }

  // Launching an app, sharing, Home, screen off…: the panel's job is done.
  override fun onStop() {
    super.onStop()
    if (!isChangingConfigurations) finishPanel()
  }

  // JS handles Back first (closing animation); this is only the fallback.
  override fun invokeDefaultOnBackPressed() = finishPanel()

  override fun onDestroy() {
    if (current?.get() === this) current = null
    super.onDestroy()
  }
}
