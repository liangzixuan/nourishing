package local.nourish.healthconnect

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteDoneException
import android.database.sqlite.SQLiteOpenHelper
import java.time.Instant

/** Pending progress is small independent writes; history is immutable and paged.
 * Use scalar statements for full envelopes so Android's cursor row limit does not
 * truncate a valid large review. Cursors contain only history summaries. */
internal class AndroidIntakeSessionPersistence(context:Context,name:String="intake-corrections.db"):SQLiteOpenHelper(context.applicationContext,name,null,1),IntakeSessionPersistence {
    override fun onCreate(db:SQLiteDatabase){
        db.execSQL("CREATE TABLE pending (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL)")
        db.execSQL("CREATE TABLE resolutions (sequence INTEGER PRIMARY KEY AUTOINCREMENT, operation_id TEXT NOT NULL UNIQUE, resolved_at TEXT NOT NULL, type TEXT NOT NULL, body TEXT NOT NULL)")
    }
    override fun onUpgrade(db:SQLiteDatabase,oldVersion:Int,newVersion:Int){error("Unsupported intake recovery schema change.")}
    private fun scalar(sql:String,args:Array<String> = emptyArray()):String?=readableDatabase.compileStatement(sql).use {
        it.bindAllArgsAsStrings(args)
        try { it.simpleQueryForString() }catch(_:SQLiteDoneException){null}
    }
    override fun read()=scalar("SELECT body FROM pending WHERE id=1")
    override fun write(value:String?){
        if(value==null)writableDatabase.execSQL("DELETE FROM pending WHERE id=1")
        else writableDatabase.execSQL("INSERT OR REPLACE INTO pending(id,body) VALUES(1,?)",arrayOf(value))
    }
    override fun archiveAndClear(expected:String,resolution:IntakeCorrectionResolution){
        val db=writableDatabase;db.beginTransaction()
        try {
            check(read()==expected){"Pending correction changed before recovery was saved."}
            db.execSQL("INSERT INTO resolutions(operation_id,resolved_at,type,body) VALUES(?,?,?,?)",arrayOf(
                resolution.session.operation.id,resolution.resolvedAt.toString(),resolution.session.operation.review.plan.type.wire,intakeResolutionJson(resolution).toString()))
            db.execSQL("DELETE FROM pending WHERE id=1")
            db.setTransactionSuccessful()
        }finally { db.endTransaction() }
    }
    override fun history(before:Long?,limit:Int):List<IntakeResolutionSummary> {
        val condition=if(before==null)"" else "WHERE sequence < ?"
        val args=if(before==null)arrayOf(limit.toString()) else arrayOf(before.toString(),limit.toString())
        return readableDatabase.rawQuery("SELECT sequence,operation_id,resolved_at,type FROM resolutions $condition ORDER BY sequence DESC LIMIT ?",args).use { cursor->
            buildList { while(cursor.moveToNext())add(IntakeResolutionSummary(cursor.getLong(0),cursor.getString(1),Instant.parse(cursor.getString(2)),HealthWriteType.fromWire(cursor.getString(3)))) }
        }
    }
    override fun resolution(operationId:String)=scalar("SELECT body FROM resolutions WHERE operation_id=?",arrayOf(operationId))
}

private object AndroidIntakeSessions {
    private var store:IntakeSessionStore?=null
    @Synchronized fun get(context:Context):IntakeSessionStore=store?:PersistedIntakeSessionStore(AndroidIntakeSessionPersistence(context)).also { store=it }
}
fun androidIntakeSessions(context:Context):IntakeSessionStore=AndroidIntakeSessions.get(context)
