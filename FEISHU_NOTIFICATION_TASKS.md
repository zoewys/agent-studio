# 飞书 Bot 远程审批通知 — 任务书

> 对应 Spec: `FEISHU_NOTIFICATION_SPEC.md`
> 所有任务可直接交给 AI Agent 执行，除非标注 🔶

---

## 任务总览

| # | 任务 | 依赖 | 可并行 | 可 Agent 执行 |
|---|------|------|--------|--------------|
| 1 | 安装依赖 | 无 | — | ✅ |
| 2 | 类型定义 | 1 | — | ✅ |
| 3 | FeishuNotifier 核心模块 | 2 | 可与 4 并行 | ✅ |
| 4 | Preload bridge | 2 | 可与 3 并行 | ✅ |
| 5 | ipc.ts 集成 | 3, 4 | — | ✅ |
| 6 | Settings UI | 4, 5 | — | ✅ |
| 7 | 端到端测试 | 6 | — | 🔶 需人工验证 |

---

### 任务 1：安装依赖

**背景**：飞书 SDK 是整个功能的基础，需要先安装才能进行后续开发。

**具体要求**：
1. 执行 `pnpm add @larksuiteoapi/node-sdk`
2. 确认 `package.json` 中 `dependencies` 新增了该包
3. 确认 `pnpm-lock.yaml` 已更新

**参考文件**：
- `package.json` — 查看现有依赖结构

**验证命令**：
```bash
pnpm ls @larksuiteoapi/node-sdk
```

---

### 任务 2：类型定义

**背景**：所有新增类型和 IPC 通道定义集中在 `src/shared/types.ts`，是后续任务的基础。

**具体要求**：
1. 在 `src/shared/types.ts` 中 `AppSettings` 接口之前新增：
   - `FeishuConfig` 接口：`appId: string`, `appSecret: string`, `chatId?: string`, `userId?: string`, `enabled: boolean`
   - `DEFAULT_FEISHU_CONFIG` 常量：所有字符串字段为空字符串，`enabled` 为 `false`
   - `FeishuConnectionStatus` 类型：`'disconnected' | 'connecting' | 'connected' | 'error'`

2. 扩展 `AppSettings` 接口，新增 `feishu: FeishuConfig` 字段

3. 扩展 `DEFAULT_APP_SETTINGS`，新增 `feishu: DEFAULT_FEISHU_CONFIG`

4. 在 `IPC` 常量对象末尾（`routeRecommend` 之后）新增三个通道：
   - `feishuTest: 'feishu:test'`
   - `feishuStatus: 'feishu:status'`
   - `feishuStatusChanged: 'feishu:status-changed'`

**参考文件**：
- `src/shared/types.ts` — 现有 `AppSettings`（第 430-438 行）、`IPC`（第 443-548 行）的定义模式

**验证命令**：
```bash
pnpm run typecheck
```

**测试用例**：
- `FeishuConfig` 所有字段都有正确的类型
- `DEFAULT_APP_SETTINGS.feishu` 存在且 `enabled` 为 `false`
- `IPC.feishuTest` 等三个通道有正确的字符串值

---

### 任务 3：FeishuNotifier 核心模块

**背景**：这是飞书集成的核心，封装 SDK 的 Client + WSClient，负责连接管理、消息发送和按钮回调处理。

**具体要求**：
1. 新建 `src/main/FeishuNotifier.ts`
2. 导入 `@larksuiteoapi/node-sdk` 和 `@shared/types` 中的相关类型
3. 实现 `FeishuNotifier` 类，包含以下公开方法：

**`configure(config, onStatusChange, onCardAction)`**：
- 参数：`config: FeishuConfig`, `onStatusChange: (status: FeishuConnectionStatus) => void`, `onCardAction: (runId: string, action: 'approve' | 'reject' | 'rerun', stepIndex: number) => void`
- 如果已有 wsClient，先调 `destroy()` 断开
- 如果 `!config.enabled` 或 `!config.appId` 或 `!config.appSecret`，设置状态 `disconnected` 并返回
- 创建 `new lark.Client({ appId, appSecret })`
- 创建 `new lark.WSClient({ appId, appSecret })`
- 注册 `card.action.trigger` 事件处理：解析 `data.action.value` 中的 `{ action, runId, stepIndex }`，调用 `onCardAction`，返回更新后的卡片
- 调用 `wsClient.start()`，更新状态为 `connecting`，连接成功后更新为 `connected`

**`destroy()`**：断开 WSClient，设状态为 `disconnected`

**`getStatus()`**：返回当前 `FeishuConnectionStatus`

