import { dialog, ipcMain } from 'electron';
import { ipcChannels } from '@shared/ipc';
import type { ImportRecordingResult } from '@shared/types/domain';
import { importRecordingRequestSchema, saveSettingsRequestSchema } from '@shared/schemas/ipc';
import type { FileImportService } from '@main/services/fileImportService';
import type { TranscriptionService } from '@main/services/transcriptionService';
import type { RecordingRepository } from '@main/repositories/recordingRepository';
import type { SettingsRepository } from '@main/settings/settingsRepository';
import type { SpeechToTextService } from '@main/stt/types';

export function registerIpcHandlers(dependencies: {
  recordings: RecordingRepository;
  importer: FileImportService;
  transcriber: TranscriptionService;
  settings: SettingsRepository;
  speechToText: SpeechToTextService;
}): void {
  ipcMain.handle(ipcChannels.recordingsList, () => dependencies.recordings.listRecordings());

  ipcMain.handle(ipcChannels.recordingsGet, (_event, id: string) => dependencies.recordings.getRecording(id));

  async function importAndMaybeTranscribe(filePath: string): Promise<ImportRecordingResult> {
    const result = await dependencies.importer.importFile(filePath);
    if (result.wasDuplicate || !dependencies.settings.getSettings().autoTranscribeOnImport) {
      return result;
    }

    return {
      ...result,
      recording: dependencies.transcriber.startTranscription(result.recording.id)
    };
  }

  ipcMain.handle(ipcChannels.recordingsImportDialog, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import Recording',
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['m4a', 'mp3', 'wav'] }]
    });

    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    return importAndMaybeTranscribe(result.filePaths[0]);
  });

  ipcMain.handle(ipcChannels.recordingsImportPath, (_event, input: unknown) => {
    const parsed = importRecordingRequestSchema.parse(input);
    return importAndMaybeTranscribe(parsed.filePath);
  });

  ipcMain.handle(ipcChannels.recordingsTranscribe, (_event, id: string) => dependencies.transcriber.transcribeRecording(id));

  ipcMain.handle(ipcChannels.recordingsSearch, (_event, query: string) => dependencies.recordings.search(query));

  ipcMain.handle(ipcChannels.settingsGet, () => dependencies.settings.getSettings());

  ipcMain.handle(ipcChannels.settingsSave, (_event, input: unknown) => {
    const parsed = saveSettingsRequestSchema.parse(input);
    return dependencies.settings.saveSettings(parsed);
  });

  ipcMain.handle(ipcChannels.sttStatus, () => dependencies.speechToText.getStatus());
}
