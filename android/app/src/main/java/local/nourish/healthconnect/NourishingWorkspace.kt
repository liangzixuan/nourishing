package local.nourish.healthconnect

import android.content.Context
import android.content.Intent
import android.net.Uri

/** The packaged app owns one configured workspace. */
object NourishingWorkspace {
    val policy=WebWorkspacePolicy(WorkspaceOrigin.parse(BuildConfig.WORKSPACE_ORIGIN))
    val cloudOrigin=runCatching{CloudOrigin.parse(policy.origin.value)}.getOrNull()
    fun widgetIntent(context:Context,origin:WorkspaceOrigin,destination:WidgetDestination):Intent {
        val url=WebWorkspacePolicy(origin).widgetUrl(destination)
        return Intent(Intent.ACTION_VIEW,Uri.parse(url)).apply {
            if(policy.isWorkspace(url)) {
                setClass(context,NourishingActivity::class.java)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
        }
    }
}
