package local.nourish.healthconnect

import java.net.URI

enum class WidgetDestination(val key:String) { DIARY("diary"), FASTING("fasting"), FOOD("food") }

/** One origin owns the diary, camera and native message channel. */
class WebWorkspacePolicy(val origin:WorkspaceOrigin) {
    private val expected=URI(origin.value)
    private fun parse(value:String)=runCatching{URI(value)}.getOrNull()
    private fun port(uri:URI)=if(uri.port==-1)443 else uri.port
    private fun owns(uri:URI)=uri.scheme=="https"&&uri.rawUserInfo==null&&uri.host.equals(expected.host,true)&&port(uri)==port(expected)
    fun isWorkspace(value:String):Boolean {
        val uri=parse(value)?:return false
        return owns(uri)
    }
    fun isExternalLink(value:String):Boolean {
        val uri=parse(value)?:return false
        return uri.scheme in setOf("http","https")&&uri.host!=null&&uri.rawUserInfo==null&&!owns(uri)
    }
    fun widgetUrl(destination:WidgetDestination)=origin.value+"/?widget="+destination.key
    fun widgetEntry(value:String):String? {
        val uri=parse(value)?:return null
        if(!owns(uri)||uri.rawPath !in setOf("","/")||uri.rawFragment!=null)return null
        val destination=WidgetDestination.entries.firstOrNull { uri.rawQuery=="widget="+it.key }?:return null
        return widgetUrl(destination)
    }
}

fun webDownloadName(value:String):String=value.replace('\\','/').substringAfterLast('/')
    .filter{it.code>=32&&it.code!=127}.trim().take(180).takeUnless{it.isBlank()||it in setOf(".","..")}?:"Nourishing-export"
