# 长期计划

最后更新：2026-09-07

本文档记录 Distill 的长期开发路线。它不是承诺所有功能一次完成，而是帮助后续 AI 开发始终知道项目下一步应该往哪里走。

## 长期原则

- 核心对象始终是 `Recording`。
- 核心体验始终是：导入、转写、阅读、回听、理解、整理、搜索。
- AI 是整理、检索和反思辅助层；Assistant 是次级 reflection/retrieval layer，不是 Distill 的默认产品入口。
- 保持 local-first、单用户、本地 SQLite 优先。
- 不为了“看起来高级”引入后端、账号、云同步、向量库或复杂插件系统。

## Phase 0：项目初始化与导入播放闭环

目标：从空目录建立可运行、可测试、可打包的桌面应用，并实现最小纵向闭环。

范围：

- Electron + React + TypeScript + Vite 项目初始化
- Tailwind CSS、shadcn/ui 约定、Zustand、Zod
- SQLite、better-sqlite3、FTS5、migration 基础设施
- Electron Forge、pnpm、Vitest、Playwright
- Python Worker 基础目录
- `Recording` 导入、持久化、Library 展示、Detail 打开、音频播放
- 窗口级拖拽导入音频
- `LLMProvider`、`SpeechToTextService`、`AIArtifact`、`ProcessingJob` 等扩展边界
- 中文项目文档和 AI 开发规则

状态：已完成。

补充进度：

- 已支持把 `.m4a`、`.mp3`、`.wav` 直接拖入应用窗口导入。
- 拖拽导入通过 preload 的类型化 API 获取本地文件路径，保持 Renderer 与 Node/Electron 能力隔离。

## Phase 1：真实本地转写闭环

目标：导入 M4A 后自动执行本地 speech-to-text，并把 segment 级 transcript 永久保存。

范围：

- 接入 Python Worker + faster-whisper
- 设计 Electron Main 到 Python Worker 的可靠 subprocess protocol
- 保存 `Transcript` 与 `TranscriptSegment`
- 用 `ProcessingJob` 追踪 pending、running、succeeded、failed
- UI 显示 Transcribing、Failed、Retry 等状态
- UI 显示转写 elapsed time，并解释首次模型下载/加载导致的等待
- Transcript 面板支持长音频、多段 transcript 在右栏内独立滚动阅读
- 点击 Transcript Segment 后音频稳定 seek 到 segment start time，并从对应时间继续播放
- Transcript Segment 支持人工修正，并保留原始机器转写版本
- 保留 mock STT 测试，不让自动化测试依赖真实 Whisper 模型
- 真实用户导入默认走 Python Worker，mock STT 只用于显式测试/开发

验收重点：

- 导入真实 `.m4a` 后能生成中文 transcript
- segment 的 start/end/text 正确入库
- transcript 能记录 provider、model 和 source job，避免 mock 占位内容伪装成真实转写
- 重新打开应用后 transcript 仍存在
- 点击一句 transcript 可以跳转播放
- Whisper worker 启动失败、模型缺失、转写失败时有用户可理解的错误

当前推进：

- 已建立 `TranscriptionService` 主干。
- 已通过 `ProcessingJob` 记录转写任务状态。
- 已打通手动触发转写、保存 `Transcript` 与 `TranscriptSegment`、UI 展示 segment 的流程。
- 已支持导入后自动创建后台转写任务。
- 已实现点击 Transcript Segment 后音频 seek 到 segment start time。
- 已将 Python Worker 改为真实 faster-whisper 调用，并补充 worker 进程协议校验。
- 已增加 Settings 中的 STT 环境状态检查入口。
- 已增加 Settings 中的 STT provider 选择；mock 与 Python Worker 可在应用内切换。
- 已验证打包应用可通过 Python Worker 生成中文真实 transcript。
- 已将正常默认 provider 调整为 Python Worker，并把 mock STT 限制为显式环境变量开启。
- 已给 transcript 增加来源元数据，并在 UI 中提示旧 mock/占位 transcript 需要重新转写。
- 已将默认模型改为 `faster-whisper-tiny`，并在 Settings 提供常用模型选择。
- 已在转写运行中显示耗时提示，减少短音频等待时的不确定感。
- 已补充 Python Worker 转写超时诊断；超时后会结束 worker 进程树，并提示 small/medium 在 CPU 或首次模型下载时可能非常慢。
- 已将手动 Retranscribe 改为后台任务启动，UI 立即显示新任务耗时。
- 已强化 transcript segment 点击回听，通过 media fragment 重载播放器源，并等待 metadata、seek 和可播放数据就绪后再播放，避免从头播放。
- 已为本地音频协议增加 byte range 响应，保证 M4A/MP3/WAV seek 后能从目标时间继续读取音频数据。
- 已为 Transcript 面板增加独立、可见、稳定的垂直滚动条，并用长 transcript 验证实际 overflow。
- 已支持在详情页手动编辑 transcript segment；保存时 Main 侧会创建新的 transcript revision、重建 `full_text` 并刷新搜索索引，原始机器转写仍保留在数据库中。

