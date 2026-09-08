import { Component, useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import Underline from '@tiptap/extension-underline';
import { AlertCircle, Bold, Bot, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Code2, Clock3, FileAudio, FileText, FolderOpen, Heading1, Heading2, Image as ImageIcon, Import, Italic, Library, Link2, List, ListChecks, ListOrdered, Minus, Pencil, Plus, Quote, Redo2, RefreshCw, Save, Search, Settings, Strikethrough, Trash2, Underline as UnderlineIcon, Undo2, Upload, X, XCircle } from 'lucide-react';
import type { AgentScope, AIArtifact, AIArtifactTemplate, LibraryCalendarDay, LibraryItem, NoteDetail, ProcessingJob, RecordingDetail, RecordingListItem, RichTextDocument, SpeechToTextStatus, TranscriptSegment, WatchFolderStatus } from '@shared/types/domain';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { cn } from '@renderer/lib/utils';
import { useLibraryStore } from '@renderer/stores/libraryStore';
import { useAssistantStore } from '@renderer/stores/assistantStore';
import { AssistantPanel } from '@renderer/features/assistant/AssistantPanel';

export function App() {
  return (
    <AppErrorBoundary>
      <AppShell />
    </AppErrorBoundary>
  );
}

function AppShell() {
  const {
    libraryItems,
    recordings,
    selectedRecording,
    selectedNote,
    calendarMonth,
    calendarDays,
    selectedCalendarDate,
    calendarItems,
    aiTemplates,
    settings,
    speechToTextStatus,
    watchFolderStatus,
    query,
    viewMode,
    loading,
    calendarLoading,
    importing,
    checkingSpeechToText,
    transcribingIds,
    generatingArtifactIds,
    error,
    load,
    selectRecording,
    createNote,
    selectNote,
    saveNote,
    deleteNote,
    importFromDialog,
    importFromPaths,
    transcribeRecording,
    editTranscriptSegment,
    revealRecordingInFolder,
    deleteRecording,
    generateArtifact,
    deleteAIArtifact,
    search,
    showLibrary,
    showCalendar,
    loadCalendarMonth,
    selectCalendarDate,
    showSettings,
    saveSettings,
    refreshSpeechToTextStatus
  } = useLibraryStore();
  const assistantOpen = useAssistantStore((state) => state.open);
  const setAssistantOpen = useAssistantStore((state) => state.setOpen);
  const [dragging, setDragging] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [libraryPaneWidth, setLibraryPaneWidth] = useState(420);
  const [resizingPane, setResizingPane] = useState<'sidebar' | 'library' | null>(null);
  const dragDepth = useRef(0);
  const paneResize = useRef<{
    pane: 'sidebar' | 'library';
    pointerId: number;
    startX: number;
    startSidebarWidth: number;
    startLibraryPaneWidth: number;
  } | null>(null);
  const assistantScope = buildAssistantScope(selectedRecording, selectedNote);
  const assistantScopeLabel = formatAssistantScopeLabel(selectedRecording, selectedNote);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => window.distillAPI.onLibraryChanged(() => {
    void load();
  }), [load]);

  function handleDragEnter(event: React.DragEvent) {
    event.preventDefault();
    if (!hasDraggedFiles(event)) {
      return;
    }

    dragDepth.current += 1;
    setDragging(true);
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    if (hasDraggedFiles(event)) {
      event.dataTransfer.dropEffect = 'copy';
      setDragging(true);
    }
  }

  function handleDragLeave(event: React.DragEvent) {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) {
      setDragging(false);
    }
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const filePaths = Array.from(event.dataTransfer.files)
      .filter(isSupportedAudioFile)
      .map(getDroppedFilePath)
      .filter((filePath) => filePath.length > 0);

    if (filePaths.length > 0) {
      void importFromPaths(filePaths);
    }
  }

  function startPaneResize(pane: 'sidebar' | 'library', event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    paneResize.current = {
      pane,
      pointerId: event.pointerId,
      startX: event.clientX,
      startSidebarWidth: sidebarWidth,
      startLibraryPaneWidth: libraryPaneWidth
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    setResizingPane(pane);
  }

  function updatePaneResize(event: PointerEvent<HTMLDivElement>) {
    const resize = paneResize.current;
    if (!resize || resize.pointerId !== event.pointerId) {
      return;
    }

    const delta = event.clientX - resize.startX;
    if (resize.pane === 'sidebar') {
      setSidebarWidth(clampNumber(resize.startSidebarWidth + delta, 220, 340));
    } else {
      setLibraryPaneWidth(clampNumber(resize.startLibraryPaneWidth + delta, 320, 620));
    }
  }

  function endPaneResize(event: PointerEvent<HTMLDivElement>) {
    const resize = paneResize.current;
    if (resize?.pointerId === event.pointerId && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    paneResize.current = null;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    setResizingPane(null);
  }

  return (
    <div
      data-testid="app-shell"
      className={cn('relative grid h-full min-h-0 bg-background text-foreground', dragging && 'outline outline-2 outline-accent')}
      style={{
        gridTemplateColumns: `${sidebarWidth}px ${paneResizeHandleWidth}px ${libraryPaneWidth}px ${paneResizeHandleWidth}px minmax(0, 1fr)`
      }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragging ? <DropOverlay /> : null}
      <Sidebar
        query={query}
        activeView={viewMode}
        onQueryChange={(value) => void search(value)}
        onImport={() => void importFromDialog()}
        onLibrary={showLibrary}
        onCalendar={() => void showCalendar()}
        onSettings={() => void showSettings()}
        onAssistant={() => setAssistantOpen(!assistantOpen)}
        assistantOpen={assistantOpen}
        importing={importing}
      />
      <PaneResizeHandle
        testId="sidebar-resize-handle"
        active={resizingPane === 'sidebar'}
        title="Resize Sidebar"
        onPointerDown={(event) => startPaneResize('sidebar', event)}
        onPointerMove={updatePaneResize}
        onPointerUp={endPaneResize}
        onPointerCancel={endPaneResize}
      />
      <LibraryPane
        items={libraryItems}
        selectedKey={selectedNote ? libraryItemKey('note', selectedNote.id) : selectedRecording ? libraryItemKey('recording', selectedRecording.id) : null}
        loading={loading}
        importing={importing}
        onSelect={(item) => {
          if (item.kind === 'recording') {
            void selectRecording(item.id);
          } else {
            void selectNote(item.id);
          }
        }}
        onRevealInFolder={(id) => void revealRecordingInFolder(id)}
        onDeleteRecording={(id) => void deleteRecording(id)}
        onDeleteNote={(id) => void deleteNote(id)}
        onImport={() => void importFromDialog()}
        onCreateNote={() => void createNote()}
      />
      <PaneResizeHandle
        testId="library-resize-handle"
        active={resizingPane === 'library'}
        title="Resize Library"
        onPointerDown={(event) => startPaneResize('library', event)}
        onPointerMove={updatePaneResize}
        onPointerUp={endPaneResize}
        onPointerCancel={endPaneResize}
      />
      <main className="min-h-0 min-w-0 border-l border-border bg-surface-elevated">
        {error ? <ErrorBanner message={error} /> : null}
        {viewMode === 'settings' ? (
          <SettingsPane
            settings={settings}
            speechToTextStatus={speechToTextStatus}
            watchFolderStatus={watchFolderStatus}
            checkingSpeechToText={checkingSpeechToText}
            onSave={(input) => void saveSettings(input)}
            onRefreshSpeechToText={() => void refreshSpeechToTextStatus()}
          />
        ) : viewMode === 'calendar' ? (
          <CalendarPane
            month={calendarMonth}
            days={calendarDays}
            selectedDate={selectedCalendarDate}
            items={calendarItems}
            loading={calendarLoading}
            onMonthChange={(year, month) => void loadCalendarMonth(year, month)}
            onToday={() => {
              const today = localDateKey(new Date());
              const [year, month] = calendarParts(today);
              void loadCalendarMonth(year, month).then(() => selectCalendarDate(today));
            }}
            onSelectDate={(date) => void selectCalendarDate(date)}
            onSelectItem={(item) => {
              if (item.kind === 'recording') {
                void selectRecording(item.id);
              } else {
                void selectNote(item.id);
              }
            }}
          />
        ) : selectedNote ? (
          <NoteDetailPane
            note={selectedNote}
            onSave={saveNote}
          />
        ) : (
          <RecordingDetailPane
            recording={selectedRecording}
            aiTemplates={aiTemplates}
            importing={importing}
            isTranscribing={selectedRecording ? Boolean(transcribingIds[selectedRecording.id]) : false}
            isGeneratingArtifact={selectedRecording ? Boolean(generatingArtifactIds[selectedRecording.id]) : false}
            onImport={() => void importFromDialog()}
            onCreateNote={() => void createNote()}
            onTranscribe={(id) => void transcribeRecording(id)}
            onEditTranscriptSegment={(recordingId, transcriptId, segmentId, text) => editTranscriptSegment(recordingId, transcriptId, segmentId, text)}
            onGenerateArtifact={(id, templateId) => void generateArtifact(id, templateId)}
            onDeleteAIArtifact={(recordingId, artifactId) => deleteAIArtifact(recordingId, artifactId)}
          />
        )}
      </main>
      {assistantOpen ? (
        <AssistantPanel
          scope={assistantScope}
          scopeLabel={assistantScopeLabel}
          onClose={() => setAssistantOpen(false)}
          onOpenRecording={(id) => void selectRecording(id)}
          onOpenNote={(id) => void selectNote(id)}
        />
      ) : null}
    </div>
  );
}

function DropOverlay() {
  return (
    <div data-testid="drop-overlay" className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent/10 backdrop-blur-[1px]">
      <div className="flex min-h-[156px] min-w-[320px] flex-col items-center justify-center rounded border border-accent bg-background/95 px-8 py-6 text-center shadow-sm">
        <Upload className="mb-3 h-8 w-8 text-accent" />
        <div className="text-base font-semibold">释放以导入音频</div>
        <p className="mt-2 text-sm text-muted-foreground">支持 M4A、MP3、WAV，可一次拖入多个文件。</p>
      </div>
    </div>
  );
}

const paneResizeHandleWidth = 6;

function PaneResizeHandle(props: {
  testId: string;
  title: string;
  active: boolean;
  onPointerDown(event: PointerEvent<HTMLDivElement>): void;
  onPointerMove(event: PointerEvent<HTMLDivElement>): void;
  onPointerUp(event: PointerEvent<HTMLDivElement>): void;
  onPointerCancel(event: PointerEvent<HTMLDivElement>): void;
}) {
  return (
    <div
      data-testid={props.testId}
      className={cn(
        'relative z-20 min-h-0 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-accent/15',
        props.active && 'bg-accent/20'
      )}
      title={props.title}
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onPointerCancel={props.onPointerCancel}
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
    </div>
  );
}

function hasDraggedFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes('Files');
}

