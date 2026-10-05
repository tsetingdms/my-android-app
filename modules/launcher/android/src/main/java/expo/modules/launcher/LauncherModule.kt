package expo.modules.launcher

import android.app.Activity
import android.app.ActivityManager
import android.app.WallpaperManager
import android.app.role.RoleManager
import android.content.BroadcastReceiver
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.drawable.AdaptiveIconDrawable
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.StatFs
import android.provider.AlarmClock
import android.provider.MediaStore
import android.provider.Settings
import android.view.View
import android.view.ViewTreeObserver
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.lang.ref.WeakReference

class LauncherModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context is not available")

  private var packageReceiver: BroadcastReceiver? = null
  private var pendingPhoto: Promise? = null
  private var pendingPhotoSize = 1080

  // Edge-panel clipboard: Android 10+ only allows reading the clipboard while we have focus, so the
  // home window's focus changes (and clip changes while focused) trigger a capture.
  private var clipWatchView: WeakReference<View>? = null
  private var clipListening = false
  private val clipFocusListener = ViewTreeObserver.OnWindowFocusChangeListener { hasFocus ->
    if (hasFocus) captureClipboard()
  }
  private val clipChangedListener = ClipboardManager.OnPrimaryClipChangedListener { captureClipboard() }

  override fun definition() = ModuleDefinition {
    Name("Launcher")

    Events("onAppsChanged", "onHomePressed", "onTorchChanged", "onClipsChanged")

    OnCreate {
      registerPackageReceiver()
      appContext.reactContext?.let { ctx ->
        if (LockScreen.isEnabled(ctx)) LockScreen.register(ctx)
        SystemControls.watchTorch(ctx) { on -> sendEvent("onTorchChanged", Bundle().apply { putBoolean("on", on) }) }
      }
      ClipboardStore.onChange = { sendEvent("onClipsChanged", Bundle()) }
    }

    OnActivityEntersForeground {
      watchClipboard()
    }

    OnDestroy {
      unregisterPackageReceiver()
      appContext.reactContext?.let { SystemControls.unwatchTorch(it) }
      ClipboardStore.onChange = null
      unwatchClipboard()
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode == PHOTO_REQUEST) onPhotoPicked(payload.resultCode, payload.data)
    }

    // Pressing the home button while we are the default launcher re-delivers the HOME intent.
    OnNewIntent { intent ->
      if (intent.hasCategory(Intent.CATEGORY_HOME)) {
        sendEvent("onHomePressed", Bundle())
      }
    }

    AsyncFunction("getApps") { iconSize: Int ->
      loadApps(iconSize.coerceIn(48, 256))
    }

    Function("launchApp") { packageName: String, activityName: String ->
      launch(packageName, activityName)
    }

    Function("openAppInfo") { packageName: String ->
      start(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
    }

    Function("uninstallApp") { packageName: String ->
      start(Intent(Intent.ACTION_DELETE, Uri.parse("package:$packageName")))
    }

    Function("isDefaultLauncher") {
      isDefaultLauncher()
    }

    Function("openHomeSettings") {
      start(Intent(Settings.ACTION_HOME_SETTINGS)) || start(Intent(Settings.ACTION_SETTINGS))
    }

    Function("requestHomeRole") {
      requestHomeRole()
    }

    Function("openWallpaperPicker") {
      start(Intent.createChooser(Intent(Intent.ACTION_SET_WALLPAPER), "Choose wallpaper"))
    }

    Function("openSettingsPanel") { panel: String ->
      openPanel(panel)
    }

    Function("openAlarms") {
      start(Intent(AlarmClock.ACTION_SHOW_ALARMS))
    }

    Function("openCalendar") {
      val uri = Uri.parse("content://com.android.calendar/time/${System.currentTimeMillis()}")
      start(Intent(Intent.ACTION_VIEW, uri)) ||
        start(Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_CALENDAR))
    }

    Function("expandNotifications") {
      expandNotifications()
    }

    // Cached flag kept current by the torch callback: cheap enough to call while a panel animates.
    Function("isTorchOn") { SystemControls.torchOn }

    Function("setTorch") { on: Boolean ->
      SystemControls.setTorch(context, on)
    }

    // region Control panel

    Function("getSystemState") {
      SystemControls.state(context)
    }

    Function("setVolume") { fraction: Double ->
      SystemControls.setVolume(context, fraction)
    }

    Function("setBrightness") { fraction: Double ->
      SystemControls.setBrightness(context, fraction)
    }

    Function("setAutoBrightness") { on: Boolean ->
      SystemControls.setAutoBrightness(context, on)
    }

    Function("setAutoRotate") { on: Boolean ->
      SystemControls.setAutoRotate(context, on)
    }

    Function("requestWriteSettings") {
      start(SystemControls.requestWriteSettingsIntent(context))
    }

    Function("cycleRinger") {
      SystemControls.cycleRinger(context)
    }

    Function("mediaKey") { action: String ->
      SystemControls.mediaKey(context, action)
    }

    Function("openCamera") {
      LockScreenActivity.openCamera() || start(Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA))
    }

    Function("openCalculator") {
      start(Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_CALCULATOR)) ||
        launchPackage("com.google.android.calculator")
    }

    // endregion

    // region Wallpaper photo

    AsyncFunction("pickWallpaperPhoto") { maxShortSide: Int, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null || pendingPhoto != null) {
        promise.reject("E_PICKER", "The photo picker is not available right now", null)
      } else {
        pendingPhoto = promise
        pendingPhotoSize = maxShortSide
        val pick = Intent(Intent.ACTION_GET_CONTENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE)
        try {
          activity.startActivityForResult(Intent.createChooser(pick, "Choose a wallpaper"), PHOTO_REQUEST)
        } catch (e: Exception) {
          pendingPhoto = null
          promise.reject("E_PICKER", "No app can pick photos", e)
        }
      }
    }.runOnQueue(Queues.MAIN)

    // endregion

    // region Clipboard

    AsyncFunction("setClipboardOptions") { enabled: Boolean, keepHours: Int ->
      ClipboardStore.setOptions(context, enabled, keepHours)
      if (enabled) watchClipboard() else unwatchClipboard()
    }.runOnQueue(Queues.MAIN)

    Function("getClips") {
      ClipboardStore.list(context)
    }

    Function("copyClip") { id: String ->
      ClipboardStore.copy(context, id)
    }

    Function("shareClip") { id: String, packageName: String? ->
      shareClip(id, packageName)
    }

    Function("pinClip") { id: String, pinned: Boolean ->
      ClipboardStore.setPinned(context, id, pinned)
    }

    Function("updateClipText") { id: String, text: String ->
      ClipboardStore.updateText(context, id, text)
    }

    Function("deleteClip") { id: String ->
      ClipboardStore.remove(context, id)
    }

    Function("clearClips") {
      ClipboardStore.clear(context)
    }

    AsyncFunction("saveClipEdit") { id: String, edit: String ->
      ClipboardStore.saveEdit(context, id, edit)
    }

    // endregion

    // region Lock screen

    Function("setLockScreenEnabled") { enabled: Boolean ->
      LockScreen.setEnabled(context, enabled)
    }

    Function("isLockScreenEnabled") {
      LockScreen.isEnabled(context)
    }

    Function("unlockScreen") {
      LockScreenActivity.unlock()
    }

    Function("getLockScreenStatus") {
      LockScreen.status(context)
    }

    Function("testLockScreen") {
      LockScreen.test(context)
    }

    // "Display over other apps": lets Android start the lock screen from the background reliably.
    Function("openOverlaySettings") {
      start(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")))
    }

    // Android 13+: the lock-screen fallback posts a (silent, instantly removed) notification.
    Function("requestNotificationPermission") {
      val activity = appContext.currentActivity
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && activity != null) {
        activity.requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), NOTIFICATION_REQUEST)
        true
      } else {
        false
      }
    }

    // endregion

    Function("getBattery") {
      battery()
    }

    AsyncFunction("getDeviceStats") {
      deviceStats()
    }

    Function("getWallpaperColor") {
      wallpaperColor()
    }
  }

  // region Clipboard

  private fun watchClipboard() {
    val ctx = appContext.reactContext ?: return
    if (!ClipboardStore.isEnabled(ctx)) return
    val activity = appContext.currentActivity
    if (activity != null && activity !is LockScreenActivity) {
      val decor = activity.window?.decorView
      if (decor != null && clipWatchView?.get() !== decor) {
        detachClipFocusListener()
        decor.viewTreeObserver.addOnWindowFocusChangeListener(clipFocusListener)
        clipWatchView = WeakReference(decor)
      }
      if (decor?.hasWindowFocus() == true) captureClipboard()
    }
    if (!clipListening) {
      try {
        (ctx.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager)?.addPrimaryClipChangedListener(clipChangedListener)
        clipListening = true
      } catch (e: Exception) {
        clipListening = false
      }
    }
  }

  private fun detachClipFocusListener() {
    val observer = clipWatchView?.get()?.viewTreeObserver
    if (observer != null && observer.isAlive) observer.removeOnWindowFocusChangeListener(clipFocusListener)
    clipWatchView = null
  }

  private fun unwatchClipboard() {
    val run = Runnable {
      detachClipFocusListener()
      if (clipListening) {
        try {
          val manager = appContext.reactContext?.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
          manager?.removePrimaryClipChangedListener(clipChangedListener)
        } catch (e: Exception) {
          // Already gone.
        }
        clipListening = false
      }
    }
    if (Looper.myLooper() == Looper.getMainLooper()) run.run() else Handler(Looper.getMainLooper()).post(run)
  }

  private fun captureClipboard() {
    val ctx = appContext.reactContext ?: return
    try {
      ClipboardStore.capture(ctx)
    } catch (e: Exception) {
      // Never let a clipboard problem crash the home screen.
    }
  }

  /** Sends an item straight to [packageName] (e.g. WhatsApp's chat picker), or through the share sheet. */
  private fun shareClip(id: String, packageName: String?): Boolean {
    val send = ClipboardStore.shareIntent(context, id) ?: return false
    if (packageName != null && start(Intent(send).setPackage(packageName))) return true
    start(Intent.createChooser(send, null))
    return false
  }

  // endregion

  // region Apps

  private fun loadApps(iconSize: Int): List<Map<String, Any?>> {
    val ctx = context
    val pm = ctx.packageManager
    val query = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)

    @Suppress("DEPRECATION")
    val activities = pm.queryIntentActivities(query, 0)

    val iconDir = File(ctx.cacheDir, "launcher-icons").apply { mkdirs() }
    val keep = HashSet<String>()
    val result = ArrayList<Map<String, Any?>>(activities.size)

    for (info in activities) {
      val ai = info.activityInfo ?: continue
      if (ai.packageName == ctx.packageName) continue

      val updated = try {
        @Suppress("DEPRECATION")
        pm.getPackageInfo(ai.packageName, 0).lastUpdateTime
      } catch (e: Exception) {
        0L
      }

      // Icons are rendered once and cached on disk, keyed by app version, so later loads are instant.
      val base = "${ai.packageName}_${Integer.toHexString(ai.name.hashCode())}_${updated}_$iconSize"
      val adaptiveFile = File(iconDir, "${base}_a.png")
      val legacyFile = File(iconDir, "${base}_l.png")
      val monoFile = File(iconDir, "${base}_m.png")

      val iconFile: File? = when {
        adaptiveFile.exists() -> adaptiveFile
        legacyFile.exists() -> legacyFile
        else -> renderIcon(info.loadIcon(pm), iconSize, adaptiveFile, legacyFile, monoFile)
      }

      keep.add(adaptiveFile.name)
      keep.add(legacyFile.name)
      keep.add(monoFile.name)

      val appInfo = ai.applicationInfo
      val category = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && appInfo != null) appInfo.category else -1
      val isSystem = appInfo != null && (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0

      result.add(
        mapOf(
          "key" to "${ai.packageName}/${ai.name}",
          "packageName" to ai.packageName,
          "activityName" to ai.name,
          "label" to info.loadLabel(pm).toString(),
          "icon" to iconFile?.let { Uri.fromFile(it).toString() },
          "monoIcon" to if (monoFile.exists()) Uri.fromFile(monoFile).toString() else null,
          "category" to category,
          "isSystem" to isSystem,
        )
      )
    }

    // Drop icons for apps that were uninstalled or updated.
    iconDir.listFiles()?.forEach { file ->
      if (file.name !in keep) file.delete()
    }

    return result
  }

  private fun renderIcon(drawable: Drawable, size: Int, adaptiveFile: File, legacyFile: File, monoFile: File): File? {
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && drawable is AdaptiveIconDrawable) {
        // Render the full-bleed layers without the system mask so JS can apply any icon shape.
        writePng(drawLayers(size, drawable.background, drawable.foreground), adaptiveFile)
        // Themed icons: use the Android 13 monochrome layer, or fall back to the foreground
        // layer (tinted as a silhouette in JS) on older phones such as Android 11.
        val mono = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) drawable.monochrome else null
        (mono ?: drawable.foreground)?.let { writePng(drawLayers(size, it), monoFile) }
        adaptiveFile
      } else {
        // Legacy icons are wrapped on a white plate so every icon fits the chosen shape.
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)
        val inset = (size * 0.16f).toInt()
        drawable.setBounds(inset, inset, size - inset, size - inset)
        drawable.draw(canvas)
        writePng(bitmap, legacyFile)
        legacyFile
      }
    } catch (e: Exception) {
      null
    }
  }

  private fun drawLayers(size: Int, vararg layers: Drawable?): Bitmap {
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    // Adaptive icon layers are 108dp with the visible 72dp in the middle, i.e. 25% extra on each side.
    val inset = size / 4
    for (layer in layers) {
      if (layer == null) continue
      layer.setBounds(-inset, -inset, size + inset, size + inset)
      layer.draw(canvas)
    }
    return bitmap
  }

  private fun writePng(bitmap: Bitmap, file: File) {
    val tmp = File(file.parentFile, "${file.name}.tmp")
    FileOutputStream(tmp).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    bitmap.recycle()
    tmp.renameTo(file)
  }

  private fun launch(packageName: String, activityName: String): Boolean {
    val intent = Intent(Intent.ACTION_MAIN)
      .addCategory(Intent.CATEGORY_LAUNCHER)
      .setClassName(packageName, activityName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
    if (start(intent)) return true
    val fallback = context.packageManager.getLaunchIntentForPackage(packageName) ?: return false
    return start(fallback)
  }

  private fun launchPackage(packageName: String): Boolean {
    val intent = context.packageManager.getLaunchIntentForPackage(packageName) ?: return false
    return start(intent)
  }

  private fun onPhotoPicked(resultCode: Int, data: Intent?) {
    val promise = pendingPhoto ?: return
    pendingPhoto = null
    val uri = data?.data
    if (resultCode != Activity.RESULT_OK || uri == null) {
      promise.resolve(null)
      return
    }
    val ctx = context
    val size = pendingPhotoSize
    Thread {
      try {
        promise.resolve(WallpaperPhoto.save(ctx, uri, size))
      } catch (e: Exception) {
        promise.reject("E_PHOTO", e.message ?: "Couldn't use that picture", e)
      }
    }.start()
  }

  private fun start(intent: Intent): Boolean {
    return try {
      val activity = appContext.currentActivity
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
      true
    } catch (e: Exception) {
      false
    }
  }

  // Android 10+ shows a one-tap "Set as default home app" dialog; older versions open the settings page.
  private fun requestHomeRole(): Boolean {
    val activity = appContext.currentActivity
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && activity != null) {
      try {
        val roles = activity.getSystemService(RoleManager::class.java)
        if (roles != null && roles.isRoleAvailable(RoleManager.ROLE_HOME) && !roles.isRoleHeld(RoleManager.ROLE_HOME)) {
          activity.startActivityForResult(roles.createRequestRoleIntent(RoleManager.ROLE_HOME), HOME_ROLE_REQUEST)
          return true
        }
      } catch (e: Exception) {
        // Fall through to the settings screen.
      }
    }
    return start(Intent(Settings.ACTION_HOME_SETTINGS)) || start(Intent(Settings.ACTION_SETTINGS))
  }

  private fun isDefaultLauncher(): Boolean {
    val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)

    @Suppress("DEPRECATION")
    val resolved = context.packageManager.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)
    return resolved?.activityInfo?.packageName == context.packageName
  }

  private fun registerPackageReceiver() {
    val ctx = appContext.reactContext?.applicationContext ?: return
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(c: Context?, intent: Intent?) {
        val body = Bundle()
        body.putString("action", intent?.action ?: "")
        body.putString("packageName", intent?.data?.schemeSpecificPart ?: "")
        sendEvent("onAppsChanged", body)
      }
    }
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_PACKAGE_ADDED)
      addAction(Intent.ACTION_PACKAGE_REMOVED)
      addAction(Intent.ACTION_PACKAGE_CHANGED)
      addAction(Intent.ACTION_PACKAGE_REPLACED)
      addDataScheme("package")
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        ctx.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
      } else {
        ctx.registerReceiver(receiver, filter)
      }
      packageReceiver = receiver
    } catch (e: Exception) {
      packageReceiver = null
    }
  }

  private fun unregisterPackageReceiver() {
    val receiver = packageReceiver ?: return
    try {
      appContext.reactContext?.applicationContext?.unregisterReceiver(receiver)
    } catch (e: Exception) {
      // Already unregistered.
    }
    packageReceiver = null
  }

  // endregion

  // region System shortcuts

  private fun openPanel(panel: String): Boolean {
    val q = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
    val action = when (panel) {
      "wifi" -> if (q) Settings.Panel.ACTION_WIFI else Settings.ACTION_WIFI_SETTINGS
      "internet" -> if (q) Settings.Panel.ACTION_INTERNET_CONNECTIVITY else Settings.ACTION_WIRELESS_SETTINGS
      "volume" -> if (q) Settings.Panel.ACTION_VOLUME else Settings.ACTION_SOUND_SETTINGS
      "bluetooth" -> Settings.ACTION_BLUETOOTH_SETTINGS
      "display" -> Settings.ACTION_DISPLAY_SETTINGS
      "battery" -> Intent.ACTION_POWER_USAGE_SUMMARY
      "storage" -> Settings.ACTION_INTERNAL_STORAGE_SETTINGS
      "location" -> Settings.ACTION_LOCATION_SOURCE_SETTINGS
      "airplane" -> Settings.ACTION_AIRPLANE_MODE_SETTINGS
      "apps" -> Settings.ACTION_APPLICATION_SETTINGS
      else -> Settings.ACTION_SETTINGS
    }
    return start(Intent(action)) || start(Intent(Settings.ACTION_SETTINGS))
  }

  private fun expandNotifications(): Boolean {
    return try {
      val service = context.getSystemService("statusbar") ?: return false
      val clazz = Class.forName("android.app.StatusBarManager")
      clazz.getMethod("expandNotificationsPanel").invoke(service)
      true
    } catch (e: Exception) {
      false
    }
  }

  // endregion

  // region Device info

  private fun battery(): Map<String, Any> {
    val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
    val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
    val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
    val status = intent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
    val temperature = intent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) ?: 0
    val charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
    return mapOf(
      "level" to if (level >= 0 && scale > 0) level * 100 / scale else -1,
      "charging" to charging,
      "temperature" to temperature / 10.0,
    )
  }

  private fun deviceStats(): Map<String, Any> {
    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    val memory = ActivityManager.MemoryInfo()
    am.getMemoryInfo(memory)
    val stat = StatFs(Environment.getDataDirectory().path)
    return mapOf(
      "ramTotal" to memory.totalMem.toDouble(),
      "ramAvailable" to memory.availMem.toDouble(),
      "storageTotal" to stat.totalBytes.toDouble(),
      "storageAvailable" to stat.availableBytes.toDouble(),
    )
  }

  private fun wallpaperColor(): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O_MR1) return null
    return try {
      val colors = WallpaperManager.getInstance(context).getWallpaperColors(WallpaperManager.FLAG_SYSTEM)
      val color = colors?.secondaryColor ?: colors?.primaryColor ?: return null
      String.format("#%06X", 0xFFFFFF and color.toArgb())
    } catch (e: Exception) {
      null
    }
  }

  // endregion

  companion object {
    private const val HOME_ROLE_REQUEST = 4242
    private const val PHOTO_REQUEST = 4243
    private const val NOTIFICATION_REQUEST = 4244
  }
}
