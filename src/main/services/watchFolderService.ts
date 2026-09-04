import fs from 'node:fs';
import path from 'node:path';
import type { WatchFolderStatus } from '@shared/types/domain';
import type { FileImportService } from '@main/services/fileImportService';
import type { TranscriptionService } from '@main/services/transcriptionService';
import type { SettingsRepository } from '@main/settings/settingsRepository';
import { logger } from '@main/logging/logger';

type WatchFolderOptions = {
  debounceMs?: number;
  settleMs?: number;
  onImported?: (recordingId: string) => void;
};

const supportedAudioExtensions = new Set(['.m4a', '.mp3', '.wav']);

export class WatchFolderService {
  private watcher: fs.FSWatcher | null = null;
  private pendingImports = new Map<string, ReturnType<typeof setTimeout>>();
  private status: WatchFolderStatus = {
    folderPath: '',
    running: false,
    errorMessage: null,
    lastEventAt: null
  };

  private readonly debounceMs: number;
  private readonly settleMs: number;
  private readonly onImported: ((recordingId: string) => void) | undefined;

  constructor(
    private readonly settings: SettingsRepository,
    private readonly importer: FileImportService,
    private readonly transcriber: TranscriptionService,
    options: WatchFolderOptions = {}
  ) {
    this.debounceMs = options.debounceMs ?? 750;
    this.settleMs = options.settleMs ?? 750;
    this.onImported = options.onImported;
  }

  getStatus(): WatchFolderStatus {
    return { ...this.status };
  }

  async refresh(): Promise<WatchFolderStatus> {
    const folderPath = this.settings.getSettings().watchFolder.trim();
    if (folderPath === this.status.folderPath && this.watcher && this.status.running) {
      return this.getStatus();
    }

    this.closeWatcher();
    this.status = {
      folderPath,
      running: false,
      errorMessage: null,
      lastEventAt: this.status.lastEventAt
    };

    if (!folderPath) {
      return this.getStatus();
    }

    try {
      const stats = await fs.promises.stat(folderPath);
      if (!stats.isDirectory()) {
        this.status.errorMessage = 'Watch Folder 不是有效文件夹。';
        return this.getStatus();
      }

      this.watcher = fs.watch(folderPath, (_eventType, fileName) => {
        this.status.lastEventAt = new Date().toISOString();
        if (fileName) {
          this.scheduleImport(path.join(folderPath, fileName.toString()));
        } else {
          void this.scanFolder(folderPath);
        }
      });

      this.watcher.on('error', (error) => {
        this.status.running = false;
        this.status.errorMessage = error.message;
        logger.error('WatchFolder', 'Watcher failed', { folderPath, error: error.message });
      });

      this.status.running = true;
      logger.info('WatchFolder', 'Started watching folder', { folderPath });
      await this.scanFolder(folderPath);
    } catch (error) {
      this.status.errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('WatchFolder', 'Could not start watch folder', { folderPath, error: this.status.errorMessage });
    }

    return this.getStatus();
  }

  stop(): void {
    this.closeWatcher();
    this.status.running = false;
  }

  private async scanFolder(folderPath: string): Promise<void> {
    try {
      const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          this.scheduleImport(path.join(folderPath, entry.name));
        }
      }
    } catch (error) {
      this.status.errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('WatchFolder', 'Could not scan watch folder', { folderPath, error: this.status.errorMessage });
    }
  }

  private scheduleImport(filePath: string): void {
    if (!isSupportedAudioFile(filePath)) {
      return;
    }

    const key = path.normalize(filePath).toLowerCase();
    const existing = this.pendingImports.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.pendingImports.delete(key);
      void this.importWhenStable(filePath);
    }, this.debounceMs);
    this.pendingImports.set(key, timer);
  }

  private async importWhenStable(filePath: string): Promise<void> {
    if (!(await this.isStableFile(filePath))) {
      return;
    }

    try {
      const result = await this.importer.importFile(filePath);
      this.status.lastEventAt = new Date().toISOString();
      this.status.errorMessage = null;
      if (!result.wasDuplicate && this.settings.getSettings().autoTranscribeOnImport) {
        this.transcriber.startTranscription(result.recording.id);
      }
      if (!result.wasDuplicate) {
        this.onImported?.(result.recording.id);
      }
    } catch (error) {
      this.status.errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('WatchFolder', 'Could not import watched file', { filePath, error: this.status.errorMessage });
    }
  }

  private async isStableFile(filePath: string): Promise<boolean> {
    try {
      const first = await fs.promises.stat(filePath);
      if (!first.isFile() || first.size === 0) {
        return false;
      }

      await new Promise((resolve) => setTimeout(resolve, this.settleMs));
      const second = await fs.promises.stat(filePath);
      return second.isFile() && second.size === first.size && second.mtimeMs === first.mtimeMs;
    } catch {
      return false;
    }
  }

  private closeWatcher(): void {
    this.watcher?.close();
    this.watcher = null;
    for (const timer of this.pendingImports.values()) {
      clearTimeout(timer);
    }
    this.pendingImports.clear();
  }
}

function isSupportedAudioFile(filePath: string): boolean {
  return supportedAudioExtensions.has(path.extname(filePath).toLowerCase());
}
