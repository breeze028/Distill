import type { SqliteDatabase } from '@main/database/database';
import type { AppSettings, SpeechToTextProvider } from '@shared/types/domain';
import type { SaveSettingsRequest } from '@shared/schemas/ipc';

const defaults: AppSettings = {
  aiProvider: defaultAIProvider(),
  deepSeekApiKeyConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
  deepSeekModel: 'deepseek-v4-flash',
  watchFolder: '',
  speechProvider: defaultSpeechProvider(),
  speechModel: 'faster-whisper-tiny',
  autoTranscribeOnImport: true,
  mockSpeechProviderEnabled: isMockSpeechToTextAllowed()
};

export class SettingsRepository {
  constructor(private readonly db: SqliteDatabase) {}

  getSettings(): AppSettings {
    const rows = this.db.prepare('SELECT key, value FROM app_setting').all() as Array<{ key: string; value: string }>;
    const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));

    return {
      aiProvider: normalizeAIProvider(values.aiProvider),
      deepSeekApiKeyConfigured: Boolean(values.deepSeekApiKey) || defaults.deepSeekApiKeyConfigured,
      deepSeekModel: values.deepSeekModel ?? defaults.deepSeekModel,
      watchFolder: values.watchFolder ?? defaults.watchFolder,
      speechProvider: normalizeSpeechProvider(values.speechProvider),
      speechModel: values.speechModel ?? defaults.speechModel,
      autoTranscribeOnImport: values.autoTranscribeOnImport === undefined ? defaults.autoTranscribeOnImport : values.autoTranscribeOnImport === 'true',
      mockSpeechProviderEnabled: isMockSpeechToTextAllowed()
    };
  }

  saveSettings(input: SaveSettingsRequest): AppSettings {
    const now = new Date().toISOString();
    const save = this.db.prepare(
      `INSERT INTO app_setting (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    );

    const write = this.db.transaction(() => {
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) {
          save.run(key, String(value), now);
        }
      }
    });

    write();
    return this.getSettings();
  }

  getSecret(key: 'deepSeekApiKey'): string {
    const row = this.db.prepare('SELECT value FROM app_setting WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value || process.env.DEEPSEEK_API_KEY || '';
  }
}

function defaultSpeechProvider(): SpeechToTextProvider {
  return process.env.DISTILL_STT_PROVIDER === 'mock' && isMockSpeechToTextAllowed() ? 'mock' : 'python';
}

function defaultAIProvider(): string {
  return process.env.DISTILL_LLM_PROVIDER === 'mock' && isMockLLMAllowed() ? 'mock' : 'deepseek';
}

function normalizeAIProvider(value: string | undefined): string {
  if (value === 'mock' && isMockLLMAllowed()) {
    return 'mock';
  }
  if (value === 'mock') {
    return 'deepseek';
  }
  return value === 'deepseek' ? 'deepseek' : defaults.aiProvider;
}

function normalizeSpeechProvider(value: string | undefined): SpeechToTextProvider {
  if (value === 'mock' && isMockSpeechToTextAllowed()) {
    return 'mock';
  }
  if (value === 'mock') {
    return 'python';
  }
  return value === 'python' ? 'python' : defaults.speechProvider;
}

function isMockSpeechToTextAllowed(): boolean {
  return process.env.DISTILL_ALLOW_MOCK_STT === 'true' || process.env.DISTILL_STT_PROVIDER === 'mock';
}

function isMockLLMAllowed(): boolean {
  return process.env.DISTILL_ALLOW_MOCK_LLM === 'true' || process.env.DISTILL_LLM_PROVIDER === 'mock';
}
