package local.nourish.healthconnect

import android.content.Context
import android.view.View
import android.widget.Button
import android.widget.LinearLayout

/** Optional controls stay in their owner panel; disclosure does not recreate them. */
class NativeDetails(context: Context, private val title: String): LinearLayout(context) {
    val body = LinearLayout(context).apply { orientation = VERTICAL }
    private val toggle = Button(context).apply { text = title; textSize = 16f; isAllCaps = false }
    val expanded: Boolean get() = body.visibility == View.VISIBLE
    init {
        orientation = VERTICAL
        addView(toggle); addView(body)
        toggle.setOnClickListener { setExpanded(!expanded) }
        setExpanded(false)
    }
    fun setExpanded(value: Boolean) {
        body.visibility = if (value) View.VISIBLE else View.GONE
        toggle.text = if(value) "▾ $title" else "▸ $title"
        toggle.contentDescription = title
        androidx.core.view.ViewCompat.setStateDescription(toggle, context.getString(if(value) R.string.export_ui_expanded else R.string.export_ui_collapsed))
    }
}
