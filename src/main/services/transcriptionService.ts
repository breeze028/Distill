import fs from 'node:fs';
import type { RecordingDetail } from '@shared/types/domain';
import type { RecordingRepository } from '@main/repositories/recordingRepository';
import type { SpeechToTextService } from '@main/stt/types';
import { logger } from '@main/logging/logger';

export class TranscriptionService {
  constructor(
    private readonly recordings: RecordingRepository,
    private readonly speechToText: SpeechToTextService
  ) {}

  async transcribeRecording(recordingId: string): Promise<RecordingDetail> {
    const recording = this.recordings.getRecording(recordingId);
    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    if (!fs.existsSync(recording.filePath)) {
      throw new Error('原始音频文件不存在，无法转写。');
    }

    const job = this.recordings.createProcessingJob(recordingId, 'transcription', 'running');
    this.recordings.updateRecordingProcessingState(recordingId, 'running');
    logger.info('STT', 'Started transcription job', { recordingId, jobId: job.id });

    try {
      const result = await this.speechToText.transcribe(recording.filePath);
      const segments = result.segments.map((segment) => ({
        id: 'generated-by-repository',
        transcriptId: 'generated-by-repository',
        startTime: segment.start,
        endTime: segment.end,
        text: segment.text.trim()
      })).filter((segment) => segment.text.length > 0);

      if (segments.length === 0) {
        throw new Error('转写结果为空。');
      }

      this.recordings.addTranscript(recordingId, {
        language: result.language,
        duration: result.duration ?? recording.duration,
        fullText: segments.map((segment) => segment.text).join('\n'),
        segments
      });
      this.recordings.markProcessingJobSucceeded(job.id);
      logger.info('STT', 'Transcription job succeeded', { recordingId, jobId: job.id, segmentCount: segments.length });

      const updated = this.recordings.getRecording(recordingId);
      if (!updated) {
        throw new Error('Recording disappeared after transcription.');
      }
      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : '转写失败。';
      this.recordings.markProcessingJobFailed(job.id, message, error instanceof Error ? error.stack ?? null : null);
      this.recordings.updateRecordingProcessingState(recordingId, 'failed');
      logger.error('STT', 'Transcription job failed', { recordingId, jobId: job.id, error: message });
      throw error;
    }
  }
}
