import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileAudio, FolderOpen, Import, Library, RefreshCw, Search, Settings, Upload, XCircle } from 'lucide-react';
import type { ProcessingJob, RecordingDetail, RecordingListItem, SpeechToTextStatus, TranscriptSegment } from '@shared/types/domain';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { cn } from '@renderer/lib/utils';
import { useLibraryStore } from '@renderer/stores/libraryStore';

export function App() {
  const {
    recordings,
    selectedRecording,
    settings,
    speechToTextStatus,
    query,
    viewMode,
    loading,
    importing,
    checkingSpeechToText,
    transcribingIds,
    error,
    load,
    selectRecording,
    importFromDialog,
    importFromPath,
    transcribeRecording,
    search,
    showLibrary,
    showInbox,
    showSettings,
    saveSettings,
    refreshSpeechToTextStatus
  } = useLibraryStore();
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = Array.from(event.dataTransfer.files).find((item) => /\.(m4a|mp3|wav)$/i.test(item.name));
    const filePath = (file as File & { path?: string } | undefined)?.path;
    if (filePath) {
      void importFromPath(filePath);
    }
  }

  return (
    <div
      className={cn('grid h-full grid-cols-[260px_minmax(320px,420px)_1fr] bg-background text-foreground', dragging && 'outline outline-2 outline-accent')}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <Sidebar
        query={query}
        activeView={viewMode}
        onQueryChange={(value) => void search(value)}
        onImport={() => void importFromDialog()}
        onLibrary={showLibrary}
        onInbox={() => void showInbox()}
        onSettings={() => void showSettings()}
        importing={importing}
      />
      <LibraryPane
        recordings={recordings}
        selectedId={selectedRecording?.id ?? null}
        loading={loading}
        importing={importing}
        onSelect={(id) => void selectRecording(id)}
        onImport={() => void importFromDialog()}
      />
      <main className="min-w-0 border-l border-border bg-surface-elevated">
        {error ? <ErrorBanner message={error} /> : null}
        {viewMode === 'settings' ? (
          <SettingsPane
            settings={settings}
            speechToTextStatus={speechToTextStatus}
            checkingSpeechToText={checkingSpeechToText}
            onSave={(input) => void saveSettings(input)}
            onRefreshSpeechToText={() => void refreshSpeechToTextStatus()}
          />
        ) : viewMode === 'inbox' ? (
          <InboxPane settings={settings} onOpenSettings={() => void showSettings()} />
        ) : (
          <RecordingDetailPane
            recording={selectedRecording}
            importing={importing}
            isTranscribing={selectedRecording ? Boolean(transcribingIds[selectedRecording.id]) : false}
            onImport={() => void importFromDialog()}
            onTranscribe={(id) => void transcribeRecording(id)}
          />
        )}
      </main>
    </div>
  );
}

function Sidebar(props: {
  query: string;
  activeView: 'library' | 'inbox' | 'settings';
  importing: boolean;
  onQueryChange(value: string): void;
  onImport(): void;
  onLibrary(): void;
  onInbox(): void;
  onSettings(): void;
}) {
  return (
    <aside className="flex min-w-0 flex-col border-r border-border bg-surface px-3 py-3">
      <div className="flex h-10 items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[15px] font-semibold">
          <FileAudio className="h-4 w-4 text-accent" />
          <span>Distill</span>
        </div>
        <Button size="icon" title="Import Recording" onClick={props.onImport} disabled={props.importing}>
          <Import className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded border border-input bg-background px-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder="Search recordings"
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
        />
      </div>

      <nav className="mt-5 space-y-1">
        <SidebarItem icon={<Library className="h-4 w-4" />} label="Library" active={props.activeView === 'library'} onClick={props.onLibrary} />
        <SidebarItem icon={<FolderOpen className="h-4 w-4" />} label="Inbox" active={props.activeView === 'inbox'} onClick={props.onInbox} />
        <SidebarItem icon={<Settings className="h-4 w-4" />} label="Settings" active={props.activeView === 'settings'} onClick={props.onSettings} />
      </nav>

      <div className="mt-auto border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
        Drop M4A, MP3, or WAV files anywhere in the window.
      </div>
    </aside>
  );
}

function InboxPane(props: { settings: ReturnType<typeof useLibraryStore.getState>['settings']; onOpenSettings(): void }) {
  const watchFolder = props.settings?.watchFolder.trim();

  return (
    <section className="h-full overflow-y-auto px-8 py-6">
      <h1 className="text-2xl font-semibold">Inbox</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Watch Folder 会在下一阶段接入自动监听。现在这里用于确认收件箱入口、显示当前配置，并为后续导入队列保留位置。
      </p>

      <div className="mt-8 max-w-2xl border-t border-border pt-5">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Watch Folder</div>
        <div className="mt-3 rounded border border-border bg-background px-3 py-2 text-sm">
          {watchFolder ? watchFolder : '尚未配置'}
        </div>
        <Button className="mt-4" variant="secondary" onClick={props.onOpenSettings}>
          <Settings className="h-4 w-4" />
          打开设置
        </Button>
      </div>
    </section>
  );
}

