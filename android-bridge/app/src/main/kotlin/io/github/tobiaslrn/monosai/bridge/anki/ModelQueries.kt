package io.github.tobiaslrn.monosai.bridge.anki

data class ModelRead(val id: Long, val name: String, val fields: List<String>)
class ModelQueries(private val provider: ReadQueries) {
    fun all(): List<ModelRead> = provider.query("models", arrayOf("_id", "name", "field_names")) {
        ModelRead(it.requiredLong("_id"), it.requiredText("name"), it.requiredText("field_names").split('\u001f'))
    }
}
