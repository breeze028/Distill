const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { _electron } = require('playwright');

async function main() {
  const root = path.resolve(__dirname, '..', '..');
  const exe = path.join(root, 'out', 'distill-win32-x64', 'distill.exe');
  const db = path.join(root, 'test-results', 'real-stt-ui.db');
  const audio = path.join(root, 'test-fixtures', 'real-stt-chinese.m4a');
  const python = process.env.DISTILL_PYTHON_COMMAND || path.join(root, 'python', '.venv', 'Scripts', 'python.exe');

  if (!fs.existsSync(exe)) {
    throw new Error(`Packaged app not found. Run pnpm build first: ${exe}`);
  }
  if (!fs.existsSync(python)) {
    throw new Error(`Python STT environment not found. Run pnpm setup:stt first: ${python}`);
  }

  ensureSpeechFixture(audio);
  assertPythonWorkerReady(root, python);

  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${db}${suffix}`, { force: true });
  }
  fs.mkdirSync(path.dirname(db), { recursive: true });

  const app = await _electron.launch({
    executablePath: exe,
    env: {
      ...process.env,
      DISTILL_DB_PATH: db,
      DISTILL_PYTHON_COMMAND: python
    }
  });

  try {
    const win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await win.waitForTimeout(1000);
    await win.evaluate(() => window.distillAPI.saveSettings({
      speechProvider: 'python',
      speechModel: 'faster-whisper-tiny',
      autoTranscribeOnImport: true
    }));

    const imported = await win.evaluate((filePath) => window.distillAPI.importRecordingFromPath(filePath), audio);
    await waitForTranscript(win, imported.recording.id, 120000);

    const detail = await win.evaluate((recordingId) => window.distillAPI.getRecording(recordingId), imported.recording.id);
    const transcript = detail?.transcript?.fullText ?? '';

    console.log(JSON.stringify({
      importedTitle: imported.recording.title,
      language: detail?.transcript?.language,
      segmentCount: detail?.transcript?.segments.length ?? 0,
      transcript
    }, null, 2));

    if (!/中文.*(转写|轉寫).*功能/.test(transcript)) {
      throw new Error(`Expected real STT transcript to contain spoken words, got: ${transcript}`);
    }
  } finally {
    await app.close();
  }
}

function ensureSpeechFixture(audioPath) {
  fs.mkdirSync(path.dirname(audioPath), { recursive: true });
  fs.rmSync(audioPath, { force: true });
  const wavPath = audioPath.replace(/\.m4a$/i, '.wav');
  const command = [
    'Add-Type -AssemblyName System.Speech',
    '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    "$voice = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'zh-CN' } | Select-Object -First 1",
    "if (-not $voice) { throw 'No zh-CN speech synthesis voice is installed.' }",
    '$synth.SelectVoice($voice.VoiceInfo.Name)',
    `$synth.SetOutputToWaveFile('${wavPath.replace(/'/g, "''")}')`,
    "$synth.Speak('今天测试中文语音转写功能')",
    '$synth.Dispose()'
  ].join('; ');
  execFileSync('powershell', ['-NoProfile', '-Command', command], { stdio: 'ignore' });
  execFileSync('ffmpeg', ['-y', '-i', wavPath, '-acodec', 'libvo_aacenc', '-b:a', '96k', audioPath], { stdio: 'ignore' });
  fs.rmSync(wavPath, { force: true });
}

function assertPythonWorkerReady(root, python) {
  const worker = path.join(root, 'python', 'worker', 'worker.py');
  const request = JSON.stringify({ type: 'diagnose' });
  const output = execFileSync(python, [worker], { input: `${request}\n`, encoding: 'utf8' });
  const status = JSON.parse(output);
  if (!status.fasterWhisperAvailable) {
    throw new Error(`faster-whisper is not ready: ${status.errorMessage}`);
  }
}

async function waitForTranscript(win, recordingId, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const recording = await win.evaluate((id) => window.distillAPI.getRecording(id), recordingId);
    if (recording?.transcript?.segments.length) {
      return recording;
    }

    const failedJob = recording?.jobs.find((job) => job.kind === 'transcription' && job.state === 'failed');
    if (failedJob) {
      throw new Error(`Transcription failed: ${failedJob.errorMessage}`);
    }

    await win.waitForTimeout(1000);
  }

  const recording = await win.evaluate((id) => window.distillAPI.getRecording(id), recordingId);
  throw new Error(`Timed out waiting for transcript. Last processing state: ${recording?.processingState ?? 'missing'}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
