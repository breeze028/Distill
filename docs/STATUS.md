# 完成情况

最后更新：2026-09-07

本文档记录当前已经完成的内容、验证情况、已知限制和推荐下一步。每次完成较大阶段或明显改变架构/核心流程后，都应该更新本文档。

## 当前阶段

当前处于 Phase 1/2/3 并行推进，并已完成 Read-only Personal Reflection Agent 第一版纵向切片。

Phase 0 目标：项目初始化，并实现 `Import M4A -> 存入 Recording -> Library 显示 -> 打开 Detail -> 播放 M4A` 的最小纵向闭环。

状态：已完成。

Phase 1 当前目标：建立转写任务主干，逐步接入真实本地 speech-to-text。

状态：进行中。

Phase 2 当前目标：建立基于 Transcript 的结构化 AI 笔记生成闭环。

状态：已启动。

Phase 3 当前目标：扩展 Library 资料库体验，支持录音、文本笔记、搜索和日历浏览。

状态：已启动。

Read-only Personal Reflection Agent 当前目标：在不改变核心资料库产品形态的前提下，增加一个可收起的 Ask Distill 面板，让用户基于真实 Recording、Transcript、AIArtifact 和 Note 做回顾问答。

状态：第一版纵向切片已完成。

## 已完成

- 初始化 Electron + React + TypeScript + Vite 桌面应用。
- 配置 pnpm、Electron Forge、Tailwind CSS、shadcn/ui 约定、Zustand、Zod、Vitest、Playwright。
- 配置 SQLite + better-sqlite3 + FTS5。
- 建立数据库 migration 基础设施。
- 创建 Python Worker 基础目录与占位 worker。
- 创建 `Recording`、`Transcript`、`TranscriptSegment`、`AIArtifact`、`AITemplate`、`Tag`、`RecordingTag`、`ProcessingJob`、`AppSetting` 初始 schema。
- 新增 `Note` 数据模型、`note` 表和 `note_fts` 搜索索引，用于保存用户手写文本笔记。
- 实现 `.m4a`、`.mp3`、`.wav` 手动导入；新导入音频会复制到用户指定的音频库文件夹。
- 实现窗口级拖拽导入 `.m4a`、`.mp3`、`.wav`，支持一次拖入多个音频文件，并复用音频库文件夹复制规则。
- 导入后保存原始文件名、路径、导入时间、时长、大小、创建时间和格式。
- 新导入音频的创建时间优先来自音频 metadata creation time，读不到时回退文件系统创建时间，Calendar 再以该字段归类。
- 实现重复导入检测。
- 实现 Library 列表；当前可混合显示录音和文本笔记。
- Library 已新增 New Note 入口，支持创建文本笔记。
- 文本笔记详情使用 Tiptap 基础富文本编辑器，支持标题、正文、粗体、斜体、下划线、删除线、标题、列表、任务列表、引用、行内代码、代码块、链接、分割线、撤销/重做和自动保存。
- 文本笔记支持插入本地照片；图片会复制到 Main 侧托管的 note image assets，并通过 `distill-asset://note-image/...` 安全协议渲染。
- 文本笔记保存 Tiptap JSON 正文与纯文本正文；纯文本用于列表预览和 Library 搜索。
- 文本笔记当前存储在 Distill SQLite 数据库的 `note` 表中；音频库文件夹只存放音频副本，笔记不会以文件形式出现在该文件夹。
- Library 列表条目支持右键打开所在文件夹或删除录音；删除库内副本时会移到回收站，旧外部路径录音只删除 Distill 记录。
- 实现 Calendar 入口：按录音和笔记创建日期展示哪些天有记录，并可打开当天混合项目列表。
- 实现 Recording Detail。
- 使用 `distill-audio://recording/{id}` 安全协议播放本地音频。
- `distill-audio://` 支持 byte range 响应，保证播放器 seek 后可以从目标位置读取音频数据。
- 实现基础播放器、播放速度选择、详情页 summary/transcript 空状态。
- 实现 Settings 页面基础字段。
- 移除 Electron 默认原生菜单栏，避免顶部 File/Edit/View 菜单造成焦点问题。
- 删除用户可见 Inbox 入口，Library 直接承担音频资料库功能。
- 音频库文件夹已有第一版 Main 侧监听服务：保存文件夹后自动监听 M4A/MP3/WAV，发现新音频后导入，并按设置触发自动转写。
- Settings 中的音频库文件夹使用原生文件夹选择器配置，避免手动输入本地路径字符串，并显示监听状态、最近事件时间和错误信息。
- 音频库文件夹导入完成后会通过类型化 `library:changed` 通知刷新 Library UI。
- 新增 `TranscriptionService`。
- 新增 `recordings:transcribe` IPC。
- 新增手动触发转写按钮。
- 转写流程会创建并更新 `ProcessingJob`。
- 导入成功后会按设置自动创建后台转写任务。
- Settings 中可控制是否导入后自动转写。
- mock STT 转写结果会保存为 `Transcript` 和 `TranscriptSegment`。
- Recording Detail 可以展示 transcript segment。
- Transcript 面板有独立、稳定且可见的垂直滚动条，长音频生成的多段 transcript 可以在详情页右栏内滚动阅读。
- 点击 transcript segment 会把播放器源重载为带 media fragment 的目标时间 URL，并等待音频 metadata/seek/可播放数据就绪后再播放；音频协议支持 Range 请求，避免 M4A seek 后实际播放又回到 0 秒。
- Transcript segment 已支持行内人工编辑；保存后会生成新的最新 transcript 版本，重建 `full_text` 与 FTS 搜索索引，并保留原始机器转写版本。
- Python Worker 已接入 faster-whisper 调用。
- Main 到 Python Worker 的 JSON 进程协议已增加响应校验、结构化错误、超时和打包路径解析。
- 打包配置会把 `python/` 作为 extra resource 带入应用。
- Recording Detail 会显示最近一次转写失败原因，并提供重试入口。
- Settings 已增加 STT 状态检查入口，可以显示当前 provider、模型、Python 命令、worker 路径、Python 版本和 faster-whisper 可用性。
- Settings 已增加 STT provider 选择，转写和状态检查会按最新设置在 mock/Python Worker 间切换。
- Settings 已将默认 STT 模型调整为 `faster-whisper-tiny`，并提供 tiny/base/small/medium 模型选择，优先保证短录音转写速度。
- 新增 `pnpm setup:stt`，用于创建本地 Python venv 并安装 faster-whisper 依赖。
- 新增 `pnpm smoke:stt`，用于可选验证打包应用里的真实 Python Worker 转写链路。
- 应用启动时会恢复遗留的 running `ProcessingJob`，避免转写任务在异常关闭后永久停留在 running。
- Python Worker 在 Windows 管道输入/输出/错误流中强制使用 UTF-8，避免中文文件路径和中文真实 transcript 乱码。
- 新增 transcript 来源元数据：`provider`、`model`、`source_job_id`，用于区分真实 Python Worker 转写和测试 mock 转写。
- 正常启动默认使用 Python Worker；mock STT 只在显式设置 `DISTILL_ALLOW_MOCK_STT=true` 或 `DISTILL_STT_PROVIDER=mock` 时开放。
- Python STT 未显式配置命令时，会优先发现源码目录下的 `python\.venv\Scripts\python.exe`；从 `out\distill-win32-x64\distill.exe` 手动启动打包应用时也会回溯到项目 venv。
- Recording Detail 会识别旧 mock/占位 transcript，并提示使用 Python Worker 重新转写。
- Recording Detail 在转写运行中会显示已耗时，并提示首次模型下载/加载可能导致等待变长。
- Python STT 转写超时默认 30 分钟，可用 `DISTILL_STT_TIMEOUT_MS` 调整；超时后 Windows 会尝试结束 worker 进程树，并提示 medium/small 在 CPU 与首次下载场景下可能很慢。
- 手动 Retranscribe 会先创建新的后台 `ProcessingJob` 并立即刷新 UI，处理耗时从本次任务开始计算。
- 新增 `AIArtifactService`，可基于已有 Transcript 和内置模板生成结构化 AI 笔记。
- 新增 `recordings:start-ai-generation` IPC，Renderer 可触发后台 AI 生成任务。
- 新增 `SelectableLLMProvider`，正常默认走 DeepSeek，默认模型为 `deepseek-v4-flash`，测试/开发可显式启用 mock LLM。
- Recording Detail 的 Summary 区域已增加 Generate/Regenerate Notes 入口。
- Summary 区域已增加 AI 模板选择，下拉只读取 Main 暴露的模板元数据，实际 prompt/schema 不进入 Renderer。
- AI 笔记生成会创建 `ProcessingJob(kind='ai')`，运行中显示耗时，成功后写入 `AIArtifact`，失败后显示错误、诊断详情并可重试。
- Recording Detail 已返回完整 `artifacts` 历史，Summary 区域可在多次生成结果之间切换查看。
- AI History 记录支持右键显示 Delete 并删除单条 `AIArtifact`；删除后 Summary 会回退到剩余最新版本，搜索索引同步刷新。
- DeepSeek provider 已增加基础错误分类：API Key/权限错误、频率或额度限制、服务端错误、响应缺失和 JSON/schema 错误。
- AI 笔记生成失败时会把 provider raw response 写入 `ProcessingJob.errorDetail`，并在 UI 中以折叠诊断详情展示。
- 新增 Read-only Personal Reflection Agent：独立 `AgentModel`、`DeepSeekAgentModel`、`MockAgentModel`、`AgentRuntime`、`ToolRegistry`、Library read-only tools、`AgentService` 和 Assistant typed IPC。
- 新增 `agent_conversation` / `agent_message` 表，Assistant 多轮对话可以持久化；Agent run 不塞进 `ProcessingJob`。
- Assistant tools 当前支持 `search_library`、`get_recording`、`get_transcript`、`get_note`、`list_library_by_date_range`，全部只读，参数经过 Zod validation，并由程序维护 structured Sources。
- Renderer 新增 `src/renderer/features/assistant/` 和 `assistantStore`，`App.tsx` 只负责打开/关闭、scope 和 source navigation 集成。
- UI 新增可收起右侧 Ask Distill 面板，支持 All Library 和 Current Item scope，显示回答、sources 和运行 activity；点击 note source 可打开笔记，点击 recording source 可打开录音，若 source 带 transcript segment 时间则会滚到对应片段并 seek 音频。
- 创建中文 README、AGENTS、产品、架构、开发文档。
- 初始化 Git，并完成首个提交。

