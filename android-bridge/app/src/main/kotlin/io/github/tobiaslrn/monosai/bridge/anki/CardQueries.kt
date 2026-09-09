package io.github.tobiaslrn.monosai.bridge.anki

class CardQueries(private val provider: ReadQueries, private val decks: DeckQueries) {
    private companion object {
        val LEGACY_COLUMNS = arrayOf("_id", "note_id", "deck_id", "reps", "lapses", "sm2_factor", "queue")
        val COLUMNS_WITH_INTERVAL = LEGACY_COLUMNS + "ivl"
    }

    /**
     * Resolved once, because AnkiDroid builds differ in whether they expose `ivl`
     * and an unknown projection column makes the provider reject the query.
     */
    private var columns: Array<String> = LEGACY_COLUMNS

    fun probe() {
        // An impossible id still exercises URI/projection support, even in an empty collection.
        provider.query("cards", LEGACY_COLUMNS, "cid:0") { it.requiredLong("_id") }
        // Only after the supported projection proved access, so a permission or
        // provider failure is still reported as itself rather than as a missing column.
        columns = runCatching {
            provider.query("cards", COLUMNS_WITH_INTERVAL, "cid:0") { it.requiredLong("_id") }
            COLUMNS_WITH_INTERVAL
        }.getOrDefault(LEGACY_COLUMNS)
    }
    fun find(query: String): List<Long> = provider.query("cards", arrayOf("_id"), query) { it.requiredLong("_id") }
    fun info(ids: List<Long>): List<CardRead> {
        if (ids.isEmpty()) return emptyList()
        val found = read("cid:${ids.joinToString(",")}").associateBy { it.cardId }
        return ids.mapNotNull { found[it] }
    }

    private fun read(selection: String): List<CardRead> {
        val active = columns
        if (active === LEGACY_COLUMNS) return rows(LEGACY_COLUMNS, selection)
        // Some AnkiDroid builds reject an unknown projection column only once a row
        // is produced, so the empty probe cannot prove `ivl`. Give the optional
        // signal up permanently rather than lose every card to it.
        return runCatching { rows(active, selection) }.getOrElse {
            columns = LEGACY_COLUMNS
            rows(LEGACY_COLUMNS, selection)
        }
    }

    private fun rows(projection: Array<String>, selection: String): List<CardRead> {
        val names = decks.namesById()
        return provider.query("cards", projection, selection) {
            fun count(column: String): Int = it.requiredInt(column)
            CardRead(it.requiredLong("_id"), it.requiredLong("note_id"), count("reps"), count("lapses"), count("sm2_factor"), count("queue"),
                names[it.requiredLong("deck_id")] ?: throw AnkiReadException(ReadFailure.QUERY), it.optionalInt("ivl"))
        }
    }
}
