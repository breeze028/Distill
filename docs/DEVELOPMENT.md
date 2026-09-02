# 开发

## 常用命令

```powershell
pnpm install
pnpm dev
pnpm test
pnpm build
```

`better-sqlite3` 是原生依赖。Forge 在应用打包时会把打包依赖 rebuild 到 Electron ABI；`pnpm test` 会在运行测试前把本地依赖 rebuild 回 Node/Vitest ABI。

## 本地转写环境

默认开发模式使用 mock STT，便于不下载模型也能跑通 UI、数据库和测试。

启用真实 faster-whisper：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r python\requirements.txt
$env:DISTILL_PYTHON_COMMAND = ".\.venv\Scripts\python.exe"
pnpm dev
```

然后在 Settings 中把 `Speech-to-Text Provider` 改为 `Python Worker`。

可选环境变量：

- `DISTILL_STT_PROVIDER`：首次启动时的默认 provider，可设为 `python`。
- `DISTILL_WHISPER_MODEL`：默认 `small`，也接受 UI 设置中的 `faster-whisper-small` 形式。
- `DISTILL_WHISPER_DEVICE`：默认 `auto`。
- `DISTILL_WHISPER_COMPUTE_TYPE`：默认 `int8`。

自动化测试不会调用真实 faster-whisper，也不会下载模型。

## 项目结构

```text
src/
  main/
    database/
    ipc/
    llm/
    logging/
    repositories/
    services/
    settings/
    stt/
  preload/
  renderer/
    components/
    stores/
  shared/
    schemas/
    types/
python/
  worker/
tests/
docs/
```

## 添加数据库字段

在 `src/main/database/migrations` 下创建新的编号 SQL 文件。旧 migration 一经提交，不要修改。

## 测试说明

自动化测试中使用 mock STT 和 mock LLM。单元测试不要调用 DeepSeek 或 faster-whisper。

## 打包说明

第 0 阶段，Forge packaging 暂时关闭 `asar`，便于诊断原生 SQLite 问题。只有在验证 `better-sqlite3` unpack 规则、production `node_modules` 打包和 packaged migration 查找逻辑后，才重新启用 `asar`。
