# 接入你既有的 frps（不改动服务器上的 frps）

本文面向**已经在一台公网 VPS 上跑着 frps**的用户。插件不会安装、不会修改、不会重启你的 frps，
也不会改动 Caddyfile 里你自己的内容；本机侧也不会改动 DSH 自身配置。

> 只读预览：面板「自建 FRP → 步骤 2」里的**复制接入清单**按钮会生成同样的两份文本，**不发起任何网络请求**，
> 也不写入任何文件。

## 三个必读项

| 项 | 含义 | 你要做什么 |
|---|---|---|
| **`vhostHTTPPort`** | 你 frps 上「Caddy ↔ frps」之间的**回环明文 HTTP** 端口（上游默认 7080） | 在面板填写**你真实的那个值**。插件不会替你假定 7080：端口填错会让「明文 vhost 公网可达」的安全闸门失效 |
| **`proxyBindAddr`** | 决定 vhost 监听在哪个地址 | 必须是 `"127.0.0.1"`。若缺省（= `0.0.0.0`），`<公网IP>:<vhostHTTPPort>` 会对全网明文开放，攻击者可绕过 HTTPS 直接以 `Host: <公网IP>` 访问网关 |
| **入口证书档 `entryTls`** | 谁终止公网 TLS | 见下两档，按需二选一 |

## 两档入口证书

### A. 公网 IP 证书档（`public-ip-cert`，缺省）

- 公网入口：`443`，由 **VPS 上的 Caddy** 终止 TLS，它再反代到 `127.0.0.1:<vhostHTTPPort>`。
- 证书：Caddy 不能为 IP 自签公开证书，故用 **certbot** 一次性签发 Let's Encrypt 的短期 IP 证书（约 **6 天**），
  由 certbot 自带的每日续期定时器自动续期。
- 手机浏览器与 App 都正常。
- VPS 侧要做：新增 Caddy 片段（`/etc/caddy/dsh-mobile-dsh.caddy`）+ Caddyfile 顶部一行 `import` + 签发证书 + 确认续期定时器。

### B. 自签穿透档（`self-signed`）——**完全不用任何公开证书，证书永不过期**

- 公网入口：`publicPort`（缺省 **33080**，可改；不得为 3080/3443/3444）。frps 只做**纯 TCP 透传，不解密**。
- TLS 由**你家电脑上的 DSH 网关自己终止**，用的是插件自签的 CA（5 年）+ 叶证书（397 天，SAN = 公网 IP）→ **零续期运维**。
- App **不受自签影响**：App 会从网关的 `GET /mobile-access/ca.cer` 取到那张 CA 并固定它（配对串里的 `instance=` 就是该 CA 的指纹）。
- 手机**浏览器**访问会提示证书不受信任（这是自签的必然结果），请用 App 扫码配对使用。
- VPS 侧只需 3 件事，**不需要 Caddy、不需要 certbot、不需要改 `vhostHTTPPort`**。

> 拓扑：`手机 ──HTTPS(:33080)──▶ frps TCP 代理（透传）──加密隧道──▶ 本机 frpc ──▶ 127.0.0.1:<网关HTTPS端口> ──▶ dsh web 127.0.0.1:3080`

## 操作步骤（自签穿透档，共 7 步）

### 本机（3 步）

1. 面板「自建 FRP → 步骤 1」填写：VPS 地址、frps 端口（你 frps 的 `bindPort`）、Token、公网入口
   `https://<公网IP>`；**置备方式 = 接入我已有的 frps**；**入口证书档 = 自签穿透**；公网入口端口 = `33080`（或你选的端口）。
2. 「复制接入清单」，按其中的「本机侧」核对生成的 `frpc.toml`；插件会以 `0600` 权限写入
   `…/remote/frp/config/frpc.toml`。
3. 装官方 frpc（面板「步骤 3」）→ 点「保存并验证连接」。启动前插件会自检 `frpc verify -c <配置>`。

### VPS（2 步）

4. 放行公网入口端口（**只要这一条防火墙规则**）：
   ```sh
   ufw allow 33080/tcp
   ufw status | grep 33080
   ```
   若用 firewalld 或云厂商安全组，放行同样的 **TCP 33080**。
5. 确认既有 frps 已就绪（**不改它的配置**）：
   ```sh
   systemctl is-active frps || true
   ss -lnt | grep -E ':(<你的 bindPort>|33080)\b' || true
   ```

### 手机（2 步）

6. 在电脑面板「远程访问」生成**远程配对二维码 / 配对链接**（含 `instance=<CA指纹>` 与一次性 token）。
7. 用 Android App 扫码（或粘贴链接）完成配对，即可远程进入 DSH。

### 端到端验证（在 VPS 或任意外部机器执行）

```sh
curl -k -sS -o /dev/null -w '%{http_code}\n' https://<公网IP>:33080/mobile-access/discovery
# 期望输出 200（-k 是因为自签证书；App 走的是固定 CA，不需要 -k）
```

面板「步骤 2 → 运行自检」还会显示：入口证书剩余天数、CA 指纹、frps 控制端口可达性、公网入口可达性。
**本机探测 ≠ 公网验证**：请务必在外部再跑一次上面的 curl（手机流量即可）。

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| `frp_attach_mode_requires_vhost_port` | 选了公网 IP 证书档却没填你 frps 的真实 `vhostHTTPPort`。填上真实值即可（插件不会替你假定 7080） |
| `frp_vhost_publicly_reachable` | 你 frps 的明文 vhost 端口从本机看是**公网可达**的。在你 frps 配置里加 `proxyBindAddr = "127.0.0.1"`（不影响公网 `bindPort`），然后重连 |
| `frp_attach_cert_unknown` | 自签入口证书缺失或不可读；重新连接即可自动重签（证书落在插件私有目录的 `remote/ingress/`） |
| 手机浏览器提示证书不受信任 | 自签档的正常现象；请在 App 内配对使用 |
| 自检显示「公网入口不可达」 | 端口未放行、frpc 未启动，或 frps 未把该 `remotePort` 转发出来 |
| App 报「连接到另一台 DSH」 | 公网入口指向了别的 DSH：检查 `remotePort` 与 frpc 是否在本机运行 |

## 与其他通道的关系

- **`origin` 自有反代通道**（默认 3444）是另一条独立路径，TLS 由**你自己的外部反代**终止，与本档互不影响。
- **deploy 模式**（由插件安装 frps + Caddy）保持不变，仍需要 SSH；attach 模式**零 SSH**。