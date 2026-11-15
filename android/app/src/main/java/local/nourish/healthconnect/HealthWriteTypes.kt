package local.nourish.healthconnect

import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.*
import kotlin.reflect.KClass

/** Explicit user mapping. Metric names never infer a native type. */
enum class HealthWriteType(val wire:String,val label:String,val units:Set<String>,val recordClass:KClass<out Record>) {
    WEIGHT("weight","Weight",setOf("kg","lb","lbs","st"),WeightRecord::class),
    WATER("body-water","Body water mass",setOf("kg","lb"),BodyWaterMassRecord::class),
    FAT("body-fat","Body fat",setOf("%"),BodyFatRecord::class),
    HEIGHT("height","Height",setOf("cm","m","in","ft"),HeightRecord::class),
    GLUCOSE("glucose","Blood glucose",setOf("mmol/L","mg/dL"),BloodGlucoseRecord::class),
    PRESSURE("pressure","Blood pressure",setOf("mmHg"),BloodPressureRecord::class),
    TEMPERATURE("temperature","Body temperature",setOf("°C","°F"),BodyTemperatureRecord::class),
    HEART("heart-rate","Heart rate",setOf("bpm"),HeartRateRecord::class),
    RESTING("resting-heart-rate","Resting heart rate",setOf("bpm"),RestingHeartRateRecord::class),
    HRV("hrv","Heart rate variability (RMSSD)",setOf("ms"),HeartRateVariabilityRmssdRecord::class),
    OXYGEN("oxygen","Oxygen saturation",setOf("%"),OxygenSaturationRecord::class),
    RESPIRATION("respiration","Respiratory rate",setOf("brpm"),RespiratoryRateRecord::class),
    NUTRITION("nutrition","Food nutrients",emptySet(),NutritionRecord::class),
    HYDRATION("hydration","Water intake",emptySet(),HydrationRecord::class);

    val isIntake get()=this==NUTRITION||this==HYDRATION
    val permissions get()=setOf(HealthPermission.getReadPermission(recordClass),HealthPermission.getWritePermission(recordClass))
    override fun toString()=label
    fun native(row:HealthWriteRow,metadata:Metadata):Record {
        val time=row.time;val offset=row.offset;val n=row.value
        require(n.isFinite())
        return when(this){
            NUTRITION->nutritionNativeRecord(row,metadata)
            HYDRATION->HydrationRecord(startTime=time,startZoneOffset=offset,endTime=requireNotNull(row.end),endZoneOffset=row.endOffset,volume=Volume.liters(n/1000.0),metadata=metadata)
            WEIGHT->WeightRecord(time=time,zoneOffset=offset,metadata=metadata,weight=Mass.kilograms(n))
            WATER->BodyWaterMassRecord(time=time,zoneOffset=offset,metadata=metadata,mass=Mass.kilograms(n))
            FAT->BodyFatRecord(time=time,zoneOffset=offset,metadata=metadata,percentage=Percentage(n))
            HEIGHT->HeightRecord(time=time,zoneOffset=offset,metadata=metadata,height=Length.meters(n/100.0))
            GLUCOSE->BloodGlucoseRecord(time=time,zoneOffset=offset,metadata=metadata,level=if(row.unit=="mg/dL")BloodGlucose.milligramsPerDeciliter(n) else BloodGlucose.millimolesPerLiter(n))
            PRESSURE->BloodPressureRecord(time=time,zoneOffset=offset,metadata=metadata,systolic=Pressure.millimetersOfMercury(n),diastolic=Pressure.millimetersOfMercury(requireNotNull(row.secondary)))
            TEMPERATURE->BodyTemperatureRecord(time=time,zoneOffset=offset,metadata=metadata,temperature=Temperature.celsius(n))
            HEART->{require(n%1.0==0.0);HeartRateRecord(startTime=time,startZoneOffset=offset,endTime=time,endZoneOffset=offset,samples=listOf(HeartRateRecord.Sample(time,n.toLong())),metadata=metadata)}
            RESTING->{require(n%1.0==0.0);RestingHeartRateRecord(time=time,zoneOffset=offset,metadata=metadata,beatsPerMinute=n.toLong())}
            HRV->HeartRateVariabilityRmssdRecord(time=time,zoneOffset=offset,metadata=metadata,heartRateVariabilityMillis=n)
            OXYGEN->OxygenSaturationRecord(time=time,zoneOffset=offset,metadata=metadata,percentage=Percentage(n))
            RESPIRATION->RespiratoryRateRecord(time=time,zoneOffset=offset,metadata=metadata,rate=n)
        }
    }
    companion object {fun fromWire(value:String)=entries.single{it.wire==value}}
}
