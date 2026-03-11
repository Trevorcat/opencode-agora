# OpenCode 集成经验记录

> 日期：2026-03-11  
> 背景：在实现 Agora MCP 与 OpenCode TUI 集成时，通过阅读 oh-my-opencode 源码获得的关键认知。

---

## 一、omo 如何在 Windows 上实现 TUI 集成

### 结论：不靠 tmux，靠 OpenCode HTTP API

omo 的 tmux subagent 功能在 Windows 上**默认关闭**（`enabled: false`）且有 `process.platform !== "win32"` 的排除判断。tmux 在 Windows 环境中也根本不存在。

omo 在所有平台（包括 Windows）实现 TUI 集成的真实机制是：**直接调用 OpenCode 暴露的 HTTP API**。

### OpenCode TUI HTTP API 端点

OpenCode 本地 HTTP 服务器暴露了一组 `/tui/` 端点，允许外部程序（插件、MCP server）与 TUI 交互：

```
POST /tui/show-toast           → 右上角弹出 toast 通知
POST /tui/publish              → 推送结构化事件到 TUI
POST /tui/append-prompt        → 向输入框追加文字
POST /tui/submit-prompt        → 自动提交当前输入
POST /tui/execute-command      → 执行斜杠命令
POST /tui/open-help            → 打开帮助面板
POST /tui/open-sessions        → 打开 session 列表
GET  /tui/control/next         → 获取下一个控制事件
POST /tui/control/response     → 响应控制请求
```

### /tui/show-toast 参数

```json
{
  "title": "Agora Round 2/3",
  "message": "proponent ✓  skeptic ✓  — 辩论进行中",
  "variant": "info",       // "info" | "success" | "warning" | "error"
  "duration": 5000         // 毫秒，可选
}
```

### /tui/publish 支持的事件类型

```json
// 1. 向输入框追加文字（让 AI 自动读取并回复）
{ "type": "tui.prompt.append", "properties": { "text": "辩论结果：..." } }

// 2. 执行命令
{ "type": "tui.command.execute", "properties": { "command": "/debate" } }

// 3. 显示 toast（等同于 show-toast）
{ "type": "tui.toast.show", "properties": { "title": "...", "message": "...", "variant": "success" } }

// 4. 切换 session
{ "type": "tui.session.select", "properties": { "sessionID": "ses_xxx" } }
```

---

## 二、omo 如何获取 OpenCode HTTP API 的 URL

### 关键发现：`serverUrl` 由 Plugin SDK 直接注入

omo 是作为 **OpenCode Plugin** 运行的（`@opencode-ai/plugin` SDK），OpenCode 在启动插件时会把完整的 client 对象注入进来：

```typescript
// @opencode-ai/plugin 的 PluginInput 类型
export type PluginInput = {
  client: ReturnType<typeof createOpencodeClient>;  // 已配好 baseUrl 的 SDK client
  project: Project;
  directory: string;
  worktree: string;
  serverUrl: URL;   // ← 直接拿到！不需要自己发现
  $: BunShell;
};

export type Plugin = (input: PluginInput) => Promise<Hooks>;
```

**OpenCode 直接把 `serverUrl` 作为参数传给插件**，omo 完全不需要做端口发现。

### 我们的情况（MCP Server）与 omo 的差异

| | omo (Plugin) | Agora (MCP Server) |
|---|---|---|
| 运行方式 | OpenCode 直接 `import()` 加载 | 独立子进程，stdio 通信 |
| 获取 URL | `input.serverUrl` 直接注入 | **必须自己发现** |
| 权限 | 完整 Plugin SDK | 只有 MCP 工具调用接口 |

### 我们当前实现的问题

`OpenCodeHttpClient.discoverUrl()` 的探测顺序有两个缺陷：

**问题 1：OPENCODE_PID 环境变量不可靠**

OpenCode 不会自动把 `OPENCODE_PID` 注入 MCP 子进程的环境变量。用户需要手动配置，实际上几乎不会这么做。

**问题 2：端口探测范围太窄，且顺序固定**

```typescript
// 当前实现
const candidatePorts = [4096, 4097, 4098, 4099, 4100];
```

