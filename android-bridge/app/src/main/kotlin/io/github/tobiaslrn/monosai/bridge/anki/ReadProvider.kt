package io.github.tobiaslrn.monosai.bridge.anki

import android.content.Context
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri

const val ANKI_AUTHORITY = "com.ichi2.anki.flashcards"
const val ANKI_PERMISSION = "com.ichi2.anki.permission.READ_WRITE_DATABASE"

/** Only query is exposed. No resolver or writable collection escapes this boundary. */
interface ReadQueries {
    fun checkPermission()
    fun <T> query(path: String, columns: Array<String>, selection: String? = null, row: (Cursor) -> T): List<T>
}

class ReadProvider(private val context: Context) : ReadQueries {
    override fun checkPermission() {
        if (context.packageManager.resolveContentProvider(ANKI_AUTHORITY, 0) == null)
            throw AnkiReadException(ReadFailure.ABSENT)
        if (context.checkSelfPermission(ANKI_PERMISSION) != PackageManager.PERMISSION_GRANTED)
            throw AnkiReadException(ReadFailure.PERMISSION)
    }

    override fun <T> query(path: String, columns: Array<String>, selection: String?, row: (Cursor) -> T): List<T> {
        checkPermission()
        // AnkiDroid returns null for a search without matches.
        val cursor = open(path, columns, selection) ?: return emptyList()
        return cursor.use { collect(path, it, row) }
    }

    /**
     * Opening is where a build that does not know a projection column rejects it,
     * before a row exists. Keeping it in its own frame is what lets the caller
     * tell an unsupported column from a permission, cursor or collection failure.
     */
    private fun open(path: String, columns: Array<String>, selection: String?): Cursor? = try {
        context.contentResolver.query(Uri.parse("content://$ANKI_AUTHORITY/$path"), columns, selection, null, null)
    } catch (_: SecurityException) {
        throw AnkiReadException(ReadFailure.PERMISSION)
    } catch (_: IllegalArgumentException) {
        throw columnFailure(path)
    } catch (_: RuntimeException) {
        throw AnkiReadException(ReadFailure.QUERY)
    }

    /**
     * Some builds fill the cursor window lazily and only then reject the column,
     * so this frame reports the same recoverable failure. A value the row mapper
     * refuses raises [AnkiReadException] instead and is passed through unchanged:
     * a malformed number is a collection problem, never a missing column.
     */
    private fun <T> collect(path: String, cursor: Cursor, row: (Cursor) -> T): List<T> = try {
        buildList { while (cursor.moveToNext()) add(row(cursor)) }
    } catch (error: AnkiReadException) {
        throw error
    } catch (_: IllegalArgumentException) {
        throw columnFailure(path)
    } catch (_: RuntimeException) {
        throw AnkiReadException(ReadFailure.QUERY)
    }

    /** Card columns are the review evidence, so their absence keeps that code. */
    private fun columnFailure(path: String) =
        AnkiColumnException(if (path == "cards") ReadFailure.EVIDENCE else ReadFailure.QUERY)
}

/**
 * Column lookups separate the two failures the caller must not confuse: a column
 * the cursor never carried is an unsupported projection, while a null or
 * out-of-range value in a column that exists is a malformed row.
 */
private fun Cursor.index(column: String): Int {
    val index = getColumnIndex(column)
    if (index < 0) throw IllegalArgumentException("Unknown column")
    return index
}

private fun Cursor.value(column: String): Long {
    val index = index(column)
    if (isNull(index)) throw AnkiReadException(ReadFailure.QUERY)
    return getLong(index)
}

private fun malformed(): Nothing = throw AnkiReadException(ReadFailure.QUERY)

internal fun Cursor.requiredLong(column: String): Long =
    value(column).also { if (it !in 0..9_007_199_254_740_991L) malformed() }

internal fun Cursor.requiredInt(column: String): Int =
    value(column).also { if (it !in Int.MIN_VALUE.toLong()..Int.MAX_VALUE.toLong()) malformed() }.toInt()

internal fun Cursor.requiredText(column: String): String {
    val index = index(column)
    if (isNull(index)) throw AnkiReadException(ReadFailure.QUERY)
    return getString(index)
}

/**
 * Optional columns are read only when they were requested and the row carries a
 * value. An implausible one is dropped rather than clamped, so a signal the
 * collection never supported cannot reach the learner as a confident reason.
 */
internal fun Cursor.optionalInt(column: String): Int? {
    val index = getColumnIndex(column)
    if (index < 0 || isNull(index)) return null
    val value = getLong(index)
    return if (value in Int.MIN_VALUE.toLong()..Int.MAX_VALUE.toLong()) value.toInt() else null
}

internal fun Cursor.optionalLong(column: String): Long? {
    val index = getColumnIndex(column)
    if (index < 0 || isNull(index)) return null
    val value = getLong(index)
    return if (value in 0..9_007_199_254_740_991L) value else null
}

internal fun Cursor.optionalDouble(column: String): Double? {
    val index = getColumnIndex(column)
    if (index < 0 || isNull(index)) return null
    val value = getDouble(index)
    return if (value.isFinite()) value else null
}

/** Converts the provider's review time from seconds once, at the only boundary that knows the unit. */
internal fun Cursor.optionalEpochMillis(column: String): Long? {
    val seconds = optionalLong(column) ?: return null
    if (seconds <= 0 || seconds > 9_007_199_254_740_991L / 1000) return null
    return seconds * 1000
}
