# Distill AI 开发指南

Distill 是一个本地优先的 Windows 桌面语音笔记资料库。核心对象是 `Recording`；AI 是整理层，不是产品中心。

## 产品边界

- 输入来自外部导入的音频，主要是 iPhone「语音备忘录」生成的 `.m4a` 文件。
- 本应用不是 Windows 录音机、SaaS 仪表盘、聊天机器人、后端服务或协作产品。
- 核心工作流是：导入、转写、阅读、回听、理解、整理、搜索。

## 架构

- 技术栈：Electron、React、TypeScript、Vite、Tailwind CSS、shadcn/ui 约定、Zustand、Zod、SQLite、better-sqlite3、Vitest、Playwright、Electron Forge、pnpm。
- Renderer 不允许直接访问 Node、SQLite、文件系统 API、API Key 或任意 IPC channel。
- Preload 只暴露类型化的 `window.distillAPI`。
- Main 负责数据库、导入、设置、LLM provider、STT worker、日志、文件访问和应用密钥。
- 为 `LLMProvider`、`SpeechToTextService` 和未来的 `SecretStorage` 保持可替换边界。

## 数据规则

- 原始 Transcript 必须永久保留。AI 输出绝不能覆盖 Transcript 原文。
- 使用 `AIArtifact`，不要使用 `Recording.summary`，因为同一条录音可以有多个模板和多次重新生成的版本。
- 长时间运行的任务必须记录到 `ProcessingJob`；不要只把重要处理状态保存在 React 内存中。
- 数据库 schema 修改必须通过 `src/main/database/migrations` 下的 SQL migration 完成。
- 不要为了正常 schema 变更要求用户删除数据库。

## 密钥处理

- 绝不提交真实 API Key。
- 绝不把 API Key 暴露给 renderer bundle 或 UI 日志。
- `.env.example` 只能包含空 key。
- 日志必须隐藏 token、secret、authorization header 和 API Key。

## UI 原则

- 构建安静的桌面生产力软件，可以参考 Apple Notes、Bear、Things、Voice Memos、Obsidian 的信息密度和现代 Windows 应用。
- 避免 SaaS 仪表盘、装饰性指标卡、大 hero 区、大面积渐变、重阴影和噪声 badge。
- 优先使用 typography、alignment、细分隔线、可读的 transcript 排版、稳定尺寸和较高信息密度。
- 至少测试 1366x768；目标平台是桌面端。

## 测试

- 使用 Vitest 覆盖 database、repository、AI JSON parsing、template、import logic、duplicate detection 和 search。
- 自动化测试中必须 mock 付费 API 和 Whisper。
- UI 行为有明显变化时，使用 Playwright 做有意义的验收。
- 汇报完成前，尽量运行相关 test 和 build 命令。

## 开发流程

- 较大修改前先阅读本文件。
- 修改保持聚焦，并维护现有架构边界。
- 优先直接实现并验证，不要让用户手动编码。
- 架构发生变化时，同步更新架构文档。
- 完成较大阶段或改变核心流程后，同步更新 `docs/ROADMAP.md` 和 `docs/STATUS.md`。
