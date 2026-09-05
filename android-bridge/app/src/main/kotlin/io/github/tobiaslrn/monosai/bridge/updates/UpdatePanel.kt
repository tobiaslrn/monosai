package io.github.tobiaslrn.monosai.bridge.updates

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.FileProvider
import kotlinx.coroutines.*
import java.io.File

/** Updates are checked once on launch, never by the idle service. */
class UpdatePanel(private val activity: Activity, parent: LinearLayout, private val scope: CoroutineScope) {
    private val updates = ReleaseUpdates(activity)
    private val status = TextView(activity).apply { accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE }
    private val action = Button(activity).apply { isAllCaps = false }
    private var release: BridgeRelease? = null
    private var downloaded: File? = null
    init {
        parent.addView(status); parent.addView(action)
        action.setOnClickListener { when {
            downloaded != null -> install(downloaded!!)
            release != null -> download()
            else -> check()
        } }
        check()
    }
    private fun check() = scope.launch {
        action.isEnabled = false; status.text = "Checking bridge updates…"; action.text = "Check for updates"
        try {
            release = withContext(Dispatchers.IO) { updates.check() }
            status.text = release?.let { "${it.tag} is available. Android asks you to confirm installation." } ?: "Bridge is up to date."
            if (release != null) action.text = "Download update"
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { status.text = "Updates could not be checked. Your bridge still works. Try again when online." }
        finally { action.isEnabled = true }
    }
    private fun download() = scope.launch {
        action.isEnabled = false; status.text = "Downloading bridge update…"
        try {
            downloaded = withContext(Dispatchers.IO) { updates.download(release!!) }
            action.text = "Install update"; status.text = "Download verified. Confirm the update in Android."
            install(downloaded!!)
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { status.text = "The update could not be downloaded or verified. Your installed bridge is unchanged. Try again." }
        finally { action.isEnabled = true }
    }
    private fun install(file: File) {
        if (!activity.packageManager.canRequestPackageInstalls()) {
            status.text = "Allow updates from this app in Android, then tap Install update again."
            activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}")))
            return
        }
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.updates", file)
        activity.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
    }
}