## 架构现状

- Renderer 只通过 preload 暴露的 `window.distillAPI` 与 Main 通信。
- Renderer 不直接访问 Node、SQLite、文件系统或 API Key。
- Main process 负责数据库、导入、设置、音频协议、LLM provider、Read-only Agent runtime 和 STT worker。
- `LLMProvider` 已定义，并有 `DeepSeekProvider` 初始实现。
- `LLMProvider` 已接入应用启动流程，并通过 settings 在 DeepSeek/mock provider 间选择。
- `SpeechToTextService` 已定义，并有 Python Worker 实现骨架与 mock 实现。
- `AIArtifact` 数据模型已建立，避免把 AI 输出写死为 `Recording.summary`。
- `Note` 数据模型已建立，避免把用户手写笔记混入 `Recording` 或 `AIArtifact`。
- `ProcessingJob` 表已建立，转写任务和 AI 笔记生成任务都已开始接入。

## 验证记录

最近一次已通过：

```powershell
pnpm lint
pnpm test
python -m py_compile python\worker\worker.py
pnpm build
node tests\e2e\phase0-smoke.cjs
pnpm setup:stt
pnpm smoke:stt
pnpm dev
```

自动化覆盖：

- AI JSON schema validation
- 文件导入
- 中文文件名
- 重复导入检测
- SQLite migration
- Calendar 月聚合、本地日期回退和按日录音列表
- 启动恢复中断的 ProcessingJob
- Transcript / AIArtifact / FTS 搜索基础 pipeline
- Note 创建、更新、删除、Calendar 日期聚合和 `note_fts` 搜索索引
- Note 图片导入服务、本地托管资源路径校验和图片格式校验
- packaged app 启动
- packaged app 导入真实 `.m4a`
- packaged app 通过拖拽导入音频
- 导入后持久化
- 点击录音进入详情
- 打开 Calendar 后当前月可显示有记录日期；点击日期显示当天录音和笔记，点击当天录音回到录音详情，点击当天笔记打开笔记编辑器
- 导入后自动触发 mock 转写
- 手动触发 mock 转写
- 转写后展示 transcript segment
- transcript segment 文本可见
- 重开打包应用后 transcript 仍然可见
- Transcript 面板使用稳定、可见 scrollbar；已用 75 秒、36 段 mock transcript 验证右栏可滚动
- 点击 transcript segment 会 seek 到对应音频时间点；已验证 `distill-audio://` Range fetch 返回 206，点击第 30 秒附近 segment 后播放器源包含 `#t=30.000`，进入约 31.67 秒且保持播放
- 手动编辑 transcript segment 后，最新 transcript、segment 文本和搜索索引会同步更新；旧 transcript 版本仍保留在数据库中
- 点击 Retranscribe 会立即显示新任务的运行耗时
- 点击 Generate Notes 会立即显示 AI 生成任务耗时
- mock LLM 生成的 `AIArtifact` 可在详情页 Summary 区展示并持久化
- 选择 `technical-thinking` 模板后生成 AI 笔记，mock 摘要确认使用对应 template id
- 连续两次生成 AI 笔记后，详情页展示 artifact history，数据库保留两条历史并以最新版本作为默认展示；点击旧版本可切换正文
- 右键 AI artifact history 记录会显示 Delete；删除旧版本后数据库、Summary 和搜索索引同步更新
- AI 生成任务成功/失败会写入 `ProcessingJob`
- DeepSeek provider 错误分类、raw response 保留和失败诊断详情展示
- LLM provider 选择默认使用 DeepSeek，默认模型为 `deepseek-v4-flash`，mock LLM 只在显式测试/开发环境启用
- packaged app 导入中文 `.m4a`，并使用 Python Worker + faster-whisper tiny 生成中文真实 transcript
- packaged app 在不注入 `DISTILL_PYTHON_COMMAND` 时也能自动发现项目 Python venv
- transcript 会保存来源 provider、模型和生成它的 ProcessingJob ID
- 转写运行中 UI 可显示 elapsed time
- audio element 加载到有效时长
- Electron application menu 已移除
- Sidebar 不再显示 Inbox；Settings 可打开/收回
- 保存音频库文件夹后状态显示为监听中；复制新 `.m4a` 到该文件夹会自动导入、触发转写并刷新 Library UI
- Settings 中音频库文件夹区域显示文件夹选择按钮，并且不再暴露可手动输入的路径文本框
- packaged app 中 New Note 可创建文本笔记，编辑正文后自动保存，Library 列表展示预览，Library 搜索可搜到笔记正文
- packaged app 中文本编辑器增强工具栏可见；图片导入后会复制到托管资源目录，并能在笔记编辑器中渲染
- packaged app 中 Calendar 可显示笔记所在日期，并可从当天列表打开笔记
- packaged app 中点击笔记空白编辑区域可聚焦并输入；smoke 捕获 renderer error，确认 New Note 不产生白屏异常
- Agent Runtime / ToolRegistry 单测覆盖：unknown tool、Zod validation、tool error、no tool final answer、单次 tool call、多轮 sequential tool call、maxSteps 和 source collection。
- Agent tools 集成测试使用真实 SQLite + Repository 覆盖录音 transcript 搜索、segment source 时间戳、文本 note 搜索读取，以及 Current Item scope 限制。
- DeepSeekAgentModel 使用 mock fetch 验证 tool calling 请求体、`tool_calls` 解析、usage 映射和错误分类，不调用真实 DeepSeek。
- Assistant packaged Electron smoke 覆盖：打开 Ask Distill、mock Agent 回答、显示 Sources、点击 Recording Source 打开录音并 seek 到 transcript segment、点击 Note Source 打开笔记、对话持久化、1366x768/1920x1080 open layout、closed layout、Assistant 全屏/拖拽调整宽度、主 Sidebar/Library 边界拖拽调整宽度、Enter 发送、Shift/Alt+Enter 换行和 renderer error 捕获。

