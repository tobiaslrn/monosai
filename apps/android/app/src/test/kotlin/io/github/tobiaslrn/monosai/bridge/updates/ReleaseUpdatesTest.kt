package io.github.tobiaslrn.monosai.bridge.updates

import org.junit.Assert.*
import org.junit.Test

class ReleaseUpdatesTest {
    @Test fun versionCodesAreBoundedAndMonotonic() {
        assertEquals(1000, releaseVersionCode("bridge-v0.1.0"))
        assertTrue(releaseVersionCode("bridge-v1.0.0")!! > releaseVersionCode("bridge-v0.999.999")!!)
        for (tag in listOf("v1.2.3", "bridge-v1.2", "bridge-v1.2.3-beta", "bridge-v01.2.3", "bridge-v0.0.0", "bridge-v2100.0.0", "bridge-v1.1000.0")) assertNull(tag, releaseVersionCode(tag))
    }
    @Test fun onlyStableBridgeReleasesWithTheExactFirstPartyAssetAreOffered() {
        val valid = """{"draft":false,"prerelease":false,"tag_name":"bridge-v1.2.3","assets":[{"browser_download_url":"${assetUrl("bridge-v1.2.3")}"}]}"""
        assertEquals(1, parseReleases("[$valid]").size)
        assertTrue(parseReleases("[${valid.replace("\"draft\":false", "\"draft\":true")}]").isEmpty())
        assertTrue(parseReleases("[${valid.replace("https://github.com", "https://evil.example")}]").isEmpty())
        assertTrue(parseReleases("[${valid.replace("bridge-v1.2.3", "web-v1.2.3")}]").isEmpty())
    }
}
