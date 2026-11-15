package local.nourish.healthconnect

import androidx.health.connect.client.records.HydrationRecord
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Mass
import androidx.health.connect.client.units.Volume
import java.time.Instant
import org.junit.Assert.*
import org.junit.Test

/** Executes the pinned SDK constructors, without a phone or a Health Connect service. */
class HealthIntakeSdkBoundsTest {
    private val start = Instant.parse("2026-11-01T12:00:00Z")
    private fun nutrition(energy: Double? = null, protein: Double? = null, sodium: Double? = null, b12: Double? = null) = NutritionRecord(
        startTime = start, startZoneOffset = null, endTime = start.plusSeconds(60), endZoneOffset = null,
        metadata = Metadata.manualEntry(clientRecordId = "synthetic-bounds", clientRecordVersion = 1),
        energy = energy?.let(Energy::kilocalories), protein = protein?.let(Mass::grams),
        sodium = sodium?.let(Mass::grams), vitaminB12 = b12?.let(Mass::grams)
    )
    private fun hydration(liters: Double) = HydrationRecord(
        startTime = start, startZoneOffset = null, endTime = start.plusSeconds(60), endZoneOffset = null,
        metadata = Metadata.manualEntry(clientRecordId = "synthetic-water-bounds", clientRecordVersion = 1),
        volume = Volume.liters(liters)
    )

    @Test fun negativeEnergyCannotBeWrittenAsAnIndependentCorrection() {
        assertThrows(IllegalArgumentException::class.java) { nutrition(energy = -0.000001) }
    }
    @Test fun negativeMacroAndTraceMassCannotBeWrittenAsIndependentCorrections() {
        assertThrows(IllegalArgumentException::class.java) { nutrition(protein = -0.000001) }
        assertThrows(IllegalArgumentException::class.java) { nutrition(b12 = -0.000000001) }
    }
    @Test fun negativeWaterCannotBeWrittenAsAnIndependentCorrection() {
        assertThrows(IllegalArgumentException::class.java) { hydration(-0.000001) }
    }
    @Test fun CancellationCanBeZeroWithoutInventingUnknownNutrients() {
        val record = nutrition(energy = 0.0, protein = 0.0)
        assertEquals(0.0, record.energy!!.inKilocalories, 0.0)
        assertEquals(0.0, record.protein!!.inGrams, 0.0)
        assertNull(record.sodium)
        assertNull(record.vitaminB12)
        assertEquals(0.0, hydration(0.0).volume.inLiters, 0.0)
    }
    @Test fun traceAmountsSurviveWithoutDisplayRounding() {
        assertEquals(0.0000000075, nutrition(b12 = 0.0000000075).vitaminB12!!.inGrams, 0.0)
    }
    @Test fun nonnegativeAggregatesCanStillExceedSdkLimits() {
        assertEquals(100000.0, nutrition(energy = 100000.0).energy!!.inKilocalories, 0.0)
        assertEquals(100000.0, nutrition(protein = 100000.0).protein!!.inGrams, 0.0)
        assertEquals(100.0, nutrition(sodium = 100.0).sodium!!.inGrams, 0.0)
        assertEquals(100.0, hydration(100.0).volume.inLiters, 0.0)
        assertThrows(IllegalArgumentException::class.java) { nutrition(energy = 100000.01) }
        assertThrows(IllegalArgumentException::class.java) { nutrition(protein = 100000.01) }
        assertThrows(IllegalArgumentException::class.java) { nutrition(sodium = 100.01) }
        assertThrows(IllegalArgumentException::class.java) { hydration(100.01) }
    }
}
