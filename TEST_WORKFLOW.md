# OpenCode Agora 完整测试流程

## 步骤 1：启动异步 Debate

在 OpenCode 中输入：

```
用 forum.start_debate_async 启动辩论："我们应该禁止 AI 生成代码吗？"
```

## 步骤 2：记录返回的 topicId

预期返回：
```json
{
  "topicId": "topic_20260309_xxxxxx",
  "status": "started"
}
```

**复制这个 topicId**

## 步骤 3：启动实时监控

在终端运行（替换 xxxxx 为实际的 ID）：

```bash
cd E:\projects\opencode-agora
node watch-debate.mjs topic_20260309_xxxxxx
```

## 步骤 4：在 OpenCode 中测试干预

在另一个终端或 OpenCode 中，测试这些功能：

```
# 测试暂停
调用 forum.pause_debate，topic_id 是 topic_20260309_xxxxxx

# 观察 watch-debate 中状态变为 ⏸ PAUSED

# 测试恢复  
调用 forum.resume_debate，topic_id 是 topic_20260309_xxxxxx

# 观察状态变回 ● LIVE

# 测试注入指导
调用 forum.inject_guidance，topic_id 是 topic_20260309_xxxxxx，guidance 是 "请重点考虑安全性问题"

# 观察指导出现在下一轮中

# 测试固定到黑板
调用 forum.pin_to_blackboard，topic_id 是 topic_20260309_xxxxxx，content 是 "共识：需要建立 AI 代码审查机制"，type 是 "consensus"
```

## 步骤 5：验证数据持久化

```bash
# 查看生成的文件
ls .agora/topics/topic_20260309_xxxxxx/

# 应该看到：
# - meta.json
# - round-1/, round-2/, round-3/
# - blackboard/
# - guidance/
```

## 预期结果

✅ watch-debate 显示实时更新的辩论过程
✅ 能看到 Agent 状态变化：waiting → thinking → posted
✅ 能看到帖子逐条出现
✅ 暂停/恢复功能正常
✅ 指导注入后 Agent 在后续轮次引用
✅ 黑板显示固定的共识内容
✅ debate 完成后状态变为 completed

## 问题排查

**如果 watch-debate 不刷新：**
- 检查 topicId 是否正确
- 检查 debate 是否真的在运行（可能已 failed）

**如果状态显示不正确：**
- 检查 .agora/topics/<id>/meta.json 中的 status 字段

**如果 intervention 无效：**
- 确保 debate 是 running 状态（不是 paused 或 completed）
