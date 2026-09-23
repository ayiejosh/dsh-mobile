import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createFrpAttachFrpcToml,
  createFrpAttachTemplate,
  createFrpAttachTemplateParts,
  validateAttachSettings,
} from '../src/frp-attach.js'
import { createFrpAttachPlan } from '../src/frp-attach-plan.js'
import { createFrpcToml, parseFrpSettings } from '../src/frp-config.js'
import { createCaddySite, createRestrictedFrpServerTemplate } from '../src/frp-template.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

const TOKEN = '0123456789abcdef0123456789abcdef'

function attachSettings(extra: Record<string, unknown> = {}) {
  return parseFrpSettings({
    serverAddress: '1.2.3.4',
    serverPort: 7000,
    token: TOKEN,
    publicOrigin: 'https://1.2.3.4',
    mode: 'attach',
    ...extra,
  })
}

/** Keywords that would mean the attach artefact had installed or rewritten frps. */
const FRPS_INSTALL_MARKERS = ['frps.toml', 'bindPort', 'auth.token', 'systemd', 'dsh-mobile-frps', 'frps.service']

describe('attach artefacts for an existing frps', () => {
  it('separates the VPS half from the local half and never installs frps', () => {
    const parts = createFrpAttachTemplateParts(attachSettings({ vhostHttpPort: 8080 }), { configFile: '/tmp/frpc.toml' })
    expect(parts.mode).toBe('attach')
    for (const marker of FRPS_INSTALL_MARKERS) expect(parts.vps).not.toContain(marker)
    // The declaration must state the two requirements the user has to confirm.
    expect(parts.vps).toContain('不安装、不改动、不重启你的 frps')
    expect(parts.vps).toContain('vhostHTTPPort=<N>')
    expect(parts.vps).toContain('proxyBindAddr="127.0.0.1"')
    // The Caddy half is wired through the owned snippet and one import line.
    expect(parts.vps).toContain('/etc/caddy/dsh-mobile-dsh.caddy')
    expect(parts.vps).toContain('import /etc/caddy/dsh-mobile-dsh.caddy')
    expect(parts.vps).toContain('Managed by DSH Mobile - snippet, safe to delete')
    expect(parts.vps).toContain('reverse_proxy 127.0.0.1:8080')
    expect(parts.vps).toContain('certbot certonly --standalone')
    expect(parts.vps).toContain('--ip-address 1.2.3.4')
    expect(parts.vps).toContain('certbot.timer')
    // The local half carries the generated client configuration and its self-check.
    expect(parts.local).toContain('[[proxies]]')
    expect(parts.local).toContain('type = "http"')
    expect(parts.local).toContain('localIP = "127.0.0.1"')
    expect(parts.local).toContain('frpc verify -c "/tmp/frpc.toml"')
    expect(parts.local).toContain('不安装、不改动本机 frps')
    expect(createFrpAttachTemplate(attachSettings({ vhostHttpPort: 8080 }), { configFile: '/tmp/frpc.toml' })).toBe(parts.text)
  })

  it('uses the user vhost port everywhere and defaults to the upstream one when omitted', () => {
    const custom = createFrpAttachTemplate(attachSettings({ vhostHttpPort: 8080 }))
    expect(custom).toContain('reverse_proxy 127.0.0.1:8080')
    expect(custom).not.toContain('reverse_proxy 127.0.0.1:7080')
    // An explicit port also wins over the saved value through the options bag.
    const overridden = createFrpAttachTemplate(attachSettings({ vhostHttpPort: 8080 }), { vhostHttpPort: 9090 })
    expect(overridden).toContain('reverse_proxy 127.0.0.1:9090')
    const legacy = createFrpAttachTemplate(parseFrpSettings({
      serverAddress: '1.2.3.4', serverPort: 7000, token: TOKEN, publicOrigin: 'https://1.2.3.4',
      mode: 'attach', vhostHttpPort: 7080,
    }))
    expect(legacy).toContain('reverse_proxy 127.0.0.1:7080')
  })

  it('refuses attach mode without the real vhost port and refuses self-signed outside attach', () => {
    expect(() => attachSettings()).toThrow('frp_attach_mode_requires_vhost_port')
    expect(() => parseFrpSettings({
      serverAddress: '1.2.3.4', serverPort: 7000, token: TOKEN, publicOrigin: 'https://1.2.3.4',
      entryTls: 'self-signed',
    })).toThrow('frp_entry_tls_invalid')
    expect(() => attachSettings({ entryTls: 'self-signed', vhostHttpPort: undefined })).not.toThrow()
    expect(() => validateAttachSettings(parseFrpSettings({
      serverAddress: '1.2.3.4', serverPort: 7000, token: TOKEN, publicOrigin: 'https://1.2.3.4',
    }))).toThrow('frp_settings_invalid')
  })

  it('builds a raw TCP passthrough for the self-signed entry', () => {
    const settings = attachSettings({ entryTls: 'self-signed' })
    const parts = createFrpAttachTemplateParts(settings)
    expect(parts.local).toContain('type = "tcp"')
    expect(parts.local).toContain('remotePort = 33080')
    expect(parts.local).toContain('localIP = "127.0.0.1"')
    expect(parts.local).not.toContain('customDomains')
    expect(parts.vps).toContain('ufw allow 33080/tcp')
    expect(parts.vps).toContain('https://1.2.3.4:33080/mobile-access/discovery')
    expect(parts.vps).toContain('curl -k')
    // No Caddy and no certificate files exist in this mode at all.
    expect(parts.vps).not.toContain('caddy')
    expect(parts.vps).not.toContain('certbot')
    expect(parts.vps).not.toContain('vhostHTTPPort')
    // A configurable public port flows into both halves.
    const custom = createFrpAttachTemplateParts(attachSettings({ entryTls: 'self-signed', publicPort: 34_443 }))
    expect(custom.local).toContain('remotePort = 34443')
    expect(custom.vps).toContain('ufw allow 34443/tcp')
  })

  it('builds a zero-SSH plan without any network access', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const directory = await mkdtemp(join(tmpdir(), 'dsh-mobile-attach-'))
    temporaryDirectories.push(directory)
    const plan = createFrpAttachPlan(attachSettings({ vhostHttpPort: 7080 }), {
      configFile: join(directory, 'frpc.toml'),
      localPort: 41234,
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(plan.mode).toBe('attach')
    expect(plan.vps.map(step => step.id)).toEqual(['write-snippet', 'add-import', 'issue-ip-cert', 'enable-cert-timer', 'verify-https'])
    expect(plan.vps.every(step => step.title.startsWith('frpAttachStep'))).toBe(true)
    expect(plan.local.frpcToml).toContain('localPort = 41234')
    expect(plan.local.verifyCommand).toBe(`frpc verify -c "${join(directory, 'frpc.toml')}"`)
    expect(plan.warnings.join('\n')).toContain('本机探测 ≠ 公网验证')

    const selfSigned = createFrpAttachPlan(attachSettings({ entryTls: 'self-signed' }))
    expect(selfSigned.vps.map(step => step.id)).toEqual(['open-public-port', 'verify-frps', 'verify-entry'])
    expect(selfSigned.publicPort).toBe(33_080)
    expect(selfSigned.vps[0]?.commands[0]).toBe('ufw allow 33080/tcp')
    expect(selfSigned.warnings.join('\n')).toContain('切勿把网关 listenHost 改成 0.0.0.0')
  })

  it('parameterizes the Caddy site while keeping the legacy signature working', () => {
    expect(createCaddySite('1.2.3.4', { vhostHttpPort: 8443 })).toContain('reverse_proxy 127.0.0.1:8443')
    // The second parameter used to be the certificate directory; it still is.
    expect(createCaddySite('1.2.3.4', '/custom/certs')).toContain('tls /custom/certs/fullchain.pem')
    expect(createCaddySite('dsh.example.com', { vhostHttpPort: 8080 })).toBe('dsh.example.com {\n  reverse_proxy 127.0.0.1:8080\n}\n')
    expect(createCaddySite('dsh.example.com')).toBe('dsh.example.com {\n  reverse_proxy 127.0.0.1:7080\n}\n')
    expect(() => createCaddySite('dsh.example.com', { entryTls: 'self-signed' })).toThrow('frp_entry_tls_invalid')
    expect(() => createRestrictedFrpServerTemplate(7000, TOKEN, 'https://dsh.example.com', { entryTls: 'self-signed' }))
      .toThrow('frp_entry_tls_invalid')
    expect(createRestrictedFrpServerTemplate(7000, TOKEN, 'https://dsh.example.com', { vhostHttpPort: 8080 }))
      .toContain('vhostHTTPPort = 8080')
  })
})

describe('attach token masking, explicit reveal, and the self-signed transport switches', () => {

  it('keeps both transport switches on for the self-signed passthrough (QA D6)', () => {
    const settings = attachSettings({ entryTls: 'self-signed' })
    for (const frpcToml of [
      createFrpAttachPlan(settings).local.frpcToml,
      createFrpAttachTemplateParts(settings).local,
    ]) {
      expect(frpcToml).toContain('type = "tcp"')
      expect(frpcToml).toContain('remotePort = 33080')
      expect(frpcToml).toContain('transport.useEncryption = true')
      expect(frpcToml).toContain('transport.useCompression = true')
      expect(frpcToml).not.toContain('customDomains')
    }
    // A custom public port still flows through with the switches intact.
    const custom = createFrpAttachPlan(attachSettings({ entryTls: 'self-signed', publicPort: 34_443 })).local.frpcToml
    expect(custom).toContain('remotePort = 34443')
    expect(custom).toContain('transport.useEncryption = true')
    expect(custom).toContain('transport.useCompression = true')
  })
})