**`handleRunUpdate(run: WorkflowRun)`**：
- `run.status === 'awaiting-confirm'` → 调用 `notifyAwaitingConfirm()`
- `run.status === 'completed'` → 调用 `notifyCompleted()`
- `run.status === 'error'` → 调用 `notifyError()`
- 其他状态忽略

**`notifyAwaitingConfirm(run)`**：
- 去重 key: `${run.id}:awaiting:${run.currentStepIndex}:${latestExecution.id}`
- 从 `run.steps[run.currentStepIndex]` 提取步骤信息和 handoff
- 发送橙色审批卡片（`header.template: 'orange'`）：
  - 标题："🔔 Workflow 需要审批"
  - 字段：工作流名称 (`run.templateName` 或 `run.runName`)、步骤名称 (`step.displayName`)
  - 正文：handoff summary（截取前 500 字符）
  - 产物列表：格式化 artifacts
  - 按钮区：批准（`type: 'primary'`）、拒绝（`type: 'danger'`）、重跑（`type: 'default'`）
  - 按钮 value：`{ action: 'approve'|'reject'|'rerun', runId: run.id, stepIndex }`

**`notifyCompleted(run)`**：
- 去重 key: `${run.id}:completed`
- 绿色卡片（`template: 'green'`）：工作流名称、步骤数、耗时、费用

**`notifyError(run)`**：
- 去重 key: `${run.id}:error`
- 从 `run.steps[run.currentStepIndex]` 提取错误步骤和错误消息
- 红色卡片（`template: 'red'`）：工作流名称、出错步骤、错误信息

**`sendTestNotification()`**：
- 发送一张蓝色测试卡片："🧪 Agent Studio 测试通知 — 飞书 Bot 配置成功！"
- 返回 `{ ok: true }` 或 `{ ok: false, error: '...' }`

4. 内部实现要点：
   - `notifiedKeys: Set<string>` 用于去重，每次 insert 时清理超过 1000 条的旧 key
   - `messageIds: Map<string, string>` 记录 `dedupKey → message_id`，用于卡片更新
   - `sendCard()` 内部方法：catch 所有异常，失败只 console.error 不抛出
   - `getReceiveId()` 内部方法：优先 chatId，其次 userId
   - `buildPostActionCard(action)` 内部方法：返回无按钮的卡片，显示"已批准/已拒绝/已重跑"

**参考文件**：
- `src/shared/types.ts` — `WorkflowRun`（第 291-315 行）、`WorkflowRunStep`（第 271-280 行）、`WorkflowStepExecution`（第 251-269 行）、`HandoffArtifact`（第 244-249 行）
- `src/main/Scheduler.ts` — 类的组织模式参考（构造、生命周期、回调）

**验证命令**：
```bash
pnpm run typecheck
```

**测试用例**：
- `configure()` 传入 `enabled: false` 时不创建 client
- `configure()` 传入有效凭据时状态变为 `connecting`
- `handleRunUpdate()` 对 `awaiting-confirm` 状态调用 `notifyAwaitingConfirm`
- `handleRunUpdate()` 对 `running` 状态不发任何通知
- 同一 dedupKey 多次调用只发一次消息
- `getReceiveId()` 在 chatId 和 userId 都为空时抛异常
- `sendCard()` 失败时不抛异常

---

### 任务 4：Preload bridge

**背景**：renderer 需要通过 preload bridge 调用飞书相关的 IPC 通道。

**具体要求**：
1. 修改 `src/preload/index.ts`
2. 在 import 列表中增加 `FeishuConnectionStatus` 类型
3. 在 `api` 对象中（`importData` 之后，`contextBridge.exposeInMainWorld` 之前）新增三个方法：

```typescript
feishuTest: (): Promise<{ ok: boolean; error?: string }> =>
  ipcRenderer.invoke(IPC.feishuTest),

feishuStatus: (): Promise<FeishuConnectionStatus> =>
  ipcRenderer.invoke(IPC.feishuStatus),

onFeishuStatusChanged: (cb: (status: FeishuConnectionStatus) => void): (() => void) => {
  const handler = (_e: Electron.IpcRendererEvent, status: FeishuConnectionStatus) => cb(status)
  ipcRenderer.on(IPC.feishuStatusChanged, handler)
  return () => ipcRenderer.removeListener(IPC.feishuStatusChanged, handler)
}
```

**参考文件**：
- `src/preload/index.ts` — 现有的 `onCliInstallProgress`（第 48-52 行）作为事件订阅模式参考
- `src/preload/index.ts` — 现有的 `appSettingsGet`（第 138-139 行）作为 invoke 模式参考

