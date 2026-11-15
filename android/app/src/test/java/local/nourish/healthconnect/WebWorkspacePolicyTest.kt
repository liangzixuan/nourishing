package local.nourish.healthconnect

import org.junit.Assert.*
import org.junit.Test

class WebWorkspacePolicyTest {
    @Test fun widgetEntriesAcceptOnlyCanonicalDestinationsAtTheOwnedOrigin() {
        for(destination in WidgetDestination.entries) {
            val url=policy.widgetUrl(destination)
            assertEquals(url,policy.widgetEntry(url))
            assertEquals(url,policy.widgetEntry(url.replace("fixture.test","FIXTURE.test")))
        }
        for(url in listOf(
            "https://fixture.test.ts.net/?widget=diary",
            "http://fixture.test.ts.net:8443/?widget=diary",
            "https://fixture.test.ts.net.evil.test:8443/?widget=diary",
            "https://owner@fixture.test.ts.net:8443/?widget=diary",
            "https://fixture.test.ts.net:8443/api/action?widget=food",
            "https://fixture.test.ts.net:8443/?widget=unknown",
            "https://fixture.test.ts.net:8443/?widget=food&widget=diary",
            "https://fixture.test.ts.net:8443/?widget=diary#foreign",
            "https://fixture.test.ts.net:8443/?widget=%66ood",
            "https://fixture.test.ts.net:8443/", "not a url"
        ))assertNull(url,policy.widgetEntry(url))
    }
    private val policy=WebWorkspacePolicy(WorkspaceOrigin.parse("https://fixture.test.ts.net:8443"))
    @Test fun navigationKeepsExactOriginAndPort() {
        assertTrue(policy.isWorkspace("https://fixture.test.ts.net:8443/?date=2026-11-07#diary"))
        for(url in listOf("http://fixture.test.ts.net:8443/","https://fixture.test.ts.net/","https://fixture.test.ts.net.evil.test:8443/","https://owner@fixture.test.ts.net:8443/","javascript:alert(1)","file:///private","intent://anything","not a url")) assertFalse(url,policy.isWorkspace(url))
        assertTrue(policy.isExternalLink("https://example.org/source"))
        assertFalse(policy.isExternalLink("intent://anything"))
        assertFalse(policy.isExternalLink("https://owner:secret@example.org"))
    }
    @Test fun downloadNamesCannotBecomePaths() {
        assertEquals("report.csv",webDownloadName("../../report.csv"))
        assertEquals("report.csv",webDownloadName("C:\\private\\report.csv"))
        assertEquals("Nourishing-export",webDownloadName("\r\n\u0000"))
        assertEquals("résumé.csv",webDownloadName("résumé.csv"))
        assertTrue(webDownloadName("x".repeat(400)).length<=180)
    }
}
