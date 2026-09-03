import { create } from 'zustand';
import type { AppSettings, RecordingDetail, RecordingListItem, SpeechToTextStatus } from '@shared/types/domain';

type ViewMode = 'library' | 'inbox' | 'settings';

type LibraryState = {
  recordings: RecordingListItem[];
  selectedRecording: RecordingDetail | null;
  settings: AppSettings | null;
  speechToTextStatus: SpeechToTextStatus | null;
  query: string;
  viewMode: ViewMode;
  loading: boolean;
  importing: boolean;
  checkingSpeechToText: boolean;
  transcribingIds: Record<string, boolean>;
  error: string | null;
  load(): Promise<void>;
  selectRecording(id: string): Promise<void>;
  importFromDialog(): Promise<void>;
  importFromPath(filePath: string): Promise<void>;
  importFromPaths(filePaths: string[]): Promise<void>;
  transcribeRecording(id: string): Promise<void>;
  search(query: string): Promise<void>;
  showLibrary(): void;
  showInbox(): Promise<void>;
  showSettings(): Promise<void>;
  saveSettings(settings: Parameters<typeof window.distillAPI.saveSettings>[0]): Promise<void>;
  refreshSpeechToTextStatus(): Promise<void>;
  pollRecordingUntilIdle(id: string): Promise<void>;
};

