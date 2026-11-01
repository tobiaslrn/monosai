package io.github.tobiaslrn.monosai.bridge.http

import io.github.tobiaslrn.monosai.bridge.anki.*
import kotlinx.serialization.json.*

/**
 * What this build tells a caller it is.
 *
 * The contract is the only number a caller negotiates against: it moves when the
 * loopback contract gains something a caller cannot discover by trying it, and
 * stays put for a release that only fixes behaviour. The version name rides
 * along for diagnostics, so a report can name the build without the caller
 * having to reason about release numbering.
 *
 * Passed in rather than read from `BuildConfig` here, so the router stays a
 * plain class and the golden fixtures keep the same bytes across a version bump.
 */
data class BridgeIdentity(val version: String, val contract: Int)

class Router(private val reads: AnkiReads, private val identity: BridgeIdentity) {
    fun route(body: String): String = try {
        val request = Json.parseToJsonElement(body).jsonObject
        val action = request.getValue("action").jsonPrimitive.let { require(it.isString); it.content }
        require(action.length <= 100)
        val allowed = AllowedReads.entries.firstOrNull { it.action == action }
        if (allowed == null) envelope(error = "unsupported action: $action")
        else {
            require(request["version"]?.jsonPrimitive?.intOrNull == 6)
            val params = request["params"]?.jsonObject ?: buildJsonObject {}
            val result = dispatch(allowed, params)
            envelope(result)
        }
    } catch (error: AnkiReadException) {
        envelope(error = error.failure.code)
    } catch (_: IllegalArgumentException) {
        envelope(error = "invalid request")
    } catch (_: NoSuchElementException) {
        envelope(error = "invalid request")
    }

    private fun dispatch(action: AllowedReads, params: JsonObject): JsonElement {
        // Even catalog and id-only reads prove permission and review support first.
        if (action != AllowedReads.VERSION) reads.checkAccess()
        return when (action) {
            AllowedReads.VERSION -> JsonPrimitive(6)
            // The AnkiConnect keys keep their standard meaning; `monosaiBridge`
            // is the one extension, and a caller that does not know it ignores it
            // exactly as it ignores the absence on any other AnkiConnect endpoint.
            AllowedReads.PERMISSION -> wire.encodeToJsonElement(PermissionResult(
                permission = "granted", requireApiKey = false, version = 6,
                monosaiBridge = BridgeAnnouncement(identity.version, identity.contract),
            ))
            AllowedReads.DECKS -> strings(reads.deckNames())
            AllowedReads.MODELS -> strings(reads.modelNames())
            AllowedReads.FIELDS -> strings(reads.modelFieldNames(params.text("modelName")))
            AllowedReads.FIND_CARDS -> JsonArray(reads.findCards(params.text("query")).map(::JsonPrimitive))
            AllowedReads.CARDS -> wire.encodeToJsonElement(reads.cardsInfo(params.ids("cards")).map(::CardResult))
            AllowedReads.NOTES -> wire.encodeToJsonElement(reads.notesInfo(params.ids("notes")).map(::NoteResult))
        }
    }
    private fun strings(values: List<String>) = JsonArray(values.map(::JsonPrimitive))
    private fun JsonObject.text(key: String): String = getValue(key).jsonPrimitive.let {
        require(it.isString && it.content.length <= 8_192); it.content
    }
    private fun JsonObject.ids(key: String): List<Long> = getValue(key).jsonArray.also {
        require(it.size <= 500)
    }.map { element ->
        element.jsonPrimitive.let { require(!it.isString); it.long }.also { require(it in 1..9_007_199_254_740_991L) }
    }.distinct()
}
