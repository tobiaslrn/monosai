package io.github.tobiaslrn.monosai.bridge.updates

import android.content.Context
import android.content.pm.PackageManager
import io.github.tobiaslrn.monosai.bridge.BuildConfig
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.serialization.json.*
import java.io.File
import java.net.HttpURLConnection
import java.net.URI

data class BridgeRelease(val code: Int, val tag: String, val download: String)

class ReleaseUpdates(private val context: Context) {
    suspend fun check(): BridgeRelease? {
        val json = request("https://api.github.com/repos/tobiaslrn/monosai/releases?per_page=100", 2 * 1024 * 1024)
        return parseReleases(json.decodeToString()).filter { it.code > BuildConfig.VERSION_CODE }.maxByOrNull { it.code }
    }
    suspend fun download(release: BridgeRelease): File {
        require(release.download == assetUrl(release.tag))
        val directory = File(context.cacheDir, "updates").apply { mkdirs() }
        val target = File(directory, "bridge.apk")
        val partial = File(directory, "bridge.download")
        try {
            partial.writeBytes(request(release.download, 32 * 1024 * 1024))
            val flags = PackageManager.GET_SIGNING_CERTIFICATES
            val archive = context.packageManager.getPackageArchiveInfo(partial.path, flags) ?: error("Invalid APK")
            val installed = context.packageManager.getPackageInfo(context.packageName, flags)
            require(archive.packageName == context.packageName && archive.longVersionCode == release.code.toLong())
            val expected = installed.signingInfo!!.apkContentsSigners.map { it.toCharsString() }.toSet()
            val actual = archive.signingInfo!!.apkContentsSigners.map { it.toCharsString() }.toSet()
            require(expected.isNotEmpty() && expected == actual) { "APK signer does not match this installation" }
            require(partial.renameTo(target)) { "Could not save update" }
            return target
        } finally { partial.delete() }
    }
    private suspend fun request(address: String, limit: Int): ByteArray {
        var uri = URI(address)
        repeat(5) {
            require(uri.scheme == "https" && uri.host in setOf("api.github.com", "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"))
            val connection = uri.toURL().openConnection() as HttpURLConnection
            connection.connectTimeout = 15_000; connection.readTimeout = 15_000
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("User-Agent", "Monosai-Anki-Bridge/${BuildConfig.VERSION_NAME}")
            try {
                if (connection.responseCode in setOf(301, 302, 303, 307, 308)) {
                    uri = uri.resolve(connection.getHeaderField("Location") ?: error("Missing download location"))
                } else {
                    check(connection.responseCode == 200) { "Update server unavailable" }
                    require(connection.contentLengthLong <= limit)
                    return connection.inputStream.use { input ->
                        val output = java.io.ByteArrayOutputStream()
                        val buffer = ByteArray(8192)
                        while (true) {
                            currentCoroutineContext().ensureActive()
                            val size = input.read(buffer)
                            if (size == -1) break
                            require(output.size() + size <= limit)
                            output.write(buffer, 0, size)
                        }
                        output.toByteArray()
                    }
                }
            } finally { connection.disconnect() }
        }
        error("Too many download redirects")
    }
}

internal fun assetUrl(tag: String) = "https://github.com/tobiaslrn/monosai/releases/download/$tag/monosai-anki-bridge.apk"
internal fun parseReleases(body: String): List<BridgeRelease> = Json.parseToJsonElement(body).jsonArray.mapNotNull { element ->
    val release = element.jsonObject
    if (release["draft"]?.jsonPrimitive?.booleanOrNull != false || release["prerelease"]?.jsonPrimitive?.booleanOrNull != false) return@mapNotNull null
    val tag = release["tag_name"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
    val code = releaseVersionCode(tag) ?: return@mapNotNull null
    val expected = assetUrl(tag)
    val assets = release["assets"] as? JsonArray ?: return@mapNotNull null
    if (assets.none { (it as? JsonObject)?.get("browser_download_url")?.jsonPrimitive?.contentOrNull == expected }) return@mapNotNull null
    BridgeRelease(code, tag, expected)
}