**验证命令**：
```bash
pnpm run typecheck
```

**测试用例**：
- `window.api.feishuTest` 方法存在且返回 Promise
- `window.api.feishuStatus` 方法存在且返回 Promise
- `window.api.onFeishuStatusChanged` 方法存在且返回 unsubscribe 函数

---

### 任务 5：ipc.ts 集成

**背景**：将 FeishuNotifier 接入 Electron 主进程的 IPC 调度中心，连接工作流状态变化和飞书通知。

**具体要求**：
1. 修改 `src/main/ipc.ts`
2. 新增 import：`import { FeishuNotifier } from './FeishuNotifier'`
3. 在 `registerIpc()` 函数内：

**A. 实例化**（在 `workflowManager` 创建之后、`scheduler` 创建之前）：
```typescript
const feishuNotifier = new FeishuNotifier()
```

**B. 包装 `emitWorkflow`**（修改第 134-139 行）：
在现有的 `webContents.send()` 之后增加飞书旁路调用：
```typescript
if (envelope.event.kind === 'run-updated') {
  feishuNotifier.handleRunUpdate(envelope.event.run)
}
```

**C. 定义 `initFeishu` 函数**（在 `scheduler.start()` 之后）：
- 从 `appSettingsStore.get()` 读取配置
- 调用 `feishuNotifier.configure()` 传入：
  - `onStatusChange`: 通过 `webContents.send(IPC.feishuStatusChanged, status)` 推送到 renderer
  - `onCardAction`: 根据 action 类型调用 `workflowManager.confirmStep()` / `abort()` / `rerunStep()`，用 try-catch 包裹
- 立即调用 `initFeishu()`

**D. 修改 `appSettingsSave` handler**（约第 398 行）：
在 `appSettingsStore.save(settings)` 之后调用 `initFeishu()` 重新配置飞书

**E. 注册新 IPC handlers**：
```typescript
ipcMain.handle(IPC.feishuTest, () => feishuNotifier.sendTestNotification())
ipcMain.handle(IPC.feishuStatus, () => feishuNotifier.getStatus())
```

**F. 扩展返回的 `abortAll()`**：
在 `runManager.abortAll()` 和 `workflowManager.abortAll()` 之后增加 `feishuNotifier.destroy()`

**参考文件**：
- `src/main/ipc.ts` — `emitWorkflow`（第 134-139 行）、`scheduler` 实例化（第 150-161 行）、`appSettingsSave` handler（约第 398 行）
- `src/main/ipc.ts` — `AppNotificationHooks`（第 50-53 行）作为通知钩子模式参考

**验证命令**：
```bash
pnpm run typecheck
```

**测试用例**：
- `emitWorkflow` 被调用时，renderer 收到 `workflowEvent` 且 `feishuNotifier.handleRunUpdate` 被调用
- settings 保存时 `initFeishu()` 被重新调用
- card action `approve` 调用 `workflowManager.confirmStep()`
- card action `reject` 调用 `workflowManager.abort()`
- card action `rerun` 调用 `workflowManager.rerunStep()`
- card action 异常时不影响主流程

---

### 任务 6：Settings UI 飞书配置面板

**背景**：用户需要在 Settings 页面配置飞书 App 凭据和通知目标。

**具体要求**：
1. 修改 `src/renderer/src/SettingsPanel.tsx`
2. 在 import 中增加：
   - `MessageSquare` icon（来自 `lucide-react`）
   - `FeishuConnectionStatus`, `DEFAULT_FEISHU_CONFIG` 从 `@shared/types`

3. 新增 state：
   - `feishuDraft` — `useState(settings.feishu)` 本地表单 state
   - `feishuStatus` — `useState<FeishuConnectionStatus>('disconnected')`
   - `feishuTesting` — `useState(false)` 测试按钮 loading
   - `feishuSaving` — `useState(false)` 保存按钮 loading
   - `feishuTestResult` — `useState<{ok: boolean; error?: string} | null>(null)` 测试结果

4. 新增 `useEffect`：
   - 订阅 `window.api.onFeishuStatusChanged` 更新 `feishuStatus`
   - 初始化时调用 `window.api.feishuStatus()` 获取当前状态
   - `settings.feishu` 变化时同步 `feishuDraft`

5. 在"后台运行"section 之后、`showExport` dialog 之前，新增飞书 section：

