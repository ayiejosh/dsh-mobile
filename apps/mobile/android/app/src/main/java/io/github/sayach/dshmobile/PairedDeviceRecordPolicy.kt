package io.github.sayach.dshmobile

/**
 * How one persisted device row must bind its trust anchor for each access mode.
 *
 * A LAN gateway always serves the pairing CA, so a LAN row must pin it. A remote gateway pins
 * the ingress CA only when the entry is self-signed; an entry with a publicly trusted
 * certificate serves no CA at all and its row keeps the platform trust store (`null`).
 */
internal object PairedDeviceRecordPolicy {
    /**
     * Whether the trust anchor stored with a row is acceptable for its access mode.
     *
     * @param mode the transport the row was paired over.
     * @param caCertificate the pinned CA, or `null` when the row uses the platform trust store.
     * @param instanceId the DSH instance the pinned CA must be fingerprinted against.
     */
    fun acceptsTrustAnchor(mode: AccessMode, caCertificate: ByteArray?, instanceId: String): Boolean =
        when (mode) {
            AccessMode.LAN -> caCertificate?.let { PairingTrust.validateCertificate(it, instanceId) != null } == true
            AccessMode.REMOTE -> caCertificate?.let { PairingTrust.validateCertificate(it, instanceId) != null } ?: true
        }
}