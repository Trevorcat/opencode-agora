# OpenCode Agora 手动测试指南

## ✅ 前置条件
- OpenCode 已配置 MCP（刚刚修复完成）
- MCP Server 路径正确: `E:/projects/opencode-agora/dist/index.js`

## 🎯 测试步骤

### 1. 验证 MCP 加载
启动 OpenCode，观察是否成功加载 agora MCP：
```bash
opencode
```
预期：没有错误，正常进入对话界面

### 2. 启动辩论（同步模式）
在 OpenCode 中输入：
```
启动一个辩论："我们应该采用微服务架构吗？"
```

**预期行为：**
- OpenCode 调用 `forum.start_debate`
- 等待 1-3 分钟（3 轮辩论 + 共识综合）
- 返回类似：
```json
{
  "topicId": "topic_20260309_abc123",
  "status": "completed",
  "consensus": {
    "conclusion": "建议采用微服务架构，但需要渐进式迁移...",
    "confidence": 0.85
  }
}
```

### 3. 启动辩论（异步模式 + TUI 监控）

**步骤 A：在 OpenCode 中启动异步辩论**
```
用 forum.start_debate_async 启动辩论："AI 会取代程序员吗？"
```

**预期返回：**
```json
{
  "topicId": "topic_20260309_xyz789",
  "status": "started"
}
```

**步骤 B：启动 TUI 监控**
打开新的终端窗口：
```bash
cd E:\projects\opencode-agora
npm run tui -- topic_20260309_xyz789
```

**预期看到：**
- TUI 界面显示 debate 进度
- Agent 状态实时更新（waiting → thinking → posted）
- 轮次进展（Round 1/3 → Round 2/3 → Round 3/3）

### 4. 测试干预功能

**在 TUI 中测试暂停/恢复：**
- 按 `p` 键 → 辩论暂停，状态变为 ⏸ PAUSED
- 按 `r` 键 → 辩论恢复，状态变为 ● LIVE

**在 TUI 中测试指导注入：**
- 按 `g` 键 → 底部出现输入框
- 输入：`请重点考虑成本效益`
- 按 Enter → 指导被注入
- 观察下轮 Agent 发言中是否提到成本

### 5. 测试所有 Tools

在 OpenCode 中逐个测试：

```
# 获取实时状态
调用 forum.get_live_status，topic_id 是 topic_20260309_xyz789

# 查看黑板内容
调用 forum.get_blackboard，topic_id 是 topic_20260309_xyz789

# 暂停辩论
调用 forum.pause_debate，topic_id 是 topic_20260309_xyz789

# 恢复辩论
调用 forum.resume_debate，topic_id 是 topic_20260309_xyz789

# 注入指导
调用 forum.inject_guidance，topic_id 是 topic_20260309_xyz789，guidance 是 "请考虑安全性"

# 固定到黑板
调用 forum.pin_to_blackboard，topic_id 是 topic_20260309_xyz789，content 是 "已达成共识：采用微服务"，type 是 "consensus"

# 列出所有 debates
调用 forum.list_topics

# 获取某个 topic 状态
调用 forum.get_status，topic_id 是 topic_20260309_xyz789

# 获取某轮帖子
调用 forum.get_round，topic_id 是 topic_20260309_xyz789，round 是 1

# 获取共识
调用 forum.get_consensus，topic_id 是 topic_20260309_xyz789
```

### 6. 验证数据持久化

检查文件系统：
```bash
ls .agora/topics/topic_20260309_xyz789/
# 预期看到：
# - topic.json
# - round-1/round-2/round-3/
# - blackboard/
# - guidance/
# - consensus.json
```

## 🔍 预期结果检查清单

- [ ] MCP Server 正常加载，无错误
- [ ] `start_debate` 返回 completed 状态和共识
- [ ] `start_debate_async` 立即返回 started 状态
- [ ] TUI 实时显示辩论进度
- [ ] Agent 状态正确变化（waiting → thinking → posted）
- [ ] 暂停/恢复功能正常工作
- [ ] 指导注入后 Agent 在后续轮次引用指导
- [ ] 黑板正确显示固定内容
- [ ] 所有 12 个 tools 都能正常调用
- [ ] 数据正确持久化到文件系统

## 🐛 常见问题

**问题 1: MCP 工具未显示**
解决：重启 OpenCode，或检查 `~/.config/opencode/opencode.json` 中的 `mcp` 配置

**问题 2: TUI 启动失败**
解决：确保已构建 `npm run build`，且 `dist/index.js` 存在

**问题 3: 辩论卡住**
解决：检查 `.agora/topics/<topicId>/pause-state.json` 是否意外设置为 paused

**问题 4: API Key 错误**
解决：确保环境变量 `LILITH_API_KEY` 或 `CODEX_API_KEY` 已设置

## ✅ 测试完成标准

所有检查项通过，即表示 Agora MCP 完全正常工作！
