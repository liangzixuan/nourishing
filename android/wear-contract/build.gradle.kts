plugins { id("com.android.library"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "local.nourish.wearcontract"
    compileSdk = 36
    defaultConfig { minSdk = 28 }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}
kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }
tasks.withType<Test>().configureEach {
    systemProperty("nourish.wearFixture",rootProject.file("fixtures/wear-summary.json").absolutePath)
    inputs.file(rootProject.file("fixtures/wear-summary.json"))
    systemProperty("nourish.wearLanguageFixtures",rootProject.file("fixtures/wear-summary-languages.json").absolutePath)
    inputs.file(rootProject.file("fixtures/wear-summary-languages.json"))
    systemProperty("nourish.wearReminderFixture",rootProject.file("fixtures/wear-reminder-claim.json").absolutePath)
    inputs.file(rootProject.file("fixtures/wear-reminder-claim.json"))
}
dependencies { testImplementation("junit:junit:4.13.2"); testImplementation("org.json:json:20250517") }
