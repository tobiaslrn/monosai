package io.github.tobiaslrn.monosai.bridge.http

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.cio.*
import io.ktor.server.engine.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.utils.io.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.io.readByteArray

const val BRIDGE_PORT = 8765
private const val MAX_BODY = 65_536L

class Server(private val router: Router, private val origins: () -> Set<String>) {
    private val engine = embeddedServer(CIO, host = "127.0.0.1", port = BRIDGE_PORT) { bridgeRoutes(router, origins) }
    fun start() { engine.start(wait = false) }
    fun stop() { engine.stop(200, 1_000) }
}

fun Application.bridgeRoutes(router: Router, origins: () -> Set<String>) {
    routing {
        route("/") {
            handle {
                val origin = call.request.header(HttpHeaders.Origin)
                val valid = origin != null && validOrigin(origin)
                // Reflections on a rejected origin carry only the denial envelope, never a read.
                // This lets fetch classify the failure instead of masking it as a network error.
                call.response.header(HttpHeaders.Vary, "Origin")
                call.response.header(HttpHeaders.CacheControl, "no-store")
                if (valid) call.response.header(HttpHeaders.AccessControlAllowOrigin, origin!!)
                if (call.request.httpMethod == HttpMethod.Options) {
                    call.response.header(HttpHeaders.AccessControlAllowMethods, "POST, OPTIONS")
                    call.response.header(HttpHeaders.AccessControlAllowHeaders, "Content-Type")
                    call.response.header("Access-Control-Allow-Private-Network", "true")
                    call.respondText("", status = HttpStatusCode.NoContent)
                    return@handle
                }
                if (!valid || origin !in origins()) {
                    call.respondText(envelope(error = "origin-not-allowed"), ContentType.Application.Json)
                    return@handle
                }
                if (call.request.httpMethod != HttpMethod.Post) {
                    call.respondText(envelope(error = "invalid request"), ContentType.Application.Json, HttpStatusCode.MethodNotAllowed)
                    return@handle
                }
                val bytes = call.receiveChannel().readRemaining(MAX_BODY + 1).readByteArray()
                val response = if (bytes.size > MAX_BODY) envelope(error = "invalid request")
                    else withContext(Dispatchers.IO) { router.route(bytes.decodeToString()) }
                call.respondText(response, ContentType.Application.Json)
            }
        }
    }
}
