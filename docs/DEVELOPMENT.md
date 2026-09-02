# 开发

## 常用命令

```powershell
pnpm install
pnpm dev
pnpm test
pnpm build
```

`better-sqlite3` 是原生依赖。Forge 在应用打包时会把打包依赖 rebuild 到 Electron ABI；`pnpm test` 会在运行测试前把本地依赖 rebuild 回 Node/Vitest ABI。

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