## Phase 2：AI Template 与 DeepSeek 结构化笔记

目标：基于原始 Transcript 生成可解析、可重新生成、可追踪历史的结构化 AI 笔记。

范围：

- 接入 DeepSeek API
- 完成 `LLMProvider` 调用链
- 实现 Default Summary、技术思考、个人随想三个内置模板
- 使用 Zod validation 校验模型输出
- 保存 `AIArtifact`，包括 provider、model、promptVersion、content、rawResponse
- JSON 解析失败时保留 raw response，并支持重新生成
- History 记录支持右键删除，并同步刷新最新展示与搜索索引
- Settings 页面管理 provider、model 和 API Key

验收重点：

- 不覆盖 Raw Transcript
- 同一 Recording 可以生成多个 AIArtifact
- UI 默认展示最新版 artifact
- API Key 不进入 renderer bundle，不进入日志
- DeepSeek 缺 key、请求失败、rate limit、JSON 错误都有清晰状态

当前推进：

- 已新增 `AIArtifactService`，负责从 Transcript、内置模板和 `LLMProvider` 生成结构化笔记。
- 已新增 `recordings:start-ai-generation` IPC 和 Summary 区 Generate/Regenerate Notes 入口。
- 已将 AI 笔记生成接入 `ProcessingJob(kind='ai')`，支持 running、succeeded、failed 基础状态。
- 已新增 `SelectableLLMProvider` 和 mock LLM，让自动化测试不依赖真实 DeepSeek API。
- DeepSeek 作为默认真实 provider，当前默认模型继续使用 `deepseek-v4-flash`。
- 已增加 DeepSeek HTTP/响应/JSON schema 错误分类，并在失败 job 中保留 provider raw response。
- 已在失败提示中以折叠方式展示 job 诊断详情，支持查看 JSON/schema 解析失败时的 raw response。
- 已增加 Summary 区域模板选择 UI，并通过 Main IPC 只暴露 renderer-safe 的模板元数据。
- 已在 Recording Detail 中返回完整 `AIArtifact` 历史，并在 Summary 区域支持多版本切换查看。
- 已支持右键删除 AI History 里的单条 artifact，删除后最新 artifact 会回退到剩余历史并刷新搜索索引。

下一步：

- 设计更细的重试策略，包括保留失败原因、重用模板和避免重复并发生成。
- 改进 artifact history 的版本命名和模板筛选。

## Phase 3：搜索与资料库体验

目标：让资料库可用、可找、可浏览；Library 不只承载录音，也承载用户手写文本笔记。

范围：

- 完善 SQLite FTS5 索引
- 搜索 Transcript、AI title、summary、key points、todos、tags
- 搜索文本笔记标题和正文
- 支持中文文件名、中文 transcript、中英文混合搜索
- Library 列表显示 title、date、duration、processing state、tags
- Library 列表混合展示录音和文本笔记
- 基础文本笔记编辑器：标题、正文、常用富文本格式、任务列表、链接、图片、自动保存
- Calendar 视图按日期展示哪些天有录音或笔记，并能打开当天项目列表
- 基础筛选：Today、Work、Ideas、Life 等可以先用虚拟分类或 tag 实现
- 录音详情页强化阅读体验

验收重点：

- 搜索速度在本地资料库规模增长后仍可接受
- 搜索结果能打开对应 Recording
- 搜索结果能打开对应 Note
- 中文搜索不崩溃，结果可解释

当前已完成：

- 已新增 Sidebar Calendar 入口，用月历展示当前月哪些日期有录音。
- 已新增 `recordings:get-calendar-month` 和 `recordings:list-by-date` IPC，Main 侧按 `createdAt ?? importedAt` 的本地日期聚合；新导入音频会优先使用文件内嵌 creation time 填充 `createdAt`。
- 点击日期会在 Calendar 主面板显示当天录音列表，点击录音会回到现有 Recording Detail。
- 已新增 `note` / `note_fts` schema、`NoteRepository`、`notes:*` IPC 和 `library:list/search` 混合资料库接口。
- 已在 Library 增加 New Note 入口，文本笔记和录音混排；选中文本笔记后右侧显示 Tiptap 基础富文本编辑器，并自动保存标题、正文 JSON 和纯文本搜索内容。
- 文本编辑器已增强常用格式：下划线、行内代码、代码块、任务列表、链接、分割线、图片。
- 插入照片会先复制到 Main 侧托管的 note image assets，并通过 `distill-asset://note-image/...` 在编辑器中显示。
- Calendar 已改为混合项目日历，可显示当天录音数、笔记数和录音总时长；点击当天笔记可打开笔记编辑器。

下一步：

