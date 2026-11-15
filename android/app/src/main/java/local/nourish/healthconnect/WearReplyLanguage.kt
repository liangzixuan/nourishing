package local.nourish.healthconnect

import android.content.Context

enum class WearReplyNotice { DISABLED, CHANGED, BUSY, UNAVAILABLE }

fun Context.wearReplyMessage(notice:WearReplyNotice):String=getString(when(notice){
    WearReplyNotice.DISABLED->R.string.wear_reply_disabled
    WearReplyNotice.CHANGED->R.string.wear_reply_changed
    WearReplyNotice.BUSY->R.string.wear_reply_busy
    WearReplyNotice.UNAVAILABLE->R.string.wear_reply_unavailable
})
