# demo_ziqi handoff

## 1. 基线与来源

- 最新同步基线：`origin/backend_demo` @ `43d9d2ee1`
- 本地快照来源：`demo_ziqi_snapshot_20260315` @ `8f629c780c7aadb6a3af3a883ab385c5b334f614`
- 迁移分支：`demo_ziqi_sync_backend_demo`

这次迁移不是在旧工作区上直接覆盖，而是：

1. 先把 `demo_ziqi` 上的本地改动冻结成快照提交。
2. `git fetch origin` 获取最新 `origin/backend_demo`。
3. 从最新 `origin/backend_demo` 新开 `demo_ziqi_sync_backend_demo`。
4. 将快照功能迁移到最新基线，并处理同文件分叉。

## 2. 本次保留的功能

- `Company -> Chats`
  - 支持按多个 agent 过滤消息浏览范围
  - 支持选择发送目标：`Company` 或具体 agent
  - direct target 发送后，最终回复会回写到 `Company -> Chats`
- `Company -> Agent Status`
  - 支持编辑 agent 属性
  - 支持打开 agent logs 面板
  - 表格 header / 内容列对齐修正，行高压缩
- `ClawDock` 运行链路
  - `openclaw` runner 优先使用当前 repo 自带 CLI 入口
  - 过滤已知 PowerShell profile 噪声日志

## 3. 迁移时的主要冲突与处理

- `src/gateway/server-methods/company.ts`
  - 最新 `backend_demo` 已加入 orchestration task 生命周期和 `maxOrchestrationRounds`
  - 迁移时保留了最新 task / profile 流程，并叠加了我们自己的 target selector、final reply 回写、message filter 相关逻辑
- `src/company/runners/openclaw-runner.ts`
  - 最新 `backend_demo` 仍是直接调用 PATH 上的 `openclaw`
  - 迁移后保留了我们这边的 bundled CLI 入口优先策略，并保留默认 agent fallback 能力
- `ui/src/styles/company.css`
  - 最新基线引入了新的 Monitor / Company UI 样式
  - 迁移时保留了我们对 Chats compose 区和 Agent Status 表格对齐/密度的修正，并避免旧 fleet grid 样式覆盖当前表格

## 4. 验证结果

已执行：

```powershell
pnpm.cmd install
pnpm.cmd test -- src/company/message-bus.test.ts src/company/process-manager.test.ts src/company/runners/openclaw-runner.test.ts src/gateway/server-methods/company.test.ts ui/src/ui/controllers/company.test.ts ui/src/ui/app-gateway.node.test.ts ui/src/ui/views/company-overview.test.ts
node scripts/tsdown-build.mjs
node scripts/ui.js build
```

结果：

- targeted tests：通过
- `tsdown` 构建：通过
- UI build：通过

说明：

- 在最新 `backend_demo` 上，UI 构建前额外执行了一次 `pnpm.cmd install`
- 原因是最新基线新增了 `@tailwindcss/vite` 和 `@vitejs/plugin-react` 依赖，本地旧 `node_modules` 不完整

## 5. 已知风险 / 未顺手处理项

- `company.message.send` 在 leaf-agent 直发路径上仍然会等待任务完成后再返回，长任务时可能让发送态持续较久
- leaf-agent 失败路径里仍然可能把真实的 `crashed` 状态重新广播成 `idle`
- 本次以“迁移并保留现有功能”为目标，没有顺手扩大范围修这两个残留问题

## 6. 给 owner 的建议使用方式

- 代码对比范围：

```powershell
git diff origin/backend_demo..demo_ziqi_sync_backend_demo
```

- patch 导出范围：

```powershell
git format-patch origin/backend_demo..demo_ziqi_sync_backend_demo
```

- 阅读顺序建议：
  1. 先看本文件
  2. 再看 `Company -> Chats` 相关 diff
  3. 再看 `Agent Status` / `openclaw runner` 相关 diff
