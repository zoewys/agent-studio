# 飞书 Bot 远程审批通知 — 技术规格说明书

## 1. 背景与动机

Agent Studio 的工作流在步骤完成后进入 `awaiting-confirm` 状态，需要用户在桌面 UI 上手动点"确认"才能继续。这导致：

- 用户离开电脑后工作流会卡住，无法推进
- 定时任务完成或出错时，用户只能通过系统通知获知，无法远程操作
- 缺少在移动端（手机/平板）审批的能力

**目标**：集成飞书自建应用 Bot，实现工作流关键状态（待审批、完成、出错）自动推送飞书消息卡片，用户可直接在飞书内通过按钮完成审批操作。

## 2. 设计原则

1. **零公网依赖** — 使用飞书 SDK 的 WebSocket 长连接模式（`WSClient`），Electron 主进程主动外连，不需要公网 IP 或内网穿透
2. **非侵入式集成** — 不改动 `WorkflowManager` 核心逻辑，通过包装 `emitWorkflow` 回调实现旁路通知
3. **优雅降级** — 飞书未配置或连接断开时，所有工作流功能不受影响
4. **复用现有模式** — 设置存储复用 `AppSettings` + `AppSettingsStore`，通知钩子复用 `AppNotificationHooks` 模式

## 3. 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│  Electron Main Process                                          │
│                                                                 │
│  WorkflowManager                                                │
│       │ persistAndEmit(run)                                     │
│       ▼                                                         │
│  emitWorkflow(envelope)  ← ipc.ts 包装后的回调                  │
│       ├── webContents.send()  → Renderer UI（已有）             │
│       └── FeishuNotifier.handleRunUpdate(run)  （新增旁路）      │
│                │                                                │
│                ├── awaiting-confirm → 发审批卡片（带按钮）       │
│                ├── completed        → 发完成通知                │
│                └── error            → 发出错通知                │
│                                                                 │
│  FeishuNotifier                                                 │
│       │  WSClient (WebSocket 长连接)                             │
│       │      ↕ 飞书服务器                                       │
│       │                                                         │
│       └── card.action.trigger 回调                              │
│              │ 解析 { action, runId, stepIndex }                │
│              ├── approve → workflowManager.confirmStep()        │
│              ├── reject  → workflowManager.abort()              │
│              └── rerun   → workflowManager.rerunStep()          │
└─────────────────────────────────────────────────────────────────┘
```

## 4. 依赖项

| 依赖 | 版本 | 用途 |
|------|------|------|
| `@larksuiteoapi/node-sdk` | ^1.66.1 | 飞书开放平台 Node.js SDK（Client + WSClient + EventDispatcher） |

- SDK 在 Electron 主进程中以 Node.js 模块运行
- `electron.vite.config.ts` 中 `externalizeDepsPlugin()` 已自动外部化所有 node_modules，无需额外配置
- 项目已有 `ws` (^8.21.0) 依赖，SDK 的 WebSocket 内部也使用 `ws`，版本兼容

## 5. 类型变更

### 5.1 新增类型（`src/shared/types.ts`）

```typescript
// ── Feishu Bot ──────────────────────────────────────────────────────────────

export interface FeishuConfig {
  /** 飞书开放平台 App ID */
  appId: string
  /** 飞书开放平台 App Secret */
  appSecret: string
  /** 目标群聊 ID（与 userId 二选一） */
  chatId?: string
  /** 目标用户 open_id，填写后使用私聊 */
  userId?: string
  /** 是否启用飞书通知 */
  enabled: boolean
}

export const DEFAULT_FEISHU_CONFIG: FeishuConfig = {
  appId: '',
  appSecret: '',
  chatId: '',
  userId: '',
  enabled: false
}

