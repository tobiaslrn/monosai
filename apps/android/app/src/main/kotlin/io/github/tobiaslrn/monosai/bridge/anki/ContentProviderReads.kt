package io.github.tobiaslrn.monosai.bridge.anki

import android.content.Context

class ContentProviderReads(context: Context) : AnkiReads {
    private val provider = ReadProvider(context)
    private val decks = DeckQueries(provider)
    private val models = ModelQueries(provider)
    private val cards = CardQueries(provider, decks)
    private val notes = NoteQueries(provider, models)
    override fun checkAccess() { provider.checkPermission(); cards.probe() }
    override fun deckNames() = decks.namesById().values.toList()
    override fun modelNames() = models.all().map { it.name }
    override fun modelFieldNames(name: String) = models.all().firstOrNull { it.name == name }?.fields
        ?: throw AnkiReadException(ReadFailure.QUERY)
    override fun findCards(query: String) = cards.find(query)
    override fun cardsInfo(ids: List<Long>) = cards.info(ids)
    override fun notesInfo(ids: List<Long>) = notes.info(ids)
}