export const useLibraryStore = create<LibraryState>((set, get) => ({
  recordings: [],
  selectedRecording: null,
  settings: null,
  speechToTextStatus: null,
  query: '',
  viewMode: 'library',
  loading: false,
  importing: false,
  checkingSpeechToText: false,
  transcribingIds: {},
  error: null,

  async load() {
    set({ loading: true, error: null });
    try {
      const [recordings, settings, speechToTextStatus] = await Promise.all([
        window.distillAPI.listRecordings(),
        window.distillAPI.getSettings(),
        window.distillAPI.getSpeechToTextStatus()
      ]);
      const selected = get().selectedRecording;
      set({
        recordings,
        settings,
        speechToTextStatus,
        selectedRecording: selected && recordings.some((item) => item.id === selected.id) ? selected : null,
        loading: false
      });
    } catch (error) {
      set({ error: toMessage(error), loading: false });
    }
  },

  async selectRecording(id) {
    set({ loading: true, error: null, viewMode: 'library' });
    try {
      const recording = await window.distillAPI.getRecording(id);
      set({ selectedRecording: recording, loading: false });
    } catch (error) {
      set({ error: toMessage(error), loading: false });
    }
  },

  async importFromDialog() {
    set({ importing: true, error: null, viewMode: 'library' });
    try {
      const result = await window.distillAPI.importRecordingFromDialog();
      if (result) {
        const recordings = await window.distillAPI.listRecordings();
        set({ recordings, selectedRecording: result.recording });
        if (hasRunningTranscription(result.recording)) {
          void get().pollRecordingUntilIdle(result.recording.id);
        }
      }
    } catch (error) {
      set({ error: toMessage(error) });
    } finally {
      set({ importing: false });
    }
  },

  async importFromPath(filePath) {
    set({ importing: true, error: null, viewMode: 'library' });
    try {
      const result = await window.distillAPI.importRecordingFromPath(filePath);
      const recordings = await window.distillAPI.listRecordings();
      set({ recordings, selectedRecording: result.recording });
      if (hasRunningTranscription(result.recording)) {
        void get().pollRecordingUntilIdle(result.recording.id);
      }
    } catch (error) {
      set({ error: toMessage(error) });
    } finally {
      set({ importing: false });
    }
  },

  async importFromPaths(filePaths) {
    const uniquePaths = [...new Set(filePaths)];
    if (uniquePaths.length === 0) {
      return;
    }

    set({ importing: true, error: null, viewMode: 'library' });
    try {
      let selectedRecording: RecordingDetail | null = null;
      for (const filePath of uniquePaths) {
        const result = await window.distillAPI.importRecordingFromPath(filePath);
        selectedRecording = result.recording;
        if (hasRunningTranscription(result.recording)) {
          void get().pollRecordingUntilIdle(result.recording.id);
        }
      }

      const recordings = await window.distillAPI.listRecordings();
      set({ recordings, selectedRecording });
    } catch (error) {
      set({ error: toMessage(error) });
    } finally {
      set({ importing: false });
    }
  },

  async transcribeRecording(id) {
    set((state) => ({
      transcribingIds: { ...state.transcribingIds, [id]: true },
      error: null,
      viewMode: 'library'
    }));
    try {
      const recording = await window.distillAPI.transcribeRecording(id);
      const recordings = await window.distillAPI.listRecordings();
      set({ recordings, selectedRecording: recording });
    } catch (error) {
      const recording = await window.distillAPI.getRecording(id).catch(() => null);
      const recordings = await window.distillAPI.listRecordings().catch(() => get().recordings);
      set({ error: toMessage(error), selectedRecording: recording, recordings });
    } finally {
      set((state) => {
        const { [id]: _finished, ...remaining } = state.transcribingIds;
        return { transcribingIds: remaining };
      });
    }
  },

  async search(query) {
    set({ query, error: null, viewMode: 'library' });
    try {
      const recordings = await window.distillAPI.searchRecordings(query);
      set({ recordings });
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  showLibrary() {
    set({ viewMode: 'library', error: null });
  },

  async showInbox() {
    const nextMode = get().viewMode === 'inbox' ? 'library' : 'inbox';
    set({ viewMode: nextMode, error: null });
    if (nextMode === 'inbox') {
      try {
        const settings = await window.distillAPI.getSettings();
        set({ settings });
      } catch (error) {
        set({ error: toMessage(error) });
      }
    }
  },

  async showSettings() {
    const nextMode = get().viewMode === 'settings' ? 'library' : 'settings';
    set({ viewMode: nextMode, error: null });
    if (nextMode === 'settings') {
      try {
        const [settings, speechToTextStatus] = await Promise.all([
          window.distillAPI.getSettings(),
          window.distillAPI.getSpeechToTextStatus()
        ]);
        set({ settings, speechToTextStatus });
      } catch (error) {
        set({ error: toMessage(error) });
      }
    }
  },

  async saveSettings(settings) {
    set({ error: null });
    try {
      const saved = await window.distillAPI.saveSettings(settings);
      const speechToTextStatus = await window.distillAPI.getSpeechToTextStatus();
      set({ settings: saved, speechToTextStatus });
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  async refreshSpeechToTextStatus() {
    set({ checkingSpeechToText: true, error: null });
    try {
      const speechToTextStatus = await window.distillAPI.getSpeechToTextStatus();
      set({ speechToTextStatus });
    } catch (error) {
      set({ error: toMessage(error) });
    } finally {
      set({ checkingSpeechToText: false });
    }
  },

  async pollRecordingUntilIdle(id) {
    set((state) => ({
      transcribingIds: { ...state.transcribingIds, [id]: true }
    }));

    try {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await delay(1000);
        const [recording, recordings] = await Promise.all([
          window.distillAPI.getRecording(id),
          window.distillAPI.listRecordings()
        ]);
        set({
          recordings,
          selectedRecording: get().selectedRecording?.id === id ? recording : get().selectedRecording
        });

        if (!recording || !hasRunningTranscription(recording)) {
          break;
        }
      }
    } catch (error) {
      set({ error: toMessage(error) });
    } finally {
      set((state) => {
        const { [id]: _finished, ...remaining } = state.transcribingIds;
        return { transcribingIds: remaining };
      });
    }
  }
}));

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function hasRunningTranscription(recording: RecordingDetail): boolean {
  return recording.jobs.some((job) => job.kind === 'transcription' && job.state === 'running');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
