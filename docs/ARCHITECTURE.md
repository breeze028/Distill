# 架构

Distill 使用 Electron，并严格区分进程边界。

```text
React Renderer
  -> 类型化 Preload API
  -> Electron Main
      -> SQLite / better-sqlite3
      -> 文件导入
      -> 设置与密钥
      -> LLM provider
      -> Read-only Agent runtime
      -> Python STT worker
```

## Main Process

Main process 持有可信能力：文件系统、数据库、应用设置、音频协议、未来的 DeepSeek 调用，以及未来的 faster-whisper worker 调用。

## Renderer

Renderer 是 React UI，使用 Zustand 管理应用状态。Renderer 只能调用 preload 暴露的 `window.distillAPI`。

拖拽导入时，Renderer 只读取浏览器 `File` 对象并调用 `window.distillAPI.getPathForFile`；本地路径解析由 Preload 通过 Electron `webUtils.getPathForFile` 完成，避免 Renderer 直接访问 Electron/Node API。Main 侧导入前会确保已配置音频库文件夹，并由 `FileImportService` 把外部音频复制进该文件夹后再写入 `Recording.file_path`。

Library 视图使用 `library:list` 和 `library:search` 读取混合资料库项目。录音仍由 `RecordingRepository` 管理；文本笔记由独立 `NoteRepository` 管理，并通过 `note` / `note_fts` 表持久化。Renderer 只保存当前选中的 recording 或 note 状态，不直接写库。文本笔记正文以 Tiptap JSON 作为主数据保存，同时写入 `plain_text` 供列表预览和 FTS 搜索使用。

文本笔记图片通过 `notes:import-image-dialog` 选择本地图片。Main 侧 `NoteAssetService` 会把图片复制到应用数据目录下的 note image assets，再返回 `distill-asset://note-image/{fileName}` 给 Renderer 插入到 Tiptap 文档。Renderer 不保存源图片路径，也不把图片二进制写进 SQLite；`distill-asset` 协议只解析受控文件名，避免通过笔记正文读取任意本地文件。

Calendar 视图通过 `library:get-calendar-month` 和 `library:list-by-date` 读取录音与笔记的混合聚合数据。录音日期仍来自 `created_at`，缺失时回退 `imported_at`；笔记日期使用 `created_at`。旧的 `recordings:get-calendar-month` 和 `recordings:list-by-date` 仍作为录音专用接口保留。导入时 `FileImportService` 优先从音频 metadata 的 `creationTime` 写入 recording `created_at`，会忽略 `1904-01-01` 这类明显的容器默认值，读不到有效值时回退文件系统创建时间；日期归类在 Main/repository 侧完成，避免 Renderer 自行解释数据库时间字段。

手动 Retranscribe 使用 `recordings:start-transcription` 立即创建后台 `ProcessingJob` 并返回最新 Recording，Renderer 通过轮询刷新任务状态；同步 `recordings:transcribe` 仍保留给测试和内部调用。

Settings 中的音频库文件夹通过 `settings:select-audio-library-folder` 打开 Main 侧原生文件夹选择框。Renderer 只接收用户选择后的本地路径字符串，并在保存设置时通过 `settings:save` 更新存储和监听目录。该目录仍会被 Main 监听，用户直接放入目录的音频会自动出现在 Library。

AI 笔记生成使用 `recordings:start-ai-generation`。Renderer 只提交 recording id 和 template id；Main 负责读取 Transcript、选择内置模板、调用 `LLMProvider`、写入 `AIArtifact`，并用 `ProcessingJob(kind='ai')` 记录状态。AI History 删除使用 `recordings:delete-ai-artifact`，Main 校验 artifact 属于当前 recording 后删除，并刷新最新 artifact 与 FTS 搜索索引。正常默认 provider 是 DeepSeek，自动化测试可显式启用 mock LLM。DeepSeek 响应解析失败时不会覆盖 Transcript；provider raw response 会保存在失败 job 的 `errorDetail` 中，用于后续诊断。

