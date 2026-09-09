package io.github.tobiaslrn.monosai.bridge.anki

import android.database.Cursor
import android.database.MatrixCursor
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * The card columns AnkiDroid's published `FlashCardsContract` defines, written
 * out here rather than taken from the implementation.
 *
 * A fake built from the production projection can only agree with it, including
 * where it is wrong: the bridge asked for `ivl`, the name of the field inside a
 * collection file, which the provider does not publish and rejects. Declaring
 * the external contract separately is what lets these tests disagree with us.
 */
private object PublicCardColumns {
    val REQUIRED = setOf("_id", "note_id", "deck_id", "reps", "lapses", "sm2_factor", "queue")
    val OPTIONAL = setOf("interval", "type", "original_deck_id", "fsrs_difficulty", "last_review_time_secs")
    val ALL = REQUIRED + OPTIONAL

    /** Never published: this is the backing field's name inside a collection file. */
    const val BACKING_INTERVAL_FIELD = "ivl"
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class QueriesTest {
    /**
     * @param supported the public columns this AnkiDroid knows.
     * @param values overrides for the single card row; a null value is a column
     *   that exists and holds nothing, which is not the same as an absent column.
     * @param rejectsOnRows mimics a build that fills rows itself and so rejects an
     *   unknown column only once a row is produced, rather than when the query opens.
     */
    private class Provider(
        private val supported: Set<String> = PublicCardColumns.ALL,
        private val values: Map<String, Any?> = emptyMap(),
        private val rejectsOnRows: Boolean = false,
    ) : ReadQueries {
        val queries = mutableListOf<Triple<String, List<String>, String?>>()
        val cursors = mutableListOf<Cursor>()

        override fun checkPermission() = Unit

        override fun <T> query(path: String, columns: Array<String>, selection: String?, row: (Cursor) -> T): List<T> {
            queries.add(Triple(path, columns.toList(), selection))
            val unknown = path == "cards" && columns.any { it !in supported }
            if (unknown && !rejectsOnRows) throw AnkiColumnException(ReadFailure.EVIDENCE)
            // An impossible id matches nothing, which is how the empty probe passes
            // on a build that only rejects the projection once it fills a row.
            if (path == "cards" && selection == "cid:0") return emptyList()
            if (unknown) throw AnkiColumnException(ReadFailure.EVIDENCE)
            val data: Map<String, Any?> = when (path) {
                "cards" -> mapOf(
                    "_id" to 7L, "note_id" to 5L, "deck_id" to 2L, "reps" to 3, "lapses" to 0,
                    "sm2_factor" to 0, "queue" to -1, "interval" to 23, "type" to 1,
                    "original_deck_id" to 0L, "fsrs_difficulty" to 7.5, "last_review_time_secs" to 1_757_000_000L,
                ) + values
                "decks" -> mapOf("deck_id" to 2L, "deck_name" to "日本語::動詞")
                "models" -> mapOf("_id" to 4L, "name" to "Basic", "field_names" to "ExpressionMeaning")
                "notes" -> mapOf("_id" to 5L, "mid" to 4L, "flds" to "<b>見る</b>")
                else -> error("Unapproved path")
            }
            return MatrixCursor(columns).apply { addRow(columns.map { data[it] }.toTypedArray()); cursors.add(this) }
                .use { cursor -> buildList { while (cursor.moveToNext()) add(row(cursor)) } }
        }
    }

    private val deckName = "日本語::動詞"

    private fun cards(provider: Provider) = CardQueries(provider, DeckQueries(provider))

    private fun Provider.cardProjections() = queries.filter { it.first == "cards" }.map { it.second }

    @Test fun idSearchUsesTheFastProjectionAndPreservesAnkiSyntax() {
        val provider = Provider()
        assertEquals(listOf(7L), cards(provider).find("\"deck:日本語\" -is:new"))
        assertEquals(Triple("cards", listOf("_id"), "\"deck:日本語\" -is:new"), provider.queries.single())
        assertTrue(provider.cursors.all { it.isClosed })
    }

    @Test fun activitySearchesReachTheProviderUnchanged() {
        // The recent-practice pools are ordinary Anki searches, so the grouping and
        // the quoted deck name have to survive the bridge exactly as written.
        val scope = "(\"deck:$deckName\" \"note:Basic\")"
        val searches = listOf("rated:1", "rated:3", "rated:7", "rated:7:1", "rated:7:2").map { "$scope $it" }
        val provider = Provider()
        val queries = cards(provider)
        searches.forEach { assertEquals(listOf(7L), queries.find(it)) }
        assertEquals(searches, provider.queries.map { it.third })
        assertTrue(provider.queries.all { it.second == listOf("_id") })
    }

    @Test fun joinsDeckNamesAndPreservesTheQueueAndZeroSchedulingValues() {
        val provider = Provider()
        val read = cards(provider).info(listOf(7, 99)).single()
        assertEquals(CardRead(7, 5, 3, 0, 0, -1, deckName, 23, 1, null, 7.5, 1_757_000_000_000L), read)
        assertEquals("cid:7,99", provider.queries.last().third)
    }

    @Test fun joinsModelFieldsAndPreservesEmptyTrailingValuesAndMarkup() {
        val provider = Provider()
        assertEquals(listOf(NoteRead(5, "Basic", linkedMapOf("Expression" to "<b>見る</b>", "Meaning" to ""))),
            NoteQueries(provider, ModelQueries(provider)).info(listOf(5, 99)))
        assertEquals("nid:5,99", provider.queries.last().third)
    }

    @Test fun asksForThePublishedIntervalColumnAndNeverTheBackingField() {
        val provider = Provider()
        cards(provider).info(listOf(7))
        val projection = provider.cardProjections().last()
        assertTrue(projection.contains("interval"))
        assertFalse(projection.contains(PublicCardColumns.BACKING_INTERVAL_FIELD))
        assertTrue(projection.all { it in PublicCardColumns.ALL })
    }

    @Test fun theBackingFieldNameWouldHaveCostTheSignalOnEveryBuild() {
        // Guards the regression directly. An AnkiDroid publishing the whole contract
        // still rejects `ivl`, and the fallback then hid the mistake by returning
        // every card with the interval quietly absent.
        val provider = Provider()
        assertThrows(AnkiColumnException::class.java) {
            provider.query("cards", arrayOf("_id", PublicCardColumns.BACKING_INTERVAL_FIELD), "cid:7") { }
        }
    }

    @Test fun aSupportedColumnHoldingNullIsNotTreatedAsUnsupported() {
        // A card Anki never scheduled with FSRS carries null there. The column is
        // still readable, so the other signals on the same row have to survive.
        val provider = Provider(values = mapOf("fsrs_difficulty" to null, "last_review_time_secs" to null))
        val read = cards(provider).info(listOf(7)).single()
        assertNull(read.fsrsDifficulty)
        assertNull(read.lastReviewedAt)
        assertEquals(23, read.interval)
        assertEquals(PublicCardColumns.ALL, provider.cardProjections().last().toSet())
    }

    @Test fun oneUnsupportedColumnDoesNotCostTheOthers() {
        val supported = PublicCardColumns.ALL - "fsrs_difficulty"
        val provider = Provider(supported = supported)
        val read = cards(provider).info(listOf(7)).single()
        assertNull(read.fsrsDifficulty)
        assertEquals(23, read.interval)
        assertEquals(1_757_000_000_000L, read.lastReviewedAt)
        assertEquals(supported, provider.cardProjections().last().toSet())
    }

    @Test fun anOlderBuildWithoutAnyOptionalColumnStillYieldsEligibility() {
        val provider = Provider(supported = PublicCardColumns.REQUIRED)
        assertEquals(CardRead(7, 5, 3, 0, 0, -1, deckName), cards(provider).info(listOf(7)).single())
        assertEquals(PublicCardColumns.REQUIRED, provider.cardProjections().last().toSet())
    }

    @Test fun narrowingSurvivesABuildThatRejectsOnlyOnceRowsAreProduced() {
        val provider = Provider(supported = PublicCardColumns.ALL - "type", rejectsOnRows = true)
        val queries = cards(provider)
        queries.probe()
        val read = queries.info(listOf(7)).single()
        assertNull(read.cardType)
        assertEquals(23, read.interval)
        assertEquals(7.5, read.fsrsDifficulty!!, 0.0)
        // The narrowing is resolved once, so later batches cost no rejected query.
        val attempts = provider.cardProjections().count { it.contains("type") }
        queries.info(listOf(7))
        assertEquals(attempts, provider.cardProjections().count { it.contains("type") })
    }

    @Test fun resolvesTheHomeDeckOfACardSittingInAFilteredDeck() {
        val provider = Provider(values = mapOf("original_deck_id" to 2L))
        assertEquals(deckName, cards(provider).info(listOf(7)).single().originalDeckName)
    }

    @Test fun aCardInItsOwnDeckReportsNoSeparateHomeDeck() {
        assertNull(cards(Provider()).info(listOf(7)).single().originalDeckName)
    }

    @Test fun aMalformedValueIsACollectionFailureRatherThanAMissingColumn() {
        // Dropping a column over this would quietly reduce the evidence for every
        // later card, so a value that cannot be read stays its own failure.
        val provider = Provider(values = mapOf("reps" to null))
        val failure = assertThrows(AnkiReadException::class.java) { cards(provider).info(listOf(7)) }
        assertEquals(ReadFailure.QUERY, failure.failure)
        assertFalse(failure is AnkiColumnException)
    }

    @Test fun anImplausibleOptionalValueIsDroppedRatherThanClamped() {
        val provider = Provider(values = mapOf("last_review_time_secs" to -5L, "fsrs_difficulty" to Double.NaN))
        val read = cards(provider).info(listOf(7)).single()
        assertNull(read.lastReviewedAt)
        assertNull(read.fsrsDifficulty)
        assertEquals(3, read.reps)
    }

    @Test fun theProbeProvesAccessWithTheRequiredProjectionAlone() {
        val provider = Provider()
        cards(provider).probe()
        assertEquals(PublicCardColumns.REQUIRED, provider.cardProjections().single().toSet())
        assertEquals("cid:0", provider.queries.last().third)
    }

    @Test fun emptyBatchesNeverBecomeUnboundedSearches() {
        val provider = Provider()
        assertTrue(cards(provider).info(emptyList()).isEmpty())
        assertTrue(NoteQueries(provider, ModelQueries(provider)).info(emptyList()).isEmpty())
        assertTrue(provider.queries.isEmpty())
    }
}