function isSupportedAudioFile(file: File): boolean {
  return /\.(m4a|mp3|wav)$/i.test(file.name);
}

function getDroppedFilePath(file: File): string {
  const testPaths = (window as Window & { __distillTestDroppedFilePaths?: Record<string, string> }).__distillTestDroppedFilePaths;
  return testPaths?.[file.name] ?? window.distillAPI.getPathForFile(file);
}

function Sidebar(props: {
  query: string;
  activeView: 'library' | 'calendar' | 'settings';
  importing: boolean;
  assistantOpen: boolean;
  onQueryChange(value: string): void;
  onImport(): void;
  onLibrary(): void;
  onCalendar(): void;
  onSettings(): void;
  onAssistant(): void;
}) {
  return (
    <aside data-testid="sidebar-pane" className="flex min-w-0 flex-col border-r border-border bg-surface px-3 py-3">
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
          placeholder="Search library"
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
        />
      </div>

      <nav className="mt-5 space-y-1">
        <SidebarItem icon={<Library className="h-4 w-4" />} label="Library" active={props.activeView === 'library'} onClick={props.onLibrary} />
        <SidebarItem icon={<CalendarDays className="h-4 w-4" />} label="Calendar" active={props.activeView === 'calendar'} onClick={props.onCalendar} />
        <SidebarItem icon={<Bot className="h-4 w-4" />} label="Ask Distill" active={props.assistantOpen} onClick={props.onAssistant} />
        <SidebarItem icon={<Settings className="h-4 w-4" />} label="Settings" active={props.activeView === 'settings'} onClick={props.onSettings} />
      </nav>

      <div className="mt-auto border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
        Drop M4A, MP3, or WAV files anywhere in the window.
      </div>
    </aside>
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
  items: LibraryItem[];
  selectedKey: string | null;
  loading: boolean;
  importing: boolean;
  onSelect(item: LibraryItem): void;
  onRevealInFolder(id: string): void;
  onDeleteRecording(id: string): void;
  onDeleteNote(id: string): void;
  onImport(): void;
  onCreateNote(): void;
}) {
  const [contextMenu, setContextMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  const contextItem = contextMenu ? props.items.find((item) => libraryItemKey(item.kind, item.id) === contextMenu.key) ?? null : null;

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    function closeMenu() {
      setContextMenu(null);
    }

    function closeMenuOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        closeMenu();
      }
    }

    window.addEventListener('click', closeMenu);
    window.addEventListener('contextmenu', closeMenu);
    window.addEventListener('keydown', closeMenuOnEscape);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('contextmenu', closeMenu);
      window.removeEventListener('keydown', closeMenuOnEscape);
    };
  }, [contextMenu]);

  function openContextMenu(event: MouseEvent, item: LibraryItem) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      key: libraryItemKey(item.kind, item.id),
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 100)
    });
  }

  function revealContextRecording() {
    if (!contextItem || contextItem.kind !== 'recording') {
      return;
    }
    props.onRevealInFolder(contextItem.id);
    setContextMenu(null);
  }

  function deleteContextItem() {
    if (!contextItem) {
      return;
    }
    const confirmed = window.confirm(contextItem.kind === 'recording'
      ? '删除这条录音？如果音频位于音频库文件夹内，文件副本会同时移到回收站。'
      : '删除这条笔记？');
    if (!confirmed) {
      return;
    }
    if (contextItem.kind === 'recording') {
      props.onDeleteRecording(contextItem.id);
    } else {
      props.onDeleteNote(contextItem.id);
    }
    setContextMenu(null);
  }

  return (
    <section data-testid="library-pane" className="flex min-h-0 min-w-0 flex-col bg-background">
      <header className="flex h-14 items-center justify-between border-b border-border px-4">
        <div>
          <h1 className="text-base font-semibold">Library</h1>
          <p className="text-xs text-muted-foreground">{props.items.length} items</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="icon" title="New Note" aria-label="New Note" onClick={props.onCreateNote}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={props.onImport} disabled={props.importing}>
            <Upload className="h-4 w-4" />
            Import
          </Button>
        </div>
      </header>

      {props.loading && props.items.length === 0 ? (
        <div className="px-4 py-5 text-sm text-muted-foreground">Loading library...</div>
      ) : props.items.length === 0 ? (
        <EmptyLibrary onImport={props.onImport} onCreateNote={props.onCreateNote} importing={props.importing} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {props.items.map((item) => (
            <LibraryItemRow
              key={libraryItemKey(item.kind, item.id)}
              item={item}
              selected={libraryItemKey(item.kind, item.id) === props.selectedKey}
              onClick={() => props.onSelect(item)}
              onContextMenu={(event) => openContextMenu(event, item)}
            />
          ))}
        </div>
      )}
      {contextMenu && contextItem ? (
        <div
          className="fixed z-50 w-52 rounded border border-border bg-background py-1 text-sm shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          {contextItem.kind === 'recording' ? (
            <button className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted" onClick={revealContextRecording}>
              <FolderOpen className="h-4 w-4" />
              打开所在文件夹
            </button>
          ) : null}
          <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-destructive hover:bg-muted" onClick={deleteContextItem}>
            <Trash2 className="h-4 w-4" />
            删除
          </button>
        </div>
      ) : null}
    </section>
  );
}

