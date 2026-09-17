package io.github.tobiaslrn.monosai.bridge

import android.app.Activity
import android.content.Intent
import android.content.res.ColorStateList
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Switch
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import io.github.tobiaslrn.monosai.bridge.anki.ANKI_AUTHORITY
import io.github.tobiaslrn.monosai.bridge.anki.ANKI_PERMISSION
import io.github.tobiaslrn.monosai.bridge.anki.AnkiReadException
import io.github.tobiaslrn.monosai.bridge.anki.ContentProviderReads
import io.github.tobiaslrn.monosai.bridge.anki.ReadFailure
import io.github.tobiaslrn.monosai.bridge.http.validOrigin
import io.github.tobiaslrn.monosai.bridge.updates.UpdatePanel
import kotlinx.coroutines.*

/**
 * One screen: what the listener is doing, whether AnkiDroid can be read, and
 * the two rarely-touched settings behind a fold. The views are native so that
 * Android's text scaling, keyboard focus and touch semantics stay whatever the
 * device says they are.
 */
class MainActivity : Activity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var settings: BridgeSettings
    private lateinit var stateChip: TextView
    private lateinit var stateDetail: TextView
    private lateinit var toggle: Button
    private lateinit var accessDetail: TextView
    private lateinit var grant: Button
    private lateinit var permissionNote: TextView
    private lateinit var origins: EditText
    private lateinit var originsStatus: TextView
    private lateinit var advancedContent: LinearLayout
    private var observer: Job? = null

    private val address get() = "127.0.0.1:${BridgeService.PORT}"

    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(R.style.Theme_MonosaiBridge)
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        settings = BridgeSettings(this)

        stateChip = requireViewById(R.id.stateChip)
        stateDetail = requireViewById(R.id.stateDetail)
        toggle = requireViewById(R.id.toggle)
        accessDetail = requireViewById(R.id.accessDetail)
        grant = requireViewById(R.id.grant)
        permissionNote = requireViewById(R.id.permissionNote)
        origins = requireViewById(R.id.origins)
        originsStatus = requireViewById(R.id.originsStatus)
        advancedContent = requireViewById(R.id.advancedContent)

        applyWindowInsets()
        fadeBarRuleOnScroll()

        toggle.setOnClickListener {
            if (BridgeService.state.value == BridgeState.STOPPED ||
                BridgeService.state.value == BridgeState.PORT_UNAVAILABLE
            ) {
                startForegroundService(Intent(this, BridgeService::class.java))
            } else {
                settings.enabled = false
                stopService(Intent(this, BridgeService::class.java))
            }
        }
        grant.setOnClickListener {
            if (packageManager.resolveContentProvider(ANKI_AUTHORITY, 0) == null) {
                accessDetail.setText(R.string.anki_needs_install)
            } else {
                requestPermissions(arrayOf(ANKI_PERMISSION), ANKI_REQUEST)
            }
        }
        requireViewById<Switch>(R.id.bootSwitch).apply {
            isChecked = settings.startOnBoot
            setOnCheckedChangeListener { _, checked -> settings.startOnBoot = checked }
        }
        requireViewById<Button>(R.id.openMonosai).setOnClickListener {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(MONOSAI_URL)))
        }

        requireViewById<TextView>(R.id.factAddress).text = address
        requireViewById<TextView>(R.id.factVersion).text = BuildConfig.VERSION_NAME
        requireViewById<TextView>(R.id.advancedValue).text = address
        setUpAdvanced()

        UpdatePanel(this, requireViewById(R.id.updateStatus), requireViewById(R.id.updateAction), scope)
    }

    /** The bar keeps the top inset; the column keeps the bottom one, and the keyboard's. */
    private fun applyWindowInsets() {
        val bar = requireViewById<LinearLayout>(R.id.bar)
        val column = requireViewById<LinearLayout>(R.id.column)
        val barTop = bar.paddingTop
        val columnBottom = column.paddingBottom
        val gutter = column.paddingStart
        ViewCompat.setOnApplyWindowInsetsListener(requireViewById(R.id.root)) { _, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
            )
            val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
            bar.setPadding(gutter + bars.left, barTop + bars.top, gutter + bars.right, bar.paddingBottom)
            column.setPadding(
                gutter + bars.left,
                column.paddingTop,
                gutter + bars.right,
                columnBottom + maxOf(bars.bottom, keyboard),
            )
            insets
        }
    }

    /** The bar's lower edge appears only once content has begun to pass beneath it. */
    private fun fadeBarRuleOnScroll() {
        val rule = requireViewById<View>(R.id.barRule)
        val travel = 8 * resources.displayMetrics.density
        requireViewById<View>(R.id.scroll).setOnScrollChangeListener { _, _, y, _, _ ->
            rule.alpha = (y / travel).coerceIn(0f, 1f)
        }
    }

    private fun setUpAdvanced() {
        val summary = requireViewById<LinearLayout>(R.id.advancedSummary)
        summary.setOnClickListener {
            val opening = advancedContent.visibility != View.VISIBLE
            advancedContent.visibility = if (opening) View.VISIBLE else View.GONE
            summary.stateDescription = getString(if (opening) R.string.advanced_hide else R.string.advanced_show)
        }
        summary.stateDescription = getString(R.string.advanced_show)
        origins.setText(settings.origins().sorted().joinToString("\n"))
        requireViewById<Button>(R.id.saveOrigins).setOnClickListener {
            val values = origins.text.lines().map(String::trim).filter(String::isNotEmpty).toSet()
            if (values.isEmpty() || !values.all(::validOrigin)) {
                originsStatus.visibility = View.GONE
                origins.error = getString(R.string.origins_invalid)
            } else {
                settings.saveOrigins(values)
                origins.error = null
                originsStatus.visibility = View.VISIBLE
            }
        }
    }

    override fun onStart() {
        super.onStart()
        observer = scope.launch { BridgeService.state.collect(::render) }
        if (settings.enabled && BridgeService.state.value == BridgeState.STOPPED) {
            startForegroundService(Intent(this, BridgeService::class.java))
        }
        refreshAccess()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == ANKI_REQUEST) refreshAccess()
    }

    private fun render(state: BridgeState) {
        val label = when (state) {
            BridgeState.STOPPED -> R.string.state_stopped
            BridgeState.STARTING -> R.string.state_starting
            BridgeState.RUNNING -> R.string.state_running
            BridgeState.PORT_UNAVAILABLE -> R.string.state_port_unavailable
        }
        val tint = when (state) {
            BridgeState.RUNNING -> R.color.status_success_soft
            BridgeState.PORT_UNAVAILABLE -> R.color.status_warning_soft
            else -> R.color.surface_sunken
        }
        val ink = when (state) {
            BridgeState.RUNNING -> R.color.status_success
            BridgeState.PORT_UNAVAILABLE -> R.color.status_warning
            else -> R.color.text_secondary
        }
        stateChip.setText(label)
        stateChip.backgroundTintList = ColorStateList.valueOf(getColor(tint))
        stateChip.setTextColor(getColor(ink))
        stateDetail.text = when (state) {
            BridgeState.STOPPED -> getString(R.string.state_stopped_detail)
            BridgeState.STARTING -> getString(R.string.state_starting_detail)
            BridgeState.RUNNING -> getString(R.string.state_running_detail)
            BridgeState.PORT_UNAVAILABLE -> getString(R.string.state_port_unavailable_detail, BridgeService.PORT)
        }
        val listening = state == BridgeState.RUNNING || state == BridgeState.STARTING
        toggle.setText(if (listening) R.string.action_stop else R.string.action_start)
    }

    /**
     * A granted collection needs no grant control, so the button and the note
     * explaining Android's combined permission go away once it is granted.
     */
    private fun refreshAccess() {
        scope.launch {
            val failure = withContext(Dispatchers.IO) {
                try {
                    ContentProviderReads(this@MainActivity).checkAccess()
                    null
                } catch (error: AnkiReadException) {
                    error.failure
                }
            }
            accessDetail.setText(
                when (failure) {
                    null -> R.string.anki_granted
                    ReadFailure.ABSENT -> R.string.anki_absent
                    ReadFailure.PERMISSION -> R.string.anki_permission
                    ReadFailure.EVIDENCE -> R.string.anki_evidence
                    ReadFailure.QUERY -> R.string.anki_query
                },
            )
            val needsGrant = failure == ReadFailure.PERMISSION || failure == ReadFailure.ABSENT
            grant.visibility = if (needsGrant) View.VISIBLE else View.GONE
            permissionNote.visibility = if (needsGrant) View.VISIBLE else View.GONE
        }
    }

    override fun onStop() {
        observer?.cancel()
        super.onStop()
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private companion object {
        const val ANKI_REQUEST = 10
        const val MONOSAI_URL = "https://tobiaslrn.github.io/monosai/"
    }
}
