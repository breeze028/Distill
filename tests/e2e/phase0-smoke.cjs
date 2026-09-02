const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { _electron } = require('playwright');

async function main() {
  const root = path.resolve(__dirname, '..', '..');
  const audio = path.join(root, 'test-fixtures', 'phase1-transcript-中文-test.m4a');
  const db = path.join(root, 'test-results', 'phase0-ui.db');
  const exe = path.join(root, 'out', 'distill-win32-x64', 'distill.exe');

  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${db}${suffix}`, { force: true });
  }
  fs.mkdirSync(path.dirname(db), { recursive: true });
  ensureAudioFixture(audio, 10);

  const app = await launchApp(exe, db);

  let imported;
  let appMenuRemoved = false;
  let settingsText = '';
  let text = '';
  let persisted = [];
  let audioElementCount = 0;
  let audioDuration = null;
  let seekTime = 0;

  try {
    const win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await win.waitForTimeout(1000);
    appMenuRemoved = await app.evaluate(({ Menu }) => Menu.getApplicationMenu() === null);

    imported = await win.evaluate((filePath) => window.distillAPI.importRecordingFromPath(filePath), audio);
    await win.waitForFunction(
      async (recordingId) => {
        const recording = await window.distillAPI.getRecording(recordingId);
        return Boolean(recording?.transcript?.segments.length);
      },
      imported.recording.id
    );
    await win.evaluate(() => window.location.reload());
    await win.waitForLoadState('domcontentloaded');
    await win.waitForTimeout(1000);
    await win.getByText('phase1-transcript-中文-test').first().click();
    await win.waitForTimeout(500);
    await win.getByRole('button', { name: 'Settings', exact: true }).click();
    await win.getByText('Speech-to-Text Model').waitFor();
    await win.getByText('Mock STT ready').waitFor();
    settingsText = await win.locator('body').innerText();
    await win.getByRole('button', { name: 'Settings', exact: true }).click();
    await win.getByText('phase1-transcript-中文-test').first().waitFor();
    await win.getByRole('button', { name: 'Inbox' }).click();
    await win.getByText('Watch Folder', { exact: true }).waitFor();
    await win.getByRole('button', { name: 'Inbox' }).click();
    await win.getByText('phase1-transcript-中文-test').first().waitFor();
    await win.getByText('这是第一阶段的模拟转写', { exact: false }).waitFor();
    await win.getByText('后续会由 Python Worker', { exact: false }).click();
    await win.waitForTimeout(500);
    seekTime = await win.locator('audio').evaluate((audio) => audio.currentTime);

    text = await win.locator('body').innerText();
    await win.screenshot({
      path: path.join(root, 'test-results', 'phase0-import-detail.png'),
      fullPage: true
    });

    persisted = await win.evaluate(() => window.distillAPI.listRecordings());
    audioElementCount = await win.locator('audio').count();
    audioDuration = await win.locator('audio').evaluate((audio) => {
      const element = audio;
      return Number.isFinite(element.duration) ? element.duration : null;
    });
  } finally {
    await app.close();
  }

  const reopenedApp = await launchApp(exe, db);
  let reopenedText = '';
  try {
    const win = await reopenedApp.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await win.waitForTimeout(1000);
    await win.getByText('phase1-transcript-中文-test').first().click();
    await win.getByText('这是第一阶段的模拟转写', { exact: false }).waitFor();
    reopenedText = await win.locator('body').innerText();
  } finally {
    await reopenedApp.close();
  }

  console.log(
    JSON.stringify(
      {
        importedTitle: imported.recording.title,
        duplicate: imported.wasDuplicate,
        duration: imported.recording.duration,
        persistedCount: persisted.length,
        firstTitle: persisted[0]?.title,
        audioElementCount,
        audioDuration,
        seekTime,
        appMenuRemoved,
        hasLibraryText: text.includes('Voice Library'),
        hasDetailText: text.includes('phase1-transcript-中文-test'),
        hasSpeechToTextStatus: settingsText.includes('Mock STT ready'),
        autoTranscribedAfterImport: Boolean(imported.recording.jobs.find((job) => job.kind === 'transcription')),
        hasTranscriptText: text.includes('这是第一阶段的模拟转写'),
        hasPersistedTranscriptAfterReopen: reopenedText.includes('这是第一阶段的模拟转写')
      },
      null,
      2
    )
  );

  if (imported.wasDuplicate) {
    throw new Error('Expected first import not to be a duplicate.');
  }
  if (persisted.length !== 1) {
    throw new Error(`Expected one persisted recording, got ${persisted.length}.`);
  }
  if (audioElementCount !== 1) {
    throw new Error(`Expected one audio element, got ${audioElementCount}.`);
  }
  if (!audioDuration || audioDuration <= 4.2) {
    throw new Error(`Expected playable audio duration above segment start, got ${audioDuration}.`);
  }
  if (seekTime < 4) {
    throw new Error(`Expected transcript segment click to seek near 4.2s, got ${seekTime}.`);
  }
  if (!appMenuRemoved) {
    throw new Error('Expected Electron application menu to be removed.');
  }
  if (!text.includes('phase1-transcript-中文-test')) {
    throw new Error('Imported recording title was not visible.');
  }
  if (!settingsText.includes('Mock STT ready')) {
    throw new Error('Speech-to-text status was not visible in settings.');
  }
  if (!imported.recording.jobs.some((job) => job.kind === 'transcription')) {
    throw new Error('Expected import to start a transcription job automatically.');
  }
  if (!text.includes('这是第一阶段的模拟转写')) {
    throw new Error('Transcript segment text was not visible after transcription.');
  }
  if (!reopenedText.includes('这是第一阶段的模拟转写')) {
    throw new Error('Transcript segment text was not persisted after reopening the app.');
  }
}

function launchApp(exe, db) {
  return _electron.launch({
    executablePath: exe,
    env: {
      ...process.env,
      DISTILL_DB_PATH: db
    }
  });
}

function ensureAudioFixture(audioPath, durationSeconds) {
  if (fs.existsSync(audioPath)) {
    return;
  }

  fs.mkdirSync(path.dirname(audioPath), { recursive: true });
  execFileSync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:duration=${durationSeconds}`,
    '-strict',
    '-2',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    audioPath
  ], { stdio: 'ignore' });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