```tsx
<hr className="settings-divider" />
<section className="settings-section">
  {/* header: 标题 + 说明 + 状态 badge */}
  <div className="settings-section-head">
    <div>
      <h3 className="settings-section-title">飞书机器人</h3>
      <p className="settings-section-desc">
        配置飞书自建应用后，workflow 审批、完成、出错会推送到飞书。
      </p>
    </div>
    {/* 状态 badge：根据 feishuStatus 显示不同颜色和文字 */}
  </div>

  {/* toggle: 启用飞书通知 */}
  {/* 使用 save-on-click 模式，同 showMemoryReferences toggle */}

  {/* 配置表单（仅 feishu.enabled 时展示） */}
  {settings.feishu.enabled && (
    <div className="feishu-config-fields">
      {/* input: App ID */}
      {/* input: App Secret (type=password) */}
      {/* input: Chat ID (placeholder, 说明文字) */}
      {/* input: User ID (placeholder, 标注可选) */}
      {/* button group: 保存配置 + 发送测试通知 */}
      {/* 测试结果提示 */}
    </div>
  )}
</section>
```

6. 处理函数：
   - `handleSaveFeishu`: 调用 `onSave({ ...settings, feishu: feishuDraft })`
   - `handleTestFeishu`: 调用 `window.api.feishuTest()` 并展示结果

7. CSS 类名遵循项目惯例：`settings-*` 前缀，`feishu-config-fields`、`feishu-status-badge`

**参考文件**：
- `src/renderer/src/SettingsPanel.tsx` — 现有 toggle 模式（第 177-190 行）、section 结构
- `src/renderer/src/ReflectionSettingsPanel.tsx` — draft state + save 按钮模式参考

**验证命令**：
```bash
pnpm run typecheck
pnpm run dev
# 在浏览器中打开 Settings 页，检查飞书配置区域
```

**测试用例**：
- 飞书 section 在 Settings 页面可见
- 启用 toggle 点击后立即保存
- 启用后展开配置表单
- 配置表单输入不会触发即时保存
- "保存配置"按钮保存所有字段到 settings
- "发送测试通知"按钮调用 feishuTest IPC
- 连接状态 badge 实时更新

---

### 任务 7：端到端测试 🔶

**背景**：验证从飞书配置到审批操作的完整链路。

**前置条件**：
- 在飞书开放平台创建自建应用，获取 App ID 和 App Secret
- 在应用权限中开启：`im:message`（消息读写）、`im:message:send_as_bot`（以 Bot 身份发送消息）
- 在事件订阅中开启：`im.message.receive_v1`、消息卡片回调
- 将 Bot 添加到一个测试群聊，获取 Chat ID

**具体测试步骤**：

1. **配置验证**：
   - 启动 `pnpm run dev`
   - 打开 Settings → 飞书机器人
   - 开启 toggle → 填写 App ID / App Secret / Chat ID
   - 点"保存配置" → 连接状态变为"已连接"
   - 点"发送测试通知" → 飞书群收到测试卡片

2. **审批流程**：
   - 创建一个包含 2 步的工作流模板（非 autoConfirm）
   - 启动工作流
   - 第 1 步完成后 → 飞书群收到橙色审批卡片，包含摘要和按钮
   - 在飞书点"批准" → 桌面端工作流自动推进到第 2 步
   - 飞书卡片按钮替换为"已批准"文本

3. **拒绝和重跑**：
   - 重新启动工作流
   - 在审批卡片上点"拒绝" → 工作流被 abort
   - 再次启动，点"重跑" → 当前步骤重新运行

4. **完成和出错通知**：
   - 运行到最后一步并批准 → 飞书收到绿色完成卡片
   - 故意让工作流出错（如配置无效 agent） → 飞书收到红色出错卡片

5. **定时任务通知**：
   - 创建定时任务，设置 1 分钟后触发
   - 定时任务完成 → 飞书收到完成通知
   - 配置会出错的定时任务 → 飞书收到出错通知

6. **异常场景**：
   - 在飞书审批时，桌面端已手动审批 → 飞书返回"操作失败"提示
   - 断开网络 → 状态变为"连接中"
   - 恢复网络 → 自动重连，状态恢复

**验证命令**：
```bash
pnpm run typecheck && pnpm run dev
```

---

## 执行顺序图

```
任务 1: 安装依赖
  ↓
任务 2: 类型定义
  ↓
  ├──→ 任务 3: FeishuNotifier 核心模块 ─┐
  └──→ 任务 4: Preload bridge ──────────┤  （可并行）
                                         ↓
                                   任务 5: ipc.ts 集成
                                         ↓
                                   任务 6: Settings UI
                                         ↓
                                   任务 7: 端到端测试 🔶
```

**最大并行度**：任务 3 和任务 4 可同时执行。
