package io.github.sayach.dshmobile

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WebViewDocumentStateTest {
    private val origin = GatewayOrigin.parse("https://dsh.example.com")!!

    @Test
    fun aSuccessfullyLoadedDshDocumentMayBeMarkedLive() {
        val document = WebViewDocumentState(origin)
        document.started()

        assertTrue(document.finished("https://dsh.example.com/", "https://dsh.example.com/"))
        assertTrue(document.usable)
    }

    @Test
    fun aFailedMainFrameIsNotMarkedLiveByPageFinished() {
        val document = WebViewDocumentState(origin)
        document.started()
        document.failed()

        assertFalse(document.finished("https://dsh.example.com/", "https://dsh.example.com/"))
        assertFalse(document.usable)
    }

    @Test
    fun aNewNavigationInvalidatesThePreviousDocumentUntilItFinishes() {
        val document = WebViewDocumentState(origin)
        document.started()
        assertTrue(document.finished("https://dsh.example.com/", "https://dsh.example.com/"))

        document.started()
        assertFalse(document.usable)
        assertFalse(document.finished("https://dsh.example.com/", "https://dsh.example.com/mobile-access/login"))
        assertTrue(document.finished("https://dsh.example.com/?view=other", "https://dsh.example.com/?view=other"))
    }

    @Test
    fun loginAndPairingDocumentsNeverCountAsTheDshPage() {
        val document = WebViewDocumentState(origin)
        val login = "https://dsh.example.com/mobile-access/login?return=%2F"
        document.started()
        assertFalse(document.finished(login, login))
        assertFalse(isDshDocumentUrl(origin, login))
        assertFalse(isDshDocumentUrl(origin, "https://dsh.example.com/mobile-access/pair"))
        assertFalse(isDshDocumentUrl(origin, "https://other.example.com/"))
        assertFalse(isDshDocumentUrl(origin, "https://dsh.example.com/api/remote.mux"))
        assertFalse(isDshDocumentUrl(origin, "https://dsh.example.com/plugins/events"))
        assertFalse(isDshDocumentUrl(origin, "https://dsh.example.com/sidebar/file"))
        assertTrue(isDshDocumentUrl(origin, "https://dsh.example.com/"))
    }

    @Test
    fun aSurvivingPageIsKeptAfterCookieRenewal() {
        assertTrue(renewedDocumentAction(4, 4, true, true, "true") == RenewedDocumentAction.KEEP)
    }

    @Test
    fun aFailedPageOrRendererIsReloadedAfterCookieRenewal() {
        assertTrue(renewedDocumentAction(4, 4, true, true, "false") == RenewedDocumentAction.RELOAD)
        assertTrue(renewedDocumentAction(4, 4, true, true, null) == RenewedDocumentAction.RELOAD)
    }

    @Test
    fun aLateProbeCannotReplaceAnotherDeviceOrWebView() {
        assertTrue(renewedDocumentAction(4, 5, true, true, "false") == RenewedDocumentAction.IGNORE)
        assertTrue(renewedDocumentAction(4, 4, false, true, "false") == RenewedDocumentAction.IGNORE)
        assertTrue(renewedDocumentAction(4, 4, true, false, "false") == RenewedDocumentAction.RELOAD)
    }

    @Test
    fun successfulRootCompletionCancelsTheTimeoutAfterUrlNormalization() {
        assertTrue(sameMainDocumentUrl(origin, "https://dsh.example.com/", "https://dsh.example.com"))
        assertTrue(sameMainDocumentUrl(origin, "https://dsh.example.com/?frontend=dedicated", "https://dsh.example.com/?frontend=dedicated"))
        assertFalse(sameMainDocumentUrl(origin, "https://dsh.example.com/", "https://dsh.example.com/mobile-access/login"))
        assertFalse(sameMainDocumentUrl(origin, "https://dsh.example.com/?a=1", "https://dsh.example.com/?a=2"))
        assertFalse(sameMainDocumentUrl(origin, "https://other.example.com/", "https://dsh.example.com/"))
    }
}
