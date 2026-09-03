import type { AppSettings, ImportRecordingResult, RecordingDetail, RecordingListItem, SpeechToTextStatus } from './types/domain';
import type { SaveSettingsRequest } from './schemas/ipc';

export const ipcChannels = {
  recordingsList: 'recordings:list',
  recordingsGet: 'recordings:get',
  recordingsImportDialog: 'recordings:import-dialog',
  recordingsImportPath: 'recordings:import-path',
  recordingsStartTranscription: 'recordings:start-transcription',
  recordingsTranscribe: 'recordings:transcribe',
  recordingsSearch: 'recordings:search',
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  sttStatus: 'stt:status'
} as const;

export type DistillApi = {
  listRecordings(): Promise<RecordingListItem[]>;
  getRecording(id: string): Promise<RecordingDetail | null>;
  importRecordingFromDialog(): Promise<ImportRecordingResult | null>;
  importRecordingFromPath(filePath: string): Promise<ImportRecordingResult>;
  getPathForFile(file: File): string;
  startTranscription(id: string): Promise<RecordingDetail>;
  transcribeRecording(id: string): Promise<RecordingDetail>;
  searchRecordings(query: string): Promise<RecordingListItem[]>;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: SaveSettingsRequest): Promise<AppSettings>;
  getSpeechToTextStatus(): Promise<SpeechToTextStatus>;
};

declare global {
  interface Window {
    distillAPI: DistillApi;
  }
}