OpenCode 从 4096 开始找可用端口，如果 4096-4098 被其他程序占用，实际端口可能是 4099 或 4100。端口探测顺序固定，若实际端口在末尾，每次都要等前面端口超时（每个 2s × 4 = 8s 启动延迟）。

**问题 3：健康检查 `/global/health` 响应结构假设错误**

```typescript
// 当前实现
const body = (await res.json()) as { healthy?: boolean };
return body.healthy === true;
```

实测中 `/global/health` 返回 HTTP 200 但 body 不总是包含 `{ healthy: true }`，导致健康检查误判失败，正确端口被跳过。这就是为什么有时候实际服务在 4099，但我们探测时却返回了错误的端口。

### 正确的修复方案

```typescript
static async discoverUrl(): Promise<string> {
  // 优先级 1：显式环境变量（用户手动配置，最可靠）
  const envUrl = process.env["OPENCODE_SERVER_URL"];
  if (envUrl) return envUrl;

  // 优先级 2：并发探测所有候选端口，取第一个响应的
  // 扩大范围到 4096-4110，并发而非串行，消除顺序延迟
  const candidatePorts = Array.from({ length: 15 }, (_, i) => 4096 + i);
  
  const found = await Promise.any(
    candidatePorts.map(async (port) => {
      const url = `http://127.0.0.1:${port}`;
      // 只检查 HTTP 200，不依赖 body 内容
      const res = await fetch(`${url}/global/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) throw new Error("not ok");
      return url;
    })
  ).catch(() => null);

  if (found) return found;

  // 最终 fallback
  return "http://127.0.0.1:4096";
}
```

---

## 三、Agora 集成 OpenCode TUI 的方案设计

### 架构

由于 Agora 是 MCP Server（不是 Plugin），无法直接获得 `serverUrl`，但可以通过上述端口发现拿到 OpenCode HTTP 地址，然后直接调用 `/tui/` API。

### 集成点

**1. 辩论启动时** → 显示 toast 告知用户

```typescript
await fetch(`${opencodeUrl}/tui/show-toast`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    title: "⬡ Agora 辩论已启动",
    message: `${agents.length} 位智能体正在讨论：${question.slice(0, 50)}...`,
    variant: "info",
    duration: 5000,
  }),
});
```

**2. 每轮完成时** → 进度 toast

```typescript
await fetch(`${opencodeUrl}/tui/show-toast`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    title: `⬡ Agora 第 ${round}/3 轮完成`,
    message: posts.map(p => `${p.role} ✓`).join("  "),
    variant: "info",
    duration: 4000,
  }),
});
```

**3. 辩论完成时** → 把共识注入 opencode 对话框，触发 AI 自动呈现结果

```typescript
await fetch(`${opencodeUrl}/tui/publish`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    type: "tui.prompt.append",
    properties: {
      text: `\n\n[Agora 辩论完成] topic: ${topicId}\n结论：${consensus.conclusion}\n置信度：${consensus.confidence}`,
    },
  }),
});
```

### 注意事项

- TUI API 调用应该是 **best-effort**（fire-and-forget），失败不影响辩论本身
- toast 的 `duration` 不要太长（4-6s），避免堆积
- `tui.prompt.append` 会把文字注入当前 session 的输入框，只应在辩论**完全结束**后调用一次
- OpenCode 可能没有运行 TUI（如 `opencode run` 无头模式），这时 `/tui/` API 返回 4xx，正常忽略即可

---

## 四、待实施的修复清单

- [ ] `OpenCodeHttpClient.discoverUrl()` 改为并发探测，去掉 body 内容检查
- [ ] `ConsensusSynthesizer` 加 fallback：JSON 解析失败时从投票数据直接构造共识
- [ ] `AGORA_MODERATOR_MODEL` 默认值改为 `local/Qwen/Qwen3.5-27B-FP8`
- [ ] 移除 `forum.start_debate` 同步工具
- [ ] `server.ts` 异步辩论完成回调中增加 TUI toast 通知
- [ ] `server.ts` 异步辩论完成后调用 `tui.prompt.append` 注入共识摘要
