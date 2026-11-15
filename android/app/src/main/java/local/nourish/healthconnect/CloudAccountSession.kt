package local.nourish.healthconnect

import java.net.URI
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/** Cloud origins are separate from the shipped PC origin until native routes are migrated. */
class CloudOrigin private constructor(val value:String) {
    fun endpoint(path:String):String {
        val uri=runCatching{URI(path)}.getOrElse{throw IllegalArgumentException("Invalid API path.")}
        require(!uri.isAbsolute&&uri.rawAuthority==null&&uri.rawFragment==null&&
            uri.rawPath.startsWith("/api/")&&uri.rawPath==uri.path&&
            uri.path.split('/').none{it=="."||it==".."}&&'\\' !in path){"Invalid API path."}
        return value+path
    }
    override fun equals(other:Any?)=other is CloudOrigin&&other.value==value
    override fun hashCode()=value.hashCode()
    override fun toString()=value
    companion object {
        private val hosts=setOf("nourishing.app","nourishing-cloud.appwrite.network")
        fun parse(value:String):CloudOrigin {
            val uri=runCatching{URI(value)}.getOrElse{throw IllegalArgumentException("Invalid cloud address.")}
            val host=uri.host?.lowercase()
            require(uri.scheme=="https"&&host in hosts&&uri.port in setOf(-1,443)&&
                uri.rawUserInfo==null&&uri.rawQuery==null&&uri.rawFragment==null&&uri.rawPath in setOf("","/")){
                "Use a Nourishing cloud address."
            }
            return CloudOrigin("https://$host")
        }
    }
}

data class CloudAccount(val id:String,val email:String?=null) {
    init { require(Regex("[A-Za-z0-9][A-Za-z0-9._-]{0,35}").matches(id)){"Invalid account identity."} }
}

/** Contains account ownership and a generation, never a session secret. */
class CloudAccountLease internal constructor(val origin:CloudOrigin,val account:CloudAccount,internal val generation:Long,internal val fingerprint:String) {
    override fun toString()="CloudAccountLease(account=${account.id}, origin=$origin)"
}

class CloudSessionChanged:IllegalStateException("Sign in again to connect this account.")
class CloudApiFailure(val status:Int):IllegalStateException("Cloud request failed ($status).")
class CloudProtocolFailure:IllegalStateException("Invalid cloud response.")

data class CloudHttpReply(val status:Int,val body:String)
fun interface CloudHttpTransport { fun exchange(request:Request):CloudHttpReply }

