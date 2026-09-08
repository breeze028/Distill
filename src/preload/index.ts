import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { ipcChannels, type DistillApi } from '@shared/ipc';

const api: DistillApi = {
  listRecordings: () => ipcRenderer.invoke(ipcChannels.recordingsList),
  getRecording: (id) => ipcRenderer.invoke(ipcChannels.recordingsGet, id),
  importRecordingFromDialog: () => ipcRenderer.invoke(ipcChannels.recordingsImportDialog),
  importRecordingFromPath: (filePath) => ipcRenderer.invoke(ipcChannels.recordingsImportPath, { filePath }),
  getCalendarMonth: (input) => ipcRenderer.invoke(ipcChannels.recordingsGetCalendarMonth, input),
  listRecordingsByDate: (input) => ipcRenderer.invoke(ipcChannels.recordingsListByDate, input),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  startTranscription: (id) => ipcRenderer.invoke(ipcChannels.recordingsStartTranscription, id),
  transcribeRecording: (id) => ipcRenderer.invoke(ipcChannels.recordingsTranscribe, id),
  editTranscriptSegment: (input) => ipcRenderer.invoke(ipcChannels.recordingsEditTranscriptSegment, input),
  showRecordingInFolder: (input) => ipcRenderer.invoke(ipcChannels.recordingsShowInFolder, input),
  deleteRecording: (input) => ipcRenderer.invoke(ipcChannels.recordingsDelete, input),
  startAIGeneration: (recordingId, templateId = 'default-summary') => ipcRenderer.invoke(ipcChannels.recordingsStartAIGeneration, { recordingId, templateId }),
  deleteAIArtifact: (input) => ipcRenderer.invoke(ipcChannels.recordingsDeleteAIArtifact, input),
  listAITemplates: () => ipcRenderer.invoke(ipcChannels.aiTemplatesList),
  searchRecordings: (query) => ipcRenderer.invoke(ipcChannels.recordingsSearch, query),
  listLibraryItems: () => ipcRenderer.invoke(ipcChannels.libraryList),
  searchLibraryItems: (query) => ipcRenderer.invoke(ipcChannels.librarySearch, query),
  getLibraryCalendarMonth: (input) => ipcRenderer.invoke(ipcChannels.libraryGetCalendarMonth, input),
  listLibraryItemsByDate: (input) => ipcRenderer.invoke(ipcChannels.libraryListByDate, input),
  createNote: (input = {}) => ipcRenderer.invoke(ipcChannels.notesCreate, input),
  getNote: (input) => ipcRenderer.invoke(ipcChannels.notesGet, input),
  updateNote: (input) => ipcRenderer.invoke(ipcChannels.notesUpdate, input),
  deleteNote: (input) => ipcRenderer.invoke(ipcChannels.notesDelete, input),
  importNoteImageFromDialog: () => ipcRenderer.invoke(ipcChannels.notesImportImageDialog),
  importNoteImageFromPath: (input) => ipcRenderer.invoke(ipcChannels.notesImportImagePath, input),
  onLibraryChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on(ipcChannels.libraryChanged, listener);
    return () => ipcRenderer.removeListener(ipcChannels.libraryChanged, listener);
  },
  getSettings: () => ipcRenderer.invoke(ipcChannels.settingsGet),
  saveSettings: (settings) => ipcRenderer.invoke(ipcChannels.settingsSave, settings),
  selectAudioLibraryFolder: () => ipcRenderer.invoke(ipcChannels.settingsSelectAudioLibraryFolder),
  getAudioLibraryFolderStatus: () => ipcRenderer.invoke(ipcChannels.audioLibraryFolderStatus),
  getSpeechToTextStatus: () => ipcRenderer.invoke(ipcChannels.sttStatus)
};

contextBridge.exposeInMainWorld('distillAPI', api);
