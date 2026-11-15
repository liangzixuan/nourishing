package local.nourish.healthconnect

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.speech.RecognizerIntent
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultRegistry
import androidx.activity.result.contract.ActivityResultContract
import androidx.core.app.ActivityOptionsCompat
import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test

class WebSpeechInputNativeTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private class Registry:ActivityResultRegistry(){
        lateinit var intent:Intent
        var code=0
        var unavailable=false
        override fun <I,O> onLaunch(requestCode:Int,contract:ActivityResultContract<I,O>,input:I,options:ActivityOptionsCompat?){
            if(unavailable)throw ActivityNotFoundException("No speech service")
            code=requestCode
            intent=contract.createIntent(InstrumentationRegistry.getInstrumentation().targetContext,input)
        }
        fun respond(text:String?=null,cancelled:Boolean=false){
            dispatchResult(code,if(cancelled)Activity.RESULT_CANCELED else Activity.RESULT_OK,Intent().putStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS,if(text==null)arrayListOf() else arrayListOf(text,"Ignored alternative")))
        }
    }
    private fun fixture(block:(WebSpeechInput,Registry)->Unit){
        ActivityScenario.launch<NourishingActivity>(Intent(instrumentation.targetContext,NourishingActivity::class.java)).use{scenario->
            scenario.moveToState(Lifecycle.State.CREATED)
            val registry=Registry();lateinit var input:WebSpeechInput
            scenario.onActivity{input=WebSpeechInput(it as ComponentActivity,registry)}
            scenario.moveToState(Lifecycle.State.RESUMED)
            instrumentation.runOnMainSync{block(input,registry)}
        }
    }
    @Test fun standardSpeechIntentUsesTheAppLanguageAndReturnsLiteralText(){fixture{input,registry->
        var received:Result<String?>?=null
        input.start("fr"){received=it}
        assertEquals(RecognizerIntent.ACTION_RECOGNIZE_SPEECH,registry.intent.action)
        assertEquals(RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,registry.intent.getStringExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL))
        assertEquals("fr",registry.intent.getStringExtra(RecognizerIntent.EXTRA_LANGUAGE))
        assertEquals(1,registry.intent.getIntExtra(RecognizerIntent.EXTRA_MAX_RESULTS,0))
        assertNull(received)
        registry.respond("Literal <riz> & poulet")
        assertEquals("Literal <riz> & poulet",received?.getOrThrow())
    }}
    @Test fun cancellationDiscardsTheOldResultAndCannotRetargetItToAnotherRequest(){fixture{input,registry->
        var calls=0;var rejection:Throwable?=null
        input.start("en"){calls++};input.cancel()
        input.start("de"){rejection=it.exceptionOrNull()}
        assertNotNull(rejection);registry.respond("Late result");assertEquals(0,calls)
        var received:String?=null;input.start("de"){received=it.getOrThrow()};registry.respond("New result");assertEquals("New result",received)
    }}
    @Test fun nativeCancelEmptyResultsAndMissingProviderLeaveNoPendingRecipient(){fixture{input,registry->
        var calls=0
        input.start("pt-BR"){assertNull(it.getOrThrow());calls++};registry.respond(cancelled=true)
        input.start("pt-BR"){assertNull(it.getOrThrow());calls++};registry.respond()
        registry.unavailable=true;input.start("en"){assertTrue(it.exceptionOrNull() is ActivityNotFoundException);calls++}
        registry.unavailable=false;input.start("en"){assertEquals("Recovered",it.getOrThrow());calls++};registry.respond("Recovered")
        assertEquals(4,calls)
    }}
}
