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
        try {
            val cursor = context.contentResolver.query(Uri.parse("content://$ANKI_AUTHORITY/$path"), columns, selection, null, null)
                ?: return emptyList() // AnkiDroid returns null for a notes search without matches.
            return cursor.use { buildList { while (it.moveToNext()) add(row(it)) } }
        } catch (_: SecurityException) {
            throw AnkiReadException(ReadFailure.PERMISSION)
        } catch (error: AnkiReadException) {
            throw error
        } catch (_: IllegalArgumentException) {
            throw AnkiReadException(if (path == "cards") ReadFailure.EVIDENCE else ReadFailure.QUERY)
        } catch (_: RuntimeException) {
            throw AnkiReadException(ReadFailure.QUERY)
        }
    }
}

internal fun Cursor.requiredLong(column: String): Long {
    val index = getColumnIndexOrThrow(column)
    if (isNull(index)) throw IllegalArgumentException("Missing column")
    return getLong(index).also { require(it in 0..9_007_199_254_740_991L) }
}
internal fun Cursor.requiredText(column: String): String {
    val index = getColumnIndexOrThrow(column)
    if (isNull(index)) throw IllegalArgumentException("Missing column")
    return getString(index)
}
