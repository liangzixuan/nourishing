package local.nourish.healthconnect

import android.content.res.Resources
import android.util.TypedValue

/** Convert the web app's 18sp base through Android's nonlinear font scaling. */
fun webBaseFontScale(resources:Resources):Double {
    val metrics=resources.displayMetrics
    val scaled=TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP,18f,metrics)
    val base=TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP,18f,metrics)
    return (scaled/base).toDouble().also{require(it.isFinite()&&it>0)}
}
