package io.github.tobiaslrn.monosai.bridge

import android.app.*
import android.content.Intent
import android.os.IBinder
import io.github.tobiaslrn.monosai.bridge.anki.ContentProviderReads
import io.github.tobiaslrn.monosai.bridge.http.BRIDGE_PORT
import io.github.tobiaslrn.monosai.bridge.http.BridgeIdentity
import io.github.tobiaslrn.monosai.bridge.http.Router
import io.github.tobiaslrn.monosai.bridge.http.Server
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

/** What the listener is doing. The screen owns every word shown for it. */
enum class BridgeState { STOPPED, STARTING, RUNNING, PORT_UNAVAILABLE }

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
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL, getString(R.string.notification_channel), NotificationManager.IMPORTANCE_LOW),
        )
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 1, Intent(this, BridgeService::class.java).setAction(STOP), PendingIntent.FLAG_IMMUTABLE)
        startForeground(1, Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.bridge_status)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.notification_text))
            .setContentIntent(open).setOngoing(true)
            .addAction(Notification.Action.Builder(null, getString(R.string.notification_stop), stop).build()).build())
        if (!starting) {
            starting = true
            mutableState.value = BridgeState.STARTING
            val identity = BridgeIdentity(BuildConfig.VERSION_NAME, BuildConfig.CONTRACT_VERSION)
            val listener = Server(Router(ContentProviderReads(this), identity), settings::origins)
            server = listener
            scope.launch {
                try {
                    listener.start()
                    if (isActive) mutableState.value = BridgeState.RUNNING else listener.stop()
                } catch (_: Exception) {
                    mutableState.value = BridgeState.PORT_UNAVAILABLE
                    stopSelf()
                }
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        server?.stop()
        if (mutableState.value == BridgeState.RUNNING || mutableState.value == BridgeState.STARTING) {
            mutableState.value = BridgeState.STOPPED
        }
        super.onDestroy()
    }

    companion object {
        const val STOP = "io.github.tobiaslrn.monosai.bridge.STOP"
        const val PORT = BRIDGE_PORT
        private const val CHANNEL = "bridge"
        private val mutableState = MutableStateFlow(BridgeState.STOPPED)
        val state = mutableState.asStateFlow()
    }
}
