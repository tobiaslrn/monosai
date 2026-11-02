package io.github.tobiaslrn.monosai.bridge

import android.content.Context
import io.github.tobiaslrn.monosai.bridge.http.DEFAULT_ORIGINS
import io.github.tobiaslrn.monosai.bridge.http.validOrigin

class BridgeSettings(context: Context) {
    private val preferences = context.getSharedPreferences("bridge", Context.MODE_PRIVATE)
    var enabled: Boolean
        get() = preferences.getBoolean("enabled", false)
        set(value) { preferences.edit().putBoolean("enabled", value).apply() }
    var startOnBoot: Boolean
        get() = preferences.getBoolean("startOnBoot", true)
        set(value) { preferences.edit().putBoolean("startOnBoot", value).apply() }
    fun origins(): Set<String> = preferences.getStringSet("origins", DEFAULT_ORIGINS)!!.filter(::validOrigin).toSet()
    fun saveOrigins(values: Set<String>) {
        require(values.isNotEmpty() && values.all(::validOrigin))
        preferences.edit().putStringSet("origins", values).apply()
    }
}
