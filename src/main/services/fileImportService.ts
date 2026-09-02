import fs from 'node:fs/promises';
import path from 'node:path';
import { parseFile } from 'music-metadata';
import type { ImportRecordingResult, ImportableAudioFormat } from '@shared/types/domain';
import type { RecordingRepository } from '@main/repositories/recordingRepository';
import { logger } from '@main/logging/logger';

export type AudioMetadataReader = (filePath: string) => Promise<{ duration: number | null; format: string | null }>;

const supportedFormats = new Set<ImportableAudioFormat>(['m4a', 'mp3', 'wav']);

export class FileImportService {
  constructor(
    private readonly recordings: RecordingRepository,
    private readonly readAudioMetadata: AudioMetadataReader = defaultAudioMetadataReader
  ) {}

  async importFile(filePath: string): Promise<ImportRecordingResult> {
    const absolutePath = path.resolve(filePath);
    const extension = path.extname(absolutePath).slice(1).toLowerCase();

    if (!supportedFormats.has(extension as ImportableAudioFormat)) {
      throw new Error(`Unsupported audio format: .${extension || 'unknown'}`);
    }

    const stat = await fs.stat(absolutePath);
    if (!stat.isFile()) {
      throw new Error('Selected path is not a file.');
    }

    const normalizedPath = normalizeFilePath(absolutePath);
    const duplicate = this.recordings.findDuplicate(normalizedPath, stat.size, Math.trunc(stat.mtimeMs));
    if (duplicate) {
      logger.info('Import', 'Skipped duplicate recording', { filePath: absolutePath });
      return { recording: duplicate, wasDuplicate: true };
    }

    const metadata = await this.readAudioMetadata(absolutePath);
    const title = path.basename(absolutePath, path.extname(absolutePath));
    const recording = this.recordings.createRecording({
      title,
      originalFileName: path.basename(absolutePath),
      filePath: absolutePath,
      normalizedFilePath: normalizedPath,
      fileSize: stat.size,
      fileMtimeMs: Math.trunc(stat.mtimeMs),
      format: metadata.format ?? extension,
      duration: metadata.duration,
      createdAt: Number.isFinite(stat.birthtimeMs) ? stat.birthtime.toISOString() : null
    });

    logger.info('Import', 'Imported recording', { recordingId: recording.id, filePath: absolutePath });
    return { recording, wasDuplicate: false };
  }
}

export function normalizeFilePath(filePath: string): string {
  return path.resolve(filePath).toLowerCase();
}

async function defaultAudioMetadataReader(filePath: string): Promise<{ duration: number | null; format: string | null }> {
  try {
    const metadata = await parseFile(filePath);
    return {
      duration: metadata.format.duration ?? null,
      format: metadata.format.container ?? path.extname(filePath).slice(1).toLowerCase()
    };
  } catch (error) {
    logger.warn('Import', 'Could not read audio metadata; continuing with file stats only', { filePath, error });
    return { duration: null, format: path.extname(filePath).slice(1).toLowerCase() };
  }
}
