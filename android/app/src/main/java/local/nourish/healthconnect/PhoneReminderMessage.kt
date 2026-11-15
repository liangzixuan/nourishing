package local.nourish.healthconnect

import java.util.UUID

class PhoneReminderMessage private constructor(val tag:String,val language:String,val registration:String,val expiresAt:Long) {
    companion object {
        fun parse(data:Map<String,String>,sentAt:Long,ttlSeconds:Int,now:Long,currentRevision:String?):PhoneReminderMessage?=runCatching {
            require(data.keys==setOf("version","language","tag","registration")&&data["version"]=="1")
            val language=requireNotNull(data["language"]);require(language in setOf("en","fr","de","pt-BR"))
            val tag=requireNotNull(data["tag"]);require(Regex("nourish-[a-f0-9]{64}").matches(tag))
            val revision=requireNotNull(data["registration"]);val uuid=UUID.fromString(revision)
            require(uuid.toString()==revision&&uuid.version()==4&&uuid.variant()==2&&revision==currentRevision)
            require(sentAt>0&&ttlSeconds in 1..300&&now>=sentAt)
            val expiresAt=Math.addExact(sentAt,ttlSeconds*1000L);require(now<expiresAt)
            PhoneReminderMessage(tag,language,revision,expiresAt)
        }.getOrNull()
    }
}
