type LogLevel = 'INFO' | 'WARN' | 'ERROR';

function write(level: LogLevel, scope: string, message: string, detail?: unknown): void {
  const timestamp = new Date().toISOString();
  const suffix = detail === undefined ? '' : ` ${JSON.stringify(redact(detail))}`;
  console.log(`[${timestamp}] [${level}] [${scope}] ${message}${suffix}`);
}

function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/(api[_-]?key|authorization|bearer)\s*[:=]\s*[^\s"]+/gi, '$1=[REDACTED]');
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(redact);
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (/apiKey|token|secret|authorization/i.test(key)) {
        return [key, '[REDACTED]'];
      }
      return [key, redact(item)];
    })
  );
}

export const logger = {
  info: (scope: string, message: string, detail?: unknown) => write('INFO', scope, message, detail),
  warn: (scope: string, message: string, detail?: unknown) => write('WARN', scope, message, detail),
  error: (scope: string, message: string, detail?: unknown) => write('ERROR', scope, message, detail)
};
