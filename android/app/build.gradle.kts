import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Firebase is optional. Google's plugin owns package matching and resource generation.
// Server service-account credentials never belong in this Android package.
if (file("google-services.json").isFile) {
    apply(plugin = "com.google.gms.google-services")
}

android {
    namespace = "local.nourish.healthconnect"
    compileSdk = 36
    buildToolsVersion = "35.0.0"
    defaultConfig {
        applicationId = "local.nourish.healthconnect"
        minSdk = 28
        targetSdk = 36
        versionCode = 46
        versionName = "0.25.21"
        val workspaceOrigin=providers.gradleProperty("workspaceOrigin").orElse("https://nourishing-cloud.appwrite.network").get()
        require(workspaceOrigin in setOf("https://nourishing.app","https://nourishing-cloud.appwrite.network")) { "Use an approved Nourishing cloud origin." }
        buildConfigField("String","WORKSPACE_ORIGIN","\"$workspaceOrigin\"")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    sourceSets.getByName("androidTest").assets.srcDir("../fixtures")
    buildTypes {
        release { isMinifyEnabled = false }
    }
}

tasks.withType<Test>().configureEach {
    // Explicit focused gate while the legacy Node fixtures are ported to cloud handlers.
    if (providers.gradleProperty("cloudSessionOnly").orNull == "true") {
        filter {
            includeTestsMatching("local.nourish.healthconnect.CloudAccountSessionTest")
            includeTestsMatching("local.nourish.healthconnect.CloudHealthTransferTest")
        }
    } else {
    inputs.file(rootProject.file("fixtures/home-widget.json"))
    systemProperty("nourish.wearReminderFixture",rootProject.file("fixtures/wear-reminder-claim.json").absolutePath)
    inputs.file(rootProject.file("fixtures/wear-reminder-claim.json"))
    systemProperty("nourish.wearFixture",rootProject.file("fixtures/wear-summary.json").absolutePath)
    inputs.file(rootProject.file("fixtures/wear-summary.json"))
    systemProperty("nourish.testFixtureDirectory", layout.buildDirectory.dir("outputs/test-fixtures").get().asFile.absolutePath)
    val intakeFixture=rootProject.file("fixtures/intake-write-previews.json")
    inputs.file(intakeFixture)
    systemProperty("nourish.intakeWriteFixture",intakeFixture.absolutePath)
    val correctedIntakeFixture=rootProject.file("fixtures/corrected-intake-previews.json")
    inputs.file(correctedIntakeFixture)
    systemProperty("nourish.correctedIntakeFixture",correctedIntakeFixture.absolutePath)
    val fixtureRoot=providers.gradleProperty("nativeServerFixtureRoot").orNull?.let { file(it) } ?: rootProject.file("tests")
    val reminderServerFixture=fixtureRoot.resolve("android-reminder-client-http-fixture.mjs")
    inputs.file(reminderServerFixture)
    systemProperty("nourish.reminderServerFixture",reminderServerFixture.absolutePath)
    val intakeServerFixture=fixtureRoot.resolve("intake-session-http-fixture.mjs")
    inputs.file(intakeServerFixture)
    systemProperty("nourish.intakeServerFixture",intakeServerFixture.absolutePath)
    val biometricFixture=rootProject.file("fixtures/biometric-write-previews.json")
    inputs.file(biometricFixture)
    inputs.file(rootProject.file("fixtures/compound-weight-previews.json"))
    systemProperty("nourish.biometricWriteFixture",biometricFixture.absolutePath)
    }
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

dependencies {
    implementation(platform("com.google.firebase:firebase-bom:35.1.0"))
    implementation("com.google.firebase:firebase-messaging")
    implementation(project(":wear-contract"))
    implementation("androidx.core:core-remoteviews:1.1.0")
    implementation("com.google.android.gms:play-services-wearable:20.0.1")
    constraints { implementation("androidx.fragment:fragment:1.8.9") { because("Play services must not pull Fragment 1.0 into the existing activity-result workflow.") } }
    implementation("androidx.health.connect:connect-client:1.1.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.10.2")
    implementation("com.squareup.okhttp3:okhttp:5.4.0")
    implementation("androidx.work:work-runtime-ktx:2.12.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20250517")
    testImplementation("com.squareup.okhttp3:mockwebserver3:5.4.0")
    testImplementation("com.squareup.okhttp3:okhttp-tls:5.4.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.test:core:1.7.0")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.work:work-testing:2.12.0")
}
