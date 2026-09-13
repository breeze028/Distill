# Distill

Distill 是一个本地优先的 Windows 桌面语音笔记资料库。它适合把 iPhone「语音备忘录」或其他外部音频导入电脑，保存原始录音、转写文本、AI 笔记和手写文本笔记，再用 Library、Calendar、Search 和 Ask Distill 慢慢回看。

它不是录音机、云同步产品或通用聊天机器人。当前重点是：导入已有音频、转写、阅读、回听、整理和基于自己资料做只读问答。

## 现在能做什么

- 导入 `.m4a`、`.mp3`、`.wav` 音频，也可以把音频文件拖进窗口。
- 将新音频复制到你选择的音频库文件夹，并在 Library 中展示。
- 使用本地 Python Worker + faster-whisper 转写录音。
- 在录音详情页播放音频、阅读 transcript，并点击 transcript 片段跳转播放。
- 人工修正 transcript segment；原始机器转写版本会保留。
- 基于 transcript 生成 AI 笔记，并保留历史版本。
- 新建文本笔记，支持基础富文本、任务列表、链接、本地图片和自动保存。
- 使用 Calendar 按日期查看录音和笔记。
- 使用 Ask Distill 对全部资料库或当前项目提问；它会展示来源，并可点击跳回对应录音或笔记。
- 调整主界面栏宽、Ask Distill 面板宽度，并把 Ask Distill 切到全屏。

## 当前限制

- 目前主要面向本地开发和 Windows 桌面验证，还不是正式发布版安装包。
- 首次真实转写需要安装 Python 依赖，并可能下载 faster-whisper 模型。
- `small` / `medium` 模型在普通 CPU 上可能很慢，新手建议先用 `tiny` 或 `base`。
- Ask Distill 当前是只读助手，不会替你改写、删除或创建资料。
- Ask Distill 使用 SQLite FTS5 和有限的中文查询 fallback，还没有接入向量搜索。
- 当前 UI 仍有一些英文文案。
- API Key 当前用于本地开发配置；不要提交 `.env` 或任何真实密钥。

## 准备环境

你需要先安装：

- Windows 电脑
- Git
- Node.js `20.11` 或更高版本
- pnpm `9` 或更高版本
- Python 3，用于真实语音转写

确认版本：

```powershell
node -v
pnpm -v
python --version
```

如果 `pnpm` 不存在，可以先启用 Corepack：

```powershell
corepack enable
corepack prepare pnpm@latest --activate
```

## 第一次运行

在项目目录里安装依赖：

```powershell
pnpm install
```

如果你想使用真实语音转写，先安装本地 STT 环境：

```powershell
pnpm setup:stt
```

这个命令会在项目内创建 Python 虚拟环境并安装 faster-whisper 相关依赖。只是想先看看界面的话，可以暂时跳过这一步。

启动开发版应用：

```powershell
pnpm dev
```

## 第一次打开后怎么用

1. 进入 `Settings`，选择一个音频库文件夹。之后导入的音频副本会放在这里。
2. 在 `Settings` 里确认 STT provider 和模型。新手建议从 `faster-whisper-tiny` 或 `faster-whisper-base` 开始。
3. 如果要使用 AI 笔记或 Ask Distill 的真实模型能力，配置 DeepSeek API Key。没有 key 时，导入、播放、文本笔记和本地资料库仍然可以使用。
4. 回到 `Library`，点击 `Import`，或把 `.m4a`、`.mp3`、`.wav` 文件拖进窗口。
5. 打开一条录音，等待自动转写，或点击转写按钮手动开始。
6. 转写完成后，在右侧阅读 transcript；点击某一段可以从对应时间播放音频。
7. 在 Summary 区域生成 AI 笔记。多次生成会形成历史版本。
8. 点击 `New Note` 可以写普通文本笔记，笔记会自动保存到本地数据库。
9. 打开 `Ask Distill`，选择 `All Library` 或 `Current Item` 后提问。输入框里 `Enter` 发送，`Shift + Enter` 或 `Alt + Enter` 换行。

## 常见问题

### 转写一直很慢

首次使用 faster-whisper 时可能需要下载模型；下载和模型加载都会让第一次等待更久。普通 CPU 上建议先用 `tiny` 或 `base`，确认流程跑通后再尝试更大的模型。

### 转写失败

先到 `Settings` 里检查 STT 状态。常见原因是 Python 没装好、`pnpm setup:stt` 没跑成功，或模型下载被网络中断。

### AI 笔记或 Ask Distill 失败

检查 DeepSeek API Key 是否配置正确，以及当前网络是否能访问模型服务。自动化测试会使用 mock，不会调用真实付费 API。

### 打包时报 `EBUSY`

如果 `out\distill-win32-x64` 被旧的 `distill.exe` 占用，先关闭正在运行的 Distill 窗口，再重新执行打包命令。开发时也可以在任务管理器里结束残留的 `distill.exe`。

## 开发常用命令

```powershell
pnpm dev
pnpm lint
pnpm test
pnpm build
```

可选验证：

```powershell
pnpm smoke:stt
node tests\e2e\assistant-smoke.cjs
```

说明：

- `pnpm dev`：启动 Electron 开发版。
- `pnpm lint`：运行 TypeScript 类型检查。
- `pnpm test`：重建 `better-sqlite3` 并运行 Vitest。
- `pnpm build`：使用 Electron Forge 打包。
- `pnpm smoke:stt`：验证真实 Python Worker 转写链路。
- `node tests\e2e\assistant-smoke.cjs`：验证 Ask Distill、Markdown 渲染、来源跳转、快捷键和面板尺寸行为。

## 本地开发环境变量

只在本地开发时创建 `.env`，不要提交这个文件。

```env
DEEPSEEK_API_KEY=
```

常用调试变量：

```powershell
$env:DISTILL_ALLOW_MOCK_STT = "true"
$env:DISTILL_STT_PROVIDER = "mock"
$env:DISTILL_ALLOW_MOCK_LLM = "true"
$env:DISTILL_LLM_PROVIDER = "mock"
```

mock provider 只用于开发和测试，不建议写入普通使用说明或真实资料库流程。

## 数据和安全

- 原始 transcript 会保留，AI 输出不会覆盖 transcript 原文。
- AI 笔记保存在 `AIArtifact` 中，同一条录音可以有多个生成版本。
- 手写文本笔记保存在本地 SQLite 数据库中，不会自动同步到云端。
- Renderer 不直接访问 Node、SQLite、文件系统或 API Key。
- 真实 API Key 不应出现在 Git、日志或截图里。

## 项目文档

- [产品说明](docs/PRODUCT.md)
- [长期计划](docs/ROADMAP.md)
- [完成情况](docs/STATUS.md)
- [架构说明](docs/ARCHITECTURE.md)
- [开发说明](docs/DEVELOPMENT.md)
- [AI 开发指南](AGENTS.md)
