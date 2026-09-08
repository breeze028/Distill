const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { _electron } = require('playwright');

async function main() {
  const root = path.resolve(__dirname, '..', '..');
  const fixtureAudio = path.join(root, 'test-fixtures', 'assistant-weekend.m4a');
  const audio = path.join(root, 'test-results', 'assistant-weekend.m4a');
  const db = path.join(root, 'test-results', 'assistant-ui.db');
  const exe = path.join(root, 'out', 'distill-win32-x64', 'distill.exe');
  const audioLibraryDir = path.join(root, 'test-results', 'assistant-audio-library');
  const assetDir = path.join(root, 'test-results', 'assistant-note-assets');

  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${db}${suffix}`, { force: true });
  }
  fs.rmSync(audioLibraryDir, { recursive: true, force: true });
  fs.rmSync(assetDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(db), { recursive: true });
  fs.mkdirSync(audioLibraryDir, { recursive: true });
  ensureAudioFixture(fixtureAudio, 8);
  fs.rmSync(audio, { force: true });
  fs.copyFileSync(fixtureAudio, audio);

  const app = await launchApp(exe, db, assetDir);
  const rendererErrors = [];
  let recordingSourceOpened = false;
  let recordingSourceSeeked = false;
  let noteSourceOpened = false;
  let persistedConversation = false;
  let layout1366Ok = false;
  let layout1920Ok = false;
  let closedLayoutOk = false;
  let enterSent = false;
  let shiftEnterNewline = false;
  let altEnterNewline = false;
  let fullScreenOk = false;
  let resizedOk = false;
  let sidebarResizedOk = false;
  let libraryResizedOk = false;

  try {
    const win = await app.firstWindow();
    win.on('pageerror', (error) => rendererErrors.push(error.message));
    win.on('console', (message) => {
      if (message.type() === 'error') {
        rendererErrors.push(message.text());
      }
    });
    await win.waitForLoadState('domcontentloaded');
    await win.waitForTimeout(800);
    await win.evaluate((folder) => window.distillAPI.saveSettings({ watchFolder: folder }), audioLibraryDir);

    const imported = await win.evaluate((filePath) => window.distillAPI.importRecordingFromPath(filePath), audio);
    const transcriptDetail = await waitForTranscript(win, imported.recording.id, 30000);
    const sourceSegment = transcriptDetail.transcript.segments[1] ?? transcriptDetail.transcript.segments[0];
    await win.evaluate(({ recordingId, transcriptId, segmentId }) => window.distillAPI.editTranscriptSegment({
      recordingId,
      transcriptId,
      segmentId,
      text: '这个周末很无聊，不知道做什么。'
    }), {
      recordingId: imported.recording.id,
      transcriptId: transcriptDetail.transcript.id,
      segmentId: sourceSegment.id
    });
    const note = await win.evaluate(() => window.distillAPI.createNote({ title: '摄影计划' }));
    await win.evaluate((noteId) => window.distillAPI.updateNote({
      noteId,
      title: '摄影计划',
      plainText: '我之前写过想学习摄影，先从周末扫街开始。',
      contentJson: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '我之前写过想学习摄影，先从周末扫街开始。' }]
          }
        ]
      }
    }), note.id);
    await win.evaluate(() => window.location.reload());
    await win.waitForLoadState('domcontentloaded');
    await win.waitForTimeout(800);

    await win.getByText('assistant-weekend').first().click();
    const sidebarWidthBefore = await testIdWidth(win, 'sidebar-pane');
    const sidebarHandle = await win.getByTestId('sidebar-resize-handle').boundingBox();
    if (sidebarHandle) {
      await win.mouse.move(sidebarHandle.x + sidebarHandle.width / 2, sidebarHandle.y + sidebarHandle.height / 2);
      await win.mouse.down();
      await win.mouse.move(sidebarHandle.x + 60, sidebarHandle.y + sidebarHandle.height / 2, { steps: 4 });
      await win.mouse.up();
      const sidebarWidthAfter = await testIdWidth(win, 'sidebar-pane');
      sidebarResizedOk = sidebarWidthAfter > sidebarWidthBefore + 40;
    }
    const libraryWidthBefore = await testIdWidth(win, 'library-pane');
    const libraryHandle = await win.getByTestId('library-resize-handle').boundingBox();
    if (libraryHandle) {
      await win.mouse.move(libraryHandle.x + libraryHandle.width / 2, libraryHandle.y + libraryHandle.height / 2);
      await win.mouse.down();
      await win.mouse.move(libraryHandle.x + 80, libraryHandle.y + libraryHandle.height / 2, { steps: 4 });
      await win.mouse.up();
      const libraryWidthAfter = await testIdWidth(win, 'library-pane');
      libraryResizedOk = libraryWidthAfter > libraryWidthBefore + 60;
    }
    await win.getByRole('button', { name: 'Ask Distill' }).click();
    await win.getByTestId('assistant-panel').waitFor();
    await win.setViewportSize({ width: 1366, height: 768 });
    await win.waitForTimeout(250);
    layout1366Ok = await hasNoHorizontalOverflow(win);
    const widthBeforeResize = await assistantWidth(win);
    const resizeBox = await win.getByTestId('assistant-resize-handle').boundingBox();
    if (resizeBox) {
      await win.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
      await win.mouse.down();
      await win.mouse.move(resizeBox.x - 260, resizeBox.y + resizeBox.height / 2, { steps: 6 });
      await win.mouse.up();
      const widthAfterResize = await assistantWidth(win);
      resizedOk = widthAfterResize > widthBeforeResize + 180;
    }
    await win.screenshot({
      path: path.join(root, 'test-results', 'assistant-1366x768.png'),
      fullPage: true
    });
    await win.setViewportSize({ width: 1920, height: 1080 });
    await win.waitForTimeout(250);
    layout1920Ok = await hasNoHorizontalOverflow(win);
    await win.getByTitle('Full screen Assistant').click();
    await win.waitForTimeout(250);
    fullScreenOk = await win.getByTestId('assistant-panel').evaluate((panel) => {
      const rect = panel.getBoundingClientRect();
      return panel.getAttribute('data-fullscreen') === 'true' &&
        rect.left <= 1 &&
        rect.top <= 1 &&
        rect.width >= window.innerWidth - 2 &&
        rect.height >= window.innerHeight - 2;
    });
    await win.screenshot({
      path: path.join(root, 'test-results', 'assistant-fullscreen.png'),
      fullPage: true
    });
    await win.getByTitle('Exit full screen').click();
    await win.screenshot({
      path: path.join(root, 'test-results', 'assistant-1920x1080.png'),
      fullPage: true
    });
    const assistantInput = win.getByTestId('assistant-input');
    await assistantInput.fill('快捷键第一行');
    await assistantInput.focus();
    await win.keyboard.down('Shift');
    await win.keyboard.press('Enter');
    await win.keyboard.up('Shift');
    await win.keyboard.type('第二行');
    shiftEnterNewline = await assistantInput.inputValue().then((value) => value === '快捷键第一行\n第二行');
    await win.keyboard.down('Alt');
    await win.keyboard.press('Enter');
    await win.keyboard.up('Alt');
    await win.keyboard.type('第三行');
    altEnterNewline = await assistantInput.inputValue().then((value) => value === '快捷键第一行\n第二行\n第三行');
    await win.getByTestId('assistant-input').fill('我以前有没有提过周末很无聊？');
    await win.keyboard.press('Enter');
    await win.getByText('我找到了', { exact: false }).waitFor({ timeout: 30000 });
    enterSent = true;
    await win.getByTestId('assistant-sources').waitFor();
    await win.getByText('摄影计划').first().click();
    await win.getByTestId('assistant-source').filter({ hasText: 'assistant-weekend' }).first().click();
    await win.getByRole('button', { name: 'Retranscribe' }).waitFor();
    recordingSourceOpened = await win.getByText('assistant-weekend').first().isVisible();
    await win.waitForFunction((startTime) => {
      const audio = document.querySelector('audio');
      return Boolean(audio?.currentSrc.includes(`#t=${startTime.toFixed(3)}`)) && audio.currentTime >= Math.max(0, startTime - 0.5);
    }, sourceSegment.startTime, { timeout: 5000 });
    recordingSourceSeeked = true;

    await win.getByText('摄影计划').first().click();
    await win.getByTitle('New assistant conversation').click();
    await win.getByTestId('assistant-input').fill('我之前写过哪些关于摄影的笔记？');
    await win.getByTitle('Send').click();
    await win.getByText('最直接的一条是', { exact: false }).waitFor({ timeout: 30000 });
    await win.getByTestId('assistant-source').filter({ hasText: '摄影计划' }).first().click();
    await win.getByTestId('note-title-input').waitFor();
    noteSourceOpened = await win.getByTestId('note-title-input').inputValue().then((value) => value === '摄影计划');
    persistedConversation = await win.evaluate(() => window.distillAPI.listAssistantConversations().then((items) => items.length >= 2));
    await win.getByTitle('Close Assistant').click();
    await win.getByTestId('assistant-panel').waitFor({ state: 'detached' });
    closedLayoutOk = await hasNoHorizontalOverflow(win);

    await win.screenshot({
      path: path.join(root, 'test-results', 'assistant-panel.png'),
      fullPage: true
    });
  } finally {
    await app.close();
  }

  console.log(JSON.stringify({
    recordingSourceOpened,
    recordingSourceSeeked,
    noteSourceOpened,
    persistedConversation,
    layout1366Ok,
    layout1920Ok,
    closedLayoutOk,
    enterSent,
    shiftEnterNewline,
    altEnterNewline,
    fullScreenOk,
    resizedOk,
    sidebarResizedOk,
    libraryResizedOk,
    rendererErrorCount: rendererErrors.length
  }, null, 2));

  if (!sidebarResizedOk || !libraryResizedOk) {
    throw new Error('Expected main Sidebar and Library pane boundaries to be resizable.');
  }
  if (!enterSent || !shiftEnterNewline || !altEnterNewline) {
    throw new Error('Expected Assistant input shortcuts: Enter sends, Shift/Alt+Enter insert newlines.');
  }
  if (!fullScreenOk) {
    throw new Error('Expected Assistant full screen mode to fill the app window.');
  }
  if (!resizedOk) {
    throw new Error('Expected dragging the Assistant edge to resize the panel.');
  }
  if (!layout1366Ok || !layout1920Ok || !closedLayoutOk) {
    throw new Error('Expected Assistant open/closed layouts to avoid horizontal overflow at checked desktop sizes.');
  }
  if (!recordingSourceOpened) {
    throw new Error('Expected clicking a recording Assistant source to open the recording detail.');
  }
  if (!recordingSourceSeeked) {
    throw new Error('Expected clicking a transcript Assistant source to seek audio to its segment time.');
  }
  if (!noteSourceOpened) {
    throw new Error('Expected clicking a note Assistant source to open the note detail.');
  }
  if (!persistedConversation) {
    throw new Error('Expected Assistant conversations to persist in SQLite.');
  }
  if (rendererErrors.length > 0) {
    throw new Error(`Expected no renderer errors, got: ${rendererErrors.join('\n')}`);
  }
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
      DISTILL_MOCK_STT_DELAY_MS: '100',
      DISTILL_LLM_PROVIDER: 'mock',
      DISTILL_ALLOW_MOCK_LLM: 'true',
      DISTILL_MOCK_LLM_DELAY_MS: '100',
      DISTILL_MOCK_AGENT_DELAY_MS: '100'
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
    await win.waitForTimeout(250);
  }
  throw new Error('Timed out waiting for mock transcript.');
}

async function hasNoHorizontalOverflow(win) {
  return win.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return Math.max(root.scrollWidth, body.scrollWidth) <= window.innerWidth + 1;
  });
}

async function assistantWidth(win) {
  return win.getByTestId('assistant-panel').evaluate((panel) => panel.getBoundingClientRect().width);
}

async function testIdWidth(win, testId) {
  return win.getByTestId(testId).evaluate((element) => element.getBoundingClientRect().width);
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
