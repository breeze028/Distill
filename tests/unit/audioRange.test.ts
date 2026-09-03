import { describe, expect, it } from 'vitest';
import { resolveAudioRange } from '@main/audio/audioRange';

describe('audio range responses', () => {
  it('returns a full response when no byte range is requested', () => {
    expect(resolveAudioRange(null, 1000)).toEqual({
      status: 200,
      start: 0,
      end: 999,
      contentLength: 1000,
      contentRange: null
    });
  });

  it('resolves open-ended byte ranges for media seeking', () => {
    expect(resolveAudioRange('bytes=300-', 1000)).toEqual({
      status: 206,
      start: 300,
      end: 999,
      contentLength: 700,
      contentRange: 'bytes 300-999/1000'
    });
  });

  it('resolves suffix byte ranges', () => {
    expect(resolveAudioRange('bytes=-200', 1000)).toEqual({
      status: 206,
      start: 800,
      end: 999,
      contentLength: 200,
      contentRange: 'bytes 800-999/1000'
    });
  });

  it('marks out-of-file ranges as unsatisfiable', () => {
    expect(resolveAudioRange('bytes=1000-', 1000)).toEqual({
      status: 416,
      start: 0,
      end: 0,
      contentLength: 0,
      contentRange: null
    });
  });
});
