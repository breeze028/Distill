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
      -> Python STT worker
```

## Main Process

Main process 持有可信能力：文件系统、数据库、应用设置、音频协议、未来的 DeepSeek 调用，以及未来的 faster-whisper worker 调用。

## Renderer

Renderer 是 React UI，使用 Zustand 管理应用状态。Renderer 只能调用 preload 暴露的 `window.distillAPI`。

拖拽导入时，Renderer 只读取浏览器 `File` 对象并调用 `window.distillAPI.getPathForFile`；本地路径解析由 Preload 通过 Electron `webUtils.getPathForFile` 完成，避免 Renderer 直接访问 Electron/Node API。

手动 Retranscribe 使用 `recordings:start-transcription` 立即创建后台 `ProcessingJob` 并返回最新 Recording，Renderer 通过轮询刷新任务状态；同步 `recordings:transcribe` 仍保留给测试和内部调用。

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

数据库 migration 位于 `src/main/database/migrations`。

`transcript` 永久保存原始转写文本，并记录 `provider`、`model` 和 `source_job_id`。AI 生成内容必须写入 `ai_artifact`，不能覆盖 transcript 原文。

## 搜索

搜索使用 SQLite FTS5。第一版索引字段包括标题、转写文本、AI 内容和标签。

## 音频播放

Renderer 使用 `distill-audio://recording/{id}`。Main 根据 recording ID 查找文件路径，并以安全协议流式返回音频文件。该协议支持 `Range` 请求，seek 时会返回 `206 Partial Content`、`Accept-Ranges` 和 `Content-Range`，保证 M4A/MP3/WAV 可以从 transcript segment 对应时间稳定回听。

Transcript segment 点击回听在 Renderer 内完成：点击后会把 audio source 重新加载为带 `#t={segment.startTime}` 的 media fragment URL，等待 metadata、seek 和可播放数据就绪后再播放。这样避免某些 M4A 在已有解码流中设置 `currentTime` 后实际播放又回到开头。Transcript 面板本身负责独立滚动，避免长音频 transcript 撑开整个详情页布局。
