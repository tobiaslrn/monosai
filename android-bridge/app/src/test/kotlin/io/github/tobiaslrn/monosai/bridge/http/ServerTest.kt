package io.github.tobiaslrn.monosai.bridge.http

import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import org.junit.Assert.*
import org.junit.Test

class ServerTest {
    @Test fun preflightHasCorsAndPrivateNetworkHeadersWithoutABody() = testApplication {
        application { bridgeRoutes(Router(FixtureReads())) { DEFAULT_ORIGINS } }
        val response = client.options("/") {
            header(HttpHeaders.Origin, "https://tobiaslrn.github.io")
            header("Access-Control-Request-Private-Network", "true")
            header(HttpHeaders.AccessControlRequestMethod, "POST")
        }
        assertEquals(HttpStatusCode.NoContent, response.status)
        assertEquals("https://tobiaslrn.github.io", response.headers[HttpHeaders.AccessControlAllowOrigin])
        assertEquals("true", response.headers["Access-Control-Allow-Private-Network"])
    }
    @Test fun refusedOriginsNeverDispatchButExposeOnlyTheDenial() = testApplication {
        val reads = FixtureReads()
        application { bridgeRoutes(Router(reads)) { DEFAULT_ORIGINS } }
        for (origin in listOf("https://evil.example", "null", "https://tobiaslrn.github.io.evil.example")) {
            val response = client.post("/") { header(HttpHeaders.Origin, origin); setBody("""{"action":"deckNames","version":6}""") }
            assertEquals(envelope(error = "origin-not-allowed"), response.bodyAsText())
        }
        assertEquals(0, reads.reads)
    }
    @Test fun textPlainJsonAndSettingsChangesWork() = testApplication {
        var origins = DEFAULT_ORIGINS
        application { bridgeRoutes(Router(FixtureReads())) { origins } }
        suspend fun read() = client.post("/") {
            header(HttpHeaders.Origin, "http://localhost:4200")
            setBody("""{"action":"version","version":6}""")
        }.bodyAsText()
        assertEquals(envelope(kotlinx.serialization.json.JsonPrimitive(6)), read())
        origins = emptySet()
        assertEquals(envelope(error = "origin-not-allowed"), read())
    }
    @Test fun originsAreExactAddressesWithoutPathsOrWildcards() {
        for (origin in DEFAULT_ORIGINS) assertTrue(validOrigin(origin))
        for (origin in listOf("*", "null", "https://example.com/", "https://user@example.com", "https://example.com?x", "file:///x", "http://localhost:99999")) assertFalse(origin, validOrigin(origin))
    }
}
