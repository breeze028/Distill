import { contextBridge, ipcRenderer } from 'electron';
import { ipcChannels, type DistillApi } from '@shared/ipc';

const api: DistillApi = {
  listRecordings: () => ipcRenderer.invoke(ipcChannels.recordingsList),
  getRecording: (id) => ipcRenderer.invoke(ipcChannels.recordingsGet, id),
  importRecordingFromDialog: () => ipcRenderer.invoke(ipcChannels.recordingsImportDialog),
  importRecordingFromPath: (filePath) => ipcRenderer.invoke(ipcChannels.recordingsImportPath, { filePath }),
  transcribeRecording: (id) => ipcRenderer.invoke(ipcChannels.recordingsTranscribe, id),
  searchRecordings: (query) => ipcRenderer.invoke(ipcChannels.recordingsSearch, query),
  getSettings: () => ipcRenderer.invoke(ipcChannels.settingsGet),
  saveSettings: (settings) => ipcRenderer.invoke(ipcChannels.settingsSave, settings),
  getSpeechToTextStatus: () => ipcRenderer.invoke(ipcChannels.sttStatus)
};

contextBridge.exposeInMainWorld('distillAPI', api);
