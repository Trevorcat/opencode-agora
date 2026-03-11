# OpenCode Agora

> 🏛️ Forum-style multi-agent debate MCP server for OpenCode

Agora 是一个为 OpenCode 设计的 Model Context Protocol (MCP) 服务器，支持多智能体论坛式辩论。通过引入不同角色的 AI 代理（ skeptic, proponent, pragmatist 等），Agora 能够对任何主题进行深度辩论，并最终形成共识。

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](./package.json)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

## ✨ Features

- **🤖 多智能体辩论** - 支持 2-8 个智能体参与 3 轮深度辩论
- **🎭 丰富的角色预设** - skeptic, proponent, pragmatist, analyst 等 10+ 角色
- **📋 辩论模板** - 提供 default, quick, code-review, product, ethics 等多种预设
- **⚡ 异步辩论** - 支持后台运行，实时获取进度更新
- **🎨 TUI 可视化** - 基于 OpenTUI 的终端交互界面
- **🎯 共识合成** - 自动合成辩论结果，生成结构化共识
- **🎛️ 人机协作** - 支持暂停、恢复、注入人工指导
- **🌐 多模型支持** - 兼容 OpenCode 配置的所有模型

## 🚀 Quick Start

### 1. 安装

```bash
# Clone the repository
git clone git@github.com:Trevorcat/opencode-agora.git
cd opencode-agora

# Install dependencies
npm install

# Build the project
npm run build
```

### 2. 配置 OpenCode

在 OpenCode 的 `mcp.json` 中添加：

```json
{
  "mcpServers": {
    "agora": {
      "command": "node",
      "args": ["/path/to/opencode-agora/dist/index.js"]
    }
  }
}
```

### 3. 开始辩论

在 OpenCode 中使用 `/debate` 命令：

```
/debate Should we use Rust for our CLI tool?
```

或调用 MCP 工具：

```json
{
  "tool": "forum.start_debate_async",
  "args": {
    "question": "Should we use microservices architecture?",
    "preset": "balanced-4"
  }
}
```

### 4. 监控辩论（可选）

```bash
# 使用 TUI 界面监控
npm run tui <topic-id>

# 或实时查看日志
tail -f .agora/topics/<topic-id>/events.json
```

## 📋 Available Presets

| Preset | Agents | Description |
|--------|--------|-------------|
| `default` | 3 | 平衡小组：skeptic, proponent, pragmatist [推荐] |
| `quick` | 2 | 快速辩论：正反双方 |
| `balanced-4` | 4 | 完整分析：增加 data analyst |
| `code-review` | 4 | 代码评审：security, performance, maintainability, devil's-advocate |
| `product` | 4 | 产品委员会：PM, engineer, ethicist, devil's-advocate |
| `ethics` | 3 | 伦理审查：专注于伦理和社会影响分析 |

## 🎭 Available Roles

| Role | Description | Default Model |
|------|-------------|---------------|
| **skeptic** | 严格怀疑者，挑战假设，寻找逻辑漏洞 | deepseek-v3-2-251201 |
| **proponent** | 积极倡导者，构建最强论据 | gemini-3-flash-preview |
| **pragmatist** | 实用工程师，评估可行性和成本 | qwen3.5-plus |
| **analyst** | 数据驱动分析师，基于事实和案例研究 | gemini-3.1-pro-preview |
| **security-auditor** | 安全审计师，评估安全风险 | claude-opus-4-6 |
| **performance-engineer** | 性能工程师，关注延迟和扩展性 | deepseek-v3-2-251201 |
| **maintainability-advocate** | 可维护性倡导者，关注代码质量 | gemini-3-flash-preview |
| **devils-advocate** | 魔鬼代言人，提出反对意见 | qwen3.5-plus |
| **ethicist** | 伦理分析师，评估公平性和偏见 | claude-opus-4-6 |
| **product-manager** | 产品经理，代表用户需求 | gemini-3-flash-preview |

## 🛠️ MCP Tools

### Core Debate Tools

