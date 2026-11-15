package local.nourish.healthconnect

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.security.SecureRandom
import org.json.JSONObject

/** Registration and delivery claims survive process death; app backup is disabled. */
class PhoneReminderStore(context:Context):PhoneReminderStateStore {
    private val context=context.applicationContext
    private val prefs=this.context.getSharedPreferences("phone-reminders",Context.MODE_PRIVATE)
    override fun read():PhoneReminderState=synchronized(lock){
        prefs.getString("state",null)?.let{PhoneReminderState.parse(JSONObject(it))}?:PhoneReminderState(
            ByteArray(32).also{SecureRandom().nextBytes(it)}.joinToString(""){"%02x".format(it)}
        ).also{write(it)}
    }
    override fun update(change:(PhoneReminderState)->PhoneReminderState):PhoneReminderState=synchronized(lock){
        val before=read();val after=change(before);check(after.clientId==before.clientId)
        write(after);after
    }
    private fun write(state:PhoneReminderState){check(prefs.edit().putString("state",state.json().toString()).commit())}
    fun savePendingInstallationId(value:String,projectId:String?)=update { state ->
        require(value.length in 1..8192&&value.all{it.code in 33..126})
        if(state.enabled&&projectId!=null&&state.desired?.projectId==projectId)state.copy(pendingInstallationId=value)else state
    }
    fun receive(message:PhoneReminderMessage,now:Long,display:()->Unit):Boolean=synchronized(lock){
        if(NourishingWorkspace.cloudOrigin!=null)return@synchronized false
        if(read().deliveryBinding()?.revision!=message.registration||message.expiresAt<=now)return false
        PhoneReminderReceipts(context).use { helper ->
            val db=helper.writableDatabase
            db.delete("received","expires_at<=?",arrayOf(now.toString()))
            val values=ContentValues().apply{put("tag",message.tag);put("expires_at",message.expiresAt)}
            if(db.insertWithOnConflict("received",null,values,SQLiteDatabase.CONFLICT_IGNORE)==-1L)return false
            // Claim before display. A failed/uncertain platform call must not replay.
            display();true
        }
    }
    companion object {private val lock=Any()}
}
private class PhoneReminderReceipts(context:Context):SQLiteOpenHelper(context,"phone-reminder-receipts.sqlite",null,1) {
    override fun onCreate(db:SQLiteDatabase){db.execSQL("CREATE TABLE received(tag TEXT PRIMARY KEY,expires_at INTEGER NOT NULL)")}
    override fun onUpgrade(db:SQLiteDatabase,oldVersion:Int,newVersion:Int){error("Unsupported phone reminder receipt database version")}
}
