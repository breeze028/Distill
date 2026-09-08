import fs from 'node:fs/promises';
import path from 'node:path';
import { dialog, ipcMain, shell } from 'electron';
import { ipcChannels } from '@shared/ipc';
import type { ImportRecordingResult, LibraryCalendarDay, LibraryItem, NoteListItem, RecordingCalendarDay, RecordingListItem } from '@shared/types/domain';
import { calendarMonthRequestSchema, createNoteRequestSchema, deleteAIArtifactRequestSchema, editTranscriptSegmentRequestSchema, generateAIArtifactRequestSchema, importRecordingRequestSchema, noteIdRequestSchema, noteImagePathRequestSchema, recordingDateRequestSchema, recordingIdRequestSchema, saveSettingsRequestSchema, updateNoteRequestSchema } from '@shared/schemas/ipc';
import type { FileImportService } from '@main/services/fileImportService';
import type { TranscriptionService } from '@main/services/transcriptionService';
import type { AIArtifactService } from '@main/services/aiArtifactService';
import type { RecordingRepository } from '@main/repositories/recordingRepository';
import type { NoteRepository } from '@main/repositories/noteRepository';
import type { SettingsRepository } from '@main/settings/settingsRepository';
import type { SpeechToTextService } from '@main/stt/types';
import { listBuiltInTemplateMetadata } from '@main/llm/templates';
import type { WatchFolderService } from '@main/services/watchFolderService';
import type { NoteAssetService } from '@main/services/noteAssetService';