- `forum.start_debate_async` - 异步启动辩论（立即返回 topicId，后台运行）
- `forum.get_live_status` - 获取实时进度摘要（轮次、各 agent 状态与发言预览）
- `forum.get_round` - 获取指定轮次的所有完整发言
- `forum.get_consensus` - 获取辩论共识结果（辩论完成后可用）
- `forum.get_status` - 获取话题状态和元数据
- `forum.list_topics` - 列出所有辩论话题

### Control Tools

- `forum.pause_debate` - 暂停辩论
- `forum.resume_debate` - 恢复辩论
- `forum.inject_guidance` - 注入人工指导
- `forum.attach_to_topic` - 附加会话以接收进度通知
- `forum.detach_from_topic` - 分离会话

### Blackboard Tools

- `forum.get_blackboard` - 获取共享黑板内容
- `forum.pin_to_blackboard` - 固定共识项到黑板

### Configuration Tools

- `forum.list_presets` - 列出可用辩论预设
- `forum.get_preset` - 获取预设的完整配置
- `forum.save_preset` - 保存自定义预设
- `forum.list_models` - 列出所有可用模型

## 📁 Project Structure

```
opencode-agora/
├── src/
│   ├── agents/          # Agent 管理和 OpenCode HTTP 客户端
│   ├── blackboard/      # 黑板存储和类型定义
│   ├── config/          # 预设和配置加载
│   ├── consensus/       # 共识合成器
│   ├── moderator/       # 辩论控制器和提示构建
│   ├── resilience/      # 重试和超时机制
│   ├── sync/            # 同步屏障
│   ├── tui-opentui/     # TUI 界面
│   ├── utils/           # 工具函数
│   ├── index.ts         # 入口文件
│   └── server.ts        # MCP 服务器定义
├── .agora/              # 数据目录
│   ├── agents.json      # 默认代理配置
│   ├── presets.json     # 辩论预设
│   ├── roles.json       # 角色定义
│   └── topics/          # 辩论话题数据
├── docs/                # 文档
├── tests/               # 测试文件
└── dist/                # 编译输出
```

## 🔧 Configuration

### 环境变量

| Variable | Description | Default |
|----------|-------------|---------|
| `AGORA_DIR` | Agora 数据目录 | `./.agora` |
| `AGORA_MODERATOR_MODEL` | 共识合成使用的模型 | `lilith/claude-opus-4-6` |
| `OPENCODE_PID` | OpenCode 进程 ID（自动发现） | - |

### 自定义预设

创建 `.agora/agents.json`：

```json
[
  {
    "role": "skeptic",
    "model": "lilith/deepseek-v3-2-251201",
    "persona": "自定义怀疑者人格..."
  },
  {
    "role": "proponent",
    "model": "lilith/gemini-3-flash-preview",
    "persona": "自定义支持者人格..."
  }
]
```

## 🧪 Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Run TUI
npm run tui <topic-id>
```

## 📝 Example Usage

### 简单的代码评审辩论

```javascript
// 启动代码评审辩论
const result = await mcpClient.callTool("forum.start_debate_async", {
  question: "Review this authentication implementation",
  context: "```typescript\n// auth code here\n```",
  preset: "code-review"
});

// 监控进度
const status = await mcpClient.callTool("forum.get_live_status", {
  topic_id: result.topicId
});

// 获取结果
const consensus = await mcpClient.callTool("forum.get_consensus", {
  topic_id: result.topicId
});
```

### 注入人工指导

```javascript
await mcpClient.callTool("forum.inject_guidance", {
  topic_id: "topic_20260311_a1b2c3",
  guidance: "请特别关注 GDPR 合规性要求",
  pin_to_blackboard: true
});
```

## 🤝 Contributing

欢迎贡献！请查看 [issues](https://github.com/Trevorcat/opencode-agora/issues) 了解当前的任务和需求。

## 📄 License

MIT License - 详见 [LICENSE](./LICENSE) 文件。

---

Made with ❤️ for the OpenCode community.
