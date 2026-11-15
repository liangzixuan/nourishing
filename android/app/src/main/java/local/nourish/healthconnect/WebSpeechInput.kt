package local.nourish.healthconnect

import android.app.Activity
import android.content.Intent
import android.speech.RecognizerIntent
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultRegistry
import androidx.activity.result.contract.ActivityResultContracts
import java.util.Locale

/** A single user-launched speech activity. Navigation invalidates its recipient. */
class WebSpeechInput(activity:ComponentActivity,registry:ActivityResultRegistry=activity.activityResultRegistry) {
    private var launched=false
    private var receiver:((Result<String?>)->Unit)?=null
    private val launcher=registry.register("nourishing-dictation",activity,ActivityResultContracts.StartActivityForResult()){result->
        launched=false
        val callback=receiver;receiver=null
        val text=if(result.resultCode==Activity.RESULT_OK)result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.takeIf{it.isNotBlank()} else null
        callback?.invoke(Result.success(text))
    }
    fun start(language:String,reply:(Result<String?>)->Unit){
        if(launched){reply(Result.failure(IllegalStateException("Finish the current dictation first.")));return}
        val intent=Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE,Locale.forLanguageTag(language).toLanguageTag())
            .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS,1)
        receiver=reply;launched=true
        try{launcher.launch(intent)}catch(error:Exception){launched=false;receiver=null;reply(Result.failure(error))}
    }
    fun cancel(){receiver=null}
}
