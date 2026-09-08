import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NoteAssetService } from '@main/services/noteAssetService';

let tmpDir = '';

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'distill-note-asset-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('NoteAssetService', () => {
  it('copies imported images into the note image asset folder', async () => {
    const source = path.join(tmpDir, 'photo.png');
    fs.writeFileSync(source, tinyPng());
    const service = new NoteAssetService(path.join(tmpDir, 'assets'));

    const result = await service.importImage(source);
    const resolved = service.resolveNoteImage(result.fileName);

    expect(result.src).toBe(`distill-asset://note-image/${result.fileName}`);
    expect(resolved).toBeTruthy();
    expect(fs.existsSync(resolved ?? '')).toBe(true);
    expect(fs.readFileSync(resolved ?? '')).toEqual(tinyPng());
  });

  it('rejects unsupported image formats and unsafe asset names', async () => {
    const source = path.join(tmpDir, 'notes.txt');
    fs.writeFileSync(source, 'not an image');
    const service = new NoteAssetService(path.join(tmpDir, 'assets'));

    await expect(service.importImage(source)).rejects.toThrow('Unsupported image format');
    expect(service.resolveNoteImage('../photo.png')).toBeNull();
    expect(service.resolveNoteImage('not-a-uuid.png')).toBeNull();
  });
});

function tinyPng(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lpXW8QAAAABJRU5ErkJggg==',
    'base64'
  );
}
