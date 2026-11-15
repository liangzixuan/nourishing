package local.nourish.healthconnect
import org.junit.Assert.*
import org.junit.Test
class ReadPresentationTest {
    @Test fun grantedCountsUseEverySupportedTypeAndOnlyItsActualPermissions() {
        val supported = HEALTH_RECORD_TYPES.keys
        assertEquals(17, supported.size)
        assertEquals(ReadAccessStatus(0, supported.size), readAccessStatus(emptySet()))
        assertEquals(ReadAccessStatus(supported.size, supported.size), readAccessStatus(readPermissions(supported)))
        for (type in supported) {
            val granted = readPermissions(setOf(type))
            assertEquals(ReadAccessStatus(1, supported.size), readAccessStatus(granted + "unrelated.permission"))
            assertEquals(ReadAccessStatus(supported.size - 1, supported.size), readAccessStatus(readPermissions(supported) - granted))
        }
    }
}