Assistant 使用独立的 read-only Agent 边界，不复用 `LLMProvider.generate()` 承载 messages/tools/tool_calls。Main 侧组合 `AgentConversationRepository`、`DeepSeekAgentModel` / `MockAgentModel`、`ToolRegistry`、Library read-only tools、`AgentRuntime` 和 `AgentService`。`AgentModel` 只负责 `messages + tools -> assistant response / tool calls / usage`；它不知道 SQLite、Repository、Tool execution 或 conversation persistence。`AgentRuntime` 负责最多 8 步的 agent loop、tool execution、source collection、结构化 trace 和 stop condition。

Assistant tools 当前保持 5 个只读数据访问工具：`search_library`、`get_recording`、`get_transcript`、`get_note`、`list_library_by_date_range`。工具参数使用 Zod validation，工具由 `ToolRegistry` 按名称查找和执行，未知工具、参数错误和工具异常都会变成结构化 tool result。Current Item scope 会限制工具只读取当前 Recording 或当前 Note；All Library scope 才能访问全部资料库。

Assistant conversation 通过 `agent_conversation` 和 `agent_message` 表持久化，关闭应用后仍可恢复历史对话。Assistant run 不写入 `ProcessingJob`；trace 只记录可观察的 model/tool step、工具名、参数、耗时、成功/失败和 token usage，不记录 API Key、Authorization header 或模型 private chain-of-thought。回答相关来源由程序维护为结构化 `AgentSource[]`，Renderer 只负责展示紧凑 source rows 并点击打开对应 Recording 或 Note。

Agent system prompt 会注入用户本地日历日期，要求模型把“这周、上个月、最近”等相对时间转换成明确的 `YYYY-MM-DD` 范围后再调用日期工具；同时要求回答优先使用简洁 Markdown，并用自然语言点明相关 Recording/Note 标题和日期，避免脱离 retrieved data 做过度推断。

## 数据库

初始 schema 包含：

- `recording`
- `transcript`
- `transcript_segment`
- `ai_template`
- `ai_artifact`
- `tag`
- `recording_tag`
- `processing_job`
- `app_setting`
- `recording_fts`
- `note`
- `note_fts`
- `agent_conversation`
- `agent_message`

数据库 migration 位于 `src/main/database/migrations`。

`transcript` 永久保存原始转写文本，并记录 `provider`、`model` 和 `source_job_id`。手动编辑 transcript segment 时不会原地覆盖旧 transcript，而是复制当前 transcript 生成一个新的最新版本，并同步重建 `full_text` 与 FTS 索引。AI 生成内容必须写入 `ai_artifact`，不能覆盖 transcript 原文。

## 搜索

搜索使用 SQLite FTS5。录音索引字段包括标题、转写文本、AI 内容和标签。Repository 搜索会在 FTS5 之外补一层 query-term fallback：简短关键词保持精确 `LIKE` 语义，自然中文问题会展开为有限的中文片段用于候选召回，再用同一套分数排序，降低“有没有提过/之前写过”这类 Assistant 问法漏召回的概率。

文本笔记使用独立的 `note_fts` 索引标题与纯文本正文，并复用同一套 query-term fallback。Library 搜索在 Main 侧合并录音搜索结果和笔记搜索结果，再按对应资料的最近更新时间排序返回。Calendar 聚合也在 Main 侧合并录音与笔记，返回数量、类型拆分和录音总时长。

Assistant 第一阶段继续复用 SQLite FTS5 和现有 Repository 搜索能力，不引入 embedding、vector database 或 semantic search。工具返回面向 Agent 的受限摘要、片段和 metadata，避免一次 tool call 把超长 transcript 全部塞进模型上下文。

## 音频播放

Renderer 使用 `distill-audio://recording/{id}`。Main 根据 recording ID 查找文件路径，并以安全协议流式返回音频文件。该协议支持 `Range` 请求，seek 时会返回 `206 Partial Content`、`Accept-Ranges` 和 `Content-Range`，保证 M4A/MP3/WAV 可以从 transcript segment 对应时间稳定回听。

Transcript segment 点击回听在 Renderer 内完成：点击后会把 audio source 重新加载为带 `#t={segment.startTime}` 的 media fragment URL，等待 metadata、seek 和可播放数据就绪后再播放。这样避免某些 M4A 在已有解码流中设置 `currentTime` 后实际播放又回到开头。Transcript 面板本身负责独立滚动，避免长音频 transcript 撑开整个详情页布局。
