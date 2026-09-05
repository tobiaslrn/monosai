package io.github.tobiaslrn.monosai.bridge.anki

class DeckQueries(private val provider: ReadQueries) {
    fun namesById(): Map<Long, String> = provider.query("decks", arrayOf("deck_id", "deck_name")) {
        it.requiredLong("deck_id") to it.requiredText("deck_name")
    }.toMap()
}