export type FeishuConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
```

### 5.2 扩展 `AppSettings`

```typescript
export interface AppSettings {
  showMemoryReferences: boolean
  minimizeToTray: boolean
  feishu: FeishuConfig  // 新增
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  showMemoryReferences: false,
  minimizeToTray: true,
  feishu: DEFAULT_FEISHU_CONFIG  // 新增
}
```

`AppSettingsStore.get()` 使用 `{ ...DEFAULT_APP_SETTINGS, ...parsed }` 合并，新字段自动获得默认值，无需数据迁移。

### 5.3 新增 IPC 通道

```typescript
export const IPC = {
  // ... 现有通道 ...
  /** renderer → main: 发送测试通知 */
  feishuTest: 'feishu:test',
  /** renderer → main: 获取当前连接状态 */
  feishuStatus: 'feishu:status',
  /** main → renderer: 连接状态变化推送 */
  feishuStatusChanged: 'feishu:status-changed'
} as const
```

## 6. 各模块详细设计

### 6.1 `FeishuNotifier` 类（新建 `src/main/FeishuNotifier.ts`）

```typescript
import * as lark from '@larksuiteoapi/node-sdk'

type CardAction = 'approve' | 'reject' | 'rerun'
type StatusChangeCallback = (status: FeishuConnectionStatus) => void
type CardActionCallback = (runId: string, action: CardAction, stepIndex: number) => void

