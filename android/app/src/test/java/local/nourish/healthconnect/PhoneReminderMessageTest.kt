package local.nourish.healthconnect

import org.junit.Assert.*
import org.junit.Test

class PhoneReminderMessageTest {
    private val revision="dfc09d2a-2e23-4d05-94ee-2f2bf0799edf"
    private val data=mapOf("version" to "1","language" to "fr","tag" to "nourish-"+"a".repeat(64),"registration" to revision)
    private val now=1_800_000_000_000L
    @Test fun acceptsOnlyTheCurrentRegistrationAndFiniteDeliveryWindow(){
        val parsed=PhoneReminderMessage.parse(data,now-1000,300,now,revision)!!
        assertEquals("fr",parsed.language);assertEquals(data["tag"],parsed.tag);assertEquals(now+299000,parsed.expiresAt)
        assertNull(PhoneReminderMessage.parse(data,now-300001,300,now,revision))
        assertNull(PhoneReminderMessage.parse(data,now+1,300,now,revision))
        assertNull(PhoneReminderMessage.parse(data,now-1000,301,now,revision))
        assertNull(PhoneReminderMessage.parse(data,0,300,now,revision))
        assertNull(PhoneReminderMessage.parse(data,now-1000,300,now,null))
        assertNull(PhoneReminderMessage.parse(data,now-1000,300,now,"00000000-0000-4000-8000-000000000001"))
    }
    @Test fun rejectsUnexpectedDataAndProviderText(){
        for(changed in listOf(data+("label" to "private meal"),data+("version" to "2"),data+("language" to "xx"),data+("tag" to "private meal"),data+("registration" to "bad"),data-"registration")){
            assertNull(PhoneReminderMessage.parse(changed,now-1,300,now,revision))
        }
    }
    @Test fun allFourSupportedLanguagesHaveBundledGenericText(){
        for(language in listOf("en","fr","de","pt-BR")){
            val message=PhoneReminderMessage.parse(data+("language" to language),now-1,300,now,revision)!!
            assertEquals(language,message.language)
        }
    }
    @Test fun metadataLimitsDoNotOverflow(){
        assertNull(PhoneReminderMessage.parse(data,Long.MAX_VALUE,300,now,revision))
        assertNull(PhoneReminderMessage.parse(data,now,Int.MAX_VALUE,now,revision))
        assertNull(PhoneReminderMessage.parse(data,now,0,now,revision))
        assertNull(PhoneReminderMessage.parse(data,now,300,now+300000,revision))
    }
}
