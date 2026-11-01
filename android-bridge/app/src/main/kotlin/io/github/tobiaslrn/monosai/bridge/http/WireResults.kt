package io.github.tobiaslrn.monosai.bridge.http

import io.github.tobiaslrn.monosai.bridge.anki.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * The results the bridge puts on the wire.
 *
 * Property order is key order, and the golden fixtures compare bytes, so reordering
 * a property here is a wire change. A null is written as an absent key, never as
 * `null` or a zero: an older AnkiDroid or a card Anki never scheduled with FSRS
 * has no value to report.
 */
internal val wire = Json { explicitNulls = false }

@Serializable
internal class PermissionResult(
    val permission: String,
    val requireApiKey: Boolean,
    val version: Int,
    val monosaiBridge: BridgeAnnouncement,
)

@Serializable
internal class BridgeAnnouncement(val version: String, val contract: Int)

@Serializable
internal class CardResult(
    val cardId: Long,
    val note: Long,
    val reps: Int,
    val lapses: Int,
    val factor: Int,
    val queue: Int,
    val interval: Int?,
    val cardType: Int?,
    val fsrsDifficulty: Double?,
    val lastReviewedAt: Long?,
    val deckName: String,
    val originalDeckName: String?,
) {
    constructor(card: CardRead) : this(
        cardId = card.cardId, note = card.note, reps = card.reps, lapses = card.lapses,
        factor = card.factor, queue = card.queue, interval = card.interval,
        cardType = card.cardType, fsrsDifficulty = card.fsrsDifficulty,
        lastReviewedAt = card.lastReviewedAt, deckName = card.deckName,
        originalDeckName = card.originalDeckName,
    )
}

@Serializable
internal class NoteResult(val noteId: Long, val modelName: String, val fields: Map<String, NoteFieldResult>) {
    constructor(note: NoteRead) : this(
        noteId = note.noteId, modelName = note.modelName,
        fields = note.fields.entries.withIndex().associate { (order, field) ->
            field.key to NoteFieldResult(field.value, order)
        },
    )
}

@Serializable
internal class NoteFieldResult(val value: String, val order: Int)
