import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PythonSpeechToTextService } from '@main/stt/pythonSpeechToTextService';

let tmpDir = '';
const originalCwd = process.cwd();
const originalPythonCommand = process.env.DISTILL_PYTHON_COMMAND;

beforeEach(() => {
  delete process.env.DISTILL_PYTHON_COMMAND;
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'distill-python-stt-'));
});

afterEach(() => {
  process.chdir(originalCwd);
  if (originalPythonCommand === undefined) {
    delete process.env.DISTILL_PYTHON_COMMAND;
  } else {
    process.env.DISTILL_PYTHON_COMMAND = originalPythonCommand;
  }
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

  it('checks worker readiness without transcribing audio', async () => {
    const workerPath = writeWorker(`
      process.stdin.once('data', (chunk) => {
        const request = JSON.parse(chunk.toString('utf8'));
        process.stdout.write(JSON.stringify({
          pythonVersion: '3.12.7',
          workerPath: __filename,
          fasterWhisperAvailable: request.type === 'diagnose',
          fasterWhisperVersion: '1.1.0',
          errorMessage: null
        }));
      });
    `);
    const service = new PythonSpeechToTextService({
      pythonCommand: process.execPath,
      workerPath,
      modelName: () => 'faster-whisper-medium',
      diagnosisTimeoutMs: 1000
    });

    const status = await service.getStatus();

    expect(status.ready).toBe(true);
    expect(status.modelName).toBe('medium');
    expect(status.pythonVersion).toBe('3.12.7');
    expect(status.fasterWhisperVersion).toBe('1.1.0');
  });

  it('reports a missing worker as a setup problem', async () => {
    const service = new PythonSpeechToTextService({
      workerPath: path.join(tmpDir, 'missing-worker.py')
    });

    const status = await service.getStatus();

    expect(status.ready).toBe(false);
    expect(status.errorMessage).toContain('was not found');
  });

  it('uses the source-tree Python virtual environment when no command is configured', async () => {
    const venvScripts = path.join(tmpDir, 'python', '.venv', 'Scripts');
    const venvPython = path.join(venvScripts, 'python.exe');
    fs.mkdirSync(venvScripts, { recursive: true });
    fs.writeFileSync(venvPython, '');
    process.chdir(tmpDir);

    const service = new PythonSpeechToTextService({
      workerPath: path.join(tmpDir, 'missing-worker.py')
    });

    const status = await service.getStatus();

    expect(status.pythonCommand).toBe(venvPython);
  });
});

function writeWorker(source: string): string {
  const workerPath = path.join(tmpDir, `${randomUUID()}.cjs`);
  fs.writeFileSync(workerPath, source);
  return workerPath;
}