/** First-party CookieManager is the sole credential store. No token enters JavaScript or preferences. */
class CloudAccountSession(
    val origin:CloudOrigin,
    private val cookieForOrigin:(String)->String?,
    private val transport:CloudHttpTransport=CloudOkHttpTransport(),
    private val onInvalidated:()->Unit={}
) {
    private var generation=0L
    private var active:CloudAccountLease?=null
    private var observedFingerprint:String?=null
    private val lock=Any()
    private val connectionLock=Any()
    private class Cookie(val value:String) {
        val header="__Host-nourishing_session=$value"
        val fingerprint=MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString(""){"%02x".format(it)}
        override fun toString()="Cloud session cookie"
    }
    private fun cookie():Cookie {
        val parts=cookieForOrigin(origin.value).orEmpty().split(';').map{it.trim()}
            .filter{it.substringBefore('=')=="__Host-nourishing_session"}
        if(parts.size!=1||'=' !in parts.single())throw CloudSessionChanged()
        val value=parts.single().substringAfter('=')
        if(value.isEmpty()||value.length>16384||value.any{it.code !in 33..126||it in "\";,\\"})throw CloudSessionChanged()
        return Cookie(value)
    }
    private fun invalidateLocked() { generation++;active=null;observedFingerprint=null;onInvalidated() }
    fun invalidate()=synchronized(lock){invalidateLocked()}
    private fun checkedCookie(lease:CloudAccountLease):Cookie {
        val current=try{cookie()}catch(error:CloudSessionChanged){invalidateLocked();throw error}
        if(active!==lease||lease.origin!=origin||lease.generation!=generation||current.fingerprint!=lease.fingerprint){
            if(active===lease)invalidateLocked()
            throw CloudSessionChanged()
        }
        return current
    }
    /** Run off the UI thread. The server, not a bridge message or email, supplies account identity. */
    fun connect():CloudAccountLease {
        val start=synchronized(lock){
            val current=try{cookie()}catch(error:CloudSessionChanged){invalidateLocked();throw error}
            if(observedFingerprint?.let{it!=current.fingerprint}==true)invalidateLocked()
            observedFingerprint=current.fingerprint
            generation++;active=null;generation to current
        }
        val reply=transport.exchange(Request.Builder().url(origin.endpoint("/api/account"))
            .header("Accept","application/json").header("Cookie",start.second.header).get().build())
        return synchronized(lock){
            if(generation!=start.first)throw CloudSessionChanged()
            val current=try{cookie()}catch(error:CloudSessionChanged){invalidateLocked();throw error}
            if(current.fingerprint!=start.second.fingerprint){invalidateLocked();throw CloudSessionChanged()}
            if(reply.status !in 200..299){if(reply.status in setOf(401,403))invalidateLocked();throw CloudApiFailure(reply.status)}
            val account=try{val json=JSONObject(reply.body);val value=json.get("id");if(value !is String)throw CloudProtocolFailure();CloudAccount(value,(json.opt("email") as? String)?.takeIf{it.length in 1..320})}
                catch(_:Exception){throw CloudProtocolFailure()}
            CloudAccountLease(origin,account,generation,start.second.fingerprint).also{active=it}
        }
    }
    /** Background consumers share one verified lease instead of invalidating each other's requests. */
    fun acquire():CloudAccountLease=synchronized(connectionLock){
        synchronized(lock){active?.takeIf{isCurrent(it)}}?:connect()
    }
    fun matchesCookie(binding:CloudNativeBinding):Boolean=synchronized(lock){
        binding.origin==origin&&runCatching{cookie().fingerprint==binding.sessionFingerprint}.getOrDefault(false)
    }
    fun publish(lease:CloudAccountLease,block:()->Unit):Boolean=synchronized(lock){
        if(!isCurrent(lease))false else {block();true}
    }
    /** Caller must retain the lease selected for the operation; a different account never replaces it. */
    fun request(lease:CloudAccountLease,path:String,jsonBody:String?=null,reviewToken:String?=null):CloudHttpReply {
        val request=synchronized(lock){
            val current=checkedCookie(lease)
            Request.Builder().url(origin.endpoint(path)).header("Accept","application/json").header("Cookie",current.header).apply{
                if(reviewToken!=null){require(Regex("[a-f0-9]{64}").matches(reviewToken)){"Invalid import review."};header("X-Nourish-Review-Token",reviewToken)}
                if(jsonBody!=null){
                    require(jsonBody.toByteArray().size.toLong()<=MAX_EXPORT_BYTES){"Request is too large."}
                    JSONObject(jsonBody)
                    header("Origin",origin.value)
                    val body=jsonBody.toRequestBody("application/json; charset=utf-8".toMediaType())
                    post(object:okhttp3.RequestBody(){
                        override fun contentType()=body.contentType()
                        override fun contentLength()=body.contentLength()
                        override fun isOneShot()=true
                        override fun writeTo(sink:okio.BufferedSink)=body.writeTo(sink)
                    })
                }else get()
            }.build()
        }
        val reply=transport.exchange(request)
        return synchronized(lock){
            checkedCookie(lease)
            if(reply.status in setOf(401,403)){invalidateLocked();throw CloudApiFailure(reply.status)}
            if(reply.status !in 200..299)throw CloudApiFailure(reply.status)
            reply
        }
    }
    /** Use before applying a result to local widgets, device state or a native screen. */
    fun isCurrent(lease:CloudAccountLease):Boolean=synchronized(lock){try{checkedCookie(lease);true}catch(_:CloudSessionChanged){false}}
    fun refresh()=synchronized(lock){
        observedFingerprint?.let{fingerprint->
            if(runCatching{cookie().fingerprint}.getOrNull()!=fingerprint)invalidateLocked()
        };Unit
    }
}

/** No credential forwarding through redirects or automatic write retries. */
class CloudOkHttpTransport:CloudHttpTransport {
    private val http=OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false)
        .connectTimeout(15,TimeUnit.SECONDS).readTimeout(30,TimeUnit.SECONDS).callTimeout(60,TimeUnit.SECONDS).build()
    override fun exchange(request:Request):CloudHttpReply=http.newCall(request).execute().use{response->
        val bytes=response.body.byteStream().use{input->
            val output=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192)
            while(true){val size=input.read(buffer);if(size<0)break;if(output.size()+size>1_048_576)throw CloudProtocolFailure();output.write(buffer,0,size)}
            output.toByteArray()
        }
        CloudHttpReply(response.code,bytes.toString(Charsets.UTF_8))
    }
}