export function registerIpcHandlers(dependencies: {
  recordings: RecordingRepository;
  notes: NoteRepository;
  noteAssets: NoteAssetService;
  importer: FileImportService;
  transcriber: TranscriptionService;
  aiArtifacts: AIArtifactService;
  settings: SettingsRepository;
  speechToText: SpeechToTextService;
  watchFolder: WatchFolderService;
}): void {
  ipcMain.handle(ipcChannels.recordingsList, () => dependencies.recordings.listRecordings());

  ipcMain.handle(ipcChannels.recordingsGet, (_event, id: string) => dependencies.recordings.getRecording(id));

  async function importAndMaybeTranscribe(filePath: string): Promise<ImportRecordingResult> {
    const audioLibraryFolder = await ensureAudioLibraryFolder();
    if (!audioLibraryFolder) {
      throw new Error('需要先选择音频库文件夹。');
    }

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

  ipcMain.handle(ipcChannels.recordingsGetCalendarMonth, (_event, input: unknown) => {
    const parsed = calendarMonthRequestSchema.parse(input);
    return dependencies.recordings.getCalendarMonth(parsed.year, parsed.month);
  });

  ipcMain.handle(ipcChannels.recordingsListByDate, (_event, input: unknown) => {
    const parsed = recordingDateRequestSchema.parse(input);
    return dependencies.recordings.listRecordingsByDate(parsed.date);
  });

  ipcMain.handle(ipcChannels.recordingsStartTranscription, (_event, id: string) => dependencies.transcriber.startTranscription(id));

  ipcMain.handle(ipcChannels.recordingsTranscribe, (_event, id: string) => dependencies.transcriber.transcribeRecording(id));

  ipcMain.handle(ipcChannels.recordingsEditTranscriptSegment, (_event, input: unknown) => {
    const parsed = editTranscriptSegmentRequestSchema.parse(input);
    return dependencies.recordings.editTranscriptSegment(parsed.recordingId, parsed.transcriptId, parsed.segmentId, parsed.text);
  });

  ipcMain.handle(ipcChannels.recordingsShowInFolder, (_event, input: unknown) => {
    const parsed = recordingIdRequestSchema.parse(input);
    const recording = dependencies.recordings.getRecording(parsed.recordingId);
    if (!recording) {
      throw new Error('Recording was not found.');
    }

    shell.showItemInFolder(recording.filePath);
  });

  ipcMain.handle(ipcChannels.recordingsDelete, async (_event, input: unknown) => {
    const parsed = recordingIdRequestSchema.parse(input);
    const recording = dependencies.recordings.getRecording(parsed.recordingId);
    if (!recording) {
      throw new Error('Recording was not found.');
    }

    let fileMovedToTrash = false;
    const audioLibraryFolder = dependencies.settings.getSettings().watchFolder.trim();
    if (audioLibraryFolder && isPathInsideDirectory(recording.filePath, audioLibraryFolder) && await fileExists(recording.filePath)) {
      await shell.trashItem(recording.filePath);
      fileMovedToTrash = true;
    }

    dependencies.recordings.deleteRecording(parsed.recordingId);
    return { recordingId: parsed.recordingId, fileMovedToTrash };
  });

  ipcMain.handle(ipcChannels.recordingsStartAIGeneration, (_event, input: unknown) => {
    const parsed = generateAIArtifactRequestSchema.parse(input);
    return dependencies.aiArtifacts.startGeneration(parsed.recordingId, parsed.templateId);
  });

  ipcMain.handle(ipcChannels.recordingsDeleteAIArtifact, (_event, input: unknown) => {
    const parsed = deleteAIArtifactRequestSchema.parse(input);
    return dependencies.recordings.deleteAIArtifact(parsed.recordingId, parsed.artifactId);
  });

  ipcMain.handle(ipcChannels.aiTemplatesList, () => listBuiltInTemplateMetadata());

  ipcMain.handle(ipcChannels.recordingsSearch, (_event, query: string) => dependencies.recordings.search(query));

  ipcMain.handle(ipcChannels.libraryList, () => listLibraryItems(dependencies.recordings.listRecordings(), dependencies.notes.listNotes()));

  ipcMain.handle(ipcChannels.librarySearch, (_event, query: string) => {
    const trimmed = typeof query === 'string' ? query.trim() : '';
    if (!trimmed) {
      return listLibraryItems(dependencies.recordings.listRecordings(), dependencies.notes.listNotes());
    }
    return listLibraryItems(dependencies.recordings.search(trimmed), dependencies.notes.search(trimmed));
  });

  ipcMain.handle(ipcChannels.libraryGetCalendarMonth, (_event, input: unknown) => {
    const parsed = calendarMonthRequestSchema.parse(input);
    return mergeCalendarDays(
      dependencies.recordings.getCalendarMonth(parsed.year, parsed.month),
      dependencies.notes.getCalendarMonth(parsed.year, parsed.month)
    );
  });

  ipcMain.handle(ipcChannels.libraryListByDate, (_event, input: unknown) => {
    const parsed = recordingDateRequestSchema.parse(input);
    return listLibraryItems(
      dependencies.recordings.listRecordingsByDate(parsed.date),
      dependencies.notes.listNotesByDate(parsed.date)
    );
  });

  ipcMain.handle(ipcChannels.notesCreate, (_event, input: unknown) => {
    const parsed = createNoteRequestSchema.parse(input ?? {});
    return dependencies.notes.createNote(parsed);
  });

  ipcMain.handle(ipcChannels.notesGet, (_event, input: unknown) => {
    const parsed = noteIdRequestSchema.parse(input);
    return dependencies.notes.getNote(parsed.noteId);
  });

  ipcMain.handle(ipcChannels.notesUpdate, (_event, input: unknown) => {
    const parsed = updateNoteRequestSchema.parse(input);
    return dependencies.notes.updateNote(parsed.noteId, {
      title: parsed.title,
      contentJson: parsed.contentJson,
      plainText: parsed.plainText
    });
  });

  ipcMain.handle(ipcChannels.notesDelete, (_event, input: unknown) => {
    const parsed = noteIdRequestSchema.parse(input);
    dependencies.notes.deleteNote(parsed.noteId);
  });

  ipcMain.handle(ipcChannels.notesImportImageDialog, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Insert Photo',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }]
    });

    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    return dependencies.noteAssets.importImage(result.filePaths[0]);
  });

  ipcMain.handle(ipcChannels.notesImportImagePath, (_event, input: unknown) => {
    const parsed = noteImagePathRequestSchema.parse(input);
    return dependencies.noteAssets.importImage(parsed.filePath);
  });

  ipcMain.handle(ipcChannels.settingsGet, () => dependencies.settings.getSettings());

  ipcMain.handle(ipcChannels.settingsSave, async (_event, input: unknown) => {
    const parsed = saveSettingsRequestSchema.parse(input);
    const saved = dependencies.settings.saveSettings(parsed);
    await dependencies.watchFolder.refresh();
    return saved;
  });

  ipcMain.handle(ipcChannels.settingsSelectAudioLibraryFolder, async () => {
    return selectAudioLibraryFolder();
  });

  ipcMain.handle(ipcChannels.audioLibraryFolderStatus, () => dependencies.watchFolder.getStatus());

  ipcMain.handle(ipcChannels.sttStatus, () => dependencies.speechToText.getStatus());

  async function ensureAudioLibraryFolder(): Promise<string | null> {
    const currentWatchFolder = dependencies.settings.getSettings().watchFolder.trim();
    if (currentWatchFolder) {
      return currentWatchFolder;
    }

    const selectedFolder = await selectAudioLibraryFolder();
    if (!selectedFolder) {
      return null;
    }

    dependencies.settings.saveSettings({ watchFolder: selectedFolder });
    await dependencies.watchFolder.refresh();
    return selectedFolder;
  }

  async function selectAudioLibraryFolder(): Promise<string | null> {
    const currentWatchFolder = dependencies.settings.getSettings().watchFolder.trim();
    const result = await dialog.showOpenDialog({
      title: 'Choose Audio Library Folder',
      defaultPath: currentWatchFolder || undefined,
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    return result.filePaths[0];
  }
}

function listLibraryItems(recordings: RecordingListItem[], notes: NoteListItem[]): LibraryItem[] {
  return [
    ...recordings.map((recording) => ({
      ...recording,
      kind: 'recording' as const,
      sortAt: recording.importedAt,
      preview: recording.originalFileName
    })),
    ...notes.map((note) => ({
      ...note,
      kind: 'note' as const,
      sortAt: note.updatedAt,
      preview: note.plainTextPreview
    }))
  ].sort((left, right) => new Date(right.sortAt).getTime() - new Date(left.sortAt).getTime());
}

function mergeCalendarDays(recordingDays: RecordingCalendarDay[], noteDays: Array<{ date: string; noteCount: number }>): LibraryCalendarDay[] {
  const days = new Map<string, LibraryCalendarDay>();

  for (const day of recordingDays) {
    days.set(day.date, {
      ...day,
      noteCount: 0,
      itemCount: day.recordingCount
    });
  }

  for (const day of noteDays) {
    const current = days.get(day.date) ?? {
      date: day.date,
      recordingCount: 0,
      noteCount: 0,
      itemCount: 0,
      totalDuration: null
    };
    current.noteCount += day.noteCount;
    current.itemCount += day.noteCount;
    days.set(day.date, current);
  }

  return [...days.values()].sort((left, right) => left.date.localeCompare(right.date));
}

async function fileExists(filePath: string): Promise<boolean> {
  return fs.stat(filePath).then((stat) => stat.isFile()).catch(() => false);
}

function isPathInsideDirectory(filePath: string, directoryPath: string): boolean {
  const relativePath = path.relative(path.resolve(directoryPath), path.resolve(filePath));
  return relativePath.length > 0 && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}
