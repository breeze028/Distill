const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { _electron } = require('playwright');

async function main() {
  const root = path.resolve(__dirname, '..', '..');
  const audio = path.join(root, 'test-fixtures', 'phase1-transcript-long-中文-test.m4a');
  const db = path.join(root, 'test-results', 'phase0-ui.db');
  const exe = path.join(root, 'out', 'distill-win32-x64', 'distill.exe');
  const watchDir = path.join(root, 'test-results', 'watch-folder');

  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${db}${suffix}`, { force: true });
  }
  fs.rmSync(watchDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(db), { recursive: true });
  fs.mkdirSync(watchDir, { recursive: true });
  ensureAudioFixture(audio, 75);

  const app = await launchApp(exe, db);

  let imported;
  let appMenuRemoved = false;
  let settingsText = '';
  let text = '';
  let persisted = [];
  let audioElementCount = 0;
  let audioDuration = null;
  let seekTime = 0;
  let seekPaused = true;
  let seekReadyState = 0;
  let seekSource = '';
  let rangedFetchStatus = 0;
  let hasTranscriptScrollbar = false;
  let retranscribeStartedFresh = false;
  let retranscribeProgressVisible = false;
  let aiGenerationStartedFresh = false;
  let aiGenerationProgressVisible = false;
  let aiArtifactHistoryPersisted = false;
  let aiArtifactHistoryVisible = false;
  let watchFolderRunning = false;
  let watchFolderImported = false;
  let watchFolderAutoTranscribed = false;

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
    await win.getByText('phase1-transcript-long-中文-test').first().click();
    await win.waitForTimeout(500);
    await win.getByRole('button', { name: 'Settings', exact: true }).click();
    await win.getByText('Speech-to-Text Model').waitFor();
    await win.getByText('Mock STT ready').waitFor();
    settingsText = await win.locator('body').innerText();
    await win.getByRole('button', { name: 'Settings', exact: true }).click();
    await win.getByText('phase1-transcript-long-中文-test').first().waitFor();
    await win.getByRole('button', { name: 'Inbox' }).click();
    await win.getByText('Watch Folder', { exact: true }).waitFor();
    await win.getByRole('button', { name: 'Inbox' }).click();
    await win.getByText('phase1-transcript-long-中文-test').first().waitFor();
    await win.evaluate((folder) => window.distillAPI.saveSettings({ watchFolder: folder }), watchDir);
    const watchStatus = await waitForWatchFolderStatus(win, 5000);
    watchFolderRunning = watchStatus.running;
    await win.getByRole('button', { name: 'Inbox' }).click();
    await win.getByText('监听中').waitFor();
    await win.getByRole('button', { name: 'Inbox' }).click();
    fs.copyFileSync(audio, path.join(watchDir, 'watch-folder-auto.m4a'));
    const watchedRecordings = await waitForRecordingCount(win, 2, 30000);
    const watchedRecording = watchedRecordings.find((recording) => recording.title === 'watch-folder-auto');
    watchFolderImported = Boolean(watchedRecording);
    if (watchedRecording) {
      const watchedDetail = await waitForTranscript(win, watchedRecording.id, 30000);
      watchFolderAutoTranscribed = Boolean(watchedDetail.transcript?.segments.length);
    }
    rangedFetchStatus = await win.evaluate(async (recordingId) => {
      const response = await fetch(`distill-audio://recording/${recordingId}`, {
        headers: { Range: 'bytes=0-1' }
      });
      await response.arrayBuffer();
      return response.status;
    }, imported.recording.id);
    await win.getByText('这是第一阶段的模拟转写', { exact: false }).waitFor();
    await win.getByText('这是第30秒附近的模拟转写', { exact: false }).click();
    await win.waitForTimeout(1800);
    const seekState = await win.locator('audio').evaluate((audio) => ({
      currentTime: audio.currentTime,
      paused: audio.paused,
      readyState: audio.readyState,
      currentSrc: audio.currentSrc
    }));
    seekTime = seekState.currentTime;
    seekPaused = seekState.paused;
    seekReadyState = seekState.readyState;
    seekSource = seekState.currentSrc;
    hasTranscriptScrollbar = await win.getByTestId('transcript-pane').evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return styles.overflowY === 'scroll' && styles.scrollbarGutter.includes('stable') && element.scrollHeight > element.clientHeight;
    });
    const detailBeforeGenerate = await win.evaluate((id) => window.distillAPI.getRecording(id), imported.recording.id);
    const previousAIJobId = detailBeforeGenerate.jobs.find((job) => job.kind === 'ai')?.id;
    await win.getByTestId('ai-template-select').selectOption('technical-thinking');
    await win.getByRole('button', { name: 'Generate Notes' }).click();
    await win.getByText(/Generating Notes · 00:0[0-3]/).waitFor();
    aiGenerationProgressVisible = true;
    const detailDuringGenerate = await win.evaluate((id) => window.distillAPI.getRecording(id), imported.recording.id);
    const runningAIJob = detailDuringGenerate.jobs.find((job) => job.kind === 'ai' && job.state === 'running');
    aiGenerationStartedFresh = Boolean(runningAIJob && runningAIJob.id !== previousAIJobId);
    if (runningAIJob) {
      await waitForProcessingJob(win, imported.recording.id, runningAIJob.id, 30000);
    }
    await win.getByText('整理自 technical-thinking 模板的模拟 AI 笔记。').waitFor();
    await win.getByTestId('ai-template-select').selectOption('personal-reflection');
    const detailBeforeSecondGenerate = await win.evaluate((id) => window.distillAPI.getRecording(id), imported.recording.id);
    const previousSecondAIJobId = detailBeforeSecondGenerate.jobs.find((job) => job.kind === 'ai')?.id;
    await win.getByRole('button', { name: 'Regenerate Notes' }).click();
    await win.getByText(/Generating Notes · 00:0[0-3]/).waitFor();
    const detailDuringSecondGenerate = await win.evaluate((id) => window.distillAPI.getRecording(id), imported.recording.id);
    const runningSecondAIJob = detailDuringSecondGenerate.jobs.find((job) => job.kind === 'ai' && job.state === 'running');
    if (!runningSecondAIJob || runningSecondAIJob.id === previousSecondAIJobId) {
      throw new Error('Expected Regenerate Notes to create a fresh running AI job.');
    }
    await waitForProcessingJob(win, imported.recording.id, runningSecondAIJob.id, 30000);
    await win.getByText('整理自 personal-reflection 模板的模拟 AI 笔记。').waitFor();
    await win.getByTestId('ai-artifact-history').getByText('技术思考').waitFor();
    await win.getByTestId('ai-artifact-history').getByText('个人随想').waitFor();
    await win.getByTestId('ai-artifact-history').getByText('技术思考').click();
    await win.getByText('整理自 technical-thinking 模板的模拟 AI 笔记。').waitFor();
    await win.getByTestId('ai-artifact-history').getByText('个人随想').click();
    await win.getByText('整理自 personal-reflection 模板的模拟 AI 笔记。').waitFor();
    aiArtifactHistoryVisible = true;
    const detailAfterSecondGenerate = await win.evaluate((id) => window.distillAPI.getRecording(id), imported.recording.id);
    aiArtifactHistoryPersisted = detailAfterSecondGenerate.artifacts.length >= 2 &&
      detailAfterSecondGenerate.latestArtifact?.templateId === 'personal-reflection' &&
      detailAfterSecondGenerate.artifacts.some((artifact) => artifact.templateId === 'technical-thinking');

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
    await win.getByText('phase1-transcript-long-中文-test').first().click();
    await win.getByTestId('transcript-row').filter({ hasText: '这是第一阶段的模拟转写' }).first().waitFor();
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
        seekPaused,
        seekReadyState,
        seekSource,
        rangedFetchStatus,
        appMenuRemoved,
        dragDropImported: Boolean(imported.recording),
        hasTranscriptScrollbar,
        retranscribeStartedFresh,
        retranscribeProgressVisible,
        aiGenerationStartedFresh,
        aiGenerationProgressVisible,
        aiArtifactHistoryPersisted,
        aiArtifactHistoryVisible,
        watchFolderRunning,
        watchFolderImported,
        watchFolderAutoTranscribed,
        hasLibraryText: text.includes('Voice Library'),
        hasDetailText: text.includes('phase1-transcript-long-中文-test'),
        hasSpeechToTextStatus: settingsText.includes('Mock STT ready'),
        autoTranscribedAfterImport: Boolean(imported.recording.jobs.find((job) => job.kind === 'transcription')),
        hasGeneratedAIArtifact: text.includes('整理自 personal-reflection 模板的模拟 AI 笔记。'),
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
  if (persisted.length < 2) {
    throw new Error(`Expected at least two persisted recordings after watch folder import, got ${persisted.length}.`);
  }
  if (audioElementCount !== 1) {
    throw new Error(`Expected one audio element, got ${audioElementCount}.`);
  }
  if (!audioDuration || audioDuration <= 30) {
    throw new Error(`Expected playable audio duration above the 30s transcript segment, got ${audioDuration}.`);
  }
  if (rangedFetchStatus !== 206) {
    throw new Error(`Expected distill-audio range fetch to return 206, got ${rangedFetchStatus}.`);
  }
  if (!seekSource.includes('#t=30.000')) {
    throw new Error(`Expected segment click to reload audio source with media fragment, got ${seekSource}.`);
  }
  if (seekTime < 30.5) {
    throw new Error(`Expected transcript segment click to play forward from 30s, got ${seekTime}.`);
  }
  if (seekPaused) {
    throw new Error('Expected transcript segment click to start playback.');
  }
  if (seekReadyState < 2) {
    throw new Error(`Expected audio to have current data after segment seek, got readyState ${seekReadyState}.`);
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
  if (!aiGenerationStartedFresh) {
    throw new Error('Expected Generate Notes to create a fresh running AI job.');
  }
  if (!aiGenerationProgressVisible) {
    throw new Error('Expected Generate Notes progress to be visible immediately.');
  }
  if (!aiArtifactHistoryPersisted) {
    throw new Error('Expected multiple AI artifacts to be persisted in history.');
  }
  if (!aiArtifactHistoryVisible) {
    throw new Error('Expected AI artifact history to be visible.');
  }
  if (!watchFolderRunning) {
    throw new Error('Expected watch folder to be running after saving settings.');
  }
  if (!watchFolderImported) {
    throw new Error('Expected watch folder to import a new audio file.');
  }
  if (!watchFolderAutoTranscribed) {
    throw new Error('Expected watch folder import to start automatic transcription.');
  }
  if (!appMenuRemoved) {
    throw new Error('Expected Electron application menu to be removed.');
  }
  if (!imported.recording) {
    throw new Error('Expected drag-and-drop import to create a recording.');
  }
  if (!text.includes('phase1-transcript-long-中文-test')) {
    throw new Error('Imported recording title was not visible.');
  }
  if (!settingsText.includes('Mock STT ready')) {
    throw new Error('Speech-to-text status was not visible in settings.');
  }
  if (!imported.recording.jobs.some((job) => job.kind === 'transcription')) {
    throw new Error('Expected import to start a transcription job automatically.');
  }
  if (!text.includes('整理自 personal-reflection 模板的模拟 AI 笔记。')) {
    throw new Error('Generated AI artifact summary was not visible.');
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

async function waitForWatchFolderStatus(win, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const status = await win.evaluate(() => window.distillAPI.getWatchFolderStatus());
    if (status.running || status.errorMessage) {
      return status;
    }
    await win.waitForTimeout(250);
  }
  return win.evaluate(() => window.distillAPI.getWatchFolderStatus());
}

function launchApp(exe, db) {
  return _electron.launch({
    executablePath: exe,
    env: {
      ...process.env,
      DISTILL_DB_PATH: db,
      DISTILL_STT_PROVIDER: 'mock',
      DISTILL_ALLOW_MOCK_STT: 'true',
      DISTILL_MOCK_STT_DELAY_MS: '1500',
      DISTILL_MOCK_STT_SEGMENT_COUNT: '36',
      DISTILL_LLM_PROVIDER: 'mock',
      DISTILL_ALLOW_MOCK_LLM: 'true',
      DISTILL_MOCK_LLM_DELAY_MS: '1500'
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
  return waitForProcessingJob(win, recordingId, jobId, timeoutMs);
}

async function waitForProcessingJob(win, recordingId, jobId, timeoutMs) {
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

  throw new Error(`Timed out waiting for processing job ${jobId}.`);
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
