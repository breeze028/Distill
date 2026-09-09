import { Fragment, FormEvent, KeyboardEvent, PointerEvent, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Bot, ChevronDown, FileAudio, FileText, Loader2, Maximize2, MessageSquarePlus, Minimize2, PanelRightClose, Search, Send, Sparkles } from 'lucide-react';
import type { AgentConversationMessage, AgentScope, AgentSource, AgentTraceStep } from '@shared/types/domain';
import { Button } from '@renderer/components/ui/button';
import { cn } from '@renderer/lib/utils';
import { useAssistantStore } from '@renderer/stores/assistantStore';

export function AssistantPanel(props: {
  scope: AgentScope;
  scopeLabel: string;
  onClose(): void;
  onOpenRecording(source: Extract<AgentSource, { kind: 'recording' }>): void;
  onOpenNote(id: string): void;
}) {
  const {
    conversations,
    activeConversation,
    loading,
    running,
    error,
    lastTrace,
    load,
    selectConversation,
    startNew,
    ask
  } = useAssistantStore();
  const [draft, setDraft] = useState('');
  const [fullScreen, setFullScreen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(() => clampPanelWidth(Math.round(window.innerWidth * 0.32)));
  const [resizing, setResizing] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const resizePointerId = useRef<number | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [activeConversation?.messages.length, running]);

  useEffect(() => {
    function clampAfterWindowResize() {
      setPanelWidth((width) => clampPanelWidth(width));
    }

    window.addEventListener('resize', clampAfterWindowResize);
    return () => window.removeEventListener('resize', clampAfterWindowResize);
  }, []);

  async function sendDraft() {
    const question = draft.trim();
    if (!question || running) {
      return;
    }
    setDraft('');
    await ask(question, props.scope);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await sendDraft();
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
      return;
    }

    if (event.shiftKey || event.altKey) {
      event.preventDefault();
      insertNewlineAtCursor(event.currentTarget);
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      return;
    }

    event.preventDefault();
    void sendDraft();
  }

  function insertNewlineAtCursor(textarea: HTMLTextAreaElement) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.setRangeText('\n', start, end, 'end');
    setDraft(textarea.value);
  }

  function startResize(event: PointerEvent<HTMLDivElement>) {
    if (fullScreen || event.button !== 0) {
      return;
    }

    resizePointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizing(true);
    setPanelWidth(widthFromPointerX(event.clientX));
  }

  function updateResize(event: PointerEvent<HTMLDivElement>) {
    if (!resizing || resizePointerId.current !== event.pointerId) {
      return;
    }

    setPanelWidth(widthFromPointerX(event.clientX));
  }

  function endResize(event: PointerEvent<HTMLDivElement>) {
    if (resizePointerId.current === event.pointerId && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resizePointerId.current = null;
    setResizing(false);
  }

  return (
    <aside
      data-testid="assistant-panel"
      data-fullscreen={fullScreen}
      className={cn(
        'absolute inset-y-0 right-0 z-30 flex min-w-[340px] flex-col border-l border-border bg-surface-elevated shadow-lg',
        fullScreen && 'inset-0 z-40 min-w-0 border-l-0'
      )}
      style={fullScreen ? undefined : { width: panelWidth }}
    >
      <div
        data-testid="assistant-resize-handle"
        className={cn(
          'absolute inset-y-0 left-0 z-10 w-2 -translate-x-1 cursor-col-resize touch-none',
          fullScreen && 'hidden',
          resizing && 'bg-accent/20'
        )}
        title="Resize Assistant"
        onPointerDown={startResize}
        onPointerMove={updateResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
      />
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Bot className="h-4 w-4 text-accent" />
            <span>Ask Distill</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{props.scopeLabel}</div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" title="New assistant conversation" onClick={startNew}>
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" title={fullScreen ? 'Exit full screen' : 'Full screen Assistant'} onClick={() => setFullScreen((current) => !current)}>
            {fullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button size="icon" variant="ghost" title="Close Assistant" onClick={props.onClose}>
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {conversations.length > 0 ? (
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
          <select
            className="h-8 min-w-0 flex-1 rounded border border-input bg-background px-2 text-xs"
            value={activeConversation?.id ?? ''}
            onChange={(event) => event.target.value ? void selectConversation(event.target.value) : startNew()}
            disabled={loading || running}
            title="Assistant conversations"
          >
            <option value="">New reflection</option>
            {conversations.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>{conversation.title ?? 'Untitled reflection'}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none -ml-8 h-4 w-4 text-muted-foreground" />
        </div>
      ) : null}

      <div ref={scrollRef} className="stable-scrollbar min-h-0 flex-1 overflow-y-scroll px-4 py-4">
        {activeConversation?.messages.length ? (
          <div className="space-y-4">
            {activeConversation.messages.map((message) => (
              <AssistantMessage
                key={message.id}
                message={message}
                onOpenRecording={props.onOpenRecording}
                onOpenNote={props.onOpenNote}
              />
            ))}
            {running ? <AgentActivity trace={lastTrace} /> : null}
          </div>
        ) : (
          <AssistantEmptyState />
        )}
      </div>

      {error ? (
        <div className="border-t border-destructive/25 bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>
      ) : null}

      <form className="shrink-0 border-t border-border p-3" onSubmit={(event) => void submit(event)}>
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            data-testid="assistant-input"
            className="max-h-32 min-h-20 min-w-0 flex-1 resize-none rounded border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Ask about your recordings and notes..."
            disabled={running}
          />
          <Button size="icon" type="submit" title="Send" disabled={running || draft.trim().length === 0}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </form>
    </aside>
  );
}

function widthFromPointerX(clientX: number): number {
  return clampPanelWidth(window.innerWidth - clientX);
}

function clampPanelWidth(width: number): number {
  const minWidth = 340;
  const maxWidth = Math.max(minWidth, Math.min(960, window.innerWidth - 360));
  return Math.max(minWidth, Math.min(maxWidth, width));
}

function AssistantEmptyState() {
  return (
    <div className="flex h-full min-h-[260px] flex-col justify-center">
      <Sparkles className="mb-4 h-8 w-8 text-accent" />
      <h2 className="text-base font-semibold">Reflect on your library</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Ask what you said, wrote, repeated, or changed. Distill will search your saved material before answering.</p>
    </div>
  );
}

function AssistantMessage(props: {
  message: AgentConversationMessage;
  onOpenRecording(source: Extract<AgentSource, { kind: 'recording' }>): void;
  onOpenNote(id: string): void;
}) {
  const isUser = props.message.role === 'user';
  return (
    <article className={cn('text-sm', isUser && 'ml-8')}>
      <div className={cn('rounded px-3 py-2 leading-6', isUser ? 'whitespace-pre-wrap bg-muted' : 'bg-transparent px-0')}>
        {isUser ? props.message.content : <MarkdownContent content={props.message.content} />}
      </div>
      {!isUser && props.message.sources.length > 0 ? (
        <AgentSourceList
          sources={props.message.sources}
          onOpenRecording={props.onOpenRecording}
          onOpenNote={props.onOpenNote}
        />
      ) : null}
    </article>
  );
}

function MarkdownContent(props: { content: string }) {
  const blocks = parseMarkdownBlocks(props.content);
  return (
    <div data-testid="assistant-markdown" className="space-y-3 text-sm leading-6">
      {blocks.map((block, index) => renderMarkdownBlock(block, index))}
    </div>
  );
}

type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'unordered-list'; items: string[] }
  | { type: 'ordered-list'; items: string[] }
  | { type: 'code'; text: string; language?: string }
  | { type: 'rule' };

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    const fence = trimmed.match(/^```([\w-]+)?\s*$/);
    if (fence) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index]?.trim() ?? '')) {
        codeLines.push(lines[index] ?? '');
        index += 1;
      }
      blocks.push({ type: 'code', text: codeLines.join('\n'), language: fence[1] });
      index += index < lines.length ? 1 : 0;
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3 | 4, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (/^(---|\*\*\*|___)$/.test(trimmed)) {
      blocks.push({ type: 'rule' });
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = (lines[index] ?? '').trim().match(/^[-*]\s+(.+)$/);
        if (!item) {
          break;
        }
        items.push(item[1].trim());
        index += 1;
      }
      blocks.push({ type: 'unordered-list', items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = (lines[index] ?? '').trim().match(/^\d+\.\s+(.+)$/);
        if (!item) {
          break;
        }
        items.push(item[1].trim());
        index += 1;
      }
      blocks.push({ type: 'ordered-list', items });
      continue;
    }

    const paragraphLines = [trimmed];
    index += 1;
    while (index < lines.length) {
      const next = (lines[index] ?? '').trim();
      if (!next || /^```/.test(next) || /^#{1,4}\s+/.test(next) || /^(---|\*\*\*|___)$/.test(next) || /^[-*]\s+/.test(next) || /^\d+\.\s+/.test(next)) {
        break;
      }
      paragraphLines.push(next);
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraphLines.join(' ') });
  }

  return blocks;
}

