package local.nourish.healthconnect

import java.io.File
import org.json.JSONObject

/** Consent belongs to one verified account session. This is a digest, never a session credential. */
data class CloudNativeBinding(val origin:CloudOrigin,val accountId:String,val sessionFingerprint:String){
    init{CloudAccount(accountId);require(Regex("[a-f0-9]{64}").matches(sessionFingerprint))}
    fun owns(lease:CloudAccountLease)=origin==lease.origin&&accountId==lease.account.id&&sessionFingerprint==lease.fingerprint
    fun json()=JSONObject().put("origin",origin.value).put("accountId",accountId).put("sessionFingerprint",sessionFingerprint)
    companion object{
        fun from(lease:CloudAccountLease)=CloudNativeBinding(lease.origin,lease.account.id,lease.fingerprint)
        fun parse(json:JSONObject)=CloudNativeBinding(CloudOrigin.parse(json.getString("origin")),json.getString("accountId"),json.getString("sessionFingerprint"))
    }
}
data class CloudBackgroundConfig(val binding:CloudNativeBinding,val types:Set<ExportType>,val days:Int,val revision:String){
    init{require(types.isNotEmpty()&&days in 1..30&&revision.isNotBlank())}
    fun json()=JSONObject().put("binding",binding.json()).put("types",org.json.JSONArray(types.map{it.name})).put("days",days).put("revision",revision)
    companion object{fun parse(json:JSONObject):CloudBackgroundConfig{val values=json.getJSONArray("types");return CloudBackgroundConfig(CloudNativeBinding.parse(json.getJSONObject("binding")),(0 until values.length()).map{ExportType.valueOf(values.getString(it))}.toSet(),json.getInt("days"),json.getString("revision"))}}
}

/** Snapshot-only imports: no device writes, removals, or reassignment of old reconciliation journals. */
class CloudBackgroundTransfer(private val session:CloudAccountSession,private val current:(CloudBackgroundConfig)->Boolean){
    fun check(config:CloudBackgroundConfig,lease:CloudAccountLease){
        if(!current(config)||!config.binding.owns(lease)||!session.isCurrent(lease))throw CloudSessionChanged()
    }
    fun transfer(config:CloudBackgroundConfig,lease:CloudAccountLease,file:File,beforeUpload:()->Unit={}):ImportCounts{
        check(config,lease);beforeUpload();val transfer=CloudHealthTransfer(session)
        val review=transfer.preview(lease,file)
        check(config,lease);beforeUpload();val counts=transfer.import(review)
        check(config,lease);return counts
    }
}

data class CloudWidgetConfig(val binding:CloudNativeBinding,val unit:String,val kind:WidgetKind,val revision:String){
    init{require(unit in setOf("kcal","kJ")&&revision.isNotBlank())}
    fun json()=JSONObject().put("binding",binding.json()).put("unit",unit).put("kind",kind.name).put("revision",revision)
    companion object{fun parse(json:JSONObject)=CloudWidgetConfig(CloudNativeBinding.parse(json.getJSONObject("binding")),json.getString("unit"),WidgetKind.valueOf(json.getString("kind")),json.getString("revision"))}
}
fun cloudWidgetSnapshot(session:CloudAccountSession,lease:CloudAccountLease,config:CloudWidgetConfig):JSONObject{
    if(!config.binding.owns(lease))throw CloudSessionChanged()
    val json=JSONObject(session.request(lease,"/api/home-widgets?unit=${config.unit}").body)
    HomeWidgetSnapshot.parseCloud(json,config)
    if(!session.isCurrent(lease))throw CloudSessionChanged()
    return json
}
