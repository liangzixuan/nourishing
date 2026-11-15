plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "local.nourish.watch"
    compileSdk = 36
    buildToolsVersion = "35.0.0"
    defaultConfig { applicationId = "local.nourish.healthconnect"; minSdk = 30; targetSdk = 36; versionCode = 23; versionName = "0.23.0"; testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner" }
    sourceSets.getByName("androidTest").assets.srcDir("../fixtures")
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}
kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }
dependencies {
    implementation(project(":wear-contract"))
    implementation("com.google.android.gms:play-services-wearable:20.0.1")
    constraints { implementation("androidx.fragment:fragment:1.8.9") }
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20250517")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.test:core:1.7.0")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
}
