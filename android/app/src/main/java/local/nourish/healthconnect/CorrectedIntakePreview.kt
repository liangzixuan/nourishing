package local.nourish.healthconnect

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.json.JSONArray
import org.json.JSONObject

internal fun JSONObject.intakeText(key:String)=get(key).also { require(it is String) { "Invalid correction $key." } } as String
private fun JSONObject.flag(key:String)=get(key).also { require(it is Boolean) { "Invalid correction $key." } } as Boolean
private fun JSONObject.digest(key:String)=intakeText(key).also { require(Regex("[a-f0-9]{64}").matches(it)) }
private fun intakeDate(value:String):String { require(Regex("\\d{4}-\\d{2}-\\d{2}").matches(value));require(LocalDate.parse(value).toString()==value);return value }
private fun intakeUuid(value:String):String { require(Regex("[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}").matches(value));return value }
private fun strings(array:JSONArray):List<String> {
    require(array.length()<=MAX_EXPORT_RECORDS)
    return (0 until array.length()).map { array.get(it).also { value->require(value is String&&value.isNotBlank()) } as String }.also { require(it.distinct().size==it.size) }
}
private fun objects(array:JSONArray):List<JSONObject> { require(array.length()<=MAX_EXPORT_RECORDS);return (0 until array.length()).map { array.getJSONObject(it) } }
private fun revision(value:Any) { require(value is Number&&value.toDouble().isFinite()&&value.toDouble()>=1&&value.toDouble()<=9007199254740991.0&&value.toDouble()==value.toLong().toDouble()) }

data class CorrectedIntakeSelection(val type:HealthWriteType,val from:String,val to:String,val timeZone:String,
    val waterSource:String?,val correctionDates:List<String>,val useDrafts:Boolean) {
    fun json():JSONObject=JSONObject().put("kind",type.wire).put("from",from).put("to",to).put("timeZone",timeZone)
        .put("interval","recorded-minute").also { if(waterSource!=null)it.put("waterSource",waterSource) }
        .put("correctionDates",JSONArray(correctionDates)).put("useDrafts",useDrafts)
}
fun parseCorrectedIntakeSelection(value:JSONObject):CorrectedIntakeSelection {
    val type=HealthWriteType.fromWire(value.intakeText("kind"));require(type.isIntake)
    strictKeys(value,setOf("kind","from","to","timeZone","interval","correctionDates","useDrafts")+if(type==HealthWriteType.HYDRATION)setOf("waterSource") else emptySet())
    require(value.intakeText("interval")=="recorded-minute")
    val from=intakeDate(value.intakeText("from"));val to=intakeDate(value.intakeText("to"));require(from<=to)
    val zone=value.intakeText("timeZone");require(zone in ZoneId.getAvailableZoneIds())
    val water=if(type==HealthWriteType.HYDRATION)value.intakeText("waterSource").also { require(it in setOf("logged","food","both")) } else null
    val dates=strings(value.getJSONArray("correctionDates")).map(::intakeDate);require(dates==dates.sorted())
    val drafts=value.flag("useDrafts");require(water!="logged"||dates.isEmpty()&&!drafts)
    return CorrectedIntakeSelection(type,from,to,zone,water,dates,drafts)
}

data class IntakeRetirement(val id:String,val clientId:String,val reason:String)
data class IntakeGroupReview(val date:String,val anchorId:String,val anchorClientId:String,val entryIds:Set<String>,val description:String)
data class CorrectedIntakePreview(val selection:CorrectedIntakeSelection,val saveScope:String,val workspaceScope:String,val reviewToken:String,
    val rows:List<HealthWriteRow>,val retire:List<IntakeRetirement>,val groups:List<IntakeGroupReview>,val related:List<String>,val skipped:List<String>,val activationRequired:Boolean) {
    fun nativePlan(origin:WorkspaceOrigin,identity:WorkspaceIdentity):IntakeCorrectionPlan? {
        require(identity.login.isNotBlank())
        if(rows.isEmpty()&&retire.isEmpty())return null
        val scope=JSONArray().put(origin.value).put(identity.login).put(workspaceScope).toString()
        return IntakeCorrectionPlan(scope,reviewToken,selection.type,rows,retire.map { it.clientId }.toSet())
    }
    fun sameReviewedActions(other:CorrectedIntakePreview)=selection==other.selection&&saveScope==other.saveScope&&workspaceScope==other.workspaceScope&&
        rows==other.rows&&retire==other.retire&&groups==other.groups&&related==other.related&&skipped==other.skipped
}