class AppErrorBoundary extends Component<{ children: React.ReactNode }, { error: string | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: unknown): { error: string } {
    return { error: error instanceof Error ? error.message : 'Renderer crashed.' };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center bg-background px-8 text-center text-foreground">
          <AlertCircle className="mb-4 h-10 w-10 text-destructive" />
          <h1 className="text-lg font-semibold">界面出错了</h1>
          <p className="mt-2 max-w-[520px] text-sm leading-6 text-muted-foreground">{this.state.error}</p>
          <Button className="mt-5" variant="secondary" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" />
            Reload
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

function EmptyLibrary(props: { onImport(): void; onCreateNote(): void; importing: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center">
      <Library className="mb-4 h-10 w-10 text-muted-foreground" />
      <h2 className="text-base font-semibold">No items yet</h2>
      <p className="mt-2 max-w-[260px] text-sm leading-6 text-muted-foreground">Drop an audio file here, import one from disk, or start a text note.</p>
      <div className="mt-5 flex items-center gap-2">
        <Button onClick={props.onCreateNote}>
          <Plus className="h-4 w-4" />
          New Note
        </Button>
        <Button variant="secondary" onClick={props.onImport} disabled={props.importing}>
          <Import className="h-4 w-4" />
          Import
        </Button>
      </div>
    </div>
  );
}

function CalendarPane(props: {
  month: { year: number; month: number };
  days: LibraryCalendarDay[];
  selectedDate: string | null;
  items: LibraryItem[];
  loading: boolean;
  onMonthChange(year: number, month: number): void;
  onToday(): void;
  onSelectDate(date: string): void;
  onSelectItem(item: LibraryItem): void;
}) {
  const today = localDateKey(new Date());
  const cells = calendarCells(props.month.year, props.month.month);
  const dayByDate = new Map(props.days.map((day) => [day.date, day]));
  const selectedLabel = props.selectedDate ? formatCalendarDateLabel(props.selectedDate) : '选择一天';

  return (
    <section className="flex h-full min-h-0 flex-col px-8 py-6">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-semibold">{formatCalendarMonthLabel(props.month.year, props.month.month)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">按录音创建日期展示记录分布</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="secondary" title="Previous month" onClick={() => props.onMonthChange(...shiftCalendarMonth(props.month, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="secondary" onClick={props.onToday}>今天</Button>
          <Button size="icon" variant="secondary" title="Next month" onClick={() => props.onMonthChange(...shiftCalendarMonth(props.month, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pt-5">
        <div className="grid grid-cols-7 border-l border-t border-border text-xs font-medium text-muted-foreground">
          {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
            <div key={day} className="border-b border-r border-border px-2 py-2 text-center">周{day}</div>
          ))}
          {cells.map((cell) => {
            const day = dayByDate.get(cell.date);
            const selected = cell.date === props.selectedDate;
            const isToday = cell.date === today;
            return (
              <button
                key={cell.date}
                data-testid="calendar-day"
                data-date={cell.date}
                className={cn(
                  'flex h-24 min-w-0 flex-col border-b border-r border-border px-2 py-2 text-left hover:bg-muted',
                  !cell.inCurrentMonth && 'bg-surface text-muted-foreground/60',
                  selected && 'bg-muted ring-1 ring-inset ring-accent',
                  isToday && !selected && 'bg-accent/5'
                )}
                onClick={() => props.onSelectDate(cell.date)}
              >
                <span className={cn('text-sm tabular-nums', isToday && 'font-semibold text-accent')}>{cell.dayNumber}</span>
                {day ? (
                  <span className="mt-auto min-w-0">
                    <span className="block truncate text-xs font-medium text-foreground">{day.itemCount} 个项目</span>
                    <span className="block truncate text-xs text-muted-foreground">{formatCalendarDayCounts(day)}</span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <section data-testid="calendar-day-detail" className="mt-6 border-t border-border pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">{selectedLabel}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
                {props.selectedDate ? `${props.items.length} 个项目` : '点击日期查看当天项目'}
              </p>
            </div>
            {props.loading ? <span className="text-sm text-muted-foreground">Loading...</span> : null}
          </div>

          {props.selectedDate && props.items.length > 0 ? (
            <div className="mt-4 divide-y divide-border">
              {props.items.map((item) => (
                <button
                  key={libraryItemKey(item.kind, item.id)}
                  data-testid="calendar-recording-row"
                  data-recording-id={item.kind === 'recording' ? item.id : undefined}
                  data-testid-calendar-item={item.kind}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-4 px-1 py-3 text-left hover:bg-muted"
                  onClick={() => props.onSelectItem(item)}
                >
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      {item.kind === 'recording' ? <FileAudio className="h-4 w-4 shrink-0 text-accent" /> : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">{item.preview}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {item.kind === 'recording' ? formatDuration(item.duration) : formatShortDateTime(item.updatedAt)}
                  </span>
                </button>
              ))}
            </div>
          ) : props.selectedDate ? (
            <p className="mt-4 text-sm text-muted-foreground">这一天没有项目。</p>
          ) : null}
        </section>
      </div>
    </section>
  );
}

function LibraryItemRow(props: { item: LibraryItem; selected: boolean; onClick(): void; onContextMenu(event: MouseEvent): void }) {
  const icon = props.item.kind === 'recording'
    ? <FileAudio className="h-4 w-4 shrink-0 text-accent" />
    : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />;
  const date = props.item.kind === 'recording' ? formatRecordingListDate(props.item) : formatShortDateTime(props.item.updatedAt);
  const meta = props.item.kind === 'recording' ? `${formatFileSize(props.item.fileSize)} · ${props.item.processingState}` : 'Text note';
  const duration = props.item.kind === 'recording' ? formatDuration(props.item.duration) : null;
  const preview = props.item.preview || (props.item.kind === 'recording' ? props.item.originalFileName : 'No text yet');

  return (
    <button
      className={cn(
        'block w-full border-b border-border px-4 py-3 text-left hover:bg-muted',
        props.selected && 'bg-muted'
      )}
      onClick={props.onClick}
      onContextMenu={props.onContextMenu}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="min-w-0 truncate text-sm font-medium">{props.item.title}</span>
        </div>
        {duration ? <div className="shrink-0 text-xs text-muted-foreground">{duration}</div> : null}
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{preview}</span>
        <span className="shrink-0">{date}</span>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{meta}</div>
    </button>
  );
}

function NoteDetailPane(props: {
  note: NoteDetail;
  onSave(noteId: string, title: string, contentJson: RichTextDocument, plainText: string): Promise<void>;
}) {
  const { note, onSave } = props;
  const [title, setTitle] = useState(note.title);
  const [revision, setRevision] = useState(0);
  const [toolbarRevision, setToolbarRevision] = useState(0);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const activeNoteId = useRef(note.id);
  const pendingSignature = useRef<string | null>(null);
  const lastSavedSignature = useRef(noteSignature(note.title, note.contentJson, note.plainText));
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https'
      }),
      Image.configure({
        allowBase64: false
      }),
      TaskList,
      TaskItem.configure({
        nested: true
      })
    ],
    content: toEditorContent(note.contentJson),
    editorProps: {
      attributes: {
        class: 'note-editor-content min-h-full outline-none'
      }
    },
    onUpdate: () => setRevision((current) => current + 1)
  }, [note.id]);

  useEffect(() => {
    if (!editor) {
      return undefined;
    }

    const refreshToolbar = () => setToolbarRevision((current) => current + 1);
    editor.on('transaction', refreshToolbar);
    editor.on('selectionUpdate', refreshToolbar);
    editor.on('focus', refreshToolbar);
    editor.on('blur', refreshToolbar);

    return () => {
      editor.off('transaction', refreshToolbar);
      editor.off('selectionUpdate', refreshToolbar);
      editor.off('focus', refreshToolbar);
      editor.off('blur', refreshToolbar);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor || activeNoteId.current === note.id) {
      return;
    }

    activeNoteId.current = note.id;
    pendingSignature.current = null;
    setTitle(note.title);
    lastSavedSignature.current = noteSignature(note.title, note.contentJson, note.plainText);
    setSaveState('saved');
    editor.commands.setContent(toEditorContent(note.contentJson), { emitUpdate: false });
    window.setTimeout(() => editor.commands.focus('end'), 0);
  }, [editor, note.id, note.title, note.contentJson, note.plainText]);

  useEffect(() => {
    if (note.id !== activeNoteId.current) {
      return;
    }

    const savedSignature = noteSignature(note.title, note.contentJson, note.plainText);
    if (!pendingSignature.current || pendingSignature.current === savedSignature) {
      lastSavedSignature.current = savedSignature;
      pendingSignature.current = null;
      if (saveState === 'saving') {
        setSaveState('saved');
      }
    }
  }, [note.id, note.title, note.contentJson, note.plainText, saveState]);

  useEffect(() => {
    if (!editor) {
      return undefined;
    }

    const contentJson = editor.getJSON() as RichTextDocument;
    const plainText = editor.getText({ blockSeparator: '\n' });
    const nextTitle = title.trim() || 'Untitled Note';
    const nextSignature = noteSignature(nextTitle, contentJson, plainText);
    if (nextSignature === lastSavedSignature.current) {
      setSaveState('saved');
      return undefined;
    }

    setSaveState('saving');
    pendingSignature.current = nextSignature;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void onSave(note.id, nextTitle, contentJson, plainText)
        .then(() => {
          if (!cancelled) {
            lastSavedSignature.current = nextSignature;
            pendingSignature.current = null;
            setSaveState('saved');
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSaveState('error');
          }
        });
    }, 900);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [editor, note.id, onSave, revision, title]);

  return (
    <article className="flex h-full min-h-0 min-w-0 flex-col bg-surface-elevated">
      <header className="border-b border-border px-8 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <input
              data-testid="note-title-input"
              className="h-10 w-full min-w-0 bg-transparent text-2xl font-semibold leading-tight outline-none placeholder:text-muted-foreground"
              value={title}
              placeholder="Untitled Note"
              onChange={(event) => setTitle(event.target.value)}
            />
            <p className="mt-1 text-sm text-muted-foreground">Updated {formatShortDateTime(note.updatedAt)}</p>
          </div>
          <div className={cn('shrink-0 pt-2 text-xs', saveState === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
            {saveState === 'saving' ? 'Saving...' : saveState === 'error' ? 'Save failed' : 'Saved'}
          </div>
        </div>
        <NoteEditorToolbar editor={editor} revision={toolbarRevision} />
      </header>
      <section
        className="stable-scrollbar min-h-0 flex-1 overflow-y-scroll px-8 py-7"
        onMouseDown={(event) => {
          const target = event.target as HTMLElement;
          if (!target.closest('.ProseMirror')) {
            event.preventDefault();
            editor?.commands.focus('end');
          }
        }}
      >
        <EditorContent data-testid="note-editor" className="min-h-full" editor={editor} />
      </section>
    </article>
  );
}

function NoteEditorToolbar(props: { editor: Editor | null; revision: number }) {
  const editor = props.editor;
  const disabled = !editor;
  return (
    <div data-toolbar-revision={props.revision} className="mt-4 flex flex-wrap items-center gap-1 border-t border-border pt-3">
      <ToolbarButton title="Bold" disabled={disabled} active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}>
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Italic" disabled={disabled} active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}>
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Underline" disabled={disabled} active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Strike" disabled={disabled} active={editor?.isActive('strike')} onClick={() => editor?.chain().focus().toggleStrike().run()}>
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Inline Code" disabled={disabled} active={editor?.isActive('code')} onClick={() => editor?.chain().focus().toggleCode().run()}>
        <Code2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton title="Heading 1" disabled={disabled} active={editor?.isActive('heading', { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>
        <Heading1 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Heading 2" disabled={disabled} active={editor?.isActive('heading', { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Bullet List" disabled={disabled} active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Numbered List" disabled={disabled} active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Task List" disabled={disabled} active={editor?.isActive('taskList')} onClick={() => editor?.chain().focus().toggleTaskList().run()}>
        <ListChecks className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Quote" disabled={disabled} active={editor?.isActive('blockquote')} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
        <Quote className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Code Block" disabled={disabled} active={editor?.isActive('codeBlock')} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>
        <Code2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Divider" disabled={disabled} onClick={() => editor?.chain().focus().setHorizontalRule().run()}>
        <Minus className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton title="Link" disabled={disabled} active={editor?.isActive('link')} onClick={() => setNoteLink(editor)}>
        <Link2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Insert Photo" disabled={disabled} onClick={() => void insertNoteImage(editor)}>
        <ImageIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton title="Undo" disabled={disabled || !editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()}>
        <Undo2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Redo" disabled={disabled || !editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()}>
        <Redo2 className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton(props: { title: string; active?: boolean; disabled?: boolean; onClick(): void; children: React.ReactNode }) {
  const pressedByMouse = useRef(false);
  const runAction = () => {
    if (!props.disabled) {
      props.onClick();
    }
  };

  return (
    <Button
      size="icon"
      variant={props.active ? 'default' : 'ghost'}
      type="button"
      title={props.title}
      aria-pressed={Boolean(props.active)}
      disabled={props.disabled}
      onMouseDown={(event) => {
        if (event.button !== 0) {
          return;
        }

        event.preventDefault();
        pressedByMouse.current = true;
        runAction();
      }}
      onClick={(event) => {
        if (pressedByMouse.current) {
          pressedByMouse.current = false;
          event.preventDefault();
          return;
        }

        runAction();
      }}
    >
      {props.children}
    </Button>
  );
}

function ToolbarDivider() {
  return <div className="mx-1 h-6 w-px bg-border" />;
}

function setNoteLink(editor: Editor | null) {
  if (!editor) {
    return;
  }

  const previousUrl = editor.getAttributes('link').href as string | undefined;
  const nextUrl = window.prompt('Link URL', previousUrl ?? '');
  if (nextUrl === null) {
    return;
  }

  const trimmed = nextUrl.trim();
  if (!trimmed) {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    return;
  }

  editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run();
}

async function insertNoteImage(editor: Editor | null): Promise<void> {
  if (!editor) {
    return;
  }

  const result = await window.distillAPI.importNoteImageFromDialog();
  if (!result) {
    return;
  }

  editor.chain().focus().setImage({ src: result.src, alt: result.fileName }).run();
}

function RecordingDetailPane(props: {
  recording: RecordingDetail | null;
  aiTemplates: AIArtifactTemplate[];
  importing: boolean;
  isTranscribing: boolean;
  isGeneratingArtifact: boolean;
  onImport(): void;
  onCreateNote(): void;
  onTranscribe(id: string): void;
  onEditTranscriptSegment(recordingId: string, transcriptId: string, segmentId: string, text: string): Promise<void>;
  onGenerateArtifact(id: string, templateId: string): void;
  onDeleteAIArtifact(recordingId: string, artifactId: string): Promise<void>;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [selectedTemplateId, setSelectedTemplateId] = useState('default-summary');
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);

  useEffect(() => {
    if (!audioRef.current || !props.recording) {
      return;
    }

    audioRef.current.src = buildAudioSource(props.recording.id);
    audioRef.current.load();
    audioRef.current.playbackRate = playbackRate;
  }, [props.recording?.id]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    const preferredTemplate = props.recording?.latestArtifact?.templateId ?? 'default-summary';
    if (props.aiTemplates.some((template) => template.id === preferredTemplate)) {
      setSelectedTemplateId(preferredTemplate);
    }
  }, [props.recording?.id, props.recording?.latestArtifact?.templateId, props.aiTemplates]);

  useEffect(() => {
    setSelectedArtifactId(props.recording?.latestArtifact?.id ?? null);
  }, [props.recording?.id, props.recording?.latestArtifact?.id]);

  if (!props.recording) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <FileAudio className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Select an item</h2>
        <p className="mt-2 max-w-[360px] text-sm leading-6 text-muted-foreground">Recordings, transcripts, AI notes, and text notes live together in Library.</p>
        <div className="mt-5 flex items-center gap-2">
          <Button onClick={props.onCreateNote}>
            <Plus className="h-4 w-4" />
            New Note
          </Button>
          <Button variant="secondary" onClick={props.onImport} disabled={props.importing}>
            <Import className="h-4 w-4" />
            Import
          </Button>
        </div>
      </div>
    );
  }
  const recording = props.recording;
  const transcript = recording.transcript;
  const transcriptionJob = getLatestTranscriptionJob(recording);
  const transcriptionError = transcriptionJob?.state === 'failed' ? transcriptionJob : null;
  const isTranscribing = props.isTranscribing || transcriptionJob?.state === 'running';
  const aiJob = getLatestAIJob(recording);
  const aiError = aiJob?.state === 'failed' ? aiJob : null;
  const isGeneratingArtifact = props.isGeneratingArtifact || aiJob?.state === 'running';
  const canGenerateArtifact = Boolean(transcript) && !isTranscribing;
  const selectedTemplate = props.aiTemplates.find((template) => template.id === selectedTemplateId) ?? props.aiTemplates[0] ?? null;
  const effectiveTemplateId = selectedTemplate?.id ?? 'default-summary';
  const displayedArtifact = recording.artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? recording.latestArtifact;

  return (
    <article className="flex h-full min-h-0 min-w-0 flex-col">
      <header className="border-b border-border px-8 py-5">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold leading-tight">{displayedArtifact?.content.title ?? recording.title}</h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">{recording.filePath}</p>
          </div>
          <div className="shrink-0 text-right text-sm text-muted-foreground">
            <div>{formatDuration(recording.duration)}</div>
            <div>{recording.format.toUpperCase()}</div>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <audio ref={audioRef} className="h-10 flex-1" controls preload="metadata" />
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
            disabled={isTranscribing}
            title={recording.transcript ? 'Regenerate transcript' : 'Transcribe recording'}
          >
            {isTranscribing ? 'Transcribing...' : recording.transcript ? 'Retranscribe' : 'Transcribe Recording'}
          </Button>
        </div>
        {transcriptionError ? (
          <JobErrorNotice
            job={transcriptionError}
            disabled={props.isTranscribing}
            onRetry={() => props.onTranscribe(recording.id)}
          />
        ) : isTranscribing && transcriptionJob ? (
          <TranscriptionProgressNotice job={transcriptionJob} />
        ) : null}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,420px)_1fr]">
        <section className="min-w-0 overflow-y-auto border-r border-border px-8 py-6">
          <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
            <SectionTitle title="Summary" />
            {canGenerateArtifact ? (
              <div className="flex min-w-0 items-center gap-2">
                <select
                  data-testid="ai-template-select"
                  className="h-8 max-w-[180px] rounded border border-input bg-background px-2 text-xs"
                  value={effectiveTemplateId}
                  onChange={(event) => setSelectedTemplateId(event.target.value)}
                  disabled={isGeneratingArtifact || props.aiTemplates.length === 0}
                  title={selectedTemplate?.description ?? 'AI note template'}
                >
                  {props.aiTemplates.length ? (
                    props.aiTemplates.map((template) => (
                      <option key={template.id} value={template.id}>{template.name}</option>
                    ))
                  ) : (
                    <option value="default-summary">Default Summary</option>
                  )}
                </select>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => props.onGenerateArtifact(recording.id, effectiveTemplateId)}
                  disabled={isGeneratingArtifact || !selectedTemplate}
                  title={recording.latestArtifact ? 'Regenerate AI notes' : 'Generate AI notes'}
                >
                  {isGeneratingArtifact ? 'Generating...' : recording.latestArtifact ? 'Regenerate Notes' : 'Generate Notes'}
                </Button>
              </div>
            ) : null}
          </div>
          {aiError ? (
            <JobErrorNotice job={aiError} disabled={isGeneratingArtifact || !canGenerateArtifact} onRetry={() => props.onGenerateArtifact(recording.id, effectiveTemplateId)} />
          ) : isGeneratingArtifact && aiJob ? (
            <AIProgressNotice job={aiJob} />
          ) : null}
          {displayedArtifact ? (
            <div className="mt-4 space-y-6 text-sm leading-6">
              <p>{displayedArtifact.content.summary}</p>
              <NoteList title="Key Points" items={displayedArtifact.content.keyPoints} />
              <NoteList title="Todos" items={displayedArtifact.content.todos} />
              <AIArtifactHistory
                artifacts={recording.artifacts}
                selectedId={displayedArtifact.id}
                templates={props.aiTemplates}
                onSelect={setSelectedArtifactId}
                onDelete={(artifactId) => props.onDeleteAIArtifact(recording.id, artifactId)}
              />
            </div>
          ) : (
            <div className="mt-4">
              <EmptySection text={transcript ? 'AI 笔记尚未生成。点击 Generate Notes 可以基于当前 transcript 生成结构化笔记。' : '先完成转写后，才能生成 AI 笔记。'} />
            </div>
          )}
        </section>

        <section data-testid="transcript-pane" className="stable-scrollbar min-w-0 overflow-y-scroll px-8 py-6">
          <SectionTitle title="Transcript" />
          {transcript?.segments.length ? (
            <div className="space-y-3">
              {isMockTranscript(recording) ? <MockTranscriptNotice /> : null}
              {transcript.segments.map((segment) => (
                <TranscriptRow
                  key={segment.id}
                  segment={segment}
                  onClick={() => {
                    if (audioRef.current) {
                      void seekAudioToSegment(audioRef.current, recording.id, segment.startTime);
                    }
                  }}
                  onSave={(text) => props.onEditTranscriptSegment(recording.id, transcript.id, segment.id, text)}
                />
              ))}
            </div>
          ) : isTranscribing ? (
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

function MockTranscriptNotice() {
  return (
    <div className="flex items-start gap-2 rounded border border-destructive/25 bg-destructive/10 px-3 py-3 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <div className="font-medium">这不是这段录音的真实转写</div>
        <p className="mt-1 leading-6 text-destructive/80">当前显示的是 mock/占位 transcript。请确认 Settings 使用 Python Worker，然后点击 Retranscribe 生成真实内容。</p>
      </div>
    </div>
  );
}

function JobErrorNotice(props: { job: ProcessingJob; disabled: boolean; onRetry(): void }) {
  const title = props.job.kind === 'ai' ? 'AI notes failed' : props.job.kind === 'transcription' ? 'Transcription failed' : 'Processing failed';
  const defaultMessage = props.job.kind === 'ai' ? 'AI 笔记生成失败。' : 'The speech-to-text worker failed.';

  return (
    <div className="mt-4 flex items-start justify-between gap-4 rounded border border-destructive/25 bg-destructive/10 px-3 py-3 text-sm text-destructive">
      <div className="flex min-w-0 gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <div className="font-medium">{title}</div>
          <div className="mt-1 break-words text-destructive/80">{props.job.errorMessage ?? defaultMessage}</div>
          {props.job.errorDetail ? (
            <details className="mt-2 max-w-full text-xs text-destructive/80">
              <summary className="cursor-pointer select-none font-medium text-destructive">诊断详情</summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-destructive/20 bg-background/75 p-2 font-mono text-[11px] leading-5 text-foreground">
                {props.job.errorDetail}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
      <Button variant="secondary" size="sm" onClick={props.onRetry} disabled={props.disabled}>
        Retry
      </Button>
    </div>
  );
}

function TranscriptionProgressNotice(props: { job: ProcessingJob }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const startedAt = props.job.startedAt ?? props.job.createdAt;
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const message = transcriptionProgressMessage(elapsedSeconds);

  return (
    <div className="mt-4 flex items-start gap-2 rounded border border-border bg-background px-3 py-3 text-sm">
      <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <div className="min-w-0">
        <div className="font-medium">Transcribing · {formatDuration(elapsedSeconds)}</div>
        <p className="mt-1 leading-6 text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

function transcriptionProgressMessage(elapsedSeconds: number): string {
  if (elapsedSeconds >= 15 * 60) {
    return '仍在运行超过 15 分钟。medium 在 CPU 上可能非常慢，建议切回 tiny/base 验证流程，或等待首次模型下载完成后重试。';
  }

  if (elapsedSeconds >= 5 * 60) {
    return '仍在运行。small/medium 首次使用可能正在下载较大的模型；CPU 转写会明显慢于 tiny/base。';
  }

  if (elapsedSeconds >= 60) {
    return '仍在运行。首次使用某个 Whisper 模型时，可能正在下载或加载模型；更大的模型会更慢。';
  }

  return '正在转写。短音频通常会在几十秒内完成；首次运行可能更久。';
}

function AIProgressNotice(props: { job: ProcessingJob }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const startedAt = props.job.startedAt ?? props.job.createdAt;
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));

  return (
    <div className="mt-4 flex items-start gap-2 rounded border border-border bg-background px-3 py-3 text-sm">
      <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <div className="min-w-0">
        <div className="font-medium">Generating Notes · {formatDuration(elapsedSeconds)}</div>
        <p className="mt-1 leading-6 text-muted-foreground">正在根据 transcript 生成结构化 AI 笔记。</p>
      </div>
    </div>
  );
}

async function seekAudioToSegment(audio: HTMLAudioElement, recordingId: string, startTime: number): Promise<void> {
  const requestedTime = Math.max(0, startTime);
  audio.pause();
  audio.src = buildAudioSource(recordingId, requestedTime);
  audio.load();
  await waitForMediaMetadata(audio);
  const targetTime = clampSeekTime(audio, requestedTime);
  await setAudioCurrentTime(audio, targetTime);
  await waitForPlayableData(audio, targetTime);
  await audio.play().catch(() => undefined);
}

function buildAudioSource(recordingId: string, startTime?: number): string {
  const baseUrl = `distill-audio://recording/${recordingId}`;
  return startTime === undefined ? baseUrl : `${baseUrl}#t=${startTime.toFixed(3)}`;
}

function waitForMediaMetadata(audio: HTMLAudioElement): Promise<void> {
  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const finish = () => {
      audio.removeEventListener('loadedmetadata', finish);
      audio.removeEventListener('durationchange', finish);
      resolve();
    };

    audio.addEventListener('loadedmetadata', finish, { once: true });
    audio.addEventListener('durationchange', finish, { once: true });
    audio.load();
  });
}

function clampSeekTime(audio: HTMLAudioElement, startTime: number): number {
  const safeStart = Math.max(0, startTime);
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
    return safeStart;
  }

  return Math.min(safeStart, Math.max(0, audio.duration - 0.05));
}

function setAudioCurrentTime(audio: HTMLAudioElement, targetTime: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let timeout = 0;
    const toleranceSeconds = 0.35;

    const cleanup = () => {
      window.clearTimeout(timeout);
      audio.removeEventListener('seeked', settle);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
    };

    const settle = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve();
    };

    const handleTimeUpdate = () => {
      if (Math.abs(audio.currentTime - targetTime) <= toleranceSeconds) {
        settle();
      }
    };

    audio.addEventListener('seeked', settle, { once: true });
    audio.addEventListener('timeupdate', handleTimeUpdate);
    timeout = window.setTimeout(settle, 800);

    audio.currentTime = targetTime;

    if (Math.abs(audio.currentTime - targetTime) <= toleranceSeconds) {
      settle();
    }
  });
}

function waitForPlayableData(audio: HTMLAudioElement, targetTime: number): Promise<void> {
  if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && Math.abs(audio.currentTime - targetTime) <= 0.75) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    let timeout = 0;

    const cleanup = () => {
      window.clearTimeout(timeout);
      audio.removeEventListener('canplay', settle);
      audio.removeEventListener('loadeddata', settle);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
    };

    const settle = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve();
    };

    const handleTimeUpdate = () => {
      if (Math.abs(audio.currentTime - targetTime) <= 0.75) {
        settle();
      }
    };

    audio.addEventListener('canplay', settle, { once: true });
    audio.addEventListener('loadeddata', settle, { once: true });
    audio.addEventListener('timeupdate', handleTimeUpdate);
    timeout = window.setTimeout(settle, 1200);
  });
}

function getLatestTranscriptionJob(recording: RecordingDetail): ProcessingJob | null {
  return recording.jobs.find((job) => job.kind === 'transcription') ?? null;
}

function getLatestAIJob(recording: RecordingDetail): ProcessingJob | null {
  return recording.jobs.find((job) => job.kind === 'ai') ?? null;
}

function isMockTranscript(recording: RecordingDetail): boolean {
  return recording.transcript?.provider === 'mock' || recording.transcript?.fullText.includes('这是第一阶段的模拟转写') === true;
}

function TranscriptRow(props: { segment: TranscriptSegment; onClick(): void; onSave(text: string): Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.segment.text);
  const [saving, setSaving] = useState(false);
  const trimmedDraft = draft.trim();
  const canSave = trimmedDraft.length > 0 && trimmedDraft !== props.segment.text.trim() && !saving;

  useEffect(() => {
    if (!editing) {
      setDraft(props.segment.text);
    }
  }, [editing, props.segment.id, props.segment.text]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!canSave) {
      return;
    }

    setSaving(true);
    try {
      await props.onSave(trimmedDraft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function startEditing(event: MouseEvent) {
    event.stopPropagation();
    setDraft(props.segment.text);
    setEditing(true);
  }

  function cancelEditing(event: MouseEvent) {
    event.stopPropagation();
    setDraft(props.segment.text);
    setEditing(false);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (editing) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      props.onClick();
    }
  }

  return (
    <div
      data-testid="transcript-row"
      className={cn(
        'group grid w-full grid-cols-[64px_minmax(0,1fr)_32px] gap-4 rounded px-2 py-2 text-left hover:bg-muted',
        editing && 'bg-muted/60'
      )}
      onClick={editing ? undefined : props.onClick}
      onKeyDown={handleKeyDown}
      role={editing ? undefined : 'button'}
      tabIndex={editing ? undefined : 0}
    >
      <span className="text-xs tabular-nums text-muted-foreground">{formatTimestamp(props.segment.startTime)}</span>
      {editing ? (
        <form className="min-w-0" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void handleSave(event)}>
          <textarea
            data-testid="transcript-edit-textarea"
            className="min-h-24 w-full resize-y rounded border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            autoFocus
          />
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" type="submit" disabled={!canSave}>
              <Save className="h-4 w-4" />
              保存
            </Button>
            <Button size="icon" variant="ghost" type="button" title="Cancel edit" onClick={cancelEditing} disabled={saving}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </form>
      ) : (
        <span className="min-w-0 text-sm leading-6">{props.segment.text}</span>
      )}
      <Button
        className={cn('self-start opacity-0 group-hover:opacity-100 focus-visible:opacity-100', editing && 'invisible')}
        size="icon"
        variant="ghost"
        type="button"
        title="Edit transcript segment"
        onClick={startEditing}
      >
        <Pencil className="h-4 w-4" />
      </Button>
    </div>
  );
}

function SettingsPane(props: {
  settings: ReturnType<typeof useLibraryStore.getState>['settings'];
  speechToTextStatus: SpeechToTextStatus | null;
  watchFolderStatus: WatchFolderStatus | null;
  checkingSpeechToText: boolean;
  onSave(input: Parameters<typeof window.distillAPI.saveSettings>[0]): void;
  onRefreshSpeechToText(): void;
}) {
  const [watchFolder, setWatchFolder] = useState(props.settings?.watchFolder ?? '');
  const [model, setModel] = useState(props.settings?.deepSeekModel ?? 'deepseek-v4-flash');
  const [speechProvider, setSpeechProvider] = useState(props.settings?.speechProvider ?? 'python');
  const [speechModel, setSpeechModel] = useState(props.settings?.speechModel ?? 'faster-whisper-tiny');
  const [autoTranscribeOnImport, setAutoTranscribeOnImport] = useState(props.settings?.autoTranscribeOnImport ?? true);
  const [selectingWatchFolder, setSelectingWatchFolder] = useState(false);
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    setWatchFolder(props.settings?.watchFolder ?? '');
    setModel(props.settings?.deepSeekModel ?? 'deepseek-v4-flash');
    setSpeechProvider(props.settings?.speechProvider ?? 'python');
    setSpeechModel(props.settings?.speechModel ?? 'faster-whisper-tiny');
    setAutoTranscribeOnImport(props.settings?.autoTranscribeOnImport ?? true);
  }, [props.settings]);

