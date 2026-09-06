import type { AIArtifactTemplate, AppSettings, ImportRecordingResult, RecordingCalendarDay, RecordingDetail, RecordingListItem, SpeechToTextStatus, WatchFolderStatus } from './types/domain';
import type { CalendarMonthRequest, DeleteAIArtifactRequest, EditTranscriptSegmentRequest, RecordingDateRequest, SaveSettingsRequest } from './schemas/ipc';

export const ipcChannels = {
  recordingsList: 'recordings:list',
  recordingsGet: 'recordings:get',
  recordingsImportDialog: 'recordings:import-dialog',
  recordingsImportPath: 'recordings:import-path',
  recordingsGetCalendarMonth: 'recordings:get-calendar-month',
  recordingsListByDate: 'recordings:list-by-date',
  recordingsStartTranscription: 'recordings:start-transcription',
  recordingsTranscribe: 'recordings:transcribe',
  recordingsEditTranscriptSegment: 'recordings:edit-transcript-segment',
  recordingsStartAIGeneration: 'recordings:start-ai-generation',
  recordingsDeleteAIArtifact: 'recordings:delete-ai-artifact',
  aiTemplatesList: 'ai-templates:list',
  recordingsSearch: 'recordings:search',
  libraryChanged: 'library:changed',
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  settingsSelectAudioLibraryFolder: 'settings:select-audio-library-folder',
  audioLibraryFolderStatus: 'audio-library-folder:status',
  sttStatus: 'stt:status'
} as const;

export type DistillApi = {
  listRecordings(): Promise<RecordingListItem[]>;
  getRecording(id: string): Promise<RecordingDetail | null>;
  importRecordingFromDialog(): Promise<ImportRecordingResult | null>;
  importRecordingFromPath(filePath: string): Promise<ImportRecordingResult>;
  getCalendarMonth(input: CalendarMonthRequest): Promise<RecordingCalendarDay[]>;
  listRecordingsByDate(input: RecordingDateRequest): Promise<RecordingListItem[]>;
  getPathForFile(file: File): string;
  startTranscription(id: string): Promise<RecordingDetail>;
  transcribeRecording(id: string): Promise<RecordingDetail>;
  editTranscriptSegment(input: EditTranscriptSegmentRequest): Promise<RecordingDetail>;
  startAIGeneration(recordingId: string, templateId?: string): Promise<RecordingDetail>;
  deleteAIArtifact(input: DeleteAIArtifactRequest): Promise<RecordingDetail>;
  listAITemplates(): Promise<AIArtifactTemplate[]>;
  searchRecordings(query: string): Promise<RecordingListItem[]>;
  onLibraryChanged(callback: () => void): () => void;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: SaveSettingsRequest): Promise<AppSettings>;
  selectAudioLibraryFolder(): Promise<string | null>;
  getAudioLibraryFolderStatus(): Promise<WatchFolderStatus>;
  getSpeechToTextStatus(): Promise<SpeechToTextStatus>;
};

declare global {
  interface Window {
    distillAPI: DistillApi;
  }
}
