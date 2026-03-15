# demo_ziqi 修改说明

## 修改内容

1. `Company -> Chats`
   - 支持按多个 agent 过滤聊天浏览范围
   - 支持发送目标选择：`Company` 或具体 agent
   - 支持将最终回复回写到 `Company -> Chats`

2. `Company -> Agent Status`
   - 支持编辑 agent 属性
   - 支持查看 agent logs
   - 修正表格 header 和内容列对齐
   - 压缩每个 agent 行的高度和密度

3. 运行链路与稳定性
   - `openclaw` runner 优先使用当前 repo 自带 CLI 入口
   - `message bus` 支持按参与 agent 过滤历史消息
   - 过滤已知 PowerShell profile 噪声日志
   - 补充对应测试

## 涉及文件

- `README.demo_ziqi.md`
- `src/company/message-bus.ts`
- `src/company/message-bus.test.ts`
- `src/company/process-manager.ts`
- `src/company/process-manager.test.ts`
- `src/company/runners/openclaw-runner.ts`
- `src/company/runners/openclaw-runner.test.ts`
- `src/gateway/server-methods/company.ts`
- `src/gateway/server-methods/company.test.ts`
- `ui/src/styles/company.css`
- `ui/src/ui/app-gateway.ts`
- `ui/src/ui/app-gateway.node.test.ts`
- `ui/src/ui/app-render.ts`
- `ui/src/ui/app-view-state.ts`
- `ui/src/ui/app.ts`
- `ui/src/ui/controllers/company.ts`
- `ui/src/ui/controllers/company.test.ts`
- `ui/src/ui/views/company-agent-logs.ts`
- `ui/src/ui/views/company-fleet.ts`
- `ui/src/ui/views/company-overview.ts`
- `ui/src/ui/views/company-overview.test.ts`
- `vitest.config.ts`