  async function chooseWatchFolder() {
    setSelectingWatchFolder(true);
    try {
      const selectedFolder = await window.distillAPI.selectAudioLibraryFolder();
      if (selectedFolder) {
        setWatchFolder(selectedFolder);
        props.onSave(buildSettingsInput(selectedFolder));
      }
    } finally {
      setSelectingWatchFolder(false);
    }
  }

  function buildSettingsInput(nextWatchFolder = watchFolder): Parameters<typeof window.distillAPI.saveSettings>[0] {
    return {
      deepSeekModel: model,
      speechProvider,
      speechModel,
      autoTranscribeOnImport,
      watchFolder: nextWatchFolder,
      ...(apiKey ? { deepSeekApiKey: apiKey } : {})
    };
  }

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
            {props.settings?.mockSpeechProviderEnabled ? <option value="mock">Mock STT</option> : null}
            <option value="python">Python Worker</option>
          </select>
        </Field>
        <Field label="Speech-to-Text Model">
          <select
            className="h-9 w-full rounded border border-input bg-background px-2 text-sm"
            value={speechModel}
            onChange={(event) => setSpeechModel(event.target.value)}
          >
            <option value="faster-whisper-tiny">tiny · fastest</option>
            <option value="faster-whisper-base">base · light</option>
            <option value="faster-whisper-small">small · more accurate</option>
            <option value="faster-whisper-medium">medium · slow on CPU</option>
          </select>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">首次使用某个模型会下载/加载模型文件；短音频建议先用 tiny/base，medium 在 CPU 上可能非常慢。</p>
        </Field>
        <label className="flex items-center gap-3 text-sm">
          <input
            className="h-4 w-4 accent-accent"
            type="checkbox"
            checked={autoTranscribeOnImport}
            onChange={(event) => setAutoTranscribeOnImport(event.target.checked)}
          />
          <span>Auto transcribe after import</span>
        </label>
        <Field label="AI Provider">
          <Input value="deepseek" disabled />
        </Field>
        <Field label="DeepSeek Model">
          <Input value={model} onChange={(event) => setModel(event.target.value)} />
        </Field>
        <Field label={props.settings?.deepSeekApiKeyConfigured ? 'DeepSeek API Key Configured' : 'DeepSeek API Key'}>
          <Input type="password" value={apiKey} placeholder={props.settings?.deepSeekApiKeyConfigured ? 'Leave blank to keep existing key' : 'Stored in the main process database'} onChange={(event) => setApiKey(event.target.value)} />
        </Field>
        <div data-testid="watch-folder-field" className="block">
          <div className="mb-2 text-sm font-medium">Audio Library Folder</div>
          <div className="flex items-center gap-2">
            <div
              data-testid="watch-folder-path"
              className={cn(
                'flex h-9 min-w-0 flex-1 items-center rounded border border-input bg-surface px-3 text-sm',
                !watchFolder && 'text-muted-foreground'
              )}
            >
              <span className="truncate">{watchFolder || '尚未选择文件夹'}</span>
            </div>
            <Button type="button" variant="secondary" onClick={() => void chooseWatchFolder()} disabled={selectingWatchFolder}>
              <FolderOpen className="h-4 w-4" />
              选择文件夹
            </Button>
            {watchFolder ? (
              <Button type="button" variant="ghost" size="icon" title="Clear Audio Library Folder" onClick={() => setWatchFolder('')}>
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          <div className="mt-3 grid gap-2 text-sm">
            <StatusLine label="Status" value={formatAudioLibraryFolderStatus(props.watchFolderStatus)} />
            {props.watchFolderStatus?.lastEventAt ? <StatusLine label="Last Event" value={formatShortDateTime(props.watchFolderStatus.lastEventAt)} /> : null}
            {props.watchFolderStatus?.errorMessage ? <p className="text-sm leading-6 text-destructive">{props.watchFolderStatus.errorMessage}</p> : null}
          </div>
        </div>
        <Button onClick={() => props.onSave(buildSettingsInput())}>
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

function formatAudioLibraryFolderStatus(status: WatchFolderStatus | null): string {
  if (!status || !status.folderPath) {
    return '未配置';
  }
  if (status.errorMessage) {
    return '需要检查';
  }
  return status.running ? '监听中' : '未运行';
}

type CalendarCell = {
  date: string;
  dayNumber: number;
  inCurrentMonth: boolean;
};

function calendarCells(year: number, month: number): CalendarCell[] {
  const firstDay = new Date(year, month - 1, 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const start = new Date(year, month - 1, 1 - mondayOffset);

  return Array.from({ length: 42 }, (_item, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date: localDateKey(date),
      dayNumber: date.getDate(),
      inCurrentMonth: date.getFullYear() === year && date.getMonth() === month - 1
    };
  });
}

function shiftCalendarMonth(month: { year: number; month: number }, delta: number): [number, number] {
  const date = new Date(month.year, month.month - 1 + delta, 1);
  return [date.getFullYear(), date.getMonth() + 1];
}

function calendarParts(date: string): [number, number] {
  const [year, month] = date.split('-').map(Number);
  return [year ?? 0, month ?? 0];
}

function localDateKey(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatCalendarMonthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long' }).format(new Date(year, month - 1, 1));
}

function formatCalendarDateLabel(date: string): string {
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${date}T12:00:00`));
}

function formatCalendarDayCounts(day: LibraryCalendarDay): string {
  const parts = [];
  if (day.recordingCount > 0) {
    parts.push(`${day.recordingCount} 录音`);
  }
  if (day.noteCount > 0) {
    parts.push(`${day.noteCount} 笔记`);
  }
  if (day.totalDuration) {
    parts.push(formatDuration(day.totalDuration));
  }
  return parts.join(' · ');
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

function AIArtifactHistory(props: {
  artifacts: AIArtifact[];
  selectedId: string;
  templates: AIArtifactTemplate[];
  onSelect(id: string): void;
  onDelete(id: string): Promise<void>;
}) {
  const [menu, setMenu] = useState<{ artifactId: string; x: number; y: number } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!menu) {
      return undefined;
    }

    function closeMenu() {
      setMenu(null);
    }

    function closeMenuOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenu(null);
      }
    }

    window.addEventListener('click', closeMenu);
    window.addEventListener('keydown', closeMenuOnEscape);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('keydown', closeMenuOnEscape);
    };
  }, [menu]);

  if (props.artifacts.length <= 1) {
    return null;
  }

  async function deleteSelectedArtifact() {
    if (!menu) {
      return;
    }

    const artifactId = menu.artifactId;
    setDeletingId(artifactId);
    setMenu(null);
    try {
      await props.onDelete(artifactId);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div data-testid="ai-artifact-history" className="border-t border-border pt-4">
      <h3 className="mb-2 text-sm font-semibold">History</h3>
      <div className="space-y-1">
        {props.artifacts.map((artifact) => {
          const selected = artifact.id === props.selectedId;
          const template = props.templates.find((item) => item.id === artifact.templateId);
          return (
            <button
              key={artifact.id}
              className={cn(
                'grid w-full grid-cols-[1fr_auto] gap-3 rounded px-2 py-2 text-left text-xs hover:bg-muted',
                selected && 'bg-muted'
              )}
              aria-pressed={selected}
              onClick={() => props.onSelect(artifact.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({ artifactId: artifact.id, x: event.clientX, y: event.clientY });
              }}
              disabled={deletingId === artifact.id}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{artifact.content.title}</span>
                <span className="block truncate text-muted-foreground">{template?.name ?? artifact.templateId}</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{formatShortDateTime(artifact.createdAt)}</span>
            </button>
          );
        })}
      </div>
      {menu ? (
        <div
          data-testid="ai-artifact-context-menu"
          className="fixed z-50 min-w-36 rounded border border-border bg-background p-1 text-sm shadow"
          style={{ left: menu.x, top: menu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-destructive hover:bg-destructive/10 disabled:opacity-50"
            onClick={() => void deleteSelectedArtifact()}
            disabled={deletingId === menu.artifactId}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      ) : null}
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

function formatShortDateTime(input: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(input));
}

function formatRecordingListDate(recording: RecordingListItem): string {
  return formatShortDateTime(recording.createdAt ?? recording.importedAt);
}

function libraryItemKey(kind: LibraryItem['kind'], id: string): string {
  return `${kind}:${id}`;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildAssistantScope(recording: RecordingDetail | null, note: NoteDetail | null): AgentScope {
  if (recording) {
    return {
      kind: 'current',
      item: {
        kind: 'recording',
        id: recording.id
      }
    };
  }
  if (note) {
    return {
      kind: 'current',
      item: {
        kind: 'note',
        id: note.id
      }
    };
  }
  return { kind: 'all' };
}

function formatAssistantScopeLabel(recording: RecordingDetail | null, note: NoteDetail | null): string {
  if (recording) {
    return `Current Recording · ${recording.title}`;
  }
  if (note) {
    return `Current Note · ${note.title}`;
  }
  return 'All Library';
}

function noteSignature(title: string, contentJson: RichTextDocument, plainText: string): string {
  return JSON.stringify({ title, contentJson, plainText });
}

function toEditorContent(content: RichTextDocument): JSONContent {
  if (!content || content.type !== 'doc') {
    return emptyEditorDocument();
  }

  return content as JSONContent;
}

function emptyEditorDocument(): JSONContent {
  return {
    type: 'doc',
    content: [{ type: 'paragraph' }]
  };
}

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
