import type { SpeechToTextResult, SpeechToTextService } from './types';

export class MockSpeechToTextService implements SpeechToTextService {
  async transcribe(): Promise<SpeechToTextResult> {
    return {
      language: 'zh',
      duration: null,
      segments: [
        { start: 0, end: 4.2, text: '这是第一阶段的模拟转写，用来验证录音详情和阅读体验。' },
        { start: 4.2, end: 9.8, text: '后续会由 Python Worker 和 faster-whisper 生成真实 segment。' }
      ]
    };
  }
}