## 当前已知限制

- 首次真实 faster-whisper 转写需要用户本机安装 Python 依赖并下载模型。
- `small`/`medium` 模型在 CPU 上可能明显慢于 `tiny`/`base`；`medium` 首次下载或纯 CPU 转写时可能进入很长等待，短录音默认建议使用 `tiny` 或 `base`。
- 旧版本已经生成的 mock/占位 transcript 不会被自动删除，需要用户点击 Retranscribe 生成真实内容。
- DeepSeek provider 已接入生成主干并有 mock fetch 单测；真实 API smoke 仍需要通过本地密钥配置单独验证。
- 音频库文件夹已有本地监听、自动导入和导入后 Library 刷新第一版；尚未实现系统通知、队列视图和文件稳定性高级策略。
- `ProcessingJob` 已覆盖 AI 笔记生成的基础状态流转；更细的 token/费用/模板级重试策略尚未设计。
- Settings 中 API Key 暂存在 SQLite，未来需要替换为 Windows 安全存储方案。
- Forge packaging 为了 Phase 0 中诊断 `better-sqlite3` 原生依赖，暂时关闭 `asar`。
- 当前 UI 文案仍有较多英文，后续可以逐步中文化或引入轻量 i18n。
- 当前 Playwright smoke 是脚本形式，还不是完整 Playwright test suite。
- Assistant 第一版仍使用 SQLite FTS5 字面检索，不包含 semantic search、embedding 或 vector database；中文多词拆分召回仍受当前 FTS/fallback 策略限制。
- Assistant source navigation 已支持 recording/note 打开；recording source 若包含 transcript `segmentId/startTime`，会滚动到对应 transcript 行并 seek 音频。
- Assistant 第一版没有 streaming；运行中只显示简化 activity，不展示 chain-of-thought。
- 文本编辑器目前是基础富文本能力，不包含完整 Word 级分页、样式管理、表格、图片缩放裁剪和复杂导出。

## 下一步建议

继续推进 Assistant 的检索质量，同时保持 read-only 边界。

优先任务：

- 观察 SQLite FTS5 在真实中文资料库中的召回，再决定是否设计 semantic search。
- 为 semantic search 先写设计草案：embedding 存储位置、重建策略、隐私边界、模型可替换接口和回退到 FTS5 的混合检索策略。
- 设计 Write Tools + Human Confirmation，不在第一版直接实现写入。

## 重要提交

- `381e03c feat: initialize Distill desktop app`
- `7fca3a8 feat: add reflection assistant and resizable panes`
