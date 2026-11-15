package local.nourish.healthconnect
import org.json.JSONObject
internal fun strictKeys(value: JSONObject, keys: Set<String>) {
    requireWorkspace(value.keys().asSequence().toSet()==keys,WorkspaceError.JSON_FIELDS)
}