function SidebarItem(props: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      className={cn(
        'flex h-9 w-full items-center gap-2 rounded px-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
        props.active && 'bg-muted text-foreground'
      )}
      onClick={props.onClick}
    >
      {props.icon}
      <span>{props.label}</span>
    </button>
  );
}

function LibraryPane(props: {
  recordings: RecordingListItem[];
  selectedId: string | null;
  loading: boolean;
  importing: boolean;
  onSelect(id: string): void;
  onImport(): void;
}) {
  return (
    <section className="flex min-w-0 flex-col bg-background">
      <header className="flex h-14 items-center justify-between border-b border-border px-4">
        <div>
          <h1 className="text-base font-semibold">Voice Library</h1>
          <p className="text-xs text-muted-foreground">{props.recordings.length} recordings</p>
        </div>
        <Button variant="secondary" size="sm" onClick={props.onImport} disabled={props.importing}>
          <Upload className="h-4 w-4" />
          Import
        </Button>
      </header>

      {props.loading && props.recordings.length === 0 ? (
        <div className="px-4 py-5 text-sm text-muted-foreground">Loading library...</div>
      ) : props.recordings.length === 0 ? (
        <EmptyLibrary onImport={props.onImport} importing={props.importing} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {props.recordings.map((recording) => (
            <RecordingRow key={recording.id} recording={recording} selected={recording.id === props.selectedId} onClick={() => props.onSelect(recording.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyLibrary(props: { onImport(): void; importing: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center">
      <FileAudio className="mb-4 h-10 w-10 text-muted-foreground" />
      <h2 className="text-base font-semibold">No recordings yet</h2>
      <p className="mt-2 max-w-[260px] text-sm leading-6 text-muted-foreground">Drop an M4A file here, or import one from disk.</p>
      <Button className="mt-5" onClick={props.onImport} disabled={props.importing}>
        <Import className="h-4 w-4" />
        Import Recording
      </Button>
    </div>
  );
}

function RecordingRow(props: { recording: RecordingListItem; selected: boolean; onClick(): void }) {
  const date = new Intl.DateTimeFormat(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(props.recording.importedAt));

  return (
    <button
      className={cn(
        'block w-full border-b border-border px-4 py-3 text-left hover:bg-muted',
        props.selected && 'bg-muted'
      )}
      onClick={props.onClick}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0 truncate text-sm font-medium">{props.recording.title}</div>
        <div className="shrink-0 text-xs text-muted-foreground">{formatDuration(props.recording.duration)}</div>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{props.recording.originalFileName}</span>
        <span className="shrink-0">{date}</span>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{formatFileSize(props.recording.fileSize)} · {props.recording.processingState}</div>
    </button>
  );
}

function RecordingDetailPane(props: {
  recording: RecordingDetail | null;
  importing: boolean;
  isTranscribing: boolean;
  onImport(): void;
  onTranscribe(id: string): void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, props.recording?.id]);

  if (!props.recording) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <FileAudio className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Select or import a recording</h2>
        <p className="mt-2 max-w-[360px] text-sm leading-6 text-muted-foreground">Your recording, transcript, and AI notes will live together here.</p>
        <Button className="mt-5" onClick={props.onImport} disabled={props.importing}>
          <Import className="h-4 w-4" />
          Import Recording
        </Button>
      </div>
    );
  }
  const recording = props.recording;
  const transcriptionJob = getLatestTranscriptionJob(recording);
  const transcriptionError = transcriptionJob?.state === 'failed' ? transcriptionJob : null;

  return (
    <article className="flex h-full min-w-0 flex-col">
      <header className="border-b border-border px-8 py-5">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold leading-tight">{recording.latestArtifact?.content.title ?? recording.title}</h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">{recording.filePath}</p>
          </div>
          <div className="shrink-0 text-right text-sm text-muted-foreground">
            <div>{formatDuration(recording.duration)}</div>
            <div>{recording.format.toUpperCase()}</div>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <audio ref={audioRef} className="h-10 flex-1" src={`distill-audio://recording/${recording.id}`} controls />
          <select
            className="h-9 rounded border border-input bg-background px-2 text-sm"
            value={playbackRate}
            onChange={(event) => setPlaybackRate(Number(event.target.value))}
            title="Playback speed"
          >
            {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
              <option key={rate} value={rate}>{rate}x</option>
            ))}
          </select>
          <Button
            variant="secondary"
            onClick={() => props.onTranscribe(recording.id)}
            disabled={props.isTranscribing}
            title={recording.transcript ? 'Regenerate transcript' : 'Transcribe recording'}
          >
            {props.isTranscribing ? 'Transcribing...' : recording.transcript ? 'Retranscribe' : 'Transcribe Recording'}
          </Button>
        </div>
        {transcriptionError ? (
          <JobErrorNotice
            job={transcriptionError}
            disabled={props.isTranscribing}
            onRetry={() => props.onTranscribe(recording.id)}
          />
        ) : null}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,420px)_1fr]">
        <section className="min-w-0 overflow-y-auto border-r border-border px-8 py-6">
          <SectionTitle title="Summary" />
          {recording.latestArtifact ? (
            <div className="space-y-6 text-sm leading-6">
              <p>{recording.latestArtifact.content.summary}</p>
              <NoteList title="Key Points" items={recording.latestArtifact.content.keyPoints} />
              <NoteList title="Todos" items={recording.latestArtifact.content.todos} />
            </div>
          ) : (
            <EmptySection text="AI summary is not generated yet. The LLM provider interface and artifact model are ready for the next phase." />
          )}
        </section>

        <section className="min-w-0 overflow-y-auto px-8 py-6">
          <SectionTitle title="Transcript" />
          {recording.transcript?.segments.length ? (
            <div className="space-y-1">
              {recording.transcript.segments.map((segment) => (
                <TranscriptRow
                  key={segment.id}
                  segment={segment}
                  onClick={() => {
                    if (audioRef.current) {
                      audioRef.current.currentTime = segment.startTime;
                      void audioRef.current.play();
                    }
                  }}
                />
              ))}
            </div>
          ) : props.isTranscribing || recording.processingState === 'running' ? (
            <EmptySection text="Transcribing... Transcript segments will appear here after the speech-to-text job completes." />
          ) : (
            <div className="max-w-[520px]">
              <EmptySection text="No transcript yet. Use the transcription action to create segment-level transcript data." />
              <Button className="mt-4" variant="secondary" onClick={() => props.onTranscribe(recording.id)}>
                Start Transcription
              </Button>
            </div>
          )}
        </section>
      </div>
    </article>
  );
}

function JobErrorNotice(props: { job: ProcessingJob; disabled: boolean; onRetry(): void }) {
  return (
    <div className="mt-4 flex items-start justify-between gap-4 rounded border border-destructive/25 bg-destructive/10 px-3 py-3 text-sm text-destructive">
      <div className="flex min-w-0 gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <div className="font-medium">Transcription failed</div>
          <div className="mt-1 break-words text-destructive/80">{props.job.errorMessage ?? 'The speech-to-text worker failed.'}</div>
        </div>
      </div>
      <Button variant="secondary" size="sm" onClick={props.onRetry} disabled={props.disabled}>
        Retry
      </Button>
    </div>
  );
}

function getLatestTranscriptionJob(recording: RecordingDetail): ProcessingJob | null {
  return recording.jobs.find((job) => job.kind === 'transcription') ?? null;
}

function TranscriptRow(props: { segment: TranscriptSegment; onClick(): void }) {
  return (
    <button className="grid w-full grid-cols-[64px_1fr] gap-4 rounded px-2 py-2 text-left hover:bg-muted" onClick={props.onClick}>
      <span className="text-xs tabular-nums text-muted-foreground">{formatTimestamp(props.segment.startTime)}</span>
      <span className="text-sm leading-6">{props.segment.text}</span>
    </button>
  );
}

function SettingsPane(props: {
  settings: ReturnType<typeof useLibraryStore.getState>['settings'];
  speechToTextStatus: SpeechToTextStatus | null;
  checkingSpeechToText: boolean;
  onSave(input: Parameters<typeof window.distillAPI.saveSettings>[0]): void;
  onRefreshSpeechToText(): void;
}) {
  const [watchFolder, setWatchFolder] = useState(props.settings?.watchFolder ?? '');
  const [model, setModel] = useState(props.settings?.deepSeekModel ?? 'deepseek-chat');
  const [speechProvider, setSpeechProvider] = useState(props.settings?.speechProvider ?? 'mock');
  const [speechModel, setSpeechModel] = useState(props.settings?.speechModel ?? 'faster-whisper-small');
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    setWatchFolder(props.settings?.watchFolder ?? '');
    setModel(props.settings?.deepSeekModel ?? 'deepseek-chat');
    setSpeechProvider(props.settings?.speechProvider ?? 'mock');
    setSpeechModel(props.settings?.speechModel ?? 'faster-whisper-small');
  }, [props.settings]);

  return (
    <section className="h-full overflow-y-auto px-8 py-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="mt-7 max-w-2xl space-y-7">
        <SttStatusPanel
          status={props.speechToTextStatus}
          checking={props.checkingSpeechToText}
          onRefresh={props.onRefreshSpeechToText}
        />
        <Field label="Speech-to-Text Provider">
          <select
            className="h-9 w-full rounded border border-input bg-background px-2 text-sm"
            value={speechProvider}
            onChange={(event) => setSpeechProvider(event.target.value as 'mock' | 'python')}
          >
            <option value="mock">Mock STT</option>
            <option value="python">Python Worker</option>
          </select>
        </Field>
        <Field label="Speech-to-Text Model">
          <Input value={speechModel} onChange={(event) => setSpeechModel(event.target.value)} />
        </Field>
        <Field label="AI Provider">
          <Input value="deepseek" disabled />
        </Field>
        <Field label="DeepSeek Model">
          <Input value={model} onChange={(event) => setModel(event.target.value)} />
        </Field>
        <Field label={props.settings?.deepSeekApiKeyConfigured ? 'DeepSeek API Key Configured' : 'DeepSeek API Key'}>
          <Input type="password" value={apiKey} placeholder={props.settings?.deepSeekApiKeyConfigured ? 'Leave blank to keep existing key' : 'Stored in the main process database'} onChange={(event) => setApiKey(event.target.value)} />
        </Field>
        <Field label="Watch Folder">
          <Input value={watchFolder} placeholder="D:\\VoiceInbox" onChange={(event) => setWatchFolder(event.target.value)} />
        </Field>
        <Button onClick={() => props.onSave({ deepSeekModel: model, speechProvider, speechModel, watchFolder, ...(apiKey ? { deepSeekApiKey: apiKey } : {}) })}>
          Save Settings
        </Button>
      </div>
    </section>
  );
}