export class FeishuNotifier {
  private client: lark.Client | null = null
  private wsClient: lark.WSClient | null = null
  private status: FeishuConnectionStatus = 'disconnected'
  private config: FeishuConfig | null = null
  private onStatusChange: StatusChangeCallback | null = null
  private onCardAction: CardActionCallback | null = null
  // 去重：防止 persistAndEmit 多次触发重复推送
  private notifiedKeys = new Set<string>()
  // 记录 message_id，用于按钮点击后更新卡片
  private messageIds = new Map<string, string>()
}
```

#### `configure(config, onStatusChange, onCardAction)`

1. 如果已有 `wsClient`，先调 `destroy()` 断开
2. 如果 `config.enabled === false` 或凭据为空，设置状态为 `disconnected` 并返回
3. 创建 `lark.Client({ appId, appSecret })`
4. 创建 `lark.WSClient({ appId, appSecret })`
5. 注册 `card.action.trigger` 事件处理器
6. 调用 `wsClient.start()` 建立连接
7. 设置状态为 `connecting`，连接成功后更新为 `connected`

#### `card.action.trigger` 事件处理

```typescript
'card.action.trigger': async (data) => {
  const { action, runId, stepIndex } = data.action.value as {
    action: CardAction
    runId: string
    stepIndex: number
  }
  this.onCardAction?.(runId, action, stepIndex)
  // 返回更新后的卡片（按钮替换为结果文本）
  return this.buildPostActionCard(action)
}
```

#### `notifyAwaitingConfirm(run, stepIndex, execution)`

去重 key: `${run.id}:awaiting:${stepIndex}:${execution.id}`

发送审批卡片，包含：
- 橙色头部："🔔 Workflow 需要审批"
- 字段区：工作流名称、步骤名称
- 正文：handoff summary（截取前 500 字符）
- 产物列表：`execution.handoff.artifacts` 格式化
- 按钮区：批准（primary）、拒绝（danger）、重跑（default）

按钮 `value` 结构：
```json
{ "action": "approve", "runId": "uuid", "stepIndex": 0 }
```

#### `notifyCompleted(run)` / `notifyError(run, errorMessage)`

去重 key: `${run.id}:completed` / `${run.id}:error`

发送纯通知卡片（无按钮），展示工作流名称、步骤数、耗时、费用或错误信息。

#### `sendCard(content)` — 内部方法

```typescript
private async sendCard(content: object, dedupKey: string): Promise<void> {
  if (!this.client || !this.config) return
  if (this.notifiedKeys.has(dedupKey)) return
  this.notifiedKeys.add(dedupKey)
  // 清理超过 24 小时的 key（简单定期清理）
  try {
    const { receive_id_type, receive_id } = this.getReceiveId()
    const res = await this.client.im.message.create({
      params: { receive_id_type },
      data: {
        receive_id,
        content: JSON.stringify(content),
        msg_type: 'interactive'
      }
    })
    if (res?.data?.message_id) {
      this.messageIds.set(dedupKey, res.data.message_id)
    }
  } catch (err) {
    // 发送失败不影响工作流，仅记录日志
    console.error('[FeishuNotifier] send failed:', err)
  }
}
```

#### `getReceiveId()` — 内部方法

优先使用 `chatId`（群聊），其次 `userId`（私聊）：

```typescript
private getReceiveId(): { receive_id_type: string; receive_id: string } {
  if (this.config?.chatId) return { receive_id_type: 'chat_id', receive_id: this.config.chatId }
  if (this.config?.userId) return { receive_id_type: 'open_id', receive_id: this.config.userId }
  throw new Error('No chatId or userId configured')
}
```

### 6.2 集成层（修改 `src/main/ipc.ts`）

在 `registerIpc()` 函数中：

**Step A：实例化 FeishuNotifier**（在 `workflowManager` 创建之后）

```typescript
const feishuNotifier = new FeishuNotifier()
```

**Step B：包装 `emitWorkflow` 回调**

将现有的：
```typescript
const emitWorkflow = (envelope: WorkflowEventEnvelope): void => {
  const win = getWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC.workflowEvent, envelope)
  }
}
```

改为：
```typescript
const emitWorkflow = (envelope: WorkflowEventEnvelope): void => {
  const win = getWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC.workflowEvent, envelope)
  }
  // 飞书通知旁路
  if (envelope.event.kind === 'run-updated') {
    feishuNotifier.handleRunUpdate(envelope.event.run)
  }
}
```

`handleRunUpdate` 是 `FeishuNotifier` 的公开方法，内部根据 `run.status` 分发到对应的 `notify*` 方法。

**Step C：初始化飞书连接**（在 `scheduler.start()` 之后）

```typescript
const initFeishu = (): void => {
  const settings = appSettingsStore.get()
  feishuNotifier.configure(
    settings.feishu,
    (status) => {
      const win = getWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.feishuStatusChanged, status)
      }
    },
    (runId, action, stepIndex) => {
      try {
        if (action === 'approve') workflowManager.confirmStep(runId, stepIndex)
        else if (action === 'reject') workflowManager.abort(runId)
        else if (action === 'rerun') workflowManager.rerunStep(runId, stepIndex)
      } catch (err) {
        console.error('[Feishu] card action failed:', err)
      }
    }
  )
}
initFeishu()
```

**Step D：设置保存时重新配置**

在 `appSettingsSave` handler 中增加重新初始化：

```typescript
ipcMain.handle(IPC.appSettingsSave, (_e, settings: AppSettings): void => {
  appSettingsStore.save(settings)
  // 重新配置飞书连接
  initFeishu()
})
```

**Step E：注册新 IPC handlers**

```typescript
ipcMain.handle(IPC.feishuTest, () => feishuNotifier.sendTestNotification())
ipcMain.handle(IPC.feishuStatus, () => feishuNotifier.getStatus())
```

**Step F：扩展 `abortAll()`**

```typescript
return {
  abortAll() {
    runManager.abortAll()
    workflowManager.abortAll()
    feishuNotifier.destroy()  // 新增
  }
}
```

### 6.3 Preload Bridge（修改 `src/preload/index.ts`）

在 `api` 对象中新增：

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

import 列表中增加 `FeishuConnectionStatus` 类型。

### 6.4 Settings UI（修改 `src/renderer/src/SettingsPanel.tsx`）

在"后台运行"section 之后，新增飞书机器人配置区域：

**状态管理**：
- `feishuDraft` — 本地表单 state（`useState<FeishuConfig>`），从 `settings.feishu` 初始化
- `feishuStatus` — 连接状态（`useState<FeishuConnectionStatus>`），通过 `onFeishuStatusChanged` 订阅
- `feishuTesting` — 测试通知发送中状态

**UI 结构**：

```
飞书机器人 section
├── section header: 标题 + 说明文字 + 连接状态 badge
├── toggle: 启用飞书通知（save-on-click，同 showMemoryReferences 模式）
└── 配置表单（仅 enabled 时展示）
    ├── input: App ID
    ├── input: App Secret (type=password)
    ├── input: Chat ID (placeholder: oc_xxxxxxx)
    ├── input: User ID (placeholder: ou_xxxxxxx, 标注"可选")
    └── button group: [保存配置] [发送测试通知]
