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
