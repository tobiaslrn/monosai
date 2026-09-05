plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "io.github.tobiaslrn.monosai.bridge"
    compileSdk = 36
    defaultConfig {
        applicationId = "io.github.tobiaslrn.monosai.bridge"
        minSdk = 36
        targetSdk = 36
        versionCode = providers.environmentVariable("BRIDGE_VERSION_CODE").orElse("1").get().toInt()
        versionName = providers.environmentVariable("BRIDGE_VERSION_NAME").orElse("0.1.0-dev").get()
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
