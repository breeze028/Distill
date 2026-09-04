import type { AIArtifactTemplate, AppSettings, ImportRecordingResult, RecordingDetail, RecordingListItem, SpeechToTextStatus, WatchFolderStatus } from './types/domain';
import type { SaveSettingsRequest } from './schemas/ipc';

export const ipcChannels = {
  recordingsList: 'recordings:list',
  recordingsGet: 'recordings:get',
  recordingsImportDialog: 'recordings:import-dialog',
  recordingsImportPath: 'recordings:import-path',
  recordingsStartTranscription: 'recordings:start-transcription',
  recordingsTranscribe: 'recordings:transcribe',
  recordingsStartAIGeneration: 'recordings:start-ai-generation',
  aiTemplatesList: 'ai-templates:list',
  recordingsSearch: 'recordings:search',
  libraryChanged: 'library:changed',
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  watchFolderStatus: 'watch-folder:status',
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
  startAIGeneration(recordingId: string, templateId?: string): Promise<RecordingDetail>;
  listAITemplates(): Promise<AIArtifactTemplate[]>;
  searchRecordings(query: string): Promise<RecordingListItem[]>;
  onLibraryChanged(callback: () => void): () => void;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: SaveSettingsRequest): Promise<AppSettings>;
  getWatchFolderStatus(): Promise<WatchFolderStatus>;
  getSpeechToTextStatus(): Promise<SpeechToTextStatus>;
};

declare global {
  interface Window {
    distillAPI: DistillApi;
  }
}
