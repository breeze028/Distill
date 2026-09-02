# Distill

Distill 是一个 Windows 桌面语音笔记客户端，用于导入 iPhone「语音备忘录」等外部音频文件，并在本地保存录音、转写、AI 笔记和设置。数据默认保存在 SQLite 中。

## 当前状态

第 0 阶段已完成 Electron 应用初始化，并实现了一个很小但完整的纵向闭环：

- 导入 `.m4a`、`.mp3` 或 `.wav`
- 将 `Recording` 持久化到 SQLite
- 在资料库中展示录音
- 点击录音进入录音详情
- 播放原始音频文件

Whisper 转写和 DeepSeek 生成目前已有接口、schema 和数据模型，但还没有接入真实执行流程。

## 运行

```powershell
pnpm install
pnpm dev
```

## 验证

```powershell
pnpm test
pnpm build
```

## 项目文档

- [产品说明](docs/PRODUCT.md)
- [长期计划](docs/ROADMAP.md)
- [完成情况](docs/STATUS.md)
- [架构说明](docs/ARCHITECTURE.md)
- [开发说明](docs/DEVELOPMENT.md)
- [AI 开发指南](AGENTS.md)

## 环境变量

只在本地开发时创建 `.env`，用于保存开发密钥：

```env
DEEPSEEK_API_KEY=
```

不要提交 `.env` 或任何真实 API Key。
