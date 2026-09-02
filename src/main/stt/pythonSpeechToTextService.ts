import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { SpeechToTextResult, SpeechToTextService } from './types';

const speechToTextResultSchema = z.object({
  language: z.string().nullable(),
  duration: z.number().nullable(),
  segments: z.array(z.object({
    start: z.number(),
    end: z.number(),
    text: z.string()
  }))
});

const workerErrorSchema = z.object({
  error: z.string(),
  detail: z.string().optional()
});

type PythonSpeechToTextOptions = {
  pythonCommand?: string;
  workerPath?: string;
  modelName?: string;
  device?: string;
  computeType?: string;
  timeoutMs?: number;
};

export class PythonSpeechToTextService implements SpeechToTextService {
  private readonly pythonCommand: string;
  private readonly workerPath: string;
  private readonly modelName: string;
  private readonly device: string;
  private readonly computeType: string;
  private readonly timeoutMs: number;

  constructor(options: PythonSpeechToTextOptions = {}) {
    this.pythonCommand = options.pythonCommand ?? process.env.DISTILL_PYTHON_COMMAND ?? 'python';
    this.workerPath = options.workerPath ?? resolveDefaultWorkerPath();
    this.modelName = normalizeModelName(options.modelName ?? process.env.DISTILL_WHISPER_MODEL ?? 'small');
    this.device = options.device ?? process.env.DISTILL_WHISPER_DEVICE ?? 'auto';
    this.computeType = options.computeType ?? process.env.DISTILL_WHISPER_COMPUTE_TYPE ?? 'int8';
    this.timeoutMs = options.timeoutMs ?? 30 * 60 * 1000;
  }

  async transcribe(filePath: string): Promise<SpeechToTextResult> {
    if (!fs.existsSync(this.workerPath)) {
      throw new Error(`Python STT worker was not found: ${this.workerPath}`);
    }

    const child = spawn(this.pythonCommand, [this.workerPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let spawnErrorMessage: string | null = null;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, this.timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.stdin.write(`${JSON.stringify({
      type: 'transcribe',
      file: filePath,
      model: this.modelName,
      device: this.device,
      compute_type: this.computeType
    })}\n`);
    child.stdin.end();

    const exitCode = await new Promise<number | null>((resolve) => {
      child.on('close', resolve);
      child.on('error', (error) => {
        spawnErrorMessage = error.message;
        resolve(-1);
      });
    });
    clearTimeout(timeout);

    if (timedOut) {
      throw new Error(`Python STT worker timed out after ${this.timeoutMs}ms.`);
    }

    if (spawnErrorMessage) {
      throw new Error(`Python STT worker could not start: ${spawnErrorMessage}`);
    }

    if (exitCode !== 0) {
      throw new Error(formatWorkerError(Buffer.concat(stderr).toString('utf8'), exitCode));
    }

    const rawOutput = Buffer.concat(stdout).toString('utf8');
    try {
      return speechToTextResultSchema.parse(JSON.parse(rawOutput));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Python STT worker returned invalid JSON: ${message}`);
    }
  }
}

function resolveDefaultWorkerPath(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) {
    const packagedWorkerPath = path.join(resourcesPath, 'python', 'worker', 'worker.py');
    if (fs.existsSync(packagedWorkerPath)) {
      return packagedWorkerPath;
    }
  }

  return path.join(process.cwd(), 'python', 'worker', 'worker.py');
}

function normalizeModelName(modelName: string): string {
  return modelName.replace(/^faster-whisper-/, '');
}

function formatWorkerError(stderr: string, exitCode: number | null): string {
  const trimmed = stderr.trim();
  if (!trimmed) {
    return `Python STT worker failed with exit code ${String(exitCode)}.`;
  }

  try {
    const parsed = workerErrorSchema.parse(JSON.parse(trimmed));
    return parsed.detail ? `Python STT worker failed: ${parsed.error}. ${parsed.detail}` : `Python STT worker failed: ${parsed.error}`;
  } catch {
    return `Python STT worker failed: ${trimmed}`;
  }
}
