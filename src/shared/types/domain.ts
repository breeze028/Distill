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
  jobs: ProcessingJob[];
};

export type ImportRecordingResult = {
  recording: RecordingDetail;
  wasDuplicate: boolean;
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

export type ImportableAudioFormat = 'm4a' | 'mp3' | 'wav';
