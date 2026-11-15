package local.nourish.healthconnect

import java.io.File
import java.io.IOException
import java.net.Proxy
import java.net.URI
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okio.BufferedSink
import org.json.JSONObject

const val MAX_TRANSFER_RESPONSE_BYTES = 1_048_576

@JvmInline
value class WorkspaceOrigin private constructor(val value: String) {
    fun endpoint(path: String): String {
        if(path in setOf("/api/android-reminders/inspect","/api/android-reminders/register","/api/android-reminders/disconnect"))return value+path
        if(path in setOf("/api/health-connect/export/intake/corrected/options","/api/health-connect/export/intake/corrected/preview","/api/health-connect/export/intake/corrected/activate","/api/health-connect/export/intake/corrected/verify"))return value+path
        if(path in setOf("/api/wear-reminders/register","/api/wear-reminders/claim","/api/wear-reminders/ack"))return value+path
        if(path in setOf("/api/wear-summary?unit=kcal","/api/wear-summary?unit=kJ"))return value+path
        require(path in setOf("/api/health-connect/export/intake/options", "/api/health-connect/export/intake/preview", "/api/health-connect/export/intake/verify", "/api/health-connect/export/biometric/options", "/api/health-connect/export/biometric/preview", "/api/health-connect/export/biometric/verify", "/api/access", "/api/home-widgets?unit=kcal", "/api/home-widgets?unit=kJ", "/api/health-connect/preview?summary=1", "/api/health-connect/import?summary=1", "/api/health-connect/reconcile/preview?summary=1", "/api/health-connect/reconcile/apply") || validReceiptPath(path))
        return value + path
    }
    companion object {
        fun parse(value: String): WorkspaceOrigin {
            val input = value.trim()
            runCatching{CloudOrigin.parse(input)}.getOrNull()?.let{return WorkspaceOrigin(it.value)}
            val uri = runCatching { URI(input) }.getOrElse { throw WorkspaceValidationFailure(WorkspaceError.ADDRESS_SYNTAX) }
            val host = uri.host?.lowercase().orEmpty()
            requireWorkspace(uri.scheme == "https" && host.endsWith(".ts.net") && host.length > 7 &&
                Regex("[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\\.ts\\.net").matches(host) &&
                !host.contains("..") && uri.rawUserInfo == null && uri.rawQuery == null && uri.rawFragment == null &&
                uri.rawPath in setOf("", "/") && (uri.port == -1 || uri.port in 1..65535), WorkspaceError.PRIVATE_ADDRESS)
            val port = if (uri.port == -1 || uri.port == 443) "" else ":${uri.port}"
            return WorkspaceOrigin("https://$host$port")
        }
    }
}

data class ImportCounts(val added: Int, val updated: Int, val unchanged: Int) {
    init { requireWorkspace(listOf(added, updated, unchanged).all { it in 0..MAX_EXPORT_RECORDS } && added.toLong() + updated + unchanged <= MAX_EXPORT_RECORDS, WorkspaceError.INVALID_COUNT) }
    val total: Int get() = added + updated + unchanged
}
data class WorkspaceIdentity(val login: String)
data class TransferReview(val origin: WorkspaceOrigin, val file: File, val digest: String, val identity: WorkspaceIdentity,
    val reviewToken: String, val counts: ImportCounts, val from: String, val to: String, val zone: String, val warnings: List<String>)

fun fileDigest(file: File): String {
    requireWorkspace(file.isFile && file.length() in 1..MAX_EXPORT_BYTES, WorkspaceError.EXPORT_INCOMPLETE)
    val hash = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input -> val buffer = ByteArray(16 * 1024); while (true) { val size = input.read(buffer); if (size < 0) break; hash.update(buffer, 0, size) } }
    return hash.digest().joinToString("") { "%02x".format(it) }
}

fun importCounts(json: JSONObject): ImportCounts {
    fun count(key: String): Int {
        val value = json.get(key)
        requireWorkspace(value is Number && value.toDouble().isFinite() && value.toDouble() % 1.0 == 0.0 && value.toDouble() in 0.0..MAX_EXPORT_RECORDS.toDouble(), WorkspaceError.INVALID_COUNT)
        return (value as Number).toInt()
    }
    return ImportCounts(count("added"), count("updated"), count("unchanged"))
}

