import type { AppSettings, ImportRecordingResult, RecordingDetail, RecordingListItem } from './types/domain';
import type { SaveSettingsRequest } from './schemas/ipc';

export const ipcChannels = {
  recordingsList: 'recordings:list',
  recordingsGet: 'recordings:get',
  recordingsImportDialog: 'recordings:import-dialog',
  recordingsImportPath: 'recordings:import-path',
  recordingsSearch: 'recordings:search',
  settingsGet: 'settings:get',
  settingsSave: 'settings:save'
} as const;

export type DistillApi = {
  listRecordings(): Promise<RecordingListItem[]>;
  getRecording(id: string): Promise<RecordingDetail | null>;
  importRecordingFromDialog(): Promise<ImportRecordingResult | null>;
  importRecordingFromPath(filePath: string): Promise<ImportRecordingResult>;
  searchRecordings(query: string): Promise<RecordingListItem[]>;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: SaveSettingsRequest): Promise<AppSettings>;
};

declare global {
  interface Window {
    distillAPI: DistillApi;
  }
}