```

**交互逻辑**：
- 启用开关使用 save-on-click 模式（同已有 toggle 的模式）
- App ID / App Secret / Chat ID / User ID 使用 draft state，点"保存配置"才调用 `onSave()`
- "发送测试通知"调用 `window.api.feishuTest()`，展示成功/失败 toast
- 连接状态 badge 实时更新：绿色"已连接" / 黄色"连接中" / 红色"连接失败" / 灰色"未连接"

## 7. 文件清单

### 新增

| 文件 | 说明 |
|------|------|
| `src/main/FeishuNotifier.ts` | 飞书通知核心模块 |

### 修改

| 文件 | 改动内容 |
|------|---------|
| `src/shared/types.ts` | 新增 `FeishuConfig`、`FeishuConnectionStatus`、扩展 `AppSettings`、新增 3 个 IPC 通道 |
| `src/main/ipc.ts` | 实例化 FeishuNotifier、包装 emitWorkflow、注册 IPC handlers、设置保存时重配置、扩展 abortAll |
| `src/preload/index.ts` | 新增 `feishuTest`、`feishuStatus`、`onFeishuStatusChanged` bridge 方法 |
| `src/renderer/src/SettingsPanel.tsx` | 新增飞书配置 section（toggle + form + test button + status badge） |
| `package.json` | 新增 `@larksuiteoapi/node-sdk` 依赖 |

## 8. 实施阶段

| 阶段 | 任务 | 预估时间 |
|------|------|---------|
| 1 | 安装依赖 + 类型定义 | 0.5 天 |
| 2 | FeishuNotifier 核心模块 | 1 天 |
| 3 | ipc.ts 集成 + preload bridge | 0.5 天 |
| 4 | Settings UI 飞书配置面板 | 0.5 天 |
| 5 | 端到端测试 + 调试 | 0.5 天 |
| **合计** | | **3 天** |

## 9. 测试策略

### 单元测试
- `FeishuNotifier` 去重逻辑：多次调用 `notifyAwaitingConfirm` 同一 key 只发一次
- `getReceiveId()` 优先级：chatId > userId
- `handleRunUpdate()` 状态分发：不同 `run.status` 调用正确的 `notify*` 方法

### 集成测试
- `appSettingsSave` 后 FeishuNotifier 重新初始化（mock SDK 验证 `configure` 被调用）
- card action callback 路由到 WorkflowManager 正确的方法

### 手动测试
1. Settings 页配置飞书凭据 → 连接状态 badge 变为"已连接"
2. 点击"发送测试通知" → 飞书收到测试卡片
3. 启动非 autoConfirm 工作流 → 步骤完成后飞书收到审批卡片
4. 在飞书点"批准" → 桌面端工作流推进到下一步
5. 在飞书点"拒绝" → 工作流被 abort
6. 在飞书点"重跑" → 当前步骤重新运行
7. 工作流出错 → 飞书收到红色出错卡片
8. 工作流完成 → 飞书收到绿色完成卡片
9. 定时任务完成/出错 → 飞书收到对应通知
10. 断开网络 → 状态变为"连接中"（自动重连），恢复后变回"已连接"

## 10. 风险缓解

| 风险 | 缓解措施 |
|------|---------|
| 飞书 SDK 与 Electron 不兼容 | SDK 纯 Node.js 实现，`externalizeDepsPlugin()` 已外部化；若有问题可降级为直接调用 REST API + 原生 `ws` |
| WebSocket 连接不稳定 | SDK 内置自动重连（指数退避）；UI 展示连接状态让用户感知 |
| 卡片按钮点击时工作流已被手动操作 | `confirmStep()` / `abort()` 会抛异常（状态不匹配），catch 后在飞书返回"操作失败：workflow 状态已变更"卡片 |
| 飞书 API 限流 | 正常审批频率远低于限流阈值；并行组同时完成时可加简单 debounce |
| App Secret 安全性 | 存储在 `{userData}/settings.json`（用户级本地文件），不进 git；UI 中使用 `type=password` 遮罩 |

## 11. 后续规划（不在本次范围内）

- 微信公众号 / 企业微信通知渠道
- Web 审批页面（通过本地 HTTP server 提供，不绑定 IM）
- 审批权限控制（指定哪些飞书用户可以审批）
- 审批超时自动处理（如 30 分钟无响应自动 abort）
- 飞书群内直接发消息启动工作流
