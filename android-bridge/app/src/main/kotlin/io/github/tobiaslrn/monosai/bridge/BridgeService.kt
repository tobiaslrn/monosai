package io.github.tobiaslrn.monosai.bridge

import android.app.*
import android.content.Intent
import android.os.IBinder
import io.github.tobiaslrn.monosai.bridge.anki.ContentProviderReads
import io.github.tobiaslrn.monosai.bridge.http.Router
import io.github.tobiaslrn.monosai.bridge.http.Server
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

class BridgeService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var server: Server? = null
    private var starting = false
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val settings = BridgeSettings(this)
        if (intent?.action == STOP || (intent == null && !settings.enabled)) {
            settings.enabled = false
            stopSelf()
            return START_NOT_STICKY
        }
        settings.enabled = true
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Anki bridge", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 1, Intent(this, BridgeService::class.java).setAction(STOP), PendingIntent.FLAG_IMMUTABLE)
        startForeground(1, Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.bridge_status)
            .setContentTitle(getString(R.string.app_name))
            .setContentText("Available for local vocabulary reads")
            .setContentIntent(open).setOngoing(true)
            .addAction(Notification.Action.Builder(null, "Stop", stop).build()).build())
        if (!starting) {
            starting = true
            mutableState.value = "Starting…"
            val listener = Server(Router(ContentProviderReads(this)), settings::origins)
            server = listener
            scope.launch {
                try {
                    listener.start()
                    if (isActive) mutableState.value = "Running · port 8765" else listener.stop()
                } catch (_: Exception) {
                    mutableState.value = "Could not start. Port 8765 may be in use. Stop another bridge and try again."
                    stopSelf()
                }
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        server?.stop()
        if (mutableState.value.startsWith("Running") || mutableState.value == "Starting…") mutableState.value = "Stopped"
        super.onDestroy()
    }

    companion object {
        const val STOP = "io.github.tobiaslrn.monosai.bridge.STOP"
        private const val CHANNEL = "bridge"
        private val mutableState = MutableStateFlow("Stopped")
        val state = mutableState.asStateFlow()
    }
}
