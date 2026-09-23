package io.github.sayach.dshmobile

/** The trust anchor a native pairing request must use for the gateway that was just scanned. */
internal enum class PairingTrustAnchor {
    /** Pin the CA the gateway served, fingerprinted against the pairing key. */
    PINNED_CA,

    /** No CA was served (a publicly trusted entry); keep the platform trust store. */
    SYSTEM_TRUST_STORE,

    /** The gateway served something other than the CA the pairing key promised. */
    IDENTITY_MISMATCH,
}

/** The decision taken before any native pairing request is issued. */
internal data class PairingTrustDecision(
    val anchor: PairingTrustAnchor,
    val caCertificate: ByteArray?,
)

/**
 * Remote-mode trust selection for the self-signed passthrough entry.
 *
 * Upstream assumes every remote relay terminates a publicly trusted certificate, so the remote
 * path never pinned a CA and relied on the platform trust store. This fork's self-signed
 * passthrough entry has no public certificate: it publishes its ingress CA at
 * `/mobile-access/ca.cer`, and that CA is exactly the fingerprint the pairing key carries.
 * It must therefore be pinned the same way the LAN path already pins its pairing CA.
 *
 * The three outcomes are deliberately separated, because only two of them are legitimate:
 *  - a served CA that matches the pairing key is pinned;
 *  - nothing served (a publicly trusted entry answers 404) keeps the platform trust store and
 *    is **not** an error — this is the unchanged upstream behaviour;
 *  - anything served that is not the promised CA is a hard identity mismatch.
 */
internal object RemotePairingTrust {
    /**
     * Decide how the native pairing request must authenticate the gateway.
     *
     * @param fetchedCa the bytes returned by `/mobile-access/ca.cer`, or `null` when the entry
     *     served nothing (404, or the optional fetch failed).
     * @param instanceId the SHA-256 fingerprint carried by the scanned pairing key.
     * @return the pinned CA, the platform trust store, or an identity mismatch.
     */
    fun decide(fetchedCa: ByteArray?, instanceId: String): PairingTrustDecision {
        if (fetchedCa == null) {
            return PairingTrustDecision(PairingTrustAnchor.SYSTEM_TRUST_STORE, null)
        }
        // Fail closed: a served payload that is not the promised, self-signed, valid CA is an
        // identity mismatch, never a reason to fall back to the platform trust store.
        val pinned = PairingTrust.validateCertificate(fetchedCa, instanceId)
            ?: return PairingTrustDecision(PairingTrustAnchor.IDENTITY_MISMATCH, null)
        return PairingTrustDecision(PairingTrustAnchor.PINNED_CA, pinned)
    }
}