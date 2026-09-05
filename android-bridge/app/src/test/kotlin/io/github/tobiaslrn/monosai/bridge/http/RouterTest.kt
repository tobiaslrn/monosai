package io.github.tobiaslrn.monosai.bridge.http

import io.github.tobiaslrn.monosai.bridge.anki.*
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.io.File

/** A query-port fake, not canned router output: golden responses test the actual mapping. */
internal class FixtureReads : AnkiReads {
    var failure: ReadFailure? = null
    var reads = 0
    override fun checkAccess() { reads++; failure?.let { throw AnkiReadException(it) } }
    override fun deckNames() = listOf("Core Japanese")
    override fun modelNames() = listOf("Basic")
    override fun modelFieldNames(name: String): List<String> {
        require(name == "Basic"); return listOf("Expression", "Meaning")
    }
    override fun findCards(query: String): List<Long> { require(query == "deck:*"); return listOf(1L) }
    override fun cardsInfo(ids: List<Long>): List<CardRead> {
        require(ids == listOf(1L)); return listOf(CardRead(1, 1, 3, 1, 2400, "Core Japanese"))
    }
    override fun notesInfo(ids: List<Long>): List<NoteRead> {
        require(ids == listOf(1L)); return listOf(NoteRead(1, "Basic", linkedMapOf("Expression" to "<b>ねこ</b>", "Meaning" to "cat")))
    }
}

class RouterTest {
    @Test fun everyFixtureIsByteIdentical() {
        val directory = File(javaClass.classLoader!!.getResource("fixtures")!!.toURI())
        assertEquals(AllowedReads.entries.size + 1, directory.listFiles()!!.size)
        for (fixture in directory.listFiles()!!) {
            val actual = Router(FixtureReads()).route(File(fixture, "request.json").readText())
            assertArrayEquals(fixture.name, File(fixture, "response.json").readBytes(), actual.toByteArray())
        }
    }
    @Test fun unknownWritesNeverReachTheProvider() {
        val reads = FixtureReads()
        assertEquals("unsupported action: addNote", Json.parseToJsonElement(Router(reads).route("""{"action":"addNote","version":6}""")).jsonObject["error"]!!.jsonPrimitive.content)
        assertEquals(0, reads.reads)
    }
    @Test fun invalidBodiesAndIdsAreRejected() {
        val router = Router(FixtureReads())
        for (body in listOf("no", "[]", "{}", """{"action":"cardsInfo","version":5}""",
            """{"action":"cardsInfo","version":6,"params":{"cards":["1"]}}""",
            """{"action":"cardsInfo","version":6,"params":{"cards":[9007199254740992]}}""")) {
            assertEquals("invalid request", Json.parseToJsonElement(router.route(body)).jsonObject["error"]!!.jsonPrimitive.content)
        }
    }
    @Test fun accessFailuresKeepTheirTypedCodeAndNeverReturnAStackTrace() {
        for (failure in ReadFailure.entries) {
            val reads = FixtureReads().apply { this.failure = failure }
            assertEquals(envelope(error = failure.code), Router(reads).route("""{"action":"requestPermission","version":6}"""))
        }
    }
}
