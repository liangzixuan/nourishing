package local.nourish.healthconnect

import android.webkit.CookieManager

/** The web shell and foreground Health Connect share the same first-party session. */
fun cloudWebSession(origin:CloudOrigin,onInvalidated:()->Unit):CloudAccountSession =
    CloudAccountSession(origin,{address->CookieManager.getInstance().getCookie(address)},onInvalidated=onInvalidated)

object CloudWebSessions {
    private var current:CloudAccountSession?=null
    @Synchronized fun get(origin:CloudOrigin):CloudAccountSession {
        if(current?.origin!=origin){current?.invalidate();current=cloudWebSession(origin,{})}
        return current!!
    }
    fun refresh(){synchronized(this){current}?.refresh()}
}
