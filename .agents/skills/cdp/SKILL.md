---
name: cdp
description: 通过 Playwright 连接 ReinaManager WebView2 的 Chrome DevTools Protocol，由 AI 操作桌面前端、截图、检查 DOM/样式/控制台/网络，复现并验证 UI 问题。仅在用户显式调用 /cdp 或 $cdp 进行前端调试时使用。
---

# CDP 前端调试

使用持久化 `node_repl` 中的 Playwright 连接已运行的 Tauri WebView2。完成“复现 → 取证 → 修复 → 原路径复验”闭环，不只启动应用。

## 1. 启动或复用应用

1. 在项目根目录检查 TCP 9222 端口：

   ```powershell
   Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue
   ```

2. 若端口空闲，使用长时间运行的 shell 启动，保留输出和进程：

   ```powershell
   pnpm tauri:dev-cdp
   ```

   该命令通过 `scripts/dev-cdp.ps1` 为 WebView2 启用 9222 端口，然后运行 `pnpm tauri dev`。命令持续运行是正常现象，不要等待它自行退出。

3. 若端口已占用，访问 `http://127.0.0.1:9222/json/list` 并核对 target 是 ReinaManager。对无关进程不做连接，也不主动终止或更换其端口。

4. 等待 CDP endpoint 和 WebView target 出现。启动失败时先查看保留的 shell 日志。

## 2. 连接 WebView2

在 `node_repl` 中使用顶层 `var` 保留连接，后续调用复用同一个 `browser` 和 `page`：

```javascript
var playwright = await import("playwright");
var browser = await playwright.chromium.connectOverCDP("http://127.0.0.1:9222");
var contexts = browser.contexts();
var pages = contexts.flatMap((context) => context.pages());
nodeRepl.write(pages.map((item, index) => ({ index, url: item.url() })));
```

从现有 targets 中选择 ReinaManager 页面，不新建 browser、context 或 page。核对 URL、title 和页面内容后再操作。

## 3. 建立可观测性

复现前安装监听器，持续收集新的错误与失败请求：

```javascript
var consoleEvents = [];
var pageErrors = [];
var failedRequests = [];
page.on("console", (message) => consoleEvents.push({ type: message.type(), text: message.text() }));
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("requestfailed", (request) => failedRequests.push({
  url: request.url(),
  error: request.failure()?.errorText,
}));
```

优先使用 Playwright locator 查看可访问名称、可见性、文本和 DOM。需要时使用 `page.evaluate` 检查 computed style、尺寸、滚动容器和应用状态。不要仅凭截图猜测原因。

## 4. 操作与截图

- 优先使用 `getByRole`、`getByLabel`、`getByText` 和稳定 `data-testid`。只在没有语义定位方式时使用 CSS selector。
- 按用户描述的真实路径点击、输入、滚动和导航，记录确切复现步骤。
- 在关键节点截图：初始状态、故障状态、修复后状态。小范围问题同时截取目标元素。
- 直接将截图返回给视觉检查，不把临时截图写入仓库：

```javascript
var screenshot = await page.screenshot({ type: "png" });
await nodeRepl.emitImage(screenshot);
```

将视觉结果与 DOM、样式、控制台和网络证据交叉验证。

## 5. 安全边界

只执行当前调试所需的界面操作。未经用户明确要求，不执行以下操作：

- 删除游戏、合集、存档或其他用户数据。
- 导入/覆盖数据库，删除 WebView2 用户数据。
- 启动外部游戏、安装任务、应用更新或 OAuth 授权。
- 为了调试而关闭安全校验或修改真实用户数据。

若复现必须产生持久化数据，先向用户说明影响并征得同意。

## 6. 修复与复验

1. 在修改代码前用 DOM、样式、日志或网络证据确认原因。
2. 若用户只要求诊断，停在证据和结论，不修改代码。
3. 若用户要求修复，执行最小代码改动，等待 Vite HMR 或应用重载。
4. 使用相同的起点、数据和交互步骤复验。
5. 同时确认目标 UI、控制台错误、page error 和失败请求。
6. 按改动范围运行项目检查；涉及国际化时同时使用 i18n Skill。

## 7. 完成报告

报告以下内容：

- 复现路径和实际结果。
- 根因及支撑证据。
- 已修改文件和修复方式（若授权修复）。
- 复验路径、截图结果和项目检查结果。
- 仍存在的限制或未覆盖场景。

保留 Tauri 开发进程供用户继续调试。除非用户要求停止，不调用 `browser.close()`，不终止开发进程。