/** No cookies, token storage, redirects, automatic replay or custom TLS trust. */
class WorkspaceClient(private val http: OkHttpClient = defaultClient(), private val beforeHealthUpload: suspend () -> Unit = {}) {
    companion object {
        fun defaultClient(): OkHttpClient = OkHttpClient.Builder().proxy(Proxy.NO_PROXY)
            .followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false)
            .connectTimeout(15, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS).callTimeout(60, TimeUnit.SECONDS).build()
    }
    internal suspend fun exchange(origin: WorkspaceOrigin, path: String, file: File? = null, importing: Boolean = false, reviewToken: String? = null, json:JSONObject?=null, jsonText:String?=null): JSONObject {
        require(listOf(file,json,jsonText).count { it!=null }<=1)
        val request = Request.Builder().url(origin.endpoint(path)).header("Accept", "application/json")
        if (reviewToken != null) {
            requireWorkspace(reviewToken.matches(Regex("[a-f0-9]{64}")), WorkspaceError.PREVIEW_REQUIRED)
            request.header("X-Nourish-Review-Token", reviewToken)
        }
        if (file != null || json != null || jsonText != null) {
            val body = if(file!=null){
                requireWorkspace(file.isFile && file.length() in 1..MAX_EXPORT_BYTES, WorkspaceError.EXPORT_REQUIRED)
                file.asRequestBody("application/json; charset=utf-8".toMediaType())
            }else{
                val text=jsonText?:requireNotNull(json).toString()
                if(jsonText!=null)JSONObject(jsonText)
                val bytes=text.toByteArray(Charsets.UTF_8)
                requireWorkspace(bytes.size.toLong() in 1..MAX_EXPORT_BYTES,WorkspaceError.TRANSFER_LIMIT)
                bytes.toRequestBody("application/json; charset=utf-8".toMediaType())
            }
            request.post(object : RequestBody() {
                override fun contentType() = body.contentType()
                override fun contentLength() = body.contentLength()
                // A request body must not allow response-driven follow-ups to replay an import.
                override fun isOneShot() = true
                override fun writeTo(sink: BufferedSink) = body.writeTo(sink)
            })
            beforeHealthUpload()
        }
        return suspendCancellableCoroutine { continuation ->
            val call = http.newCall(request.build())
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (continuation.isActive) continuation.resumeWithException(WorkspaceTransferFailure(
                        if (importing) WorkspaceError.IMPORT_NO_RESULT
                        else WorkspaceError.UNREACHABLE, importing))
                }
                override fun onResponse(call: Call, response: Response) {
                    try {
                        val parsed = response.use {
                            if (it.code in 300..399) throw WorkspaceTransferFailure(WorkspaceError.REDIRECT, importing, it.code)
                            val bytes = it.body.byteStream().use { input ->
                                val output = java.io.ByteArrayOutputStream()
                                val buffer = ByteArray(8192)
                                while (true) { val size = input.read(buffer); if (size < 0) break
                                    if (size > MAX_TRANSFER_RESPONSE_BYTES - output.size()) throw WorkspaceTransferFailure(WorkspaceError.RESPONSE_LARGE, importing)
                                    output.write(buffer, 0, size)
                                }; output.toByteArray()
                            }
                            val json = try { JSONObject(bytes.toString(Charsets.UTF_8)) } catch (_: Exception) {
                                throw WorkspaceTransferFailure(WorkspaceError.INVALID_SUMMARY, importing)
                            }
                            if (!it.isSuccessful) {
                                val unknown = importing && it.code >= 500
                                throw when {
                                    it.code == 401 || it.code == 403 -> WorkspaceTransferFailure(WorkspaceError.ACCESS_DENIED, unknown, it.code)
                                    json.has("error") && !json.isNull("error") -> WorkspaceTransferFailure(json.optString("error").take(1000), unknown, it.code)
                                    else -> WorkspaceTransferFailure(WorkspaceError.REJECTED, unknown, it.code)
                                }
                            }
                            json
                        }
                        if (continuation.isActive) continuation.resume(parsed)
                    } catch (error: Exception) {
                        if (continuation.isActive) continuation.resumeWithException(if (error is WorkspaceTransferFailure) error else
                            WorkspaceTransferFailure(if (importing) WorkspaceError.IMPORT_UNREADABLE else WorkspaceError.RESPONSE_UNREADABLE, importing))
                    }
                }
            })
        }
    }
    suspend fun identity(origin: WorkspaceOrigin): WorkspaceIdentity {
        val json = exchange(origin, "/api/access")
        requireWorkspace(json.optString("mode") == "private", WorkspaceError.PRIVATE_WORKSPACE)
        val phone = json.getJSONObject("phone")
        requireWorkspace(phone.optBoolean("configured") && phone.optString("origin") == origin.value, WorkspaceError.CONFIGURED_ADDRESS)
        return WorkspaceIdentity(phone.getString("login").also { requireWorkspace(it.isNotBlank() && it.length <= 320, WorkspaceError.INVALID_IDENTITY) })
    }
    suspend fun preview(origin: WorkspaceOrigin, file: File, expectedIdentity: WorkspaceIdentity? = null): TransferReview {
        val identity = identity(origin)
        val digest = fileDigest(file)
        requireWorkspace(expectedIdentity == null || identity == expectedIdentity, WorkspaceError.ACCOUNT_PREVIEW)
        val json = exchange(origin, "/api/health-connect/preview?summary=1", file)
        val range = json.getJSONObject("range")
        val warnings = json.getJSONArray("warnings")
        requireWorkspace(warnings.length() <= 50, WorkspaceError.WARNINGS_LIMIT)
        val reviewToken = json.getString("reviewToken").also { requireWorkspace(it.matches(Regex("[a-f0-9]{64}")), WorkspaceError.INCOMPLETE_PREVIEW) }
        return TransferReview(origin, file, digest, identity, reviewToken, importCounts(json.getJSONObject("counts")),
            range.getString("from"), range.getString("to"), range.getString("zone"),
            (0 until warnings.length()).map { warnings.getString(it).take(2000) })
    }
    suspend fun import(review: TransferReview): ImportCounts {
        requireWorkspace(fileDigest(review.file) == review.digest, WorkspaceError.STAGED_CHANGED)
        requireWorkspace(identity(review.origin) == review.identity, WorkspaceError.ACCOUNT_IMPORT)
        val response = exchange(review.origin, "/api/health-connect/import?summary=1", review.file, importing = true, reviewToken = review.reviewToken)
        return try { importCounts(response.getJSONObject("counts")) }
        catch (error: CancellationException) { throw error }
        catch (_: Exception) { throw WorkspaceTransferFailure(WorkspaceError.INVALID_IMPORT_SUMMARY, outcomeUnknown = true) }
    }
}
