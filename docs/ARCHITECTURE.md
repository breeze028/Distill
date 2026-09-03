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

Renderer 使用 `distill-audio://recording/{id}`。Main 根据 recording ID 查找文件路径，并以安全协议流式返回音频文件。
