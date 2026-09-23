package io.github.sayach.dshmobile

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PairingTrustTest {
    private val instanceId = TestCertificates.instanceIdOf(TestCertificates.ingressCa)

    @Test
    fun parsesFingerprintBoundPairingKey() {
        val instanceId = "a".repeat(64)
        val token = "B".repeat(43)
        assertEquals(PairingKey(instanceId, token), PairingKey.parse("dsh1.$instanceId.$token"))
    }

    @Test
    fun rejectsLegacyOrMalformedKeys() {
        assertNull(PairingKey.parse("B".repeat(43)))
        assertNull(PairingKey.parse("dsh1.${"g".repeat(64)}.${"B".repeat(43)}"))
    }

    // `selectTrustAnchor` is the single entry point the pairing flow uses. The LAN rows below must
    // keep their pre-existing semantics line by line; the REMOTE rows are the self-signed fix.

    @Test
    fun lanPinsTheCaItFetchesFromTheGateway() {
        val trust = PairingTrust.selectTrustAnchor(AccessMode.LAN, instanceId) { TestCertificates.ingressCa }

        assertEquals(instanceId, trust?.second)
        assertArrayEquals(TestCertificates.ingressCa, trust?.first)
    }

    @Test
    fun lanStillFailsWhenTheGatewayServesNoCa() {
        assertNull(PairingTrust.selectTrustAnchor(AccessMode.LAN, instanceId) { null })
    }

    @Test
    fun lanStillFailsWhenTheServedCaIsNotThePromisedOne() {
        assertNull(PairingTrust.selectTrustAnchor(AccessMode.LAN, instanceId) { TestCertificates.foreignCa })
        assertNull(PairingTrust.selectTrustAnchor(AccessMode.LAN, instanceId) { "not a certificate".toByteArray() })
    }

    @Test
    fun remotePinsTheSelfSignedIngressCa() {
        val trust = PairingTrust.selectTrustAnchor(AccessMode.REMOTE, instanceId) { TestCertificates.ingressCa }

        assertEquals(instanceId, trust?.second)
        assertArrayEquals(TestCertificates.ingressCa, trust?.first)
    }

    @Test
    fun remoteKeepsThePlatformTrustStoreWhenTheEntryServesNoCa() {
        // A Caddy + Let's Encrypt entry answers 404 here: identical behaviour to the release that
        // never pinned anything remotely, and explicitly not an error.
        val trust = PairingTrust.selectTrustAnchor(AccessMode.REMOTE, instanceId) { null }

        assertEquals(instanceId, trust?.second)
        assertNull(trust?.first)
    }

    @Test
    fun remoteFailsWhenTheServedCaIsNotThePromisedOne() {
        assertNull(PairingTrust.selectTrustAnchor(AccessMode.REMOTE, instanceId) { TestCertificates.foreignCa })
        assertNull(PairingTrust.selectTrustAnchor(AccessMode.REMOTE, "b".repeat(64)) { TestCertificates.ingressCa })
    }
}