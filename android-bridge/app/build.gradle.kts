plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

data class BridgeVersion(val code: Int, val name: String)

/**
 * The bounded MAJOR.MINOR.PATCH in `../version.txt`, mapped to the version code
 * exactly as `scripts/bridge/release-version.mjs` maps it: major x 1,000,000 +
 * minor x 1,000 + patch, so ordering never overlaps across component boundaries.
 * `scripts/bridge/release-version.test.mjs` owns the boundary cases.
 */
val bridgeVersion: BridgeVersion by lazy {
    val file = rootProject.file("version.txt")
    val text = file.readText()
    check(Regex("^[^\\n]+\\n$").matches(text)) { "${file.name} must hold one version and a newline" }
    val match = Regex("^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$").matchEntire(text.dropLast(1))
    checkNotNull(match) { "${file.name} must hold MAJOR.MINOR.PATCH" }
    val (major, minor, patch) = match.destructured.toList().map(String::toInt)
    check(major <= 2099 && minor <= 999 && patch <= 999) { "Version component exceeds its range" }
    val code = major * 1_000_000 + minor * 1_000 + patch
    check(code >= 1) { "Invalid version code" }
    BridgeVersion(code, "$major.$minor.$patch")
}

android {
    namespace = "io.github.tobiaslrn.monosai.bridge"
    compileSdk = 36
    defaultConfig {
        applicationId = "io.github.tobiaslrn.monosai.bridge"
        minSdk = 36
        targetSdk = 36
        // `version.txt` is the source of truth; the release lane derives its tag
        // from it rather than the other way round, so a debug build on a bench
        // reports the same version the published APK will.
        versionCode = bridgeVersion.code
        versionName = bridgeVersion.name
    }
    buildFeatures { buildConfig = true }
    signingConfigs {
        create("release") {
            val path = providers.environmentVariable("BRIDGE_KEYSTORE").orNull
            if (path != null) {
                storeFile = file(path)
                storePassword = providers.environmentVariable("BRIDGE_STORE_PASSWORD").get()
                keyAlias = providers.environmentVariable("BRIDGE_KEY_ALIAS").get()
                keyPassword = providers.environmentVariable("BRIDGE_KEY_PASSWORD").get()
            }
        }
    }
    buildTypes {
        release { signingConfig = signingConfigs.getByName("release") }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    testOptions { unitTests.isIncludeAndroidResources = true }
    sourceSets.getByName("test").resources.srcDir("../../protocol")
    sourceSets.getByName("main").assets.srcDir(layout.buildDirectory.dir("generated/notices"))
    packaging { resources.excludes += setOf("META-INF/INDEX.LIST", "META-INF/DEPENDENCIES") }
}
kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }
dependencies {
    implementation(libs.ktor.server.cio)
    implementation(libs.serialization.json)
    implementation(libs.androidx.core)
    testImplementation(libs.junit)
    testImplementation(libs.ktor.server.test.host)
    testImplementation(libs.robolectric)
}

// Pin transitive runtime versions as well as the direct version catalog.
dependencyLocking { lockAllConfigurations() }

val distributionNotices by tasks.registering(Copy::class) {
    from(rootProject.file("../LICENSE"), rootProject.file("../docs/third-party-licenses.md"))
    into(layout.buildDirectory.dir("generated/notices"))
}
tasks.named("preBuild") { dependsOn(distributionNotices) }

tasks.register("runtimeLicenses") {
    group = "verification"
    description = "Resolve the shipped dependency graph and its Maven licence metadata"
    doLast {
        val modules = listOf("debugRuntimeClasspath", "releaseRuntimeClasspath").flatMap { name ->
            configurations.getByName(name).resolvedConfiguration.resolvedArtifacts.map { it.moduleVersion.id }
        }.distinctBy { it.toString() }.sortedBy { it.toString() }
        fun licenseNames(coordinate: String, depth: Int = 0): List<String> {
            check(depth < 8) { "Maven parent chain is too deep: $coordinate" }
            val pom = configurations.detachedConfiguration(dependencies.create("$coordinate@pom"))
                .apply { isTransitive = false }.singleFile
            val factory = javax.xml.parsers.DocumentBuilderFactory.newInstance()
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
            val document = factory.newDocumentBuilder().parse(pom)
            val licenses = document.getElementsByTagName("license")
            val names = (0 until licenses.length).map { index ->
                val element = licenses.item(index) as org.w3c.dom.Element
                element.getElementsByTagName("name").item(0).textContent.trim()
            }
            if (names.isNotEmpty()) return names
            val parent = document.getElementsByTagName("parent").item(0) as? org.w3c.dom.Element ?: return emptyList()
            fun part(name: String) = parent.getElementsByTagName(name).item(0).textContent.trim()
            return licenseNames("${part("groupId")}:${part("artifactId")}:${part("version")}", depth + 1)
        }
        val records = modules.map { id ->
            mapOf("name" to "${id.group}:${id.name}", "version" to id.version, "licenses" to licenseNames(id.toString()))
        }
        val output = layout.buildDirectory.file("reports/runtime-dependencies.json").get().asFile
        output.parentFile.mkdirs()
        output.writeText(groovy.json.JsonOutput.prettyPrint(groovy.json.JsonOutput.toJson(records)) + "\n")
    }
}
