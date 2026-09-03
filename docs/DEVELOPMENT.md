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

默认开发模式使用 Python Worker。为了避免真实用户录音被占位文字污染，mock STT 只在显式环境变量开启时可见。

启用真实 faster-whisper：

```powershell
pnpm setup:stt
pnpm dev
```

如果未设置 `DISTILL_PYTHON_COMMAND`，应用会优先使用源码目录下的 `python\.venv\Scripts\python.exe`。从 `out\distill-win32-x64\distill.exe` 手动启动打包应用时，也会从 packaged `resources` 路径回溯到项目 venv。

启用 mock STT 做 UI/数据库流程测试：

```powershell
$env:DISTILL_ALLOW_MOCK_STT = "true"
$env:DISTILL_STT_PROVIDER = "mock"
pnpm dev
```

验证打包应用里的真实 STT 链路：

```powershell
pnpm build
pnpm smoke:stt
```

可选环境变量：

- `DISTILL_PYTHON_COMMAND`：显式指定 Python 可执行文件；不设置时会优先发现 `python\.venv\Scripts\python.exe`。
- `DISTILL_ALLOW_MOCK_STT`：设为 `true` 时允许 UI/测试使用 mock STT。
- `DISTILL_STT_PROVIDER`：首次启动时的默认 provider，可设为 `python`；设为 `mock` 时也会开放 mock STT。
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
