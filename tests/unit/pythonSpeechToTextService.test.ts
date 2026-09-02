import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PythonSpeechToTextService } from '@main/stt/pythonSpeechToTextService';

let tmpDir = '';

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'distill-python-stt-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('PythonSpeechToTextService', () => {
  it('sends a transcription request and validates the worker response', async () => {
    const workerPath = writeWorker(`
      process.stdin.once('data', (chunk) => {
        const request = JSON.parse(chunk.toString('utf8'));
        process.stdout.write(JSON.stringify({
          language: 'zh',
          duration: 4,
          segments: [{ start: 0, end: 4, text: request.model + ':' + request.compute_type }]
        }));
      });
    `);
    const service = new PythonSpeechToTextService({
      pythonCommand: process.execPath,
      workerPath,
      modelName: 'faster-whisper-small',
      computeType: 'int8',
      timeoutMs: 1000
    });

    const result = await service.transcribe(path.join(tmpDir, 'audio.m4a'));

    expect(result.language).toBe('zh');
    expect(result.segments[0]?.text).toBe('small:int8');
  });

  it('surfaces structured worker errors', async () => {
    const workerPath = writeWorker(`
      process.stderr.write(JSON.stringify({ error: 'faster-whisper is not installed', detail: 'install requirements' }));
      process.exit(1);
    `);
    const service = new PythonSpeechToTextService({
      pythonCommand: process.execPath,
      workerPath,
      timeoutMs: 1000
    });

    await expect(service.transcribe(path.join(tmpDir, 'audio.m4a'))).rejects.toThrow('install requirements');
  });

  it('rejects malformed worker responses', async () => {
    const workerPath = writeWorker("process.stdout.write('{bad json');");
    const service = new PythonSpeechToTextService({
      pythonCommand: process.execPath,
      workerPath,
      timeoutMs: 1000
    });

    await expect(service.transcribe(path.join(tmpDir, 'audio.m4a'))).rejects.toThrow('invalid JSON');
  });
});

function writeWorker(source: string): string {
  const workerPath = path.join(tmpDir, `${randomUUID()}.cjs`);
  fs.writeFileSync(workerPath, source);
  return workerPath;
}
