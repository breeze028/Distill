import { describe, expect, it } from 'vitest';
import { SelectableSpeechToTextService } from '@main/stt/selectableSpeechToTextService';
import type { SpeechToTextProvider, SpeechToTextStatus } from '@shared/types/domain';
import type { SpeechToTextResult, SpeechToTextService } from '@main/stt/types';

describe('SelectableSpeechToTextService', () => {
  it('routes transcription through the currently selected provider', async () => {
    let speechProvider: SpeechToTextProvider = 'mock';
    const service = new SelectableSpeechToTextService(
      { getSettings: () => ({ speechProvider }) },
      {
        mock: new NamedProvider('mock'),
        python: new NamedProvider('python')
      }
    );

    await expect(service.transcribe('recording.m4a')).resolves.toMatchObject({
      segments: [{ text: 'mock' }]
    });

    speechProvider = 'python';

    await expect(service.transcribe('recording.m4a')).resolves.toMatchObject({
      segments: [{ text: 'python' }]
    });
    await expect(service.getStatus()).resolves.toMatchObject({ provider: 'python' });
  });
});

class NamedProvider implements SpeechToTextService {
  constructor(private readonly provider: SpeechToTextProvider) {}

  async transcribe(): Promise<SpeechToTextResult> {
    return {
      language: null,
      duration: null,
      segments: [{ start: 0, end: 1, text: this.provider }]
    };
  }

  async getStatus(): Promise<SpeechToTextStatus> {
    return {
      provider: this.provider,
      ready: true,
      checkedAt: new Date().toISOString(),
      modelName: this.provider,
      device: null,
      computeType: null,
      pythonCommand: null,
      workerPath: null,
      pythonVersion: null,
      fasterWhisperVersion: null,
      errorMessage: null,
      setupHint: null
    };
  }
}