function SttStatusPanel(props: { status: SpeechToTextStatus | null; checking: boolean; onRefresh(): void }) {
  const status = props.status;

  return (
    <section className="border-t border-border pt-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Speech-to-Text Status</div>
          <div className="mt-2 flex items-center gap-2 text-sm font-medium">
            {status?.ready ? <CheckCircle2 className="h-4 w-4 text-accent" /> : <XCircle className="h-4 w-4 text-destructive" />}
            <span>{formatSpeechStatus(status)}</span>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={props.onRefresh} disabled={props.checking}>
          <RefreshCw className={cn('h-4 w-4', props.checking && 'animate-spin')} />
          Check
        </Button>
      </div>

      {status ? (
        <div className="mt-4 grid gap-2 text-sm">
          <StatusLine label="Provider" value={status.provider} />
          <StatusLine label="Model" value={status.modelName} />
          {status.pythonCommand ? <StatusLine label="Python" value={status.pythonCommand} /> : null}
          {status.pythonVersion ? <StatusLine label="Python Version" value={status.pythonVersion} /> : null}
          {status.fasterWhisperVersion ? <StatusLine label="faster-whisper" value={status.fasterWhisperVersion} /> : null}
          {status.workerPath ? <StatusLine label="Worker" value={status.workerPath} /> : null}
          {status.errorMessage ? <p className="text-sm leading-6 text-destructive">{status.errorMessage}</p> : null}
          {status.setupHint ? <p className="text-sm leading-6 text-muted-foreground">{status.setupHint}</p> : null}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Status has not been checked yet.</p>
      )}
    </section>
  );
}

