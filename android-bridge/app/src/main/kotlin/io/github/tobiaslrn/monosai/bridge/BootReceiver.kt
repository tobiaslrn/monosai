package io.github.tobiaslrn.monosai.bridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val settings = BridgeSettings(context)
        if (settings.enabled && settings.startOnBoot) {
            try { context.startForegroundService(Intent(context, BridgeService::class.java)) }
            catch (_: IllegalStateException) { /* The OS refused background start; Start remains available in the app. */ }
        }
    }
}
