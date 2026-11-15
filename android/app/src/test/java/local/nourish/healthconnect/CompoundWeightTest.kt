package local.nourish.healthconnect

import androidx.health.connect.client.records.WeightRecord
import java.io.File
import java.time.Instant
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test

class CompoundWeightTest {
    @Test fun serverStoneAndPoundsPreviewsKeepSourceUnitsAndConstructKilogramSdkRecords() {
        val directory=File(requireNotNull(System.getProperty("nourish.biometricWriteFixture"))).parentFile
        val fixtures=JSONArray(File(directory,"compound-weight-previews.json").readText())
        assertEquals(2,fixtures.length())
        for(i in 0 until fixtures.length()) {
            val plan=parseHealthWritePlan(fixtures.getJSONObject(i),Instant.parse("2026-11-03T12:00:00Z"))
            val row=plan.rows.single()
            assertEquals(if(i==0)"st" else "lbs",row.unit)
            assertEquals(66.67807839,row.value,0.0)
            assertTrue(row.description.contains(if(i==0)"10.5 st" else "147 lbs"))
            val native=healthNativeRecords(plan,1234).single() as WeightRecord
            assertEquals(66.67807839,native.weight.inKilograms,0.0)
            assertEquals(row.clientId,native.metadata.clientRecordId)
        }
        assertFalse("ST" in HealthWriteType.WEIGHT.units)
        assertFalse("stones" in HealthWriteType.WEIGHT.units)
    }
}
