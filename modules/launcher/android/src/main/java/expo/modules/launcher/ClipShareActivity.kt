package expo.modules.launcher

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.widget.Toast

/**
 * "Lumo clipboard" in the Share menu: saves the shared text or pictures to the edge-panel clipboard
 * (for apps such as WhatsApp that can't copy pictures). Invisible; it finishes as soon as the copy is done,
 * which keeps the sender's read grant alive until then.
 */
class ClipShareActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val uris = ArrayList<Uri>()
    var text: String? = null
    try {
      when (intent?.action) {
        Intent.ACTION_SEND -> {
          streamExtra(intent)?.let { uris.add(it) }
          if (uris.isEmpty()) text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
        }
        Intent.ACTION_SEND_MULTIPLE -> uris.addAll(streamListExtra(intent).take(MAX_PICTURES))
      }
    } catch (e: Exception) {
      // Malformed share: nothing to save.
    }
    val sharedText = text
    if (uris.isEmpty() && sharedText.isNullOrBlank()) {
      finish()
      return
    }

    val app = applicationContext
    Thread {
      var saved = 0
      for (uri in uris) if (ClipboardStore.addImage(app, uri)) saved++
      if (!sharedText.isNullOrBlank() && ClipboardStore.addText(app, sharedText)) saved++
      runOnUiThread {
        val message = if (saved > 0) "Saved to Lumo clipboard" else "Lumo couldn't save that"
        Toast.makeText(app, message, Toast.LENGTH_SHORT).show()
        finish()
      }
    }.start()
  }

  private fun streamExtra(intent: Intent): Uri? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
    }
  }

  private fun streamListExtra(intent: Intent): List<Uri> {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) ?: emptyList()
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM) ?: emptyList()
    }
  }

  companion object {
    private const val MAX_PICTURES = 10
  }
}
