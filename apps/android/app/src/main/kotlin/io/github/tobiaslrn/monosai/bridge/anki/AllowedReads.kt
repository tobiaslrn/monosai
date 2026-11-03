package io.github.tobiaslrn.monosai.bridge.anki

/** Mirrors the web allowlist. The provider port deliberately has no write method. */
enum class AllowedReads(val action: String) {
    VERSION("version"), PERMISSION("requestPermission"), DECKS("deckNames"),
    MODELS("modelNames"), FIELDS("modelFieldNames"), FIND_CARDS("findCards"),
    CARDS("cardsInfo"), NOTES("notesInfo");
}

/**
 * One card as AnkiDroid's public card projection describes it.
 *
 * The first seven values decide eligibility and are required. The rest are
 * scheduling evidence that older AnkiDroid builds do not expose, and that a
 * supported build still leaves null on a card it does not apply to; each is
 * absent independently, so one unsupported column never costs the others.
 */
data class CardRead(
    val cardId: Long,
    val note: Long,
    val reps: Int,
    val lapses: Int,
    val factor: Int,
    val queue: Int,
    val deckName: String,
    /** Anki's current interval, in days, exactly as the provider returns it. */
    val interval: Int? = null,
    /** Anki's card type code. The domain interprets only the codes it knows. */
    val cardType: Int? = null,
    /** Home deck of a card currently in a filtered deck, resolved from `original_deck_id`. */
    val originalDeckName: String? = null,
    /** FSRS difficulty on Anki's raw memory-state scale, validated in the domain. */
    val fsrsDifficulty: Double? = null,
    /** Last answer, converted once from the provider's seconds to epoch milliseconds. */
    val lastReviewedAt: Long? = null,
)

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

open class AnkiReadException(val failure: ReadFailure) : RuntimeException(failure.code)

/**
 * A projection this AnkiDroid does not know, raised before any row is mapped.
 *
 * It carries the same wire code as the failure it replaces, so callers outside
 * the provider see no new state; inside, it is what separates "drop that column
 * and read the rest" from a malformed value, a null, or a collection failure.
 */
class AnkiColumnException(failure: ReadFailure) : AnkiReadException(failure)