/** Unlike an ordinary intake export, one rejected replacement rejects the full
 * correction. This parser performs all SDK construction before native inspection. */
fun parseCorrectedIntakePreview(json:JSONObject,now:Instant):CorrectedIntakePreview {
    require(json.toString().toByteArray(Charsets.UTF_8).size<=MAX_TRANSFER_RESPONSE_BYTES)
    strictKeys(json,setOf("version","selection","saveScope","workspaceScope","records","retire","skipped","groups","related","policies","draftRevisions","activationRequired","nativeReviewRequired","reviewToken"))
    require(json.get("version")==3&&json.flag("nativeReviewRequired"))
    val selected=parseCorrectedIntakeSelection(json.getJSONObject("selection"));val scope=intakeUuid(json.intakeText("saveScope"));val workspace=json.digest("workspaceScope");val token=json.digest("reviewToken")
    val activation=json.flag("activationRequired");val history=mutableSetOf<String>();val namespaces=mutableSetOf<String>();val policyDates=mutableSetOf<String>()
    val definitions=linkedMapOf<String,Pair<String,Set<String>>>()
    for(policy in objects(json.getJSONArray("policies"))){
        strictKeys(policy,setOf("namespace","kind","date","timeZone","revision","groups","memberIds"))
        namespaces.add(intakeUuid(policy.intakeText("namespace")));require(namespaces.size==1)
        val day=intakeDate(policy.intakeText("date"));require(day in selected.correctionDates&&policyDates.add(day))
        require(policy.intakeText("kind")==selected.type.wire&&policy.intakeText("timeZone")==selected.timeZone);revision(policy.get("revision"))
        val members=strings(policy.getJSONArray("memberIds")).toSet();require(members.isNotEmpty());history.addAll(members)
        for(group in objects(policy.getJSONArray("groups"))){
            strictKeys(group,setOf("anchorId","entryIds"));val anchor=group.intakeText("anchorId");val ids=strings(group.getJSONArray("entryIds")).toSet()
            require(ids.size>=2&&anchor in ids&&members.containsAll(ids)&&definitions.values.none { it.second.any(ids::contains) })
            require(definitions.put(anchor,day to ids)==null)
        }
    }
    require(policyDates==selected.correctionDates.toSet())
    val drafts=objects(json.getJSONArray("draftRevisions"));val draftDates=mutableSetOf<String>()
    for(draft in drafts){strictKeys(draft,setOf("date","revision","draftToken"));require(draftDates.add(intakeDate(draft.intakeText("date"))));revision(draft.get("revision"));if(!draft.isNull("draftToken"))draft.digest("draftToken")}
    require(draftDates==if(selected.useDrafts)policyDates else emptySet<String>())
    val exclusions=objects(json.getJSONArray("skipped"));for(row in exclusions){strictKeys(row,setOf("id","date","reason"));require(row.intakeText("id").isNotBlank());val day=intakeDate(row.intakeText("date"));require(day in selected.from..selected.to);require(row.intakeText("reason").isNotBlank())}
    val parsed=parseIntakeRows(json,selected.type,ZoneId.of(selected.timeZone),now,requireEveryRecord=true)
    val clients=parsed.rows.map { it.clientId }.toSet();val removals=objects(json.getJSONArray("retire")).map { row->
        strictKeys(row,setOf("id","clientRecordId","reason"));val id=row.intakeText("id");val client=row.intakeText("clientRecordId");val reason=row.intakeText("reason")
        require(id in history&&reason.isNotBlank()&&Regex("nourish-export:${selected.type.wire}:[a-f0-9]{64}").matches(client)&&client !in clients)
        IntakeRetirement(id,client,reason)
    }
    require(removals.map { it.clientId }.distinct().size==removals.size&&removals.map { it.id }.distinct().size==removals.size&&clients.size+removals.size<=MAX_EXPORT_RECORDS)
    val removedById=removals.associateBy { it.id };val groupAnchors=mutableSetOf<String>()
    val groups=objects(json.getJSONArray("groups")).map { group->
        strictKeys(group,setOf("version","executable","kind","date","anchor","entryIds","components","nutrients","coverage","attributions","retire","limitations"))
        require(group.get("version")==1&&!group.flag("executable")&&group.intakeText("kind")==selected.type.wire)
        val day=intakeDate(group.intakeText("date"));val anchor=group.getJSONObject("anchor");strictKeys(anchor,setOf("id","name","time","clientRecordId"))
        val id=anchor.intakeText("id");val client=anchor.intakeText("clientRecordId");val ids=strings(group.getJSONArray("entryIds")).toSet()
        require(groupAnchors.add(id)&&definitions[id]==(day to ids))
        val replacement=parsed.rows.single { it.clientId==client };require(replacement.id==id)
        val wire=objects(json.getJSONArray("records")).single { it.intakeText("clientRecordId")==client }
        require(anchor.intakeText("name").isNotBlank()&&wire.intakeText("date")==day&&wire.intakeText("time")==anchor.intakeText("time"))
        group.getJSONObject("nutrients");group.getJSONObject("coverage");strings(group.getJSONArray("attributions"));strings(group.getJSONArray("limitations"))
        val componentIds=mutableSetOf<String>()
        val descriptions=objects(group.getJSONArray("components")).map { component->
            strictKeys(component,setOf("id","name","date","time","quantity","nutrients","coverage","attributions"))
            val member=component.intakeText("id");require(member in ids&&componentIds.add(member)&&component.intakeText("date")==day)
            val name=component.intakeText("name");require(name.isNotBlank());val clock=if(component.isNull("time"))"time unavailable" else component.intakeText("time")
            val quantity=component.getJSONObject("quantity");val keys=quantity.keys().asSequence().toSet();require(keys.all { it in setOf("amount","quantity","unit","portionId") })
            for(key in keys)if(key in setOf("amount","quantity")){val value=quantity.get(key);require(value is Number&&value.toDouble().isFinite())}else require(quantity.get(key) is String)
            component.getJSONObject("nutrients");component.getJSONObject("coverage");val credits=strings(component.getJSONArray("attributions"))
            val amount=if(quantity.has("quantity"))"${quantity.get("quantity")} ${quantity.optString("unit","unit unavailable")}" else "${if(quantity.has("amount"))quantity.get("amount") else 1} serving(s)"
            "$member: $name; $day $clock; $amount."+(if(credits.isEmpty())"" else "\n"+credits.joinToString("\n"))
        }
        require(componentIds==ids)
        val retirementIds=mutableSetOf<String>();for(retired in objects(group.getJSONArray("retire"))){strictKeys(retired,setOf("id","clientRecordId"));val member=retired.intakeText("id");require(retirementIds.add(member)&&removedById[member]?.clientId==retired.intakeText("clientRecordId"))}
        require(retirementIds==ids-id)
        IntakeGroupReview(day,id,client,ids,"Correction on $day; retain $id ($client).\n"+descriptions.joinToString("\n"))
    }
    require(groupAnchors==definitions.keys)
    val relatedIds=mutableSetOf<String>();val related=objects(json.getJSONArray("related")).map { row->
        strictKeys(row,setOf("id","date","reason"));val id=row.intakeText("id");val day=intakeDate(row.intakeText("date"));val reason=row.intakeText("reason")
        require(id in history&&relatedIds.add(id)&&day !in selected.from..selected.to&&reason.isNotBlank());"$id: $day. $reason"
    }
    for(row in objects(json.getJSONArray("records"))){val day=intakeDate(row.intakeText("date"));if(day !in selected.from..selected.to)require(row.intakeText("id") in relatedIds){"An outside-range record lacks an explicit correction-history review."}}
    return CorrectedIntakePreview(selected,scope,workspace,token,parsed.rows,removals,groups,related,parsed.skipped,activation)
}
