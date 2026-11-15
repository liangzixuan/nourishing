package local.nourish.healthconnect

import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Mass
import androidx.health.connect.client.units.Energy
import java.time.Instant
import java.time.ZoneId
import org.json.JSONObject

val HEALTH_NUTRITION_FIELDS=setOf("energy","protein","totalCarbohydrate","totalFat","dietaryFiber","caffeine","calcium","chloride","cholesterol","chromium","copper","folicAcid","iodine","iron","magnesium","manganese","molybdenum","monounsaturatedFat","niacin","pantothenicAcid","phosphorus","polyunsaturatedFat","potassium","riboflavin","saturatedFat","selenium","sodium","sugar","thiamin","transFat","vitaminB12","vitaminB6","vitaminC","vitaminD","vitaminK","zinc","biotin")
fun nutritionNativeRecord(row:HealthWriteRow,metadata:Metadata):NutritionRecord {
    require(row.nutrients.isNotEmpty()&&row.nutrients.keys.all{it in HEALTH_NUTRITION_FIELDS}&&row.nutrients.values.all{it.isFinite()&&it>=0})
    fun mass(key:String)=row.nutrients[key]?.let{Mass.grams(it)}
    return NutritionRecord(startTime=row.time,startZoneOffset=row.offset,endTime=requireNotNull(row.end),endZoneOffset=row.endOffset,metadata=metadata,name=row.name,
        energy=row.nutrients["energy"]?.let{Energy.kilocalories(it)},protein=mass("protein"),totalCarbohydrate=mass("totalCarbohydrate"),totalFat=mass("totalFat"),dietaryFiber=mass("dietaryFiber"),
        caffeine=mass("caffeine"),calcium=mass("calcium"),chloride=mass("chloride"),cholesterol=mass("cholesterol"),chromium=mass("chromium"),copper=mass("copper"),folicAcid=mass("folicAcid"),iodine=mass("iodine"),iron=mass("iron"),magnesium=mass("magnesium"),manganese=mass("manganese"),molybdenum=mass("molybdenum"),monounsaturatedFat=mass("monounsaturatedFat"),niacin=mass("niacin"),pantothenicAcid=mass("pantothenicAcid"),phosphorus=mass("phosphorus"),polyunsaturatedFat=mass("polyunsaturatedFat"),potassium=mass("potassium"),riboflavin=mass("riboflavin"),saturatedFat=mass("saturatedFat"),selenium=mass("selenium"),sodium=mass("sodium"),sugar=mass("sugar"),thiamin=mass("thiamin"),transFat=mass("transFat"),vitaminB12=mass("vitaminB12"),vitaminB6=mass("vitaminB6"),vitaminC=mass("vitaminC"),vitaminD=mass("vitaminD"),vitaminK=mass("vitaminK"),zinc=mass("zinc"),biotin=mass("biotin"))
}
private fun JSONObject.strictText(key:String)=get(key).also{require(it is String){"Invalid intake export $key."}} as String
fun parseIntakeWritePlan(json:JSONObject,now:Instant):HealthWritePlan {
    require(json.get("version")==2){"Source credits need a fresh intake preview from the current Nourish version."}
    val token=json.strictText("reviewToken");require(Regex("[a-f0-9]{64}").matches(token))
    val selection=json.getJSONObject("selection");val type=HealthWriteType.fromWire(selection.strictText("kind"));require(type.isIntake&&selection.strictText("interval")=="recorded-minute")
    if(type==HealthWriteType.HYDRATION)require(selection.strictText("waterSource") in setOf("logged","food","both"))
    val zone=ZoneId.of(selection.strictText("timeZone"));require(zone.id in ZoneId.getAvailableZoneIds())
    val prepared=parseIntakeRows(json,type,zone,now,requireEveryRecord=false)
    return HealthWritePlan(token,selection.toString(),prepared.rows,prepared.skipped,zone.id,type)
}

internal data class ParsedIntakeRows(val rows:List<HealthWriteRow>,val skipped:List<String>)
/** Both contracts use the same units and source-credit owner. Corrections require
 * every replacement to pass; an invalid replacement must never leave only deletions. */
