import { X509Certificate } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { readCertificateRenewal, type CertRenewalStatus } from './cert-renewal.js'
import {
  isFrpSelfSignedIngress,
  resolveFrpEntryTls,
  resolveFrpMode,
  resolveFrpPublicPort,
  resolveFrpVhostHttpPort,
  type FrpSettings,
} from './frp-config.js'
import { ensureManagedCa, issueServerCertificate } from './managed-setup.js'

/** Private files owned by the self-signed FRP ingress. */
export interface FrpIngressPaths {
  readonly directory: string
  readonly caCertFile: string
  readonly caKeyFile: string
  readonly certFile: string
  readonly keyFile: string
  readonly statusFile: string
}

/** Signed ingress material plus the fingerprint the app must pin. */
export interface FrpIngressCertificate {
  readonly paths: FrpIngressPaths
  readonly ca: X509Certificate
  readonly leaf: X509Certificate
  readonly caFingerprint: string
  readonly status: CertRenewalStatus
}

/** Everything the panel needs for the on-demand self-check. */
export interface FrpIngressSelfCheck {
  readonly mode: 'deploy' | 'attach'
  readonly entryTls: 'public-ip-cert' | 'self-signed'
  readonly vhostHttpPort: number
  readonly publicPort: number
  readonly publicOrigin: string
  readonly serverAddress: string
  readonly serverPort: number
  readonly caFingerprint?: string
  readonly certificate?: CertRenewalStatus
  readonly caCertificate?: CertRenewalStatus
  readonly inbound: { readonly listenHost: '127.0.0.1'; readonly allowedCidrs: readonly string[] }
}

/** Private ingress directory, always a sibling of the remote device file. */
export function frpIngressPaths(stateFile: string): FrpIngressPaths {
  const directory = join(dirname(stateFile), 'ingress')
  return Object.freeze({
    directory,
    caCertFile: join(directory, 'ca.pem'),
    caKeyFile: join(directory, 'ca-key.pem'),
    certFile: join(directory, 'server.pem'),
    keyFile: join(directory, 'server-key.pem'),
    statusFile: join(directory, 'status.json'),
  })
}

function coversPublicIp(certificate: X509Certificate, address: string): boolean {
  const alternatives = certificate.subjectAltName ?? ''
  return alternatives.split(',').some(entry => entry.trim() === `IP Address:${address}`)
}

/**
 * Materialize the CA and leaf the gateway terminates TLS with.
 *
 * The CA lives five years and the leaf 397 days, so nothing here needs renewal
 * maintenance. The leaf is only re-signed when it is missing, expiring, no
 * longer chains to the CA, or no longer names the public IPv4 the app dials.
 */
export async function ensureFrpIngressCertificate(
  settings: FrpSettings,
  stateFile: string,
  now: number = Date.now(),
): Promise<FrpIngressCertificate> {
  if (resolveFrpMode(settings) !== 'attach' || !isFrpSelfSignedIngress(settings)) {
    throw new Error('frp_entry_tls_invalid')
  }
  const paths = frpIngressPaths(stateFile)
  const ca = await ensureManagedCa({
    mode: 'managed',
    caCertFile: paths.caCertFile,
    caKeyFile: paths.caKeyFile,
    certFile: paths.certFile,
    keyFile: paths.keyFile,
  })
  const publicHost = new URL(settings.publicOrigin).hostname
  let leaf: X509Certificate | undefined
  try {
    leaf = new X509Certificate(await readFile(paths.certFile))
  } catch {
    leaf = undefined
  }
  const reusable = leaf !== undefined
    && Date.parse(leaf.validTo) > now + 24 * 60 * 60_000
    && coversPublicIp(leaf, publicHost)
    && leaf.verify(ca.publicKey)
  if (!reusable) {
    await issueServerCertificate(
      { caCertFile: paths.caCertFile, caKeyFile: paths.caKeyFile },
      { commonName: 'DSH Mobile FRP ingress', ipAddresses: [publicHost] },
      { certFile: paths.certFile, keyFile: paths.keyFile },
    )
    leaf = new X509Certificate(await readFile(paths.certFile))
  }
  const signed = leaf ?? (() => { throw new Error('frp_attach_cert_unknown') })()
  return Object.freeze({
    paths,
    ca,
    leaf: signed,
    caFingerprint: ca.fingerprint256.replaceAll(':', '').toLowerCase(),
    status: await readCertificateRenewal(paths.certFile, now),
  })
}

/**
 * Build the read-only self-check payload shown in the desktop panel.
 *
 * No secret ever leaves this function: the CA is reported by fingerprint only,
 * and the token is never read.
 */
export async function frpIngressSelfCheck(settings: FrpSettings, stateFile: string): Promise<FrpIngressSelfCheck> {
  const paths = frpIngressPaths(stateFile)
  const base = {
    mode: resolveFrpMode(settings),
    entryTls: resolveFrpEntryTls(settings),
    vhostHttpPort: resolveFrpVhostHttpPort(settings),
    publicPort: resolveFrpPublicPort(settings),
    publicOrigin: settings.publicOrigin,
    serverAddress: settings.serverAddress,
    serverPort: settings.serverPort,
    inbound: { listenHost: '127.0.0.1' as const, allowedCidrs: Object.freeze(['127.0.0.0/8']) },
  }
  if (!isFrpSelfSignedIngress(settings)) {
    // The public-CA entry keeps its certificate on the VPS; nothing local to read.
    return Object.freeze(base)
  }
  let caFingerprint: string | undefined
  try {
    caFingerprint = new X509Certificate(await readFile(paths.caCertFile)).fingerprint256.replaceAll(':', '').toLowerCase()
  } catch {
    caFingerprint = undefined
  }
  return Object.freeze({
    ...base,
    ...(caFingerprint === undefined ? {} : { caFingerprint }),
    certificate: await readCertificateRenewal(paths.certFile),
    caCertificate: await readCertificateRenewal(paths.caCertFile),
  })
}