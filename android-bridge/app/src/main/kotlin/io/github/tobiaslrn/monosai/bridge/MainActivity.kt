package io.github.tobiaslrn.monosai.bridge

import android.app.Activity
import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import android.view.View
import android.widget.*
import io.github.tobiaslrn.monosai.bridge.anki.*
import io.github.tobiaslrn.monosai.bridge.http.validOrigin
import kotlinx.coroutines.*

/** Native controls retain Android text scaling, keyboard focus and touch semantics. */
class MainActivity : Activity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var column: LinearLayout
    private lateinit var status: TextView
    private lateinit var access: TextView
    private lateinit var settings: BridgeSettings
    private var observer: Job? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        val dark = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
        setTheme(if (dark) R.style.Theme_MonosaiBridge_Dark else R.style.Theme_MonosaiBridge_Light)
        super.onCreate(savedInstanceState)
        settings = BridgeSettings(this)
        column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val gap = (20 * resources.displayMetrics.density).toInt()
            setPadding(gap, gap, gap, gap)
        }
        val scroll = ScrollView(this).apply { addView(column) }
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(scroll) { view, insets ->
            val bars = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        setContentView(scroll)
        text(getString(R.string.app_name), 24f)
        text("Live vocabulary from AnkiDroid 2.24 or newer. Monosai only reads your collection.")
        status = text(BridgeService.state.value).apply { accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE }
        access = text("").apply { accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE }
        button("Grant AnkiDroid access") {
            if (packageManager.resolveContentProvider(ANKI_AUTHORITY, 0) == null) access.text = "Get AnkiDroid 2.24 or newer and open your collection first."
            else requestPermissions(arrayOf(ANKI_PERMISSION), 10)
        }
        button("Start bridge") {
            startForegroundService(Intent(this, BridgeService::class.java))
        }
        button("Stop bridge") {
            settings.enabled = false
            stopService(Intent(this, BridgeService::class.java))
        }
        column.addView(CheckBox(this).apply {
            text = "Restart after reboot while enabled"
            isChecked = settings.startOnBoot
            setOnCheckedChangeListener { _, checked -> settings.startOnBoot = checked }
        })
        text("The bridge does not poll AnkiDroid or keep the device awake. Android may stop it; Force stop requires opening it again.")
        button("Open Monosai") { startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse("https://tobiaslrn.github.io/monosai/"))) }
        val originPanel = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; visibility = View.GONE }
        button("Allowed origins") { originPanel.visibility = if (originPanel.visibility == View.GONE) View.VISIBLE else View.GONE }
        column.addView(originPanel)
        val label = TextView(this).apply { text = "Allowed origins · one address per line" }
        val origins = EditText(this).apply {
            id = View.generateViewId()
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE or android.text.InputType.TYPE_TEXT_VARIATION_URI
            setText(settings.origins().sorted().joinToString("\n"))
        }
        label.labelFor = origins.id
        originPanel.addView(label); originPanel.addView(origins)
        originPanel.addView(Button(this).apply {
            text = "Save allowed origins"
            setOnClickListener {
                val values = origins.text.lines().map(String::trim).filter(String::isNotEmpty).toSet()
                if (values.isEmpty() || !values.all(::validOrigin)) origins.error = "Use complete http or https origins without paths, such as https://tobiaslrn.github.io"
                else { settings.saveOrigins(values); access.text = "Allowed origins saved." }
            }
        })
        io.github.tobiaslrn.monosai.bridge.updates.UpdatePanel(this, column, scope)
    }
    override fun onStart() {
        super.onStart()
        observer = scope.launch { BridgeService.state.collect { status.text = it } }
        if (settings.enabled && BridgeService.state.value == "Stopped") {
            startForegroundService(Intent(this, BridgeService::class.java))
        }
        refreshAccess()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 10) refreshAccess()
    }

    private fun refreshAccess() {
        scope.launch {
            access.text = withContext(Dispatchers.IO) {
                try { ContentProviderReads(this@MainActivity).checkAccess(); "AnkiDroid access granted" }
                catch (error: AnkiReadException) { when (error.failure) {
                    ReadFailure.ABSENT -> "AnkiDroid was not found. Get version 2.24 or newer."
                    ReadFailure.PERMISSION -> "Grant AnkiDroid access to read vocabulary."
                    ReadFailure.EVIDENCE -> "Update AnkiDroid to 2.24 or newer, or use a package."
                    ReadFailure.QUERY -> "Open your collection in AnkiDroid and try again."
                } }
            }
        }
    }
    override fun onStop() { observer?.cancel(); super.onStop() }
    override fun onDestroy() { scope.cancel(); super.onDestroy() }
    private fun text(value: String, size: Float = 16f): TextView = TextView(this).apply {
        text = value; textSize = size
        val gap = (8 * resources.displayMetrics.density).toInt()
        setPadding(0, gap, 0, gap)
        column.addView(this)
    }
    private fun button(label: String, action: () -> Unit) {
        column.addView(Button(this).apply { text = label; isAllCaps = false; setOnClickListener { action() } })
    }
}
