package local.nourish.healthconnect

/** Reusable durable-boundary fixture; Android tests exercise the actual SQL transaction. */
internal class MemoryIntakeSessions:IntakeSessionPersistence {
    var pending:String?=null
    var beforeWrite:(String?)->Unit={}
    var beforeArchive:()->Unit={}
    private val archives=linkedMapOf<String,Pair<IntakeResolutionSummary,String>>()
    private var sequence=0L
    override fun read()=pending
    override fun write(value:String?){beforeWrite(value);pending=value}
    override fun archiveAndClear(expected:String,resolution:IntakeCorrectionResolution){
        check(pending==expected);val id=resolution.session.operation.id;check(!archives.containsKey(id))
        val body=intakeResolutionJson(resolution).toString();beforeArchive()
        archives[id]=IntakeResolutionSummary(++sequence,id,resolution.resolvedAt,resolution.session.operation.review.plan.type) to body
        pending=null
    }
    override fun history(before:Long?,limit:Int)=archives.values.map { it.first }.filter { before==null||it.sequence<before }.reversed().take(limit)
    override fun resolution(operationId:String)=archives[operationId]?.second
}