internal fun parseIntakeRows(json:JSONObject,type:HealthWriteType,zone:ZoneId,now:Instant,requireEveryRecord:Boolean):ParsedIntakeRows {
    val rows=mutableListOf<HealthWriteRow>();val skipped=mutableListOf<String>();val ids=mutableSetOf<String>();val records=json.getJSONArray("records");require(records.length()<=MAX_EXPORT_RECORDS)
    val excluded=json.getJSONArray("skipped");require(excluded.length()<=MAX_EXPORT_RECORDS)
    for(i in 0 until excluded.length()){val row=excluded.getJSONObject(i);skipped.add("${row.strictText("date")}: ${row.strictText("reason")}")}
    for(i in 0 until records.length()){
        val row=records.getJSONObject(i);val id=row.strictText("id");val clientId=row.strictText("clientRecordId");require(id.isNotBlank()&&ids.add(clientId)&&Regex("nourish-export:${type.wire}:[a-f0-9]{64}").matches(clientId))
        if(requireEveryRecord)strictKeys(row,setOf("id","date","time","name","clientRecordId","attributions","details","omitted",if(type==HealthWriteType.NUTRITION)"nutrients" else "milliliters"))
        val creditsJson=row.getJSONArray("attributions")
        val credits=(0 until creditsJson.length()).map{creditsJson.get(it).also{credit->require(credit is String&&credit.isNotBlank()){"Invalid intake source credit."}} as String}
        require(credits.distinct().size==credits.size){"Duplicate intake source credits."}
        require(type!=HealthWriteType.HYDRATION||credits.isEmpty()){"Health Connect hydration records cannot retain source credits. Use the attributed Nourish data export."}
        val day=row.strictText("date");val clock=row.strictText("time");val time=resolveExportClock(day,clock,zone,now,true)
        if(time is ExcludedExportClock){require(!requireEveryRecord){time.reason+" The entire correction was rejected; no removal may proceed."};skipped.add(time.reason);continue};time as ExportClock
        val foodName=row.strictText("name");require(foodName.isNotBlank())
        // This is the persisted native name, shared by review, receipts and hourly payload identity.
        val name=(listOf(foodName)+credits).joinToString("\n")
        val nutrients=linkedMapOf<String,Double>()
        var value=0.0
        if(type==HealthWriteType.NUTRITION){val source=row.getJSONObject("nutrients");for(key in source.keys()){require(key in HEALTH_NUTRITION_FIELDS);val v=source.get(key);require(v is Number&&v.toDouble().isFinite()&&v.toDouble()>=0);nutrients[key]=v.toDouble()};require(nutrients.isNotEmpty())}
        else{val v=row.get("milliliters");require(v is Number&&v.toDouble().isFinite()&&v.toDouble() in 0.0..100000.0);value=v.toDouble()}
        val details=row.getJSONArray("details");val omitted=row.getJSONArray("omitted")
        if(requireEveryRecord){
            require(details.length()<=MAX_EXPORT_RECORDS&&omitted.length()<=MAX_EXPORT_RECORDS)
            for(index in 0 until details.length()){
                val detail=details.getJSONObject(index);strictKeys(detail,setOf("name","value","unit"))
                require(detail.strictText("name").isNotBlank()&&detail.strictText("unit").isNotBlank())
                val value=detail.get("value");require(value is Number&&value.toDouble().isFinite())
            }
            for(index in 0 until omitted.length())require(omitted.get(index) is String)
        }
        val description="$day $clock ${zone.id}: $name\nRecorded-minute interval: ${time.start} to ${time.end} (not measured eating/drinking duration).\n"+(0 until details.length()).joinToString("\n"){val d=details.getJSONObject(it);"${d.strictText("name")}: ${d.get("value")} ${d.strictText("unit")}"}+(if(omitted.length()>0)"\nOmitted:\n"+(0 until omitted.length()).joinToString("\n"){omitted.getString(it)} else "")
        val prepared=HealthWriteRow(id,clientId,value,if(type==HealthWriteType.HYDRATION)"mL" else "",null,time.start,time.offset,description,time.end,time.endOffset,name,nutrients.toMap())
        try{type.native(prepared,Metadata.manualEntry(clientRecordId=clientId,clientRecordVersion=1))}catch(error:IllegalArgumentException){require(!requireEveryRecord){"Correction replacement is unsupported by this phone's Health Connect SDK: ${error.message}. No removal may proceed."};skipped.add("$day $clock $name: Unsupported by this phone's Health Connect SDK (${error.message}).");continue}
        rows.add(prepared)
    }
    return ParsedIntakeRows(rows.toList(),skipped.toList())
}
