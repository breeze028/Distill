import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { NoteImageImportResult } from '@shared/types/domain';

const supportedImageExtensions = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']);

export class NoteAssetService {
  constructor(private readonly assetRoot: string) {}

  async importImage(sourcePath: string): Promise<NoteImageImportResult> {
    const extension = path.extname(sourcePath).toLowerCase();
    if (!supportedImageExtensions.has(extension)) {
      throw new Error('Unsupported image format. Use JPG, PNG, GIF, WEBP, or BMP.');
    }

    const stat = await fs.stat(sourcePath);
    if (!stat.isFile()) {
      throw new Error('Selected image is not a file.');
    }

    const folder = this.imageFolder();
    await fs.mkdir(folder, { recursive: true });

    const fileName = `${crypto.randomUUID()}${extension}`;
    const destination = path.join(folder, fileName);
    await fs.copyFile(sourcePath, destination);
    await fs.utimes(destination, stat.atime, stat.mtime);

    return {
      src: `distill-asset://note-image/${fileName}`,
      fileName
    };
  }

  resolveNoteImage(fileName: string): string | null {
    if (!/^[a-f0-9-]+\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(fileName)) {
      return null;
    }
    return path.join(this.imageFolder(), fileName);
  }

  private imageFolder(): string {
    return path.join(this.assetRoot, 'note-images');
  }
}
