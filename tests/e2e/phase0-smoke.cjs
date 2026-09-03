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
  let hasTranscriptScrollbar = false;
  let retranscribeStartedFresh = false;
  let retranscribeProgressVisible = false;

  try {
    const win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await win.waitForTimeout(1000);
    appMenuRemoved = await app.evaluate(({ Menu }) => Menu.getApplicationMenu() === null);

    await dragImportRecording(win, audio);
    const droppedRecordings = await waitForRecordingCount(win, 1, 30000);
    const droppedRecording = await win.evaluate((id) => window.distillAPI.getRecording(id), droppedRecordings[0].id);
    imported = { recording: droppedRecording, wasDuplicate: false };
    await waitForTranscript(win, imported.recording.id, 30000);
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
    hasTranscriptScrollbar = await win.getByTestId('transcript-pane').evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return styles.overflowY === 'scroll' && styles.scrollbarGutter.includes('stable');
    });

    const detailBeforeRetranscribe = await win.evaluate((id) => window.distillAPI.getRecording(id), imported.recording.id);
    const previousJobId = detailBeforeRetranscribe.jobs.find((job) => job.kind === 'transcription')?.id;
    const clickedAt = Date.now();
    await win.getByRole('button', { name: 'Retranscribe' }).click();
    await win.getByText(/Transcribing · 00:0[0-3]/).waitFor();
    retranscribeProgressVisible = true;
    const detailDuringRetranscribe = await win.evaluate((id) => window.distillAPI.getRecording(id), imported.recording.id);
    const runningJob = detailDuringRetranscribe.jobs.find((job) => job.kind === 'transcription' && job.state === 'running');
    retranscribeStartedFresh = Boolean(
      runningJob &&
      runningJob.id !== previousJobId &&
      runningJob.startedAt &&
      new Date(runningJob.startedAt).getTime() >= clickedAt - 2000
    );
    if (runningJob) {
      await waitForTranscriptJob(win, imported.recording.id, runningJob.id, 30000);
    }

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
        dragDropImported: Boolean(imported.recording),
        hasTranscriptScrollbar,
        retranscribeStartedFresh,
        retranscribeProgressVisible,
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
  if (!hasTranscriptScrollbar) {
    throw new Error('Expected the transcript pane to reserve a visible stable scrollbar.');
  }
  if (!retranscribeStartedFresh) {
    throw new Error('Expected Retranscribe to create a fresh running transcription job.');
  }
  if (!retranscribeProgressVisible) {
    throw new Error('Expected Retranscribe progress to be visible immediately.');
  }
  if (!appMenuRemoved) {
    throw new Error('Expected Electron application menu to be removed.');
  }
  if (!imported.recording) {
    throw new Error('Expected drag-and-drop import to create a recording.');
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

async function dragImportRecording(win, audioPath) {
  const fileName = path.basename(audioPath);
  await win.evaluate(({ fileName: name, filePath }) => {
    window.__distillTestDroppedFilePaths = { [name]: filePath };
  }, { fileName, filePath: audioPath });

  const dataTransfer = await win.evaluateHandle((name) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['dragged audio placeholder'], name, { type: 'audio/mp4' }));
    return transfer;
  }, fileName);

  await win.dispatchEvent('[data-testid="app-shell"]', 'dragenter', { dataTransfer });
  await win.getByTestId('drop-overlay').waitFor();
  await win.dispatchEvent('[data-testid="app-shell"]', 'drop', { dataTransfer });
  await win.getByTestId('drop-overlay').waitFor({ state: 'detached' });
}

async function waitForRecordingCount(win, count, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const recordings = await win.evaluate(() => window.distillAPI.listRecordings());
    if (recordings.length >= count) {
      return recordings;
    }
    await win.waitForTimeout(500);
  }
  const recordings = await win.evaluate(() => window.distillAPI.listRecordings());
  throw new Error(`Timed out waiting for ${count} recording(s), got ${recordings.length}.`);
}

function launchApp(exe, db) {
  return _electron.launch({
    executablePath: exe,
    env: {
      ...process.env,
      DISTILL_DB_PATH: db,
      DISTILL_STT_PROVIDER: 'mock',
      DISTILL_ALLOW_MOCK_STT: 'true',
      DISTILL_MOCK_STT_DELAY_MS: '1500'
    }
  });
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

    await win.waitForTimeout(500);
  }

  const recording = await win.evaluate((id) => window.distillAPI.getRecording(id), recordingId);
  throw new Error(`Timed out waiting for transcript. Last processing state: ${recording?.processingState ?? 'missing'}`);
}

async function waitForTranscriptJob(win, recordingId, jobId, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const recording = await win.evaluate((id) => window.distillAPI.getRecording(id), recordingId);
    const job = recording?.jobs.find((item) => item.id === jobId);
    if (job?.state === 'succeeded') {
      return recording;
    }
    if (job?.state === 'failed') {
      throw new Error(`Transcription failed: ${job.errorMessage}`);
    }

    await win.waitForTimeout(500);
  }

  throw new Error(`Timed out waiting for transcription job ${jobId}.`);
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
