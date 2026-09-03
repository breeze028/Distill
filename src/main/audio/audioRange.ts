import fs from 'node:fs';
import { Readable } from 'node:stream';

export type AudioRangeResponse = {
  status: 200 | 206 | 416;
  start: number;
  end: number;
  contentLength: number;
  contentRange: string | null;
};

export function resolveAudioRange(rangeHeader: string | null, fileSize: number): AudioRangeResponse {
  if (!rangeHeader) {
    return fullRange(fileSize);
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || fileSize <= 0) {
    return fullRange(fileSize);
  }

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) {
    return fullRange(fileSize);
  }

  const requestedStart = rawStart ? Number(rawStart) : null;
  const requestedEnd = rawEnd ? Number(rawEnd) : null;

  if ((requestedStart !== null && !Number.isSafeInteger(requestedStart)) || (requestedEnd !== null && !Number.isSafeInteger(requestedEnd))) {
    return unsatisfiableRange(fileSize);
  }

  const lastByte = fileSize - 1;
  let start = requestedStart ?? 0;
  let end = requestedEnd ?? lastByte;

  if (requestedStart === null && requestedEnd !== null) {
    start = Math.max(0, fileSize - requestedEnd);
    end = lastByte;
  }

  if (start < 0 || end < start || start >= fileSize) {
    return unsatisfiableRange(fileSize);
  }

  end = Math.min(end, lastByte);
  return {
    status: 206,
    start,
    end,
    contentLength: end - start + 1,
    contentRange: `bytes ${start}-${end}/${fileSize}`
  };
}

export function createAudioRangeResponse(filePath: string, range: AudioRangeResponse, method = 'GET'): Response {
  const fileSize = fs.statSync(filePath).size;
  if (range.status !== 206) {
    throw new Error(`Cannot create ranged audio response for status ${range.status}.`);
  }

  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Content-Length': String(range.contentLength),
    'Content-Range': range.contentRange ?? `bytes ${range.start}-${range.end}/${fileSize}`,
    'Content-Type': getAudioContentType(filePath)
  });

  if (method === 'HEAD') {
    return new Response(null, { status: 206, headers });
  }

  const stream = fs.createReadStream(filePath, { start: range.start, end: range.end });
  return new Response(Readable.toWeb(stream) as ReadableStream, { status: 206, headers });
}

function fullRange(fileSize: number): AudioRangeResponse {
  return {
    status: 200,
    start: 0,
    end: Math.max(0, fileSize - 1),
    contentLength: fileSize,
    contentRange: null
  };
}

function unsatisfiableRange(fileSize: number): AudioRangeResponse {
  return {
    status: 416,
    start: 0,
    end: 0,
    contentLength: 0,
    contentRange: null
  };
}

function getAudioContentType(filePath: string): string {
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.endsWith('.mp3')) {
    return 'audio/mpeg';
  }
  if (lowerPath.endsWith('.wav')) {
    return 'audio/wav';
  }
  return 'audio/mp4';
}
