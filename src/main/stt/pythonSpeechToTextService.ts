import { spawn } from 'node:child_process';
import path from 'node:path';
import type { SpeechToTextResult, SpeechToTextService } from './types';

export class PythonSpeechToTextService implements SpeechToTextService {
  constructor(
    private readonly pythonCommand = 'python',
    private readonly workerPath = path.join(process.cwd(), 'python', 'worker', 'worker.py')
  ) {}

  async transcribe(filePath: string): Promise<SpeechToTextResult> {
    const child = spawn(this.pythonCommand, [this.workerPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.stdin.write(`${JSON.stringify({ type: 'transcribe', file: filePath })}\n`);
    child.stdin.end();

    const exitCode = await new Promise<number | null>((resolve) => {
      child.on('close', resolve);
      child.on('error', () => resolve(-1));
    });

    if (exitCode !== 0) {
      throw new Error(`Python STT worker failed: ${Buffer.concat(stderr).toString('utf8')}`);
    }

    return JSON.parse(Buffer.concat(stdout).toString('utf8')) as SpeechToTextResult;
  }
}
