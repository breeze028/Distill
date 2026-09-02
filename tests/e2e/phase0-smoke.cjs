const fs = require('node:fs');
const path = require('node:path');
const { _electron } = require('playwright');

async function main() {
  const root = path.resolve(__dirname, '..', '..');
  const audio = path.join(root, 'test-fixtures', 'phase0-中文-test.m4a');
  const db = path.join(root, 'test-results', 'phase0-ui.db');
  const exe = path.join(root, 'out', 'distill-win32-x64', 'distill.exe');

  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${db}${suffix}`, { force: true });
  }
  fs.mkdirSync(path.dirname(db), { recursive: true });

  const app = await _electron.launch({
    executablePath: exe,
    env: {
      ...process.env,
      DISTILL_DB_PATH: db
    }
  });

  try {
    const win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await win.waitForTimeout(1000);
    const appMenuRemoved = await app.evaluate(({ Menu }) => Menu.getApplicationMenu() === null);

    const imported = await win.evaluate((filePath) => window.distillAPI.importRecordingFromPath(filePath), audio);
    await win.evaluate(() => window.location.reload());
    await win.waitForLoadState('domcontentloaded');
    await win.waitForTimeout(1000);
    await win.getByText('phase0-中文-test').first().click();
    await win.waitForTimeout(500);
    await win.getByRole('button', { name: 'Settings', exact: true }).click();
    await win.getByText('Speech-to-Text Model').waitFor();
    await win.getByRole('button', { name: 'Settings', exact: true }).click();
    await win.getByText('phase0-中文-test').first().waitFor();
    await win.getByRole('button', { name: 'Inbox' }).click();
    await win.getByText('Watch Folder', { exact: true }).waitFor();
    await win.getByRole('button', { name: 'Inbox' }).click();
    await win.getByText('phase0-中文-test').first().waitFor();

    const text = await win.locator('body').innerText();
    await win.screenshot({
      path: path.join(root, 'test-results', 'phase0-import-detail.png'),
      fullPage: true
    });

    const persisted = await win.evaluate(() => window.distillAPI.listRecordings());
    const audioElementCount = await win.locator('audio').count();
    const audioDuration = await win.locator('audio').evaluate((audio) => {
      const element = audio;
      return Number.isFinite(element.duration) ? element.duration : null;
    });

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
          appMenuRemoved,
          hasLibraryText: text.includes('Voice Library'),
          hasDetailText: text.includes('phase0-中文-test')
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
    if (!audioDuration || audioDuration <= 0) {
      throw new Error(`Expected playable audio duration, got ${audioDuration}.`);
    }
    if (!appMenuRemoved) {
      throw new Error('Expected Electron application menu to be removed.');
    }
    if (!text.includes('phase0-中文-test')) {
      throw new Error('Imported recording title was not visible.');
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
