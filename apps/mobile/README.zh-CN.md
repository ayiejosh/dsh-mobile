# DeepSeek Harness Android App

[English](README.md) · [返回项目首页](../../README.md)

DeepSeek Harness 是这个轻量、社区维护的 Android WebView 薄壳的显示名称。它不打包另一份 DSH 前端，而是访问插件提供的同一个 HTTPS 地址，因此 App 与手机浏览器会获得相同的 DSH 功能，以及可以实时编辑的 `mobile.css` 外观和 `mobile.js` 功能。

当前只支持 Android。iOS 客户端仍为未发布的本地开发实验，不进入构建、Release 或支持范围。

> **0.4.6 版本**：接入既有 frps 的自签 HTTPS 入口需要 0.4.6 Android App 固定远程网关 CA。旧版 App 不支持此入口，原有局域网与公开证书远程连接仍可使用。

## 使用

1. 按项目首页的快速开始安装插件并运行 `dsh-mobile setup`。
2. 从 GitHub Release 安装 Android APK。
3. 打开 App 后先选择“局域网访问”或“远程访问”。
4. 局域网连接在 **移动访问 → 局域网** 中生成密钥或配对链接；远程连接先配置服务商，再生成远程配对二维码。随后在 App 中扫描对应二维码或粘贴链接。
5. 两种连接分别保存设备凭据。局域网在 App 内固定私有 CA；常规远程通道使用系统信任的公开 HTTPS 证书，自签 FRP 入口则由 0.4.6 App 固定远程 CA。手机无需安装对应服务商 App。

托管部署的自建 FRP 使用公开 CA 的 HTTPS 域名或公网 IPv4 地址，需要 Android App 0.3.3 或更高版本。0.4.6 的“接入既有 frps”可沿用公开 CA 配对，也可选公网 IPv4 自签入口；后者仅能使用 0.4.6 App 配对。详见[接入指南](../../docs/ATTACH_EXISTING_FRPS.md)；受支持的旧 App 仍可使用局域网、cpolar 和 Tailscale Funnel。

手动或自动部署 VPS、核对主机指纹、清理和排障请见[自建 FRP 使用指南](../../docs/SELF_HOSTED_FRP.md)。

首次配对后，App 使用 Android Keystore 加密保存可随时撤销的长期设备 token，并且只向原先保存的精确 Origin 发送该 token，以换取短期 Web 会话。电脑的局域网 IP 变化后，App 会扫描默认端口，用稳定的 DSH 安装标识找回同一台电脑并更新地址。cpolar 免费地址等远程 Origin 失效后无法从旧地址发现新地址，需要扫描电脑端当前远程二维码，用一次性配对 token 验证新 Origin；App 不会把旧设备 token 发送给该新地址。发现过程不会暴露设备 token 或 Session 凭据。

App 会在配对前读取独立的版本元数据，明确区分“App 过旧”“插件过旧”和协议不兼容；旧插件没有该端点时仍按原流程连接。已配对连接会在后台快速恢复，连接选择页可立即操作；仅对短暂断网或服务不可用进行有限次数的自动重试。App 原生页面由 Android 按系统语言自动显示简体中文、英文或意大利文，不提供另一套语言开关。WebView 中的插件界面跟随 DSH 选择的语言；当前 DSH 尚未提供意大利语，相关字典会在 DSH 后续加入该语言时直接生效。

自动发现会同时监听 DNS-SD/mDNS 与周期性 UDP 公告，也保留端口 `3443` 的主动 UDP 查询和私有 Wi-Fi、热点 `/24` 网段探测兜底。结果按稳定安装标识合并并更新地址。首页提供“扫码配对”（对准电脑屏幕上的二维码即可免密钥配对）、局域网扫描、结果列表和手动地址输入（如子网、非默认端口或发现被防火墙拦截时，可输入 `https://IP:端口` 直接连接）。点击一台 DSH 后才输入它的密钥。手机浏览器首次使用时，可直接打开电脑端“复制配对链接”得到的链接（配对码自动填入），也可以打开 HTTPS 地址中的 `/mobile-access/pair`，输入生成密钥最后一个点号后的 43 位配对码。

私有 CA 不属于发现数据。用户明确选择局域网或自签 FRP 入口并输入配对密钥后，Android 从所选 HTTPS Origin 无凭据读取网关 CA，核对有效期及其 SHA-256 指纹与密钥一致，再与加密设备凭据一同保存。原生请求和 WebView 此后只接受该固定 CA 为精确 Origin 签发的有效叶证书，其余 TLS 错误全部取消。公开 CA 远程入口不提供私有 CA，App 改用系统信任库。叶证书在同一 CA 下续签无需重配；CA 过期、更换或指纹不匹配时绝不静默信任，必须重新配对。私有 CA 不会安装进 Android 系统信任设置。

## 为什么使用 App

- 没有浏览器地址栏和标签栏，纵向空间更完整。
- 系统返回键先处理同源 WebView 历史。
- 文件选择、同源下载、分享和清除站点数据使用受限的原生实现。
- 与手机浏览器访问同一页面，不形成第二套 UI 或协议。

局域网与公开证书远程入口仍可使用手机浏览器。自签 FRP 入口面向 0.4.6 Android App，普通浏览器不会自动信任其私有 CA。

