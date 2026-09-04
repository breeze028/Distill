import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { SpeechToTextStatus } from '@shared/types/domain';
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

const workerDiagnosisSchema = z.object({
  pythonVersion: z.string(),
  workerPath: z.string(),
  fasterWhisperAvailable: z.boolean(),
  fasterWhisperVersion: z.string().nullable(),
  errorMessage: z.string().nullable()
});

const workerErrorSchema = z.object({
  error: z.string(),
  detail: z.string().nullable().optional()
});

type PythonSpeechToTextOptions = {
  pythonCommand?: string;
  workerPath?: string;
  modelName?: string | (() => string);
  device?: string;
  computeType?: string;
  timeoutMs?: number;
  diagnosisTimeoutMs?: number;
};

type WorkerRequest = Record<string, unknown> & { type: string };

export class PythonSpeechToTextService implements SpeechToTextService {
  private readonly pythonCommand: string;
  private readonly workerPath: string;
  private readonly modelName: string | (() => string);
  private readonly device: string;
  private readonly computeType: string;
  private readonly timeoutMs: number;
  private readonly diagnosisTimeoutMs: number;

  constructor(options: PythonSpeechToTextOptions = {}) {
    this.pythonCommand = options.pythonCommand ?? resolveDefaultPythonCommand();
    this.workerPath = options.workerPath ?? resolveDefaultWorkerPath();
    this.modelName = options.modelName ?? process.env.DISTILL_WHISPER_MODEL ?? 'tiny';
    this.device = options.device ?? process.env.DISTILL_WHISPER_DEVICE ?? 'auto';
    this.computeType = options.computeType ?? process.env.DISTILL_WHISPER_COMPUTE_TYPE ?? 'int8';
    this.timeoutMs = options.timeoutMs ?? readPositiveIntegerEnv('DISTILL_STT_TIMEOUT_MS') ?? 30 * 60 * 1000;
    this.diagnosisTimeoutMs = options.diagnosisTimeoutMs ?? 10 * 1000;
  }

  async transcribe(filePath: string): Promise<SpeechToTextResult> {
    return this.requestWorker(
      {
        type: 'transcribe',
        file: filePath,
        model: this.resolvedModelName(),
        device: this.device,
        compute_type: this.computeType
      },
      speechToTextResultSchema,
      this.timeoutMs
    );
  }

  async getStatus(): Promise<SpeechToTextStatus> {
    const base = {
      provider: 'python' as const,
      checkedAt: new Date().toISOString(),
      modelName: this.resolvedModelName(),
      device: this.device,
      computeType: this.computeType,
      pythonCommand: this.pythonCommand,
      workerPath: this.workerPath
    };

    if (!fs.existsSync(this.workerPath)) {
      return {
        ...base,
        ready: false,
        pythonVersion: null,
        fasterWhisperVersion: null,
        errorMessage: `Python STT worker was not found: ${this.workerPath}`,
        setupHint: '确认打包资源或源码目录中存在 python\\worker\\worker.py。'
      };
    }

    try {
      const diagnosis = await this.requestWorker({ type: 'diagnose' }, workerDiagnosisSchema, this.diagnosisTimeoutMs);
      const ready = diagnosis.fasterWhisperAvailable;
      return {
        ...base,
        ready,
        pythonVersion: diagnosis.pythonVersion,
        fasterWhisperVersion: diagnosis.fasterWhisperVersion,
        errorMessage: diagnosis.errorMessage,
        setupHint: ready ? null : '运行 pip install -r python\\requirements.txt 后重试。'
      };
    } catch (error) {
      return {
        ...base,
        ready: false,
        pythonVersion: null,
        fasterWhisperVersion: null,
        errorMessage: error instanceof Error ? error.message : String(error),
        setupHint: '确认 Python 可执行文件可用，并安装 python\\requirements.txt 中的依赖。'
      };
    }
  }

  private resolvedModelName(): string {
    const modelName = typeof this.modelName === 'function' ? this.modelName() : this.modelName;
    return normalizeModelName(modelName);
  }

  private async requestWorker<T>(request: WorkerRequest, schema: z.ZodType<T>, timeoutMs: number): Promise<T> {
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
      killProcessTree(child.pid);
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.stdin.write(`${JSON.stringify(request)}\n`);
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
      throw new Error(formatWorkerTimeout(timeoutMs, request));
    }

    if (spawnErrorMessage) {
      throw new Error(`Python STT worker could not start: ${spawnErrorMessage}`);
    }

    if (exitCode !== 0) {
      throw new Error(formatWorkerError(Buffer.concat(stderr).toString('utf8'), exitCode));
    }

    const rawOutput = Buffer.concat(stdout).toString('utf8');
    try {
      return schema.parse(JSON.parse(rawOutput));
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

function resolveDefaultPythonCommand(): string {
  if (process.env.DISTILL_PYTHON_COMMAND) {
    return process.env.DISTILL_PYTHON_COMMAND;
  }

  for (const root of possibleSourceRoots()) {
    const candidate = path.join(root, 'python', '.venv', 'Scripts', 'python.exe');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return 'python';
}

function possibleSourceRoots(): string[] {
  const roots = [process.cwd()];
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;

  if (resourcesPath) {
    roots.push(path.resolve(resourcesPath, '..', '..', '..'));
  }

  roots.push(path.resolve(process.cwd(), '..', '..'));
  return [...new Set(roots)];
}

function normalizeModelName(modelName: string): string {
  return modelName.replace(/^faster-whisper-/, '');
}

function readPositiveIntegerEnv(key: string): number | undefined {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function killProcessTree(pid: number | undefined): void {
  if (!pid) {
    return;
  }

  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }, () => undefined);
    return;
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // The worker may have exited between timeout scheduling and cleanup.
  }
}

function formatWorkerTimeout(timeoutMs: number, request: WorkerRequest): string {
  const model = typeof request.model === 'string' ? normalizeModelName(request.model) : 'unknown';
  const timeout = formatDurationForError(timeoutMs);
  return [
    `Python STT worker timed out after ${timeout}.`,
    `Model: ${model}.`,
    '如果当前使用 small/medium，CPU 转写和首次模型下载可能非常慢；建议先切回 tiny 或 base 验证流程，再重试更大模型。'
  ].join(' ');
}

function formatDurationForError(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return rest === 0 ? `${minutes}min` : `${minutes}min ${rest}s`;
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