function renderMarkdownBlock(block: MarkdownBlock, index: number): ReactNode {
  if (block.type === 'heading') {
    const className = cn(
      'font-semibold leading-snug text-foreground',
      block.level === 1 && 'text-lg',
      block.level === 2 && 'text-base',
      block.level >= 3 && 'text-sm'
    );
    if (block.level === 1) {
      return <h1 key={index} className={className}>{renderInlineMarkdown(block.text)}</h1>;
    }
    if (block.level === 2) {
      return <h2 key={index} className={className}>{renderInlineMarkdown(block.text)}</h2>;
    }
    if (block.level === 3) {
      return <h3 key={index} className={className}>{renderInlineMarkdown(block.text)}</h3>;
    }
    return <h4 key={index} className={className}>{renderInlineMarkdown(block.text)}</h4>;
  }

  if (block.type === 'unordered-list') {
    return (
      <ul key={index} className="list-disc space-y-1 pl-5 marker:text-muted-foreground">
        {block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item)}</li>)}
      </ul>
    );
  }

  if (block.type === 'ordered-list') {
    return (
      <ol key={index} className="list-decimal space-y-1 pl-5 marker:text-muted-foreground">
        {block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item)}</li>)}
      </ol>
    );
  }

  if (block.type === 'code') {
    return (
      <pre key={index} className="max-w-full overflow-x-auto rounded border border-border bg-muted px-3 py-2 text-xs leading-5">
        <code>{block.text}</code>
      </pre>
    );
  }

  if (block.type === 'rule') {
    return <hr key={index} className="border-border" />;
  }

  return <p key={index}>{renderInlineMarkdown(block.text)}</p>;
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }

    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(<strong key={nodes.length} className="font-semibold text-foreground">{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(<code key={nodes.length} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">{token.slice(1, -1)}</code>);
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes.map((node, index) => <Fragment key={index}>{node}</Fragment>);
}

function AgentSourceList(props: {
  sources: AgentSource[];
  onOpenRecording(source: Extract<AgentSource, { kind: 'recording' }>): void;
  onOpenNote(id: string): void;
}) {
  return (
    <div data-testid="assistant-sources" className="mt-3 border-t border-border pt-2">
      <div className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Sources</div>
      <div className="space-y-1">
        {props.sources.map((source) => (
          <button
            key={sourceKey(source)}
            data-testid="assistant-source"
            className="grid w-full grid-cols-[18px_minmax(0,1fr)] gap-2 rounded px-2 py-2 text-left hover:bg-muted"
            onClick={() => source.kind === 'recording' ? props.onOpenRecording(source) : props.onOpenNote(source.noteId)}
          >
            {source.kind === 'recording' ? <FileAudio className="mt-0.5 h-4 w-4 text-accent" /> : <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />}
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium">{source.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {source.date}{source.kind === 'recording' && source.startTime !== undefined ? ` · ${formatTimestamp(source.startTime)}` : ''}
              </span>
              {source.snippet ? <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">{source.snippet}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AgentActivity(props: { trace: AgentTraceStep[] }) {
  const lastTool = [...props.trace].reverse().find((step) => step.type === 'tool');
  const label = lastTool?.toolName ? activityLabel(lastTool.toolName) : '正在整理回答...';
  return (
    <div data-testid="assistant-activity" className="flex items-center gap-2 text-sm text-muted-foreground">
      <Search className="h-4 w-4 animate-pulse text-accent" />
      <span>{label}</span>
    </div>
  );
}

function activityLabel(toolName: string): string {
  if (toolName === 'search_library') {
    return '正在搜索资料库...';
  }
  if (toolName === 'get_recording' || toolName === 'get_transcript') {
    return '正在读取录音...';
  }
  if (toolName === 'get_note') {
    return '正在读取笔记...';
  }
  return '正在整理回答...';
}

function sourceKey(source: AgentSource): string {
  return source.kind === 'recording'
    ? `recording:${source.recordingId}:${source.segmentId ?? ''}:${source.startTime ?? ''}`
    : `note:${source.noteId}`;
}

function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes.toString().padStart(2, '0')}:${rest.toString().padStart(2, '0')}`;
}
