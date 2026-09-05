package io.github.tobiaslrn.monosai.bridge.http

import kotlinx.serialization.json.*

fun envelope(result: JsonElement = JsonNull, error: String? = null): String = buildJsonObject {
    put("result", result)
    put("error", error?.let(::JsonPrimitive) ?: JsonNull)
}.toString() + "\n"
