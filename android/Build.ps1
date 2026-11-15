param(
    [string[]]$Tasks = @(':wear-contract:testDebugUnitTest', ':app:testDebugUnitTest', ':app:lintDebug', ':app:assembleDebug', ':wear:testDebugUnitTest', ':wear:lintDebug', ':wear:assembleDebug'),
    [string]$ToolRoot = $env:NOURISH_ANDROID_TOOL_ROOT,
    [switch]$CloudSessionOnly
)
$ErrorActionPreference = 'Stop'
if (!$ToolRoot) { $ToolRoot = Join-Path $PSScriptRoot '.local-tools' }
$toolRoot = [IO.Path]::GetFullPath($ToolRoot)
$javaPath = Join-Path $toolRoot 'java/jdk-17.0.20.1+1'
$gradlePath = Join-Path $toolRoot 'gradle-8.13/bin/gradle.bat'
if (!(Test-Path -LiteralPath (Join-Path $javaPath 'bin/java.exe')) -or !(Test-Path -LiteralPath $gradlePath)) {
    throw 'The project-local JDK17 and Gradle8.13 are missing. See README.md for toolchain paths.'
}
$environment = @{
    JAVA_HOME = $javaPath
    ANDROID_HOME = Join-Path $toolRoot 'sdk'
    ANDROID_USER_HOME = Join-Path $toolRoot 'android-user'
    GRADLE_USER_HOME = Join-Path $toolRoot 'gradle-cache'
}
$previous = @{}
foreach ($key in $environment.Keys) {
    $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    [Environment]::SetEnvironmentVariable($key, $environment[$key], 'Process')
}
Push-Location $PSScriptRoot
try {
    $arguments = @('--no-daemon', '--console=plain', '--max-workers=2', '-Pkotlin.compiler.execution.strategy=in-process')
    if ($CloudSessionOnly) { $arguments += '-PcloudSessionOnly=true'; $Tasks = @(':app:testDebugUnitTest') }
    & $gradlePath @arguments @Tasks
    if ($LASTEXITCODE -ne 0) { throw "Android build failed (exit $LASTEXITCODE)." }
} finally {
    Pop-Location
    foreach ($key in $previous.Keys) { [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process') }
}