- 增加笔记右键重命名、删除二次确认细化和导出 Markdown/HTML。
- 设计录音和笔记的关联关系，例如从一条录音生成一条可继续编辑的整理笔记。
- 继续打磨编辑器体验：图片缩放、粘贴清理、搜索命中高亮和笔记内附件管理。

## Phase 4：音频库文件夹

目标：支持配置统一的本地音频库文件夹；所有新导入音频都复制到该目录，直接放入该目录的音频也会自动进入 Library。

范围：

- Settings 配置音频库文件夹
- Main process 监听音频库文件夹
- 手动导入、拖拽导入时复制音频副本到音频库文件夹
- 避免重复导入
- 处理文件尚未复制完成的情况
- 记录导入 job 和错误
- Settings 显示音频库文件夹状态

验收重点：

- 将 `.m4a` 放入音频库文件夹后自动导入
- 从外部位置导入 `.m4a` 后，`Recording.filePath` 指向音频库文件夹内副本
- 同一文件不会重复导入
- 文件移动、删除、复制中断时错误可见但不破坏数据库

当前已完成：

- Settings 中的音频库文件夹会驱动 Main 侧文件夹监听刷新。
- 文件夹监听使用本地文件系统监听 M4A/MP3/WAV，并在文件稳定后调用现有 importer。
- 音频库文件夹自动导入会复用现有去重逻辑，并按 `autoTranscribeOnImport` 触发自动转写。
- 音频库文件夹导入完成后会发送类型化 `library:changed` 通知，Renderer 收到后刷新 Library。
- Settings 中的音频库文件夹已使用原生文件夹选择器，不要求用户手动输入路径字符串。

下一步：

- 增加导入队列视图，让用户看到音频库文件夹最近导入了哪些文件。
- 增加导入完成后的系统通知或非打扰式提示。
- 增加更完整的文件稳定性策略，处理大文件复制、iCloud 同步和临时文件。

## Phase 4A：Read-only Personal Reflection Agent

目标：让用户可以打开 Ask Distill，围绕自己长期保存的 Recording、Transcript、AIArtifact 和文本 Note 提问，并由模型决定调用哪些只读工具检索真实资料后回答。

当前已完成：

- 已新增独立 `AgentModel` 边界，保留 `LLMProvider.generate()` 专门服务 AIArtifact generation。
- 已新增 `DeepSeekAgentModel`，使用现有 DeepSeek API Key 与 model 设置调用 tool calling；自动化测试使用 fake/mock model，不调用真实 DeepSeek。
- 已新增 `ToolRegistry`、Zod 参数校验、结构化 tool error 和 5 个只读 Library tools。
- 已新增 `AgentRuntime`，负责最多 8 步的 model/tool loop、source collection、usage 汇总和 trace。
- 已新增 `agent_conversation` / `agent_message` migration 与 repository，Assistant 多轮对话可持久化。
- 已新增 typed Assistant IPC、preload API、`assistantStore` 和独立 `src/renderer/features/assistant/` 组件。
- UI 已接入可收起右侧 Ask Distill 面板，支持 All Library / Current Item scope，显示回答、activity、structured Sources，并可点击 Source 打开 Recording 或 Note。
- Recording source navigation 已支持 transcript segment 深跳转：搜索结果能携带匹配片段的 `segmentId/startTime`，点击后打开录音、滚到对应 transcript 行并 seek 音频。

下一步：

- 检索质量观察：用真实中文资料库记录 FTS5/fallback 的失败样例，先确认问题形态再做 semantic search。
- Semantic Search：在 SQLite FTS5 不足以覆盖“字面不同但语义相同”的回顾问题时单独设计。
- Write Tools + Human Confirmation：未来允许创建 Note、Tag、Todo 等写入动作前，必须先设计人工确认。
- Weekly Reflection：定期回顾近期资料，生成可审阅的周/月回顾。
- Reflection Questions：基于历史内容提出可选的反思问题，但不做自主后台代理。

## Phase 5：稳定性、打包与数据安全

目标：把原型提升到长期可用的本地桌面应用。

范围：

- Windows 安全存储方案替换临时 SecretStorage
- 重新评估是否启用 `asar`
- 完善日志文件输出、日志轮转和敏感信息脱敏
- 数据库备份/恢复基础能力
- 音频文件缺失后的定位与修复流程
- 更完整的 Playwright UI 验收

验收重点：

- 应用关闭重开、系统重启后数据可靠
- 打包产物可在干净 Windows 环境运行
- secret 不以明文暴露给 renderer 或日志

## 暂不进入近期计划

- iPhone App / Android App
- 账号系统
- 后端服务
- 云同步
- 团队协作
- 向量数据库
- Assistant write tools without human confirmation
- Background autonomous agent
- Multi-agent framework
- embedding search
- speaker diarization
- 完整 Word 级编辑器
- Windows 内录音
- 音频剪辑器
- 浏览器扩展
- 插件系统
