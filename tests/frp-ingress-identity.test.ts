import { lstat, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseFrpSettings } from '../src/frp-config.js'
import { ensureFrpIngressCertificate, purgeFrpIngressCertificates } from '../src/frp-ingress.js'

const temporaryDirectories: string[] = []
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function fixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-mobile-ingress-identity-'))
  temporaryDirectories.push(directory)
  return join(directory, 'remote-devices.json')
}

const settings = parseFrpSettings({
  serverAddress: '1.2.3.4', serverPort: 7000,
  token: '0123456789abcdef0123456789abcdef',
  publicOrigin: 'https://1.2.3.4', mode: 'attach', entryTls: 'self-signed',
})

describe('persistent self-signed ingress identity', () => {
  it('keeps an external CA marker and rejects missing CA files on a later start', async () => {
    const stateFile = await fixture()
    const first = await ensureFrpIngressCertificate(settings, stateFile)
    expect(JSON.parse(await readFile(first.paths.statusFile, 'utf8'))).toEqual({
      version: 1, caFingerprint: first.caFingerprint,
    })
    await expect(ensureFrpIngressCertificate(settings, stateFile, Date.parse(first.ca.validTo) + 1))
      .rejects.toThrow('frp_ingress_ca_expired')
    await unlink(first.paths.caCertFile)
    await unlink(first.paths.caKeyFile)
    await expect(ensureFrpIngressCertificate(settings, stateFile)).rejects.toThrow('frp_ingress_ca_invalid')
    await expect(lstat(first.paths.statusFile)).resolves.toBeDefined()
  })

  it('rejects a changed marker and purges both certificate files and the marker explicitly', async () => {
    const stateFile = await fixture()
    const first = await ensureFrpIngressCertificate(settings, stateFile)
    await expect(ensureFrpIngressCertificate(settings, stateFile, Date.now(), 'b'.repeat(64)))
      .rejects.toThrow('frp_ingress_ca_changed')
    await writeFile(first.paths.statusFile, `${JSON.stringify({ version: 1, caFingerprint: 'a'.repeat(64) })}\n`)
    await expect(ensureFrpIngressCertificate(settings, stateFile)).rejects.toThrow('frp_ingress_ca_changed')
    await purgeFrpIngressCertificates(stateFile)
    for (const file of [first.paths.caCertFile, first.paths.caKeyFile, first.paths.certFile, first.paths.keyFile, first.paths.statusFile]) {
      await expect(lstat(file)).rejects.toMatchObject({ code: 'ENOENT' })
    }
  })
})
