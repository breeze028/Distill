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
      setupHint: '当前使用 mock STT。设置 DISTILL_STT_PROVIDER=python 后会启用真实 faster-whisper worker。'
    };
  }
}
