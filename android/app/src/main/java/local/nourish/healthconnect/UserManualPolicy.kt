package local.nourish.healthconnect

import java.net.URI

/** The public help center has no access to the private workspace's native channel. */
object UserManualPolicy {
    fun owns(value:String):Boolean {
        val uri=runCatching{URI(value)}.getOrNull()?:return false
        return uri.scheme=="https"&&uri.host.equals("support.cronometer.com",true)&&
            uri.rawUserInfo==null&&uri.port in setOf(-1,443)&&uri.rawPath?.startsWith("/hc/")==true
    }
    fun isBrowserLink(value:String):Boolean {
        val uri=runCatching{URI(value)}.getOrNull()?:return false
        return uri.scheme in setOf("http","https")&&uri.host!=null&&uri.rawUserInfo==null
    }
}
