package io.github.tobiaslrn.monosai.bridge.anki

class CardQueries(private val provider: ReadQueries, private val decks: DeckQueries) {
    private companion object {
        /** Eligibility rests on these, so a build without them cannot be read at all. */
        val REQUIRED = arrayOf("_id", "note_id", "deck_id", "reps", "lapses", "sm2_factor", "queue")

        /**
         * AnkiDroid's public card columns for scheduling evidence.
         *
         * These are the names the content provider publishes, which are not the
         * names of the fields behind them: the interval is `interval` here and
         * `ivl` only inside a collection file. Asking for the backing name makes
         * the provider reject the whole projection.
         */
        val OPTIONAL = listOf("interval", "type", "original_deck_id", "fsrs_difficulty", "last_review_time_secs")
    }

    /** Narrowed for this provider session only, never remembered across an AnkiDroid update. */
    private var optional: List<String> = OPTIONAL
    private var confirmed = false

    fun probe() {
        // An impossible id exercises URI and required-projection support even in an
        // empty collection. It cannot prove the optional columns: a provider that
        // fills rows itself rejects an unknown one only once a row exists, so that
        // question is settled against real rows on the first batch instead.
        provider.query("cards", REQUIRED, "cid:0") { it.requiredLong("_id") }
    }

    fun find(query: String): List<Long> = provider.query("cards", arrayOf("_id"), query) { it.requiredLong("_id") }

    fun info(ids: List<Long>): List<CardRead> {
        if (ids.isEmpty()) return emptyList()
        val found = read("cid:${ids.joinToString(",")}").associateBy { it.cardId }
        return ids.mapNotNull { found[it] }
    }

    private fun read(selection: String): List<CardRead> {
        try {
            return rows(projection(), selection)
        } catch (rejected: AnkiColumnException) {
            if (confirmed || optional.isEmpty()) throw rejected
        }
        // One column the build does not know would otherwise cost every other
        // signal, so each is retried on its own against these same rows and only
        // the ones that actually fail are given up.
        optional = optional.filter { supported(it, selection) }
        confirmed = true
        return rows(projection(), selection)
    }

    private fun supported(column: String, selection: String): Boolean = try {
        provider.query("cards", REQUIRED + column, selection) { it.requiredLong("_id") }
        true
    } catch (_: AnkiColumnException) {
        false
    }

    private fun projection(): Array<String> = REQUIRED + optional

    private fun rows(projection: Array<String>, selection: String): List<CardRead> {
        val names = decks.namesById()
        return provider.query("cards", projection, selection) { cursor ->
            CardRead(
                cardId = cursor.requiredLong("_id"),
                note = cursor.requiredLong("note_id"),
                reps = cursor.requiredInt("reps"),
                lapses = cursor.requiredInt("lapses"),
                factor = cursor.requiredInt("sm2_factor"),
                queue = cursor.requiredInt("queue"),
                deckName = names[cursor.requiredLong("deck_id")] ?: throw AnkiReadException(ReadFailure.QUERY),
                interval = cursor.optionalInt("interval"),
                cardType = cursor.optionalInt("type"),
                // Zero means the card sits in its own deck; a name Anki no longer
                // knows is dropped rather than allowed to fail the whole batch.
                originalDeckName = cursor.optionalLong("original_deck_id")?.takeIf { it != 0L }?.let { names[it] },
                fsrsDifficulty = cursor.optionalDouble("fsrs_difficulty"),
                lastReviewedAt = cursor.optionalEpochMillis("last_review_time_secs"),
            )
        }
    }
}
