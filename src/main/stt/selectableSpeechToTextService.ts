import type { SpeechToTextProvider } from '@shared/types/domain';
import type { SpeechToTextResult, SpeechToTextService } from './types';

type SpeechToTextSettings = {
  getSettings(): { speechProvider: SpeechToTextProvider };
};

export class SelectableSpeechToTextService implements SpeechToTextService {
  constructor(
    private readonly settings: SpeechToTextSettings,
    private readonly providers: Record<SpeechToTextProvider, SpeechToTextService>
  ) {}

  async transcribe(filePath: string): Promise<SpeechToTextResult> {
    return this.currentProvider().transcribe(filePath);
  }

  async getStatus() {
    return this.currentProvider().getStatus();
  }

  private currentProvider(): SpeechToTextService {
    return this.providers[this.settings.getSettings().speechProvider] ?? this.providers.mock;
  }
}
