package local.nourish.healthconnect

import android.app.Activity
import android.os.Bundle
import android.os.Build
import android.view.WindowManager
import android.view.WindowInsets
import android.widget.ScrollView
import android.widget.TextView


class PermissionsRationaleActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        setContentView(ScrollView(this).apply {
            val policy = TextView(this@PermissionsRationaleActivity).apply {
                text = if(NourishingWorkspace.cloudOrigin!=null)getString(R.string.cloud_privacy_policy) else getString(R.string.privacy_policy)
                textSize = 17f
                setPadding(24, 32, 24, 32)
            }
            addView(policy)
            setOnApplyWindowInsetsListener { _, insets ->
                if (Build.VERSION.SDK_INT >= 30) {
                    val edges = insets.getInsets(WindowInsets.Type.systemBars())
                    policy.setPadding(24 + edges.left, 32 + edges.top, 24 + edges.right, 32 + edges.bottom)
                } else {
                    @Suppress("DEPRECATION")
                    policy.setPadding(24 + insets.systemWindowInsetLeft, 32 + insets.systemWindowInsetTop,
                        24 + insets.systemWindowInsetRight, 32 + insets.systemWindowInsetBottom)
                }
                insets
            }
        })
    }
}
