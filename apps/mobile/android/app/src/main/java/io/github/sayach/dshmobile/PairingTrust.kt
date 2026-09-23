package io.github.sayach.dshmobile

import java.io.ByteArrayInputStream
import java.security.MessageDigest
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate

internal data class PairingKey(val instanceId: String, val token: String) {
    companion object {
        private val FORMAT = Regex("^dsh1\\.([a-f0-9]{64})\\.([A-Za-z0-9_-]{43})$")

        fun parse(source: String): PairingKey? {
            val match = FORMAT.matchEntire(source) ?: return null
            return PairingKey(match.groupValues[1], match.groupValues[2])
        }
    }
}

internal object PairingTrust {
    /** Validate that the CA is self-signed, valid, and bound to the pairing-key instance id. */
    fun validateCertificate(der: ByteArray, instanceId: String): ByteArray? = runCatching {
        val certificate = certificate(der)
        assertCa(certificate)
        require(fingerprint(certificate) == instanceId)
        certificate.encoded
    }.getOrNull()

    /**
     * Select the TLS trust anchor for one pairing attempt, or `null` when the gateway identity
     * cannot be verified against the fingerprint carried by the pairing key.
     *
     * A LAN gateway always serves its pairing CA, so a missing or unverifiable CA fails the
     * attempt. A remote gateway serves one only for the self-signed passthrough entry; an entry
     * with a publicly trusted certificate answers 404 for `/mobile-access/ca.cer` and keeps the
     * platform trust store — `null` bytes with a non-null instance id — which is the unchanged
     * behaviour for every public remote relay.
     *
     * @param mode the transport the user selected for this attempt.
     * @param instanceId the SHA-256 fingerprint carried by the scanned pairing key.
     * @param fetchCa reads `/mobile-access/ca.cer` over the re-trust bootstrap channel.
     */
    fun selectTrustAnchor(
        mode: AccessMode,
        instanceId: String,
        fetchCa: () -> ByteArray?,
    ): Pair<ByteArray?, String?>? = when (mode) {
        AccessMode.LAN -> fetchCa()?.let { ca -> validateCertificate(ca, instanceId)?.let { it to instanceId } }
        AccessMode.REMOTE -> {
            val decision = RemotePairingTrust.decide(fetchCa(), instanceId)
            if (decision.anchor == PairingTrustAnchor.IDENTITY_MISMATCH) null
            else decision.caCertificate to instanceId
        }
    }

    /** SHA-256 fingerprint of the DER certificate, lowercase hex as used by the gateway. */
    fun fingerprint(certificate: X509Certificate): String =
        MessageDigest.getInstance("SHA-256").digest(certificate.encoded)
            .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }

    private fun certificate(der: ByteArray): X509Certificate =
        CertificateFactory.getInstance("X.509").generateCertificate(ByteArrayInputStream(der)) as X509Certificate

    private fun assertCa(certificate: X509Certificate) {
        certificate.checkValidity()
        require(certificate.basicConstraints >= 0)
        require(certificate.subjectX500Principal == certificate.issuerX500Principal)
        certificate.verify(certificate.publicKey)
    }
}
