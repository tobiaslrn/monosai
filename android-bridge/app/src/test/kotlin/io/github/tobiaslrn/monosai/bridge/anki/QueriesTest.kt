package io.github.tobiaslrn.monosai.bridge.anki

import android.database.Cursor
import android.database.MatrixCursor
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class QueriesTest {
    private class Provider : ReadQueries {
        val queries = mutableListOf<Triple<String, List<String>, String?>>()
        val cursors = mutableListOf<Cursor>()
        override fun checkPermission() = Unit
        override fun <T> query(path: String, columns: Array<String>, selection: String?, row: (Cursor) -> T): List<T> {
            queries.add(Triple(path, columns.toList(), selection))
            val data: Map<String, Any> = when (path) {
                "cards" -> mapOf("_id" to 7L, "note_id" to 5L, "deck_id" to 2L, "reps" to 3, "lapses" to 0, "sm2_factor" to 0)
                "decks" -> mapOf("deck_id" to 2L, "deck_name" to "日本語::動詞")
                "models" -> mapOf("_id" to 4L, "name" to "Basic", "field_names" to "Expression\u001fMeaning")
                "notes" -> mapOf("_id" to 5L, "mid" to 4L, "flds" to "<b>見る</b>\u001f")
                else -> error("Unapproved path")
            }
            return MatrixCursor(columns).apply { addRow(columns.map { data[it] }.toTypedArray()); cursors.add(this) }
                .use { cursor -> buildList { while (cursor.moveToNext()) add(row(cursor)) } }
        }
    }
    @Test fun idSearchUsesTheFastProjectionAndPreservesAnkiSyntax() {
        val provider = Provider()
        val cards = CardQueries(provider, DeckQueries(provider))
        assertEquals(listOf(7L), cards.find("\"deck:日本語\" -is:new"))
        assertEquals(Triple("cards", listOf("_id"), "\"deck:日本語\" -is:new"), provider.queries.single())
        assertTrue(provider.cursors.all { it.isClosed })
    }
    @Test fun joinsDeckNamesAndKeepsZeroSchedulingValues() {
        val provider = Provider()
        assertEquals(listOf(CardRead(7, 5, 3, 0, 0, "日本語::動詞")), CardQueries(provider, DeckQueries(provider)).info(listOf(7, 99)))
        assertEquals("cid:7,99", provider.queries.last().third)
    }
    @Test fun joinsModelFieldsAndPreservesEmptyTrailingValuesAndMarkup() {
        val provider = Provider()
        assertEquals(listOf(NoteRead(5, "Basic", linkedMapOf("Expression" to "<b>見る</b>", "Meaning" to ""))),
            NoteQueries(provider, ModelQueries(provider)).info(listOf(5, 99)))
        assertEquals("nid:5,99", provider.queries.last().third)
    }
    @Test fun emptyBatchesNeverBecomeUnboundedSearches() {
        val provider = Provider()
        assertTrue(CardQueries(provider, DeckQueries(provider)).info(emptyList()).isEmpty())
        assertTrue(NoteQueries(provider, ModelQueries(provider)).info(emptyList()).isEmpty())
        assertTrue(provider.queries.isEmpty())
    }
}
