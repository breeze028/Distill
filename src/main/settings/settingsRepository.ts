import type { SqliteDatabase } from '@main/database/database';
import type { AppSettings } from '@shared/types/domain';
import type { SaveSettingsRequest } from '@shared/schemas/ipc';

const defaults: AppSettings = {
  aiProvider: 'deepseek',
  deepSeekApiKeyConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
  deepSeekModel: 'deepseek-chat',
  watchFolder: '',
  speechProvider: process.env.DISTILL_STT_PROVIDER === 'python' ? 'python' : 'mock',
  speechModel: 'faster-whisper-small'
};

export class SettingsRepository {
  constructor(private readonly db: SqliteDatabase) {}

  getSettings(): AppSettings {
    const rows = this.db.prepare('SELECT key, value FROM app_setting').all() as Array<{ key: string; value: string }>;
    const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));

    return {
      aiProvider: values.aiProvider ?? defaults.aiProvider,
      deepSeekApiKeyConfigured: Boolean(values.deepSeekApiKey) || defaults.deepSeekApiKeyConfigured,
      deepSeekModel: values.deepSeekModel ?? defaults.deepSeekModel,
      watchFolder: values.watchFolder ?? defaults.watchFolder,
      speechProvider: values.speechProvider === 'python' ? 'python' : values.speechProvider === 'mock' ? 'mock' : defaults.speechProvider,
      speechModel: values.speechModel ?? defaults.speechModel
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
          save.run(key, value, now);
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
