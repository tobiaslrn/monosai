package io.github.tobiaslrn.monosai.bridge.http

import java.net.URI

val DEFAULT_ORIGINS = setOf("https://tobiaslrn.github.io", "http://localhost:4200")

fun validOrigin(value: String): Boolean = try {
    val uri = URI(value)
    uri.scheme in setOf("http", "https") && uri.host != null && uri.rawUserInfo == null &&
        uri.rawQuery == null && uri.rawFragment == null && uri.rawPath.isNullOrEmpty() &&
        (uri.port == -1 || uri.port in 1..65535) && value != "null"
} catch (_: Exception) { false }
