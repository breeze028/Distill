import { app, BrowserWindow, Menu, net, protocol } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import started from 'electron-squirrel-startup';
import { DatabaseManager } from '@main/database/database';
import { RecordingRepository } from '@main/repositories/recordingRepository';
import { FileImportService } from '@main/services/fileImportService';
import { TranscriptionService } from '@main/services/transcriptionService';
import { AIArtifactService } from '@main/services/aiArtifactService';
import { WatchFolderService } from '@main/services/watchFolderService';
import { SettingsRepository } from '@main/settings/settingsRepository';
import { registerIpcHandlers } from '@main/ipc/registerIpc';
import { ipcChannels } from '@shared/ipc';
import { builtInTemplates } from '@main/llm/templates';
import { DeepSeekProvider } from '@main/llm/deepSeekProvider';
import { MockLLMProvider } from '@main/llm/mockProvider';
import { SelectableLLMProvider } from '@main/llm/selectableLLMProvider';
import { logger } from '@main/logging/logger';
import { MockSpeechToTextService } from '@main/stt/mockSpeechToTextService';
import { PythonSpeechToTextService } from '@main/stt/pythonSpeechToTextService';
import { SelectableSpeechToTextService } from '@main/stt/selectableSpeechToTextService';
import { createAudioRangeResponse, resolveAudioRange } from '@main/audio/audioRange';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

if (started) {
  app.quit();
}

let databaseManager: DatabaseManager | null = null;
let recordings: RecordingRepository | null = null;
let watchFolderService: WatchFolderService | null = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'distill-audio',
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true
    }
  }
]);

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    title: 'Distill',
    autoHideMenuBar: true,
    backgroundColor: '#f7f6f3',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.setMenuBarVisibility(false);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  databaseManager = new DatabaseManager();
  const db = databaseManager.open();
  recordings = new RecordingRepository(db);
  const settings = new SettingsRepository(db);
  const importer = new FileImportService(recordings);
  const speechToText = new SelectableSpeechToTextService(settings, {
    mock: new MockSpeechToTextService(),
    python: new PythonSpeechToTextService({ modelName: () => settings.getSettings().speechModel })
  });
  const transcriber = new TranscriptionService(recordings, speechToText);
  const llm = new SelectableLLMProvider(settings, {
    deepseek: new DeepSeekProvider(() => settings.getSecret('deepSeekApiKey')),
    mock: new MockLLMProvider()
  });
  const aiArtifacts = new AIArtifactService(recordings, llm, settings);
  watchFolderService = new WatchFolderService(settings, importer, transcriber, {
    onImported: notifyLibraryChanged
  });

  const recoveredJobCount = recordings.recoverInterruptedJobs();
  if (recoveredJobCount > 0) {
    logger.warn('ProcessingJob', 'Recovered interrupted jobs on startup', { recoveredJobCount });
  }
  recordings.ensureBuiltInTemplates([...builtInTemplates]);
  registerIpcHandlers({ recordings, importer, transcriber, aiArtifacts, settings, speechToText, watchFolder: watchFolderService });
  void watchFolderService.refresh();
  registerAudioProtocol();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    watchFolderService?.stop();
    databaseManager?.close();
    app.quit();
  }
});

function registerAudioProtocol(): void {
  protocol.handle('distill-audio', async (request) => {
    const url = new URL(request.url);
    const id = url.hostname === 'recording' ? url.pathname.replace(/^\//, '') : '';
    const recording = id && recordings ? recordings.getRecording(id) : null;

    if (!recording || !fs.existsSync(recording.filePath)) {
      logger.warn('Audio', 'Audio file is missing', { recordingId: id });
      return new Response('Audio file not found.', { status: 404 });
    }

    const fileSize = fs.statSync(recording.filePath).size;
    const range = resolveAudioRange(request.headers.get('range'), fileSize);
    if (range.status === 206) {
      return createAudioRangeResponse(recording.filePath, range, request.method);
    }

    if (range.status === 416) {
      return new Response(null, {
        status: 416,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes */${fileSize}`
        }
      });
    }

    return net.fetch(pathToFileURL(recording.filePath).toString());
  });
}

function notifyLibraryChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(ipcChannels.libraryChanged);
  }
}
