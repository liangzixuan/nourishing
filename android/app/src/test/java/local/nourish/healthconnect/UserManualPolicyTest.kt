package local.nourish.healthconnect

import org.junit.Assert.*
import org.junit.Test

class UserManualPolicyTest {
    @Test fun helpCenterKeepsArticleSearchAndFragmentNavigation() {
        for(url in listOf("https://support.cronometer.com/hc/en-us/articles/360036016612-Mobile-Fasting#history","https://support.cronometer.com/hc/en-us/search?query=fasting","https://SUPPORT.CRONOMETER.COM:443/hc/fr/categories/360001062451-Mobile-App"))assertTrue(url,UserManualPolicy.owns(url))
    }
    @Test fun otherOriginsSchemesAndCredentialsCannotBecomeManualPages() {
        for(url in listOf("https://support.cronometer.com.evil.test/hc/en-us/","https://support.cronometer.com@evil.test/hc/en-us/","https://user@support.cronometer.com/hc/en-us/","http://support.cronometer.com/hc/en-us/","https://support.cronometer.com:8443/hc/en-us/","https://support.cronometer.com/api/","https://fixture.example.ts.net:8443/","file:///hc/en-us/","javascript:alert(1)","not a url"))assertFalse(url,UserManualPolicy.owns(url))
    }
    @Test fun browserFallbackAcceptsOnlyOrdinaryHttpLinks() {
        assertTrue(UserManualPolicy.isBrowserLink("https://cronometer.com"))
        assertTrue(UserManualPolicy.isBrowserLink("http://example.org/page"))
        for(url in listOf("javascript:alert(1)","intent://example","file:///example","https://user:password@example.org/","https:///example"))assertFalse(url,UserManualPolicy.isBrowserLink(url))
    }
}
