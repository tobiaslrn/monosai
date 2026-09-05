package io.github.tobiaslrn.monosai.bridge.anki

class CardQueries(private val provider: ReadQueries, private val decks: DeckQueries) {
    private val columns = arrayOf("_id", "note_id", "deck_id", "reps", "lapses", "sm2_factor")

    fun probe() {
        // An impossible id still exercises URI/projection support, even in an empty collection.
        provider.query("cards", columns, "cid:0") { it.requiredLong("_id") }
    }
    fun find(query: String): List<Long> = provider.query("cards", arrayOf("_id"), query) { it.requiredLong("_id") }
    fun info(ids: List<Long>): List<CardRead> {
        if (ids.isEmpty()) return emptyList()
        val names = decks.namesById()
        val found = provider.query("cards", columns, "cid:${ids.joinToString(",")}") {
            fun count(column: String): Int = it.requiredLong(column).also { n -> require(n <= Int.MAX_VALUE) }.toInt()
            CardRead(it.requiredLong("_id"), it.requiredLong("note_id"), count("reps"), count("lapses"), count("sm2_factor"),
                names[it.requiredLong("deck_id")] ?: throw AnkiReadException(ReadFailure.QUERY))
        }.associateBy { it.cardId }
        return ids.mapNotNull { found[it] }
    }
}
