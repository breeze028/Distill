import type { AIArtifactTemplate, AppSettings, DeleteRecordingResult, ImportRecordingResult, LibraryCalendarDay, LibraryItem, NoteDetail, NoteImageImportResult, RecordingCalendarDay, RecordingDetail, RecordingListItem, SpeechToTextStatus, WatchFolderStatus } from './types/domain';
import type { CalendarMonthRequest, CreateNoteRequest, DeleteAIArtifactRequest, EditTranscriptSegmentRequest, NoteIdRequest, NoteImagePathRequest, RecordingDateRequest, RecordingIdRequest, SaveSettingsRequest, UpdateNoteRequest } from './schemas/ipc';

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
  recordingsShowInFolder: 'recordings:show-in-folder',
  recordingsDelete: 'recordings:delete',
  recordingsStartAIGeneration: 'recordings:start-ai-generation',
  recordingsDeleteAIArtifact: 'recordings:delete-ai-artifact',
  aiTemplatesList: 'ai-templates:list',
  recordingsSearch: 'recordings:search',
  libraryList: 'library:list',
  librarySearch: 'library:search',
  libraryGetCalendarMonth: 'library:get-calendar-month',
  libraryListByDate: 'library:list-by-date',
  notesCreate: 'notes:create',
  notesGet: 'notes:get',
  notesUpdate: 'notes:update',
  notesDelete: 'notes:delete',
  notesImportImageDialog: 'notes:import-image-dialog',
  notesImportImagePath: 'notes:import-image-path',
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
  showRecordingInFolder(input: RecordingIdRequest): Promise<void>;
  deleteRecording(input: RecordingIdRequest): Promise<DeleteRecordingResult>;
  startAIGeneration(recordingId: string, templateId?: string): Promise<RecordingDetail>;
  deleteAIArtifact(input: DeleteAIArtifactRequest): Promise<RecordingDetail>;
  listAITemplates(): Promise<AIArtifactTemplate[]>;
  searchRecordings(query: string): Promise<RecordingListItem[]>;
  listLibraryItems(): Promise<LibraryItem[]>;
  searchLibraryItems(query: string): Promise<LibraryItem[]>;
  getLibraryCalendarMonth(input: CalendarMonthRequest): Promise<LibraryCalendarDay[]>;
  listLibraryItemsByDate(input: RecordingDateRequest): Promise<LibraryItem[]>;
  createNote(input?: CreateNoteRequest): Promise<NoteDetail>;
  getNote(input: NoteIdRequest): Promise<NoteDetail | null>;
  updateNote(input: UpdateNoteRequest): Promise<NoteDetail>;
  deleteNote(input: NoteIdRequest): Promise<void>;
  importNoteImageFromDialog(): Promise<NoteImageImportResult | null>;
  importNoteImageFromPath(input: NoteImagePathRequest): Promise<NoteImageImportResult>;
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
