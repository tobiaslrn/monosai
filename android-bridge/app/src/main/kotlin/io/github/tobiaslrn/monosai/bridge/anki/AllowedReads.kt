package io.github.tobiaslrn.monosai.bridge.anki

/** Mirrors the web allowlist. The provider port deliberately has no write method. */
enum class AllowedReads(val action: String) {
    VERSION("version"), PERMISSION("requestPermission"), DECKS("deckNames"),
    MODELS("modelNames"), FIELDS("modelFieldNames"), FIND_CARDS("findCards"),
    CARDS("cardsInfo"), NOTES("notesInfo");
}

data class CardRead(val cardId: Long, val note: Long, val reps: Int, val lapses: Int, val factor: Int, val deckName: String)
data class NoteRead(val noteId: Long, val modelName: String, val fields: Map<String, String>)

interface AnkiReads {
    fun checkAccess()
    fun deckNames(): List<String>
    fun modelNames(): List<String>
    fun modelFieldNames(name: String): List<String>
    fun findCards(query: String): List<Long>
    fun cardsInfo(ids: List<Long>): List<CardRead>
    fun notesInfo(ids: List<Long>): List<NoteRead>
}

enum class ReadFailure(val code: String) {
    ABSENT("ankidroid-not-installed"), PERMISSION("ankidroid-permission-denied"),
    EVIDENCE("review-evidence-unsupported"), QUERY("query-failed");
}
class AnkiReadException(val failure: ReadFailure) : RuntimeException(failure.code)