function StatusLine(props: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <span className="text-muted-foreground">{props.label}</span>
      <span className="min-w-0 break-words">{props.value}</span>
    </div>
  );
}

function formatSpeechStatus(status: SpeechToTextStatus | null): string {
  if (!status) {
    return 'Not checked';
  }
  if (status.provider === 'mock') {
    return 'Mock STT ready';
  }
  return status.ready ? 'Python worker ready' : 'Setup required';
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium">{props.label}</span>
      {props.children}
    </label>
  );
}

function SectionTitle(props: { title: string }) {
  return <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{props.title}</h2>;
}

function NoteList(props: { title: string; items: string[] }) {
  if (props.items.length === 0) {
    return null;
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{props.title}</h3>
      <ul className="space-y-2">
        {props.items.map((item) => (
          <li key={item} className="leading-6">{item}</li>
        ))}
      </ul>
    </div>
  );
}

function EmptySection(props: { text: string }) {
  return <p className="max-w-[520px] text-sm leading-6 text-muted-foreground">{props.text}</p>;
}

function ErrorBanner(props: { message: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
      <AlertCircle className="h-4 w-4" />
      <span>{props.message}</span>
    </div>
  );
}

function formatDuration(seconds: number | null): string {
  if (!seconds || !Number.isFinite(seconds)) {
    return '--:--';
  }
  return formatTimestamp(seconds);
}

function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes.toString().padStart(2, '0')}:${rest.toString().padStart(2, '0')}`;
}

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
