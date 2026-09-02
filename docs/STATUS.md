# 完成情况

最后更新：2026-09-02

本文档记录当前已经完成的内容、验证情况、已知限制和推荐下一步。每次完成较大阶段或明显改变架构/核心流程后，都应该更新本文档。

## 当前阶段

当前处于 Phase 1 起步阶段。

Phase 0 目标：项目初始化，并实现 `Import M4A -> 存入 Recording -> Library 显示 -> 打开 Detail -> 播放 M4A` 的最小纵向闭环。

状态：已完成。

Phase 1 当前目标：建立转写任务主干，逐步接入真实本地 speech-to-text。

状态：进行中。

## 已完成

- 初始化 Electron + React + TypeScript + Vite 桌面应用。
- 配置 pnpm、Electron Forge、Tailwind CSS、shadcn/ui 约定、Zustand、Zod、Vitest、Playwright。
- 配置 SQLite + better-sqlite3 + FTS5。
- 建立数据库 migration 基础设施。
- 创建 Python Worker 基础目录与占位 worker。
- 创建 `Recording`、`Transcript`、`TranscriptSegment`、`AIArtifact`、`AITemplate`、`Tag`、`RecordingTag`、`ProcessingJob`、`AppSetting` 初始 schema。
- 实现 `.m4a`、`.mp3`、`.wav` 手动导入。
- 导入后保存原始文件名、路径、导入时间、时长、大小、创建时间和格式。
- 实现重复导入检测。
- 实现 Library 列表。
- 实现 Recording Detail。
- 使用 `distill-audio://recording/{id}` 安全协议播放本地音频。
- 实现基础播放器、播放速度选择、详情页 summary/transcript 空状态。
- 实现 Settings 页面基础字段。
- 实现 Inbox 页面占位入口。
- 移除 Electron 默认原生菜单栏，避免顶部 File/Edit/View 菜单造成焦点问题。
- 修复 Sidebar navigation：Library、Inbox、Settings 可以切换，Inbox/Settings 再点一次可收回。
- 新增 `TranscriptionService`。
- 新增 `recordings:transcribe` IPC。
- 新增手动触发转写按钮。
- 转写流程会创建并更新 `ProcessingJob`。
- mock STT 转写结果会保存为 `Transcript` 和 `TranscriptSegment`。
- Recording Detail 可以展示 transcript segment。
- 点击 transcript segment 可以让音频 seek 到该句起始时间并播放。
- Python Worker 已接入 faster-whisper 调用。
- Main 到 Python Worker 的 JSON 进程协议已增加响应校验、结构化错误、超时和打包路径解析。
- 打包配置会把 `python/` 作为 extra resource 带入应用。
- Recording Detail 会显示最近一次转写失败原因，并提供重试入口。
- Settings 已增加 STT 状态检查入口，可以显示当前 provider、模型、Python 命令、worker 路径、Python 版本和 faster-whisper 可用性。
- Settings 已增加 STT provider 选择，转写和状态检查会按最新设置在 mock/Python Worker 间切换。
- 创建中文 README、AGENTS、产品、架构、开发文档。
- 初始化 Git，并完成首个提交。

## 架构现状

- Renderer 只通过 preload 暴露的 `window.distillAPI` 与 Main 通信。
- Renderer 不直接访问 Node、SQLite、文件系统或 API Key。
- Main process 负责数据库、导入、设置、音频协议、未来 LLM provider、未来 STT worker。
- `LLMProvider` 已定义，并有 `DeepSeekProvider` 初始实现。
- `SpeechToTextService` 已定义，并有 Python Worker 实现骨架与 mock 实现。
- `AIArtifact` 数据模型已建立，避免把 AI 输出写死为 `Recording.summary`。
- `ProcessingJob` 表已建立，但导入以外的长任务状态流转还未完整接入。
- 转写任务已开始使用 `ProcessingJob`，AI 生成任务尚未接入。

## 验证记录

最近一次已通过：

```powershell
pnpm lint
pnpm test
pnpm build
node tests\e2e\phase0-smoke.cjs
pnpm dev
```

自动化覆盖：

- AI JSON schema validation
- 文件导入
- 中文文件名
- 重复导入检测
- SQLite migration
- Transcript / AIArtifact / FTS 搜索基础 pipeline
- packaged app 启动
- packaged app 导入真实 `.m4a`
- 导入后持久化
- 点击录音进入详情
- 手动触发 mock 转写
- 转写后展示 transcript segment
- transcript segment 文本可见
- 重开打包应用后 transcript 仍然可见
- 点击 transcript segment 会 seek 到对应音频时间点
- audio element 加载到有效时长
- Electron application menu 已移除
- Inbox 和 Settings 可打开/收回

## 当前已知限制

- 默认 UI 转写仍使用 mock STT；Settings 中选择 `Python Worker` 后走真实 Python Worker。
- 首次真实 faster-whisper 转写需要用户本机安装 Python 依赖并下载模型。
- DeepSeek 尚未接入真实生成流程。
- Watch Folder 只有设置入口和 Inbox 页面占位，尚未实现文件监听。
- `ProcessingJob` 还没有覆盖 AI 生成的完整状态流转。
- Settings 中 API Key 暂存在 SQLite，未来需要替换为 Windows 安全存储方案。
- Forge packaging 为了 Phase 0 中诊断 `better-sqlite3` 原生依赖，暂时关闭 `asar`。
- 当前 UI 文案仍有较多英文，后续可以逐步中文化或引入轻量 i18n。
- 当前 Playwright smoke 是脚本形式，还不是完整 Playwright test suite。

## 下一步建议

继续推进 Phase 1：真实本地转写闭环。

优先任务：

- 设计模型安装入口，避免用户手动读命令。
- Detail 页面展示真实 Transcript。
- 为 Worker 缺失、模型缺失、转写失败添加更细的引导文案。

## 重要提交

- `381e03c feat: initialize Distill desktop app`
