const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { _electron } = require('playwright');

async function main() {
  const root = path.resolve(__dirname, '..', '..');
  const fixtureAudio = path.join(root, 'test-fixtures', 'phase1-transcript-long-中文-test.m4a');
  const audio = path.join(root, 'test-results', 'phase1-transcript-long-中文-test.m4a');
  const db = path.join(root, 'test-results', 'phase0-ui.db');
  const exe = path.join(root, 'out', 'distill-win32-x64', 'distill.exe');
  const audioLibraryDir = path.join(root, 'test-results', 'audio-library');
  const assetDir = path.join(root, 'test-results', 'note-assets');
  const noteImagePath = path.join(root, 'test-results', 'note-photo.png');

  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${db}${suffix}`, { force: true });
  }
  fs.rmSync(audioLibraryDir, { recursive: true, force: true });
  fs.rmSync(assetDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(db), { recursive: true });
  fs.mkdirSync(audioLibraryDir, { recursive: true });
  fs.writeFileSync(noteImagePath, tinyPng());
  ensureAudioFixture(fixtureAudio, 75);
  fs.rmSync(audio, { force: true });
  fs.copyFileSync(fixtureAudio, audio);

  const app = await launchApp(exe, db, assetDir);

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
  let aiArtifactDeleteMenuVisible = false;
  let aiArtifactDeleted = false;
  let libraryContextOpenFolderVisible = false;
  let libraryContextDeleteVisible = false;
  let libraryListCreatedDateVisible = false;
  let calendarDayVisible = false;
  let calendarDayDetailVisible = false;
  let calendarRecordingOpenedDetail = false;
  let audioLibraryFolderPickerVisible = false;
  let audioLibraryFolderManualInputRemoved = false;
  let audioLibraryFolderRunning = false;
  let importedCopiedToAudioLibrary = false;
  let audioLibraryFolderImported = false;
  let audioLibraryFolderAutoTranscribed = false;
  let audioLibraryFolderVisibleInLibrary = false;
  let transcriptEditPersisted = false;
  let transcriptEditSearchUpdated = false;
  let noteCreated = false;
  let notePersisted = false;
  let noteSearchUpdated = false;
  let noteBoldTogglePersistsForTyping = false;
  let noteBoldButtonActiveAfterToggle = false;
  let noteItalicTogglePersistsForTyping = false;
  let noteItalicButtonActiveAfterToggle = false;
  let noteImageImported = false;
  let noteImageRendered = false;
  let noteToolbarEnhancedVisible = false;
  let noteBlankAreaEditable = false;
  let calendarNoteVisible = false;
  let calendarNoteOpenedDetail = false;
  const rendererErrors = [];

  try {
    const win = await app.firstWindow();
    win.on('pageerror', (error) => rendererErrors.push(error.message));
    win.on('console', (message) => {
      if (message.type() === 'error') {
        rendererErrors.push(message.text());
      }
    });
    await win.waitForLoadState('domcontentloaded');
    await win.waitForTimeout(1000);
    appMenuRemoved = await app.evaluate(({ Menu }) => Menu.getApplicationMenu() === null);
    await win.evaluate((folder) => window.distillAPI.saveSettings({ watchFolder: folder }), audioLibraryDir);
    const initialAudioLibraryStatus = await waitForAudioLibraryFolderStatus(win, 5000);
    audioLibraryFolderRunning = initialAudioLibraryStatus.running;

    await dragImportRecording(win, audio);
    const droppedRecordings = await waitForRecordingCount(win, 1, 30000);
    const droppedRecording = await win.evaluate((id) => window.distillAPI.getRecording(id), droppedRecordings[0].id);
    imported = { recording: droppedRecording, wasDuplicate: false };
    importedCopiedToAudioLibrary = isPathInsideDirectory(imported.recording.filePath, audioLibraryDir);
    await waitForTranscript(win, imported.recording.id, 30000);
    await win.evaluate(() => window.location.reload());
    await win.waitForLoadState('domcontentloaded');
    await win.waitForTimeout(1000);
    await win.getByText('phase1-transcript-long-中文-test').first().click();
    await win.waitForTimeout(500);
    const expectedLibraryDate = await win.evaluate((id) => {
      return window.distillAPI.getRecording(id).then((recording) => new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(recording.createdAt ?? recording.importedAt)));
    }, imported.recording.id);
    libraryListCreatedDateVisible = await win.getByText(expectedLibraryDate).first().isVisible();
    await win.getByText('phase1-transcript-long-中文-test').first().click({ button: 'right' });
    libraryContextOpenFolderVisible = await win.getByRole('button', { name: '打开所在文件夹' }).isVisible();
    libraryContextDeleteVisible = await win.getByRole('button', { name: '删除', exact: true }).isVisible();
    await win.keyboard.press('Escape');
    const calendarDate = await win.evaluate((id) => {
      const pad = (value) => String(value).padStart(2, '0');
      return window.distillAPI.getRecording(id).then((recording) => {
        const date = new Date(recording.createdAt ?? recording.importedAt);
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      });
    }, imported.recording.id);
    await win.getByRole('button', { name: 'Calendar' }).click();
    await win.getByText('按录音创建日期展示记录分布').waitFor();
    const calendarDay = win.locator(`[data-testid="calendar-day"][data-date="${calendarDate}"]`);
    await calendarDay.getByText('个项目').waitFor();
    calendarDayVisible = true;
    await calendarDay.click();
    const calendarRecording = win.locator(`[data-testid="calendar-recording-row"][data-recording-id="${imported.recording.id}"]`);
    await calendarRecording.waitFor();
    calendarDayDetailVisible = true;
    await calendarRecording.click();
    await win.getByRole('button', { name: 'Retranscribe' }).waitFor();
    calendarRecordingOpenedDetail = true;
    await win.getByRole('button', { name: 'Settings', exact: true }).click();
    await win.getByText('Speech-to-Text Model').waitFor();
    await win.getByText('Mock STT ready').waitFor();
    await win.getByText('Audio Library Folder').waitFor();
    audioLibraryFolderPickerVisible = await win.getByRole('button', { name: '选择文件夹' }).isVisible();
    audioLibraryFolderManualInputRemoved = await win.getByTestId('watch-folder-field').getByRole('textbox').count() === 0;
    settingsText = await win.locator('body').innerText();
    await win.getByRole('button', { name: 'Settings', exact: true }).click();
    await win.getByText('phase1-transcript-long-中文-test').first().waitFor();
    await expectNoInboxEntry(win);
    await win.getByRole('button', { name: 'New Note' }).click();
    await win.getByTestId('note-title-input').fill('测试文本笔记');
    await win.locator('section').filter({ has: win.getByTestId('note-editor') }).click({ position: { x: 20, y: 180 } });
    await win.getByTitle('Bold').click();
    await win.waitForFunction(() => document.querySelector('button[title="Bold"]')?.getAttribute('aria-pressed') === 'true');
    noteBoldButtonActiveAfterToggle = await win.getByTitle('Bold').getAttribute('aria-pressed') === 'true';
    await win.keyboard.type('粗体开关测试');
    noteBoldTogglePersistsForTyping = await win.getByTestId('note-editor').locator('strong').filter({ hasText: '粗体开关测试' }).count() > 0;
    await win.getByTitle('Bold').click();
    await win.waitForFunction(() => document.querySelector('button[title="Bold"]')?.getAttribute('aria-pressed') === 'false');
    await win.getByTitle('Italic').click();
    await win.waitForFunction(() => document.querySelector('button[title="Italic"]')?.getAttribute('aria-pressed') === 'true');
    noteItalicButtonActiveAfterToggle = await win.getByTitle('Italic').getAttribute('aria-pressed') === 'true';
    await win.keyboard.type('斜体开关测试');
    noteItalicTogglePersistsForTyping = await win.getByTestId('note-editor').locator('em').filter({ hasText: '斜体开关测试' }).count() > 0;
    await win.getByTitle('Italic').click();
    await win.waitForFunction(() => document.querySelector('button[title="Italic"]')?.getAttribute('aria-pressed') === 'false');
    await win.keyboard.type('这是一条和音频放在同一个 Library 里的人工文本笔记。');
    await win.getByText('Saved').waitFor({ timeout: 5000 });
    const libraryItemsAfterNote = await win.evaluate(() => window.distillAPI.listLibraryItems());
    const noteItem = libraryItemsAfterNote.find((item) => item.kind === 'note' && item.title === '测试文本笔记');
    noteCreated = Boolean(noteItem);
    notePersisted = Boolean(noteItem?.preview.includes('人工文本笔记'));
    const noteSearchResults = await win.evaluate(() => window.distillAPI.searchLibraryItems('人工文本笔记'));
    noteSearchUpdated = noteSearchResults.some((item) => item.kind === 'note' && item.title === '测试文本笔记');
    noteBlankAreaEditable = noteSearchUpdated;
    noteToolbarEnhancedVisible =
      await win.getByTitle('Insert Photo').isVisible() &&
      await win.getByTitle('Task List').isVisible() &&
      await win.getByTitle('Link').isVisible();
    if (noteItem) {
      const imageImport = await win.evaluate((filePath) => window.distillAPI.importNoteImageFromPath({ filePath }), noteImagePath);
      noteImageImported = imageImport.src.startsWith('distill-asset://note-image/');
      await win.evaluate(({ noteId, imageSrc }) => window.distillAPI.updateNote({
        noteId,
        title: '测试图片笔记',
        plainText: '包含图片的笔记',
        contentJson: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: '包含图片的笔记' }]
            },
            {
              type: 'image',
              attrs: { src: imageSrc, alt: '图片测试' }
            }
          ]
        }
      }), { noteId: noteItem.id, imageSrc: imageImport.src });
      await win.evaluate(() => window.location.reload());
      await win.waitForLoadState('domcontentloaded');
      await win.waitForTimeout(1000);
      await win.getByText('测试图片笔记').first().click();
      await win.locator('[data-testid="note-editor"] img').waitFor();
      noteImageRendered = await win.locator('[data-testid="note-editor"] img').evaluate((image) => image.complete && image.naturalWidth > 0);
      const todayDate = await win.evaluate(() => {
        const date = new Date();
        const pad = (value) => String(value).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      });
      await win.getByRole('button', { name: 'Calendar' }).click();
      const noteCalendarDay = win.locator(`[data-testid="calendar-day"][data-date="${todayDate}"]`);
      await noteCalendarDay.getByText('笔记').waitFor();
      calendarNoteVisible = true;
      await noteCalendarDay.click();
      await win.getByText('测试图片笔记').first().waitFor();
      await win.getByText('测试图片笔记').first().click();
      await win.getByTestId('note-title-input').waitFor();
      calendarNoteOpenedDetail = true;
    }
    await win.getByRole('button', { name: 'Library' }).click();
    await win.getByText('phase1-transcript-long-中文-test').first().click();
    fs.copyFileSync(audio, path.join(audioLibraryDir, 'audio-library-auto.m4a'));
    const watchedRecordings = await waitForRecordingCount(win, 2, 30000);
    const watchedRecording = watchedRecordings.find((recording) => {
      const fileName = path.basename(recording.filePath).toLowerCase();
      return recording.originalFileName === 'audio-library-auto.m4a' || fileName === 'audio-library-auto.m4a';
    });
    audioLibraryFolderImported = Boolean(watchedRecording);
    if (watchedRecording) {
      const watchedDetail = await waitForTranscript(win, watchedRecording.id, 30000);
      audioLibraryFolderAutoTranscribed = Boolean(watchedDetail.transcript?.segments.length);
    }
    await win.getByText('audio-library-auto').first().waitFor();
    audioLibraryFolderVisibleInLibrary = true;
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
    const editableRow = win.getByTestId('transcript-row').filter({ hasText: '长音频滚动测试片段 5。' }).first();
    await editableRow.hover();
    await editableRow.getByTitle('Edit transcript segment').click();
    await win.getByTestId('transcript-edit-textarea').fill('人工修正后的 transcript 片段。');
    await win.getByRole('button', { name: '保存' }).click();
    await win.getByText('人工修正后的 transcript 片段。').waitFor();
    const detailAfterTranscriptEdit = await win.evaluate((id) => window.distillAPI.getRecording(id), imported.recording.id);
    transcriptEditPersisted = Boolean(
      detailAfterTranscriptEdit.transcript?.fullText.includes('人工修正后的 transcript 片段。') &&
      detailAfterTranscriptEdit.transcript?.segments.some((segment) => segment.text === '人工修正后的 transcript 片段。')
    );
    const editedSearchResults = await win.evaluate(() => window.distillAPI.searchRecordings('人工修正后的'));
    transcriptEditSearchUpdated = editedSearchResults.some((recording) => recording.title === 'phase1-transcript-long-中文-test');
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
    await win.getByTestId('ai-artifact-history').getByText('技术思考').click({ button: 'right' });
    await win.getByTestId('ai-artifact-context-menu').getByRole('button', { name: 'Delete' }).waitFor();
    aiArtifactDeleteMenuVisible = true;
    await win.getByTestId('ai-artifact-context-menu').getByRole('button', { name: 'Delete' }).click();
    const detailAfterArtifactDelete = await win.evaluate((id) => window.distillAPI.getRecording(id), imported.recording.id);
    aiArtifactDeleted =
      detailAfterArtifactDelete.latestArtifact?.templateId === 'personal-reflection' &&
      !detailAfterArtifactDelete.artifacts.some((artifact) => artifact.templateId === 'technical-thinking');

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

  const reopenedApp = await launchApp(exe, db, assetDir);
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
        aiArtifactDeleteMenuVisible,
        aiArtifactDeleted,
        libraryContextOpenFolderVisible,
        libraryContextDeleteVisible,
        libraryListCreatedDateVisible,
        calendarDayVisible,
        calendarDayDetailVisible,
        calendarRecordingOpenedDetail,
        audioLibraryFolderPickerVisible,
        audioLibraryFolderManualInputRemoved,
        audioLibraryFolderRunning,
        importedCopiedToAudioLibrary,
        audioLibraryFolderImported,
        audioLibraryFolderAutoTranscribed,
        audioLibraryFolderVisibleInLibrary,
        transcriptEditPersisted,
        transcriptEditSearchUpdated,
        noteCreated,
        notePersisted,
        noteSearchUpdated,
        noteBoldTogglePersistsForTyping,
        noteBoldButtonActiveAfterToggle,
        noteItalicTogglePersistsForTyping,
        noteItalicButtonActiveAfterToggle,
        noteImageImported,
        noteImageRendered,
        noteToolbarEnhancedVisible,
        noteBlankAreaEditable,
        calendarNoteVisible,
        calendarNoteOpenedDetail,
        rendererErrorCount: rendererErrors.length,
        hasLibraryText: text.includes('Library'),
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
    throw new Error(`Expected at least two persisted recordings after audio library folder import, got ${persisted.length}.`);
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
  if (!transcriptEditPersisted) {
    throw new Error('Expected manual transcript segment edit to persist in the latest transcript.');
  }
  if (!transcriptEditSearchUpdated) {
    throw new Error('Expected transcript search to include the edited transcript text.');
  }
  if (!noteCreated) {
    throw new Error('Expected New Note to create a text note in Library.');
  }
  if (!notePersisted) {
    throw new Error('Expected text note content to persist in the Library list preview.');
  }
  if (!noteSearchUpdated) {
    throw new Error('Expected text note content to be searchable from Library search.');
  }
  if (!noteBoldTogglePersistsForTyping) {
    throw new Error('Expected toggling Bold before typing to make following note text bold.');
  }
  if (!noteBoldButtonActiveAfterToggle) {
    throw new Error('Expected Bold toolbar button to show active state after toggling Bold.');
  }
  if (!noteItalicTogglePersistsForTyping) {
    throw new Error('Expected toggling Italic before typing to make following note text italic.');
  }
  if (!noteItalicButtonActiveAfterToggle) {
    throw new Error('Expected Italic toolbar button to show active state after toggling Italic.');
  }
  if (!noteBlankAreaEditable) {
    throw new Error('Expected clicking the blank note editor area to focus and accept text input.');
  }
  if (!noteToolbarEnhancedVisible) {
    throw new Error('Expected enhanced note toolbar actions to be visible.');
  }
  if (!noteImageImported) {
    throw new Error('Expected note image import to copy a local image into managed assets.');
  }
  if (!noteImageRendered) {
    throw new Error('Expected imported note image to render in the note editor.');
  }
  if (!calendarNoteVisible) {
    throw new Error('Expected Calendar to show notes on their creation date.');
  }
  if (!calendarNoteOpenedDetail) {
    throw new Error('Expected clicking a Calendar note to open the note editor.');
  }
  if (rendererErrors.length > 0) {
    throw new Error(`Expected no renderer errors, got: ${rendererErrors.join('\n')}`);
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
  if (!aiArtifactDeleteMenuVisible) {
    throw new Error('Expected AI artifact history context menu to show Delete.');
  }
  if (!aiArtifactDeleted) {
    throw new Error('Expected AI artifact history Delete action to remove the selected artifact.');
  }
  if (!libraryContextOpenFolderVisible) {
    throw new Error('Expected Library recording context menu to show Open in Folder.');
  }
  if (!libraryContextDeleteVisible) {
    throw new Error('Expected Library recording context menu to show Delete.');
  }
  if (!libraryListCreatedDateVisible) {
    throw new Error('Expected Library recording list to show the recording creation date.');
  }
  if (!calendarDayVisible) {
    throw new Error('Expected Calendar to show the imported recording date.');
  }
  if (!calendarDayDetailVisible) {
    throw new Error('Expected clicking a calendar date to show that day recording list.');
  }
  if (!calendarRecordingOpenedDetail) {
    throw new Error('Expected clicking a calendar day recording to open recording detail.');
  }
  if (!audioLibraryFolderPickerVisible) {
    throw new Error('Expected Settings to show an Audio Library Folder picker button.');
  }
  if (!audioLibraryFolderManualInputRemoved) {
    throw new Error('Expected Settings to avoid a manually editable Audio Library Folder text input.');
  }
  if (!audioLibraryFolderRunning) {
    throw new Error('Expected audio library folder watcher to be running after saving settings.');
  }
  if (!importedCopiedToAudioLibrary) {
    throw new Error('Expected drag-and-drop import to copy the recording into the audio library folder.');
  }
  if (!audioLibraryFolderImported) {
    throw new Error('Expected audio library folder watcher to import a new audio file.');
  }
  if (!audioLibraryFolderAutoTranscribed) {
    throw new Error('Expected audio library folder import to start automatic transcription.');
  }
  if (!audioLibraryFolderVisibleInLibrary) {
    throw new Error('Expected audio library folder import to refresh the library UI.');
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

async function waitForAudioLibraryFolderStatus(win, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const status = await win.evaluate(() => window.distillAPI.getAudioLibraryFolderStatus());
    if (status.running || status.errorMessage) {
      return status;
    }
    await win.waitForTimeout(250);
  }
  return win.evaluate(() => window.distillAPI.getAudioLibraryFolderStatus());
}

async function expectNoInboxEntry(win) {
  const inboxEntries = await win.getByRole('button', { name: 'Inbox' }).count();
  if (inboxEntries !== 0) {
    throw new Error(`Expected Inbox sidebar entry to be removed, got ${inboxEntries}.`);
  }
}

function isPathInsideDirectory(filePath, directoryPath) {
  const relativePath = path.relative(path.resolve(directoryPath), path.resolve(filePath));
  return relativePath.length > 0 && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function launchApp(exe, db, assetDir) {
  return _electron.launch({
    executablePath: exe,
    env: {
      ...process.env,
      DISTILL_DB_PATH: db,
      DISTILL_ASSET_DIR: assetDir,
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

function tinyPng() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lpXW8QAAAABJRU5ErkJggg==',
    'base64'
  );
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
