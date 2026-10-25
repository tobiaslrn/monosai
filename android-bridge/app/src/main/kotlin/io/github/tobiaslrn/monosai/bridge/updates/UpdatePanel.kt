package io.github.tobiaslrn.monosai.bridge.updates

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.widget.Button
import android.widget.TextView
import androidx.core.content.FileProvider
import io.github.tobiaslrn.monosai.bridge.R
import kotlinx.coroutines.*
import java.io.File

/** Updates are checked once on launch, never by the idle service. */
class UpdatePanel(
    private val activity: Activity,
    private val status: TextView,
    private val action: Button,
    private val scope: CoroutineScope,
) {
    private val updates = ReleaseUpdates(activity)
    private var release: BridgeRelease? = null
    private var downloaded: File? = null

    init {
        action.setOnClickListener {
            when {
                downloaded != null -> install(downloaded!!)
                release != null -> download()
                else -> check()
            }
        }
        check()
    }

    private fun check() = scope.launch {
        action.isEnabled = false
        status.setText(R.string.updates_checking)
        action.setText(R.string.updates_action_check)
        try {
            release = withContext(Dispatchers.IO) { updates.check() }
            val available = release
            if (available == null) {
                status.setText(R.string.updates_current)
            } else {
                status.text = activity.getString(R.string.updates_available, available.tag)
                action.setText(R.string.updates_action_download)
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            status.setText(R.string.updates_unreachable)
        } finally {
            action.isEnabled = true
        }
    }

    private fun download() = scope.launch {
        action.isEnabled = false
        status.setText(R.string.updates_downloading)
        try {
            val file = withContext(Dispatchers.IO) { updates.download(release!!) }
            downloaded = file
            action.setText(R.string.updates_action_install)
            status.setText(R.string.updates_verified)
            install(file)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            status.setText(R.string.updates_failed)
        } finally {
            action.isEnabled = true
        }
    }

    private fun install(file: File) {
        if (!activity.packageManager.canRequestPackageInstalls()) {
            status.setText(R.string.updates_needs_permission)
            activity.startActivity(
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}")),
            )
            return
        }
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.updates", file)
        activity.startActivity(
            Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),
        )
    }
}
