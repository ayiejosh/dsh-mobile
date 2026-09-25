package io.github.sayach.dshmobile

import java.net.URI

/** Tracks whether the existing WebView still contains a successfully loaded DSH document. */
internal class WebViewDocumentState(private val origin: GatewayOrigin) {
    private var failed = false
    var usable: Boolean = false
        private set

    fun started() {
        usable = false
        failed = false
    }

    fun failed() {
        usable = false
        failed = true
    }

    fun finished(url: String, currentUrl: String): Boolean {
        val successful = !failed && isDshDocumentUrl(origin, url) && isDshDocumentUrl(origin, currentUrl)
        usable = successful
        return successful
    }
}

/** Only the root DSH shell is a page whose JavaScript state we may retain. */
internal fun isDshDocumentUrl(origin: GatewayOrigin, url: String): Boolean {
    if (!GatewayUrlPolicy.isSameOrigin(origin, url)) return false
    val path = runCatching { URI(url).path }.getOrNull() ?: return false
    return path == "/" || path.isEmpty()
}

/** Match a completed main-frame callback to the WebView's current page, including a normalized root slash. */
internal fun sameMainDocumentUrl(origin: GatewayOrigin, currentUrl: String, finishedUrl: String): Boolean {
    if (!GatewayUrlPolicy.isSameOrigin(origin, currentUrl)
        || !GatewayUrlPolicy.isSameOrigin(origin, finishedUrl)
    ) return false
    val current = runCatching { URI(currentUrl) }.getOrNull() ?: return false
    val finished = runCatching { URI(finishedUrl) }.getOrNull() ?: return false
    return current.rawPath.orEmpty().ifEmpty { "/" } == finished.rawPath.orEmpty().ifEmpty { "/" }
        && current.rawQuery == finished.rawQuery
}

/** Ignore stale renewals; keep a live document, or rebuild an invalid one. */
internal enum class RenewedDocumentAction { IGNORE, KEEP, RELOAD }

internal fun renewedDocumentAction(
    expectedGeneration: Int,
    currentGeneration: Int,
    sameWebView: Boolean,
    sameOrigin: Boolean,
    probeResult: String?,
): RenewedDocumentAction = when {
    expectedGeneration != currentGeneration || !sameWebView -> RenewedDocumentAction.IGNORE
    !sameOrigin -> RenewedDocumentAction.RELOAD
    probeResult == "true" -> RenewedDocumentAction.KEEP
    else -> RenewedDocumentAction.RELOAD
}