## 安全边界

| 控制项 | Android 行为 |
| --- | --- |
| 传输 | 只接受 HTTPS origin，Manifest 禁止明文流量。 |
| TLS | 局域网在 App 内固定配对 CA；自签 FRP 入口还须由 0.4.6 App 固定远程 CA。两者只接受它为精确 Origin 签发的有效叶证书；公开 CA 远程入口使用系统信任库，其余 `SslError` 全部取消。 |
| Origin | 只保存协议、规范化主机和端口；普通路径、查询和 fragment 不持久化。 |
| 导航 | 同源主页面留在 WebView；用户点击的外部 HTTPS 链接交给系统浏览器。 |
| 权限 | 文件输入使用系统文档选择器，无需存储权限；只有用户主动扫码或拍照时才申请相机权限。 |
| 下载 | 只允许当前 exact origin 的前台 GET；认证控制路径永不下载。 |
| 数据 | 设备 token 以及局域网或自签 FRP 固定的 CA 由 Android Keystore 加密；Web 存储位于 App 沙箱；清除站点数据会删除设备凭据、Origin、Cookie、缓存和 Web 存储。 |
| 备份 | App 备份关闭，TLS 私钥和签名密钥不得进入仓库。 |

网络安全配置不信任用户安装的 CA。局域网接入会为所选网卡的当前地址签发新叶证书，App 在加密设备凭据中保留稳定 CA 固定。自签 FRP 入口使用有效期 5 年的电脑端 CA 和有效期 397 天的公网 IPv4 叶证书；叶证书可在同一 CA 下轮换，CA 到期或更换须核对新指纹并重新配对。这些有效期不代表无需运维即可一直可用。

## 移动扩展桥

认证后的页面可以通过 `dshMobile` 扩展调用 Android Bridge。Bridge 使用 `androidx.webkit` WebMessage listener，每条消息都校验配置的精确顶层 Origin 和 `isMainFrame`，绝不使用 `addJavascriptInterface`。入站消息上限为 1 MiB，剪贴板文本为 256 KiB，二进制结果为 8 MiB，回复为 12 MiB；它不暴露 Cookie、设备令牌、配对密钥、CA 私钥或任意 Android API。

可用能力包括 `files.pick`、`camera.capture`、`share`、`clipboard.read`、`clipboard.write`、`notification.notify` 和 `notification.settings`。DSH 原生文件附件入口仍在输入栏的“添加”组；当前附件 owner 支持接收图片时，Mobile 只把“拍照”加入同一组。扩展可单独调用 `files.pick`：系统选择器遵循调用方声明的 MIME 类型，通过 Bridge 返回的文件上限为 8 MiB；这不是 DSH 原生文件选择的限制。拍照仅在使用时申请 Android 相机权限，通过 `FileProvider` 写入完整分辨率 JPEG，再作为浏览器 `File` 返回。任务提醒使用精确的 Host 完成事件和明确的待确认卡片，在页面仍存活于后台时触发；可从 App 内的 DSH“常规”设置打开通知授权或系统设置。锁屏只显示通用文案，不同任务的通知不会互相覆盖，点击通知可回到 App。文件选择和拍照同一时间只允许一个，最长等待五分钟；取消、旋转、WebView 销毁、超时或会话已变化时都会清理或拒绝旧结果。手机浏览器使用对应 Web API，不支持时返回 `unsupported`。

电脑端扩展是另一层：`host.mjs` 作为 DSH 主机上的可信 Node.js 代码运行，`mobile.js` 通过限定到自身扩展的 Action 和 Route 调用它。App Bridge 不能编辑或上传扩展源文件。

客户端会校验扩展清单和带版本的资源 URL。文件变化会触发已认证的服务端事件，让手机立即刷新；页面可见时每 45 秒、隐藏时每 5 分钟的轮询只作断线恢复兜底。每个界面激活都绑定对应的 Host、脚本、样式和资源版本；Host 暂存失败会保留当前版本，客户端激活失败则关闭该扩展并重试，避免混用新旧版本。

## 构建

需要 Android Studio 或 Android SDK 36 和 JDK 17。仓库已包含 Gradle 9.7.1 Wrapper。

```powershell
Set-Location apps/mobile/android
./gradlew.bat :app:lintDebug :app:testDebugUnitTest :app:assembleDebug -x :app:lintAnalyzeDebugUnitTest -x :app:lintAnalyzeDebugAndroidTest
```

Debug APK 位于 `app/build/outputs/apk/debug/app-debug.apk`。GitHub Release 使用仅保存在仓库 Secrets 中的稳定签名密钥生成已签名 Release APK；签名密钥与密码不会进入源码或构建产物。

## 验收

共享 URL 策略测试覆盖 Origin 规范化、配对入口、同源导航和下载路径；0.4.6 的远程 CA 信任决策有本地测试，但自签 FRP 入口尚无真实 VPS 加手机的端到端验收记录。真机仍需验证该链路、小屏、横屏、刘海与手势区、软键盘、字体缩放、有效与无效 TLS、文件输入、下载、返回、旋转和清除数据后的重新认证。

Apache-2.0 licensed. See [LICENSE](../../LICENSE).
