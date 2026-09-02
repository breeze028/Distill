import { create } from 'zustand';
import type { AppSettings, RecordingDetail, RecordingListItem } from '@shared/types/domain';

type ViewMode = 'library' | 'inbox' | 'settings';

type LibraryState = {
  recordings: RecordingListItem[];
  selectedRecording: RecordingDetail | null;
  settings: AppSettings | null;
  query: string;
  viewMode: ViewMode;
  loading: boolean;
  importing: boolean;
  error: string | null;
  load(): Promise<void>;
  selectRecording(id: string): Promise<void>;
  importFromDialog(): Promise<void>;
  importFromPath(filePath: string): Promise<void>;
  search(query: string): Promise<void>;
  showLibrary(): void;
  showInbox(): Promise<void>;
  showSettings(): Promise<void>;
  saveSettings(settings: Parameters<typeof window.distillAPI.saveSettings>[0]): Promise<void>;
};

export const useLibraryStore = create<LibraryState>((set, get) => ({
  recordings: [],
  selectedRecording: null,
  settings: null,
  query: '',
  viewMode: 'library',
  loading: false,
  importing: false,
  error: null,

  async load() {
    set({ loading: true, error: null });
    try {
      const [recordings, settings] = await Promise.all([window.distillAPI.listRecordings(), window.distillAPI.getSettings()]);
      const selected = get().selectedRecording;
      set({
        recordings,
        settings,
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
    } catch (error) {
      set({ error: toMessage(error) });
    } finally {
      set({ importing: false });
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
        const settings = await window.distillAPI.getSettings();
        set({ settings });
      } catch (error) {
        set({ error: toMessage(error) });
      }
    }
  },

  async saveSettings(settings) {
    set({ error: null });
    try {
      const saved = await window.distillAPI.saveSettings(settings);
      set({ settings: saved });
    } catch (error) {
      set({ error: toMessage(error) });
    }
  }
}));

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
