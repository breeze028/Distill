export type ProcessingState = 'pending' | 'running' | 'succeeded' | 'failed';
export type ProcessingJobKind = 'import' | 'transcription' | 'ai';

export type RecordingListItem = {
  id: string;
  title: string;
  originalFileName: string;
  filePath: string;
  fileSize: number;
  format: string;
  duration: number | null;
  importedAt: string;
  createdAt: string | null;
  processingState: ProcessingState;
  tags: string[];
};

export type RichTextDocument = {
  type: string;
  content?: unknown[];
  [key: string]: unknown;
};

export type NoteListItem = {
  id: string;
  title: string;
  plainTextPreview: string;
  createdAt: string;
  updatedAt: string;
};

export type NoteDetail = NoteListItem & {
  contentJson: RichTextDocument;
  plainText: string;
};

export type RecordingLibraryItem = RecordingListItem & {
  kind: 'recording';
  sortAt: string;
  preview: string;
};

export type NoteLibraryItem = NoteListItem & {
  kind: 'note';
  sortAt: string;
  preview: string;
};

export type LibraryItem = RecordingLibraryItem | NoteLibraryItem;

export type RecordingCalendarDay = {
  date: string;
  recordingCount: number;
  totalDuration: number | null;
};

export type LibraryCalendarDay = RecordingCalendarDay & {
  noteCount: number;
  itemCount: number;
};

export type NoteImageImportResult = {
  src: string;
  fileName: string;
};

export type TranscriptSegment = {
  id: string;
  transcriptId: string;
  startTime: number;
  endTime: number;
  text: string;
};

export type Transcript = {
  id: string;
  recordingId: string;
  language: string | null;
  duration: number | null;
  provider: SpeechToTextProvider | null;
  model: string | null;
  sourceJobId: string | null;
  fullText: string;
  createdAt: string;
  segments: TranscriptSegment[];
};

export type AIArtifactContent = {
  title: string;
  summary: string;
  keyPoints: string[];
  todos: string[];
  tags: string[];
};

export type AIArtifact = {
  id: string;
  recordingId: string;
  templateId: string;
  provider: string;
  model: string;
  promptVersion: string;
  content: AIArtifactContent;
  rawResponse: string | null;
  createdAt: string;
};

export type AIArtifactTemplate = {
  id: string;
  name: string;
  description: string;
  promptVersion: string;
};

export type ProcessingJob = {
  id: string;
  recordingId: string;
  kind: ProcessingJobKind;
  state: ProcessingState;
  errorMessage: string | null;
  errorDetail: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type RecordingDetail = RecordingListItem & {
  transcript: Transcript | null;
  latestArtifact: AIArtifact | null;
  artifacts: AIArtifact[];
  jobs: ProcessingJob[];
};

export type ImportRecordingResult = {
  recording: RecordingDetail;
  wasDuplicate: boolean;
};

export type DeleteRecordingResult = {
  recordingId: string;
  fileMovedToTrash: boolean;
};

export type AppSettings = {
  aiProvider: string;
  deepSeekApiKeyConfigured: boolean;
  deepSeekModel: string;
  watchFolder: string;
  speechProvider: SpeechToTextProvider;
  speechModel: string;
  autoTranscribeOnImport: boolean;
  mockSpeechProviderEnabled: boolean;
};

export type SpeechToTextProvider = 'mock' | 'python';

export type SpeechToTextStatus = {
  provider: SpeechToTextProvider;
  ready: boolean;
  checkedAt: string;
  modelName: string;
  device: string | null;
  computeType: string | null;
  pythonCommand: string | null;
  workerPath: string | null;
  pythonVersion: string | null;
  fasterWhisperVersion: string | null;
  errorMessage: string | null;
  setupHint: string | null;
};

export type WatchFolderStatus = {
  folderPath: string;
  running: boolean;
  errorMessage: string | null;
  lastEventAt: string | null;
};

export type ImportableAudioFormat = 'm4a' | 'mp3' | 'wav';

export type AgentScope =
  | {
      kind: 'all';
    }
  | {
      kind: 'current';
      item: {
        kind: 'recording' | 'note';
        id: string;
      };
    };

export type AgentSource =
  | {
      kind: 'recording';
      recordingId: string;
      title: string;
      date: string;
      segmentId?: string;
      startTime?: number;
      snippet?: string;
    }
  | {
      kind: 'note';
      noteId: string;
      title: string;
      date: string;
      snippet?: string;
    };

export type AgentUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type AgentTraceStep = {
  step: number;
  type: 'model' | 'tool';
  model?: string;
  toolName?: string;
  arguments?: unknown;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  usage?: AgentUsage;
};

export type AgentConversation = {
  id: string;
  title: string | null;
  scope: AgentScope;
  createdAt: string;
  updatedAt: string;
};

export type AgentConversationMessage = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  sources: AgentSource[];
  createdAt: string;
};

export type AgentConversationDetail = AgentConversation & {
  messages: AgentConversationMessage[];
};

export type AgentRunResult = {
  conversation: AgentConversationDetail;
  answer: string;
  sources: AgentSource[];
  trace: AgentTraceStep[];
  usage?: AgentUsage;
};
