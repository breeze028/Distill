import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseManager } from '@main/database/database';

let tmpDir = '';
let dbManager: DatabaseManager;
const originalEnv = {
  DISTILL_ALLOW_MOCK_STT: process.env.DISTILL_ALLOW_MOCK_STT,
  DISTILL_STT_PROVIDER: process.env.DISTILL_STT_PROVIDER,
  DISTILL_ALLOW_MOCK_LLM: process.env.DISTILL_ALLOW_MOCK_LLM,
  DISTILL_LLM_PROVIDER: process.env.DISTILL_LLM_PROVIDER
};

beforeEach(() => {
  delete process.env.DISTILL_ALLOW_MOCK_STT;
  delete process.env.DISTILL_STT_PROVIDER;
  delete process.env.DISTILL_ALLOW_MOCK_LLM;
  delete process.env.DISTILL_LLM_PROVIDER;
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'distill-settings-'));
  dbManager = new DatabaseManager(path.join(tmpDir, 'test.db'), path.join(process.cwd(), 'src', 'main', 'database', 'migrations'));
});

afterEach(() => {
  dbManager.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  restoreEnv();
  vi.resetModules();
});

describe('SettingsRepository', () => {
  it('uses Python STT by default in normal builds', async () => {
    const repository = await createRepository();

    const settings = repository.getSettings();

    expect(settings.aiProvider).toBe('deepseek');
    expect(settings.speechProvider).toBe('python');
    expect(settings.speechModel).toBe('faster-whisper-tiny');
    expect(settings.mockSpeechProviderEnabled).toBe(false);
  });

  it('normalizes a previously saved mock STT provider unless mock is explicitly enabled', async () => {
    const db = dbManager.open();
    db.prepare('INSERT INTO app_setting (key, value, updated_at) VALUES (?, ?, ?)').run('speechProvider', 'mock', new Date().toISOString());
    const repository = await createRepository();

    const settings = repository.getSettings();

    expect(settings.speechProvider).toBe('python');
    expect(settings.mockSpeechProviderEnabled).toBe(false);
  });

  it('keeps mock STT available for explicit test and development runs', async () => {
    process.env.DISTILL_STT_PROVIDER = 'mock';
    const repository = await createRepository();

    const settings = repository.getSettings();

    expect(settings.speechProvider).toBe('mock');
    expect(settings.mockSpeechProviderEnabled).toBe(true);
  });

  it('keeps mock LLM available only for explicit test and development runs', async () => {
    const db = dbManager.open();
    db.prepare('INSERT INTO app_setting (key, value, updated_at) VALUES (?, ?, ?)').run('aiProvider', 'mock', new Date().toISOString());
    let repository = await createRepository();
    expect(repository.getSettings().aiProvider).toBe('deepseek');

    process.env.DISTILL_LLM_PROVIDER = 'mock';
    repository = await createRepository();
    expect(repository.getSettings().aiProvider).toBe('mock');
  });

  it('upgrades the legacy DeepSeek chat model to the current default', async () => {
    const db = dbManager.open();
    db.prepare('INSERT INTO app_setting (key, value, updated_at) VALUES (?, ?, ?)').run('deepSeekModel', 'deepseek-chat', new Date().toISOString());
    const repository = await createRepository();

    expect(repository.getSettings().deepSeekModel).toBe('deepseek-v4-flash');
  });

  it('keeps an explicitly configured DeepSeek model', async () => {
    const db = dbManager.open();
    db.prepare('INSERT INTO app_setting (key, value, updated_at) VALUES (?, ?, ?)').run('deepSeekModel', 'deepseek-v4-pro', new Date().toISOString());
    const repository = await createRepository();

    expect(repository.getSettings().deepSeekModel).toBe('deepseek-v4-pro');
  });
});

async function createRepository() {
  vi.resetModules();
  const { SettingsRepository } = await import('@main/settings/settingsRepository');
  return new SettingsRepository(dbManager.open());
}

function restoreEnv(): void {
  setOptionalEnv('DISTILL_ALLOW_MOCK_STT', originalEnv.DISTILL_ALLOW_MOCK_STT);
  setOptionalEnv('DISTILL_STT_PROVIDER', originalEnv.DISTILL_STT_PROVIDER);
  setOptionalEnv('DISTILL_ALLOW_MOCK_LLM', originalEnv.DISTILL_ALLOW_MOCK_LLM);
  setOptionalEnv('DISTILL_LLM_PROVIDER', originalEnv.DISTILL_LLM_PROVIDER);
}

function setOptionalEnv(
  key: 'DISTILL_ALLOW_MOCK_STT' | 'DISTILL_STT_PROVIDER' | 'DISTILL_ALLOW_MOCK_LLM' | 'DISTILL_LLM_PROVIDER',
  value: string | undefined
): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
