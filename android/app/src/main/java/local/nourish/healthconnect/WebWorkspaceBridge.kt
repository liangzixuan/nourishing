package local.nourish.healthconnect

import android.net.Uri
import android.util.Base64
import android.webkit.WebMessage
import android.webkit.WebMessagePort
import android.webkit.WebView
import java.io.ByteArrayOutputStream
import org.json.JSONObject

/** A fresh main-frame port is bound to the exact private origin on each page. */
class WebWorkspaceBridge(private val web:WebView,private val policy:WebWorkspacePolicy,
    private val download:(String,String,ByteArray)->Unit,private val print:(String,String)->Unit,private val healthConnect:()->Unit,private val shareImage:(String,String,ByteArray)->Unit,private val speech:(String,(Result<String?>)->Unit)->Unit,private val cancelSpeech:()->Unit,private val reminders:(String,String,String?,(Result<JSONObject>)->Unit)->Unit,private val cancelReminders:(String?)->Unit) {
    private var port:WebMessagePort?=null
    private data class Incoming(val kind:String,val name:String,val mime:String,val size:Int,val accountId:String?=null,val bytes:ByteArrayOutputStream=ByteArrayOutputStream())
    private var incoming:Incoming?=null
    fun close(){cancelSpeech();cancelReminders(null);port?.close();port=null;incoming=null}
    fun refreshFontScale(){
        if(!policy.isWorkspace(web.url.orEmpty()))return
        port?.postMessage(WebMessage(JSONObject().put("type","font-scale").put("value",webBaseFontScale(web.resources)).toString()))
    }
    fun connect() {
        if(!policy.isWorkspace(web.url.orEmpty()))return
        close()
        val script=web.context.assets.open("nourishing-bridge.js").bufferedReader().use{it.readText()}
        web.evaluateJavascript(script) {
            if(!policy.isWorkspace(web.url.orEmpty()))return@evaluateJavascript
            val channel=web.createWebMessageChannel();port=channel[0]
            channel[0].setWebMessageCallback(object:WebMessagePort.WebMessageCallback(){
                override fun onMessage(source:WebMessagePort,message:WebMessage?){
                    if(source!==port||!policy.isWorkspace(web.url.orEmpty()))return
                    var id=""
                    try {
                        val text=requireNotNull(message?.data);require(text.length<=70_000){"Invalid Android export message."}
                        val value=JSONObject(text);id=value.getString("id");require(id.length<=32)
                        when(value.getString("op")) {
                            "start"->{
                                check(incoming==null){"Finish the current export first."}
                                val size=value.getLong("size");require(size in 0..WebExportLimits.MEMORY_BYTES.toLong()){"Download exceeds the 32 MiB Android export limit."}
                                val kind=value.getString("kind");require(kind in setOf("download","print","share-image"))
                                val mime=value.getString("mime");require(Regex("[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+(?:;[^\\r\\n]{0,100})?").matches(mime))
                                val accountId=if(kind=="print"){require(mime=="text/html");CloudAccount(value.getString("accountId")).id}else null
                                incoming=Incoming(kind,webDownloadName(value.getString("name")),mime,size.toInt(),accountId)
                            }
                            "chunk"->{val state=checkNotNull(incoming);val data=Base64.decode(value.getString("data"),Base64.NO_WRAP);require(data.size<=48*1024&&state.bytes.size().toLong()+data.size<=state.size);state.bytes.write(data)}
                            "end"->{val state=checkNotNull(incoming);require(state.bytes.size()==state.size){"The export is incomplete."};incoming=null;val data=state.bytes.toByteArray();when(state.kind){"print"->print(data.toString(Charsets.UTF_8),requireNotNull(state.accountId));"share-image"->shareImage(state.name,state.mime,data);else->download(state.name,state.mime,data)}}
                            "dictate"->{
                                val requestId=id
                                speech(value.getString("language")){result->
                                    if(source===port&&policy.isWorkspace(web.url.orEmpty())){
                                        val reply=JSONObject().put("id",requestId).put("ok",result.isSuccess)
                                        result.fold({reply.put("value",it?:JSONObject.NULL)},{reply.put("error",it.message?:"Speech recognition failed.")})
                                        source.postMessage(WebMessage(reply.toString()))
                                    }
                                }
                                return
                            }
                            "cancel-dictation"->cancelSpeech()
                            "phone-reminders"->{
                                val action=value.reminderString("action");require(action in setOf("status","connect","disconnect","settings"))
                                require(value.keys().asSequence().toSet()==setOf("id","op","action")+(if(action=="connect")setOf("label")else emptySet()))
                                val label=if(action=="connect")value.reminderString("label")else null
                                val requestId=id
                                reminders(requestId,action,label){result->
                                    if(source===port&&policy.isWorkspace(web.url.orEmpty())){
                                        val reply=JSONObject().put("id",requestId).put("ok",result.isSuccess)
                                        result.fold({reply.put("value",it)},{error->
                                            val code=when(error){is PhoneReminderFailure->error.issue.name.lowercase();is PhoneReminderUiFailure->error.code;is java.io.IOException->"offline";else->"protocol"}
                                            reply.put("error",code).put("code",code)
                                        })
                                        source.postMessage(WebMessage(reply.toString()))
                                    }
                                };return
                            }
                            "cancel-phone-reminders"->cancelReminders(value.reminderString("target"))
                            "health-connect"->{check(incoming==null){"Finish the current export first."};healthConnect()}
                            "abort"->incoming=null
                            else->error("Unknown Android export operation.")
                        }
                        source.postMessage(WebMessage(JSONObject().put("id",id).put("ok",true).toString()))
                    } catch(error:Exception){incoming=null;source.postMessage(WebMessage(JSONObject().put("id",id).put("ok",false).put("error",error.message?:"Android export failed.").toString()))}
                }
            })
            web.postWebMessage(WebMessage("nourishing-native-port",arrayOf(channel[1])),Uri.parse(policy.origin.value))
            refreshFontScale()
        }
    }
}
