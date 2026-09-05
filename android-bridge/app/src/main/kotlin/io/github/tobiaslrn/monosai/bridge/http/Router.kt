package io.github.tobiaslrn.monosai.bridge.http

import io.github.tobiaslrn.monosai.bridge.anki.*
import kotlinx.serialization.json.*

class Router(private val reads: AnkiReads) {
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
            AllowedReads.PERMISSION -> buildJsonObject { put("permission", "granted"); put("requireApiKey", false); put("version", 6) }
            AllowedReads.DECKS -> strings(reads.deckNames())
            AllowedReads.MODELS -> strings(reads.modelNames())
            AllowedReads.FIELDS -> strings(reads.modelFieldNames(params.text("modelName")))
            AllowedReads.FIND_CARDS -> JsonArray(reads.findCards(params.text("query")).map(::JsonPrimitive))
            AllowedReads.CARDS -> JsonArray(reads.cardsInfo(params.ids("cards")).map { card -> buildJsonObject {
                put("cardId", card.cardId); put("note", card.note); put("reps", card.reps)
                put("lapses", card.lapses); put("factor", card.factor); put("deckName", card.deckName)
            } })
            AllowedReads.NOTES -> JsonArray(reads.notesInfo(params.ids("notes")).map { note -> buildJsonObject {
                put("noteId", note.noteId); put("modelName", note.modelName)
                put("fields", buildJsonObject {
                    note.fields.entries.forEachIndexed { order, (name, value) ->
                        put(name, buildJsonObject { put("value", value); put("order", order) })
                    }
                })
            } })
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
