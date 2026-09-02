export type SpeechSegment = {
  start: number;
  end: number;
  text: string;
};

export type SpeechToTextResult = {
  language: string | null;
  duration: number | null;
  segments: SpeechSegment[];
};

export interface SpeechToTextService {
  transcribe(filePath: string): Promise<SpeechToTextResult>;
}
