package io.github.tobiaslrn.monosai.bridge.anki

class NoteQueries(private val provider: ReadQueries, private val models: ModelQueries) {
    fun info(ids: List<Long>): List<NoteRead> {
        if (ids.isEmpty()) return emptyList()
        val types = models.all().associateBy { it.id }
        val found = provider.query("notes", arrayOf("_id", "mid", "flds"), "nid:${ids.joinToString(",")}") {
            val model = types[it.requiredLong("mid")] ?: throw AnkiReadException(ReadFailure.QUERY)
            val values = it.requiredText("flds").split('\u001f')
            require(values.size == model.fields.size)
            NoteRead(it.requiredLong("_id"), model.name, model.fields.zip(values).toMap())
        }.associateBy { it.noteId }
        return ids.mapNotNull { found[it] }
    }
}
