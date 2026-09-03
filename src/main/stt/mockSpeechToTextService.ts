import type { SpeechToTextResult, SpeechToTextService } from './types';

export class MockSpeechToTextService implements SpeechToTextService {
  async transcribe(): Promise<SpeechToTextResult> {
    const delayMs = Number(process.env.DISTILL_MOCK_STT_DELAY_MS ?? 0);
    const segmentCount = Number(process.env.DISTILL_MOCK_STT_SEGMENT_COUNT ?? 2);
    if (Number.isFinite(delayMs) && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const segments = Number.isFinite(segmentCount) && segmentCount > 2
      ? buildLongMockSegments(segmentCount)
      : [
          { start: 0, end: 4.2, text: '这是第一阶段的模拟转写，用来验证录音详情和阅读体验。' },
          { start: 4.2, end: 9.8, text: '后续会由 Python Worker 和 faster-whisper 生成真实 segment。' }
        ];

    return {
      language: 'zh',
      duration: segments.at(-1)?.end ?? null,
      segments
    };
  }

  async getStatus() {
    return {
      provider: 'mock' as const,
      ready: true,
      checkedAt: new Date().toISOString(),
      modelName: 'mock',
      device: null,
      computeType: null,
      pythonCommand: null,
      workerPath: null,
      pythonVersion: null,
      fasterWhisperVersion: null,
      errorMessage: null,
      setupHint: '当前使用 mock STT。在 Settings 中选择 Python Worker 后会启用真实 faster-whisper 转写。'
    };
  }
}

function buildLongMockSegments(count: number): SpeechToTextResult['segments'] {
  return Array.from({ length: count }, (_item, index) => {
    if (index === 0) {
      return { start: 0, end: 4.2, text: '这是第一阶段的模拟转写，用来验证录音详情和阅读体验。' };
    }
    if (index === 2) {
      return { start: 4.2, end: 5.8, text: '后续会由 Python Worker 和 faster-whisper 生成真实 segment。' };
    }
    if (index === 15) {
      return { start: 30, end: 31.7, text: '这是第30秒附近的模拟转写，用来验证点击后从对应时间播放。' };
    }

    const start = index * 2;
    return {
      start,
      end: start + 1.6,
      text: `长音频滚动测试片段 ${index + 1}。`
    };
  });
}
