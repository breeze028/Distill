import fs from 'node:fs/promises';
import type { Stats } from 'node:fs';
import path from 'node:path';
import { parseFile } from 'music-metadata';
import type { ImportRecordingResult, ImportableAudioFormat } from '@shared/types/domain';
import type { RecordingRepository } from '@main/repositories/recordingRepository';
import { logger } from '@main/logging/logger';

export type AudioMetadataReader = (filePath: string) => Promise<{ duration: number | null; format: string | null }>;
export type AudioLibraryFolderProvider = () => string;

const supportedFormats = new Set<ImportableAudioFormat>(['m4a', 'mp3', 'wav']);

export class FileImportService {
  private readonly inFlightImports = new Map<string, Promise<ImportRecordingResult>>();

  constructor(
    private readonly recordings: RecordingRepository,
    private readonly readAudioMetadata: AudioMetadataReader = defaultAudioMetadataReader,
    private readonly getAudioLibraryFolder: AudioLibraryFolderProvider = () => ''
  ) {}

  async importFile(filePath: string): Promise<ImportRecordingResult> {
    const sourcePath = path.resolve(filePath);
    const extension = path.extname(sourcePath).slice(1).toLowerCase();

    if (!supportedFormats.has(extension as ImportableAudioFormat)) {
      throw new Error(`Unsupported audio format: .${extension || 'unknown'}`);
    }

    const sourceStat = await fs.stat(sourcePath);
    if (!sourceStat.isFile()) {
      throw new Error('Selected path is not a file.');
    }

    const configuredLibraryFolder = this.getAudioLibraryFolder().trim();
    if (!configuredLibraryFolder) {
      throw new Error('Audio Library Folder is not configured.');
    }
    const libraryFolder = path.resolve(configuredLibraryFolder);
    await fs.mkdir(libraryFolder, { recursive: true });

    const targetPath = await resolveLibraryTargetPath(sourcePath, libraryFolder, sourceStat);
    const normalizedPath = normalizeFilePath(targetPath);
    const inFlightImport = this.inFlightImports.get(normalizedPath);
    if (inFlightImport) {
      return inFlightImport;
    }

    const importPromise = this.importResolvedFile(sourcePath, targetPath, normalizedPath, sourceStat, extension);
    this.inFlightImports.set(normalizedPath, importPromise);
    try {
      return await importPromise;
    } finally {
      if (this.inFlightImports.get(normalizedPath) === importPromise) {
        this.inFlightImports.delete(normalizedPath);
      }
    }
  }

  private async importResolvedFile(sourcePath: string, targetPath: string, normalizedPath: string, sourceStat: Stats, extension: string): Promise<ImportRecordingResult> {
    const samePathRecording = this.recordings.findByNormalizedPath(normalizedPath);
    if (samePathRecording) {
      logger.info('Import', 'Skipped already imported library path', { filePath: targetPath });
      return { recording: samePathRecording, wasDuplicate: true };
    }

    const duplicate = this.recordings.findDuplicate(normalizedPath, sourceStat.size, Math.trunc(sourceStat.mtimeMs));
    if (duplicate) {
      logger.info('Import', 'Skipped duplicate recording', { filePath: targetPath });
      return { recording: duplicate, wasDuplicate: true };
    }

    if (!samePath(sourcePath, targetPath)) {
      await fs.copyFile(sourcePath, targetPath);
      await fs.utimes(targetPath, sourceStat.atime, sourceStat.mtime);
    }

    const metadata = await this.readAudioMetadata(targetPath);
    const targetFileName = path.basename(targetPath);
    const title = path.basename(targetPath, path.extname(targetPath));
    const recording = this.recordings.createRecording({
      title,
      originalFileName: targetFileName,
      filePath: targetPath,
      normalizedFilePath: normalizedPath,
      fileSize: sourceStat.size,
      fileMtimeMs: Math.trunc(sourceStat.mtimeMs),
      format: metadata.format ?? extension,
      duration: metadata.duration,
      createdAt: Number.isFinite(sourceStat.birthtimeMs) ? sourceStat.birthtime.toISOString() : null
    });

    logger.info('Import', 'Imported recording', { recordingId: recording.id, filePath: targetPath });
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

async function resolveLibraryTargetPath(sourcePath: string, libraryFolder: string, sourceStat: Stats): Promise<string> {
  if (isPathInsideDirectory(sourcePath, libraryFolder)) {
    return sourcePath;
  }

  const parsed = path.parse(path.basename(sourcePath));
  for (let index = 1; ; index += 1) {
    const candidateName = index === 1 ? `${parsed.name}${parsed.ext}` : `${parsed.name} (${index})${parsed.ext}`;
    const candidatePath = path.join(libraryFolder, candidateName);
    const candidateStat = await fs.stat(candidatePath).catch(() => null);
    if (!candidateStat) {
      return candidatePath;
    }
    if (candidateStat.isFile() && candidateStat.size === sourceStat.size && Math.abs(candidateStat.mtimeMs - sourceStat.mtimeMs) <= 1000) {
      return candidatePath;
    }
  }
}

function isPathInsideDirectory(filePath: string, directoryPath: string): boolean {
  const relativePath = path.relative(path.resolve(directoryPath), path.resolve(filePath));
  return relativePath.length > 0 && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function samePath(left: string, right: string): boolean {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}
