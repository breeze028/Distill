import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { ipcChannels, type DistillApi } from '@shared/ipc';

const api: DistillApi = {
  listRecordings: () => ipcRenderer.invoke(ipcChannels.recordingsList),
  getRecording: (id) => ipcRenderer.invoke(ipcChannels.recordingsGet, id),
  importRecordingFromDialog: () => ipcRenderer.invoke(ipcChannels.recordingsImportDialog),
  importRecordingFromPath: (filePath) => ipcRenderer.invoke(ipcChannels.recordingsImportPath, { filePath }),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  startTranscription: (id) => ipcRenderer.invoke(ipcChannels.recordingsStartTranscription, id),
  transcribeRecording: (id) => ipcRenderer.invoke(ipcChannels.recordingsTranscribe, id),
  startAIGeneration: (recordingId, templateId = 'default-summary') => ipcRenderer.invoke(ipcChannels.recordingsStartAIGeneration, { recordingId, templateId }),
  listAITemplates: () => ipcRenderer.invoke(ipcChannels.aiTemplatesList),
  searchRecordings: (query) => ipcRenderer.invoke(ipcChannels.recordingsSearch, query),
  onLibraryChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on(ipcChannels.libraryChanged, listener);
    return () => ipcRenderer.removeListener(ipcChannels.libraryChanged, listener);
  },
  getSettings: () => ipcRenderer.invoke(ipcChannels.settingsGet),
  saveSettings: (settings) => ipcRenderer.invoke(ipcChannels.settingsSave, settings),
  getWatchFolderStatus: () => ipcRenderer.invoke(ipcChannels.watchFolderStatus),
  getSpeechToTextStatus: () => ipcRenderer.invoke(ipcChannels.sttStatus)
};

contextBridge.exposeInMainWorld('distillAPI', api);
