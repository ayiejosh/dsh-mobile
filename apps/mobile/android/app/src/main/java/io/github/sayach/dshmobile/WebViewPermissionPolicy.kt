package io.github.sayach.dshmobile

import android.webkit.PermissionRequest

/**
 * Decides which WebView permission requests the paired GUI page may satisfy.
 *
 * DSH's voice-input plugin records through `getUserMedia`, which Chromium routes
 * to `WebChromeClient.onPermissionRequest`. Only the microphone of the trusted
 * gateway page is granted: every other resource, and any other frame that asks
 * for one, stays denied.
 */
internal object WebViewPermissionPolicy {
    /**
     * @param resources resources the requesting frame asked for.
     * @param requestOrigin origin reported by the WebView, or null when it has none.
     * @param trustedOrigin origin this install is paired with.
     * @return whether microphone capture may be granted for this request.
     */
    fun shouldGrantAudioCapture(
        resources: List<String>,
        requestOrigin: String?,
        trustedOrigin: GatewayOrigin,
    ): Boolean = PermissionRequest.RESOURCE_AUDIO_CAPTURE in resources &&
        GatewayOrigin.parse(requestOrigin ?: "") == trustedOrigin
}
