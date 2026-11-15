package local.nourish.healthconnect

import org.json.JSONObject

data class CloudPrintCapture(val lease:CloudAccountLease,val sourcePage:String)
class CloudReportPrintGate(private val session:CloudAccountSession) {
    private val policy=WebWorkspacePolicy(WorkspaceOrigin.parse(session.origin.value))
    fun capture(accountId:String,page:String):CloudPrintCapture {
        CloudAccount(accountId);require(policy.isWorkspace(page)){"Open the report in Nourishing."}
        val lease=session.acquire();require(lease.account.id==accountId){"This report belongs to another account. Preview it again."}
        return CloudPrintCapture(lease,page).also{verify(it,page)}
    }
    fun isCurrent(capture:CloudPrintCapture,page:String)=page==capture.sourcePage&&policy.isWorkspace(page)&&session.isCurrent(capture.lease)
    fun verify(capture:CloudPrintCapture,page:String){
        if(!isCurrent(capture,page))throw CloudSessionChanged()
        val account=JSONObject(session.request(capture.lease,"/api/account").body)
        require(account.getString("id")==capture.lease.account.id){"The report account changed. Preview again."}
    }
}
