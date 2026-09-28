import fs from 'node:fs';
import type { RecordingDetail } from '@shared/types/domain';
import type { RecordingRepository } from '@main/repositories/recordingRepository';
import type { SpeechToTextService } from '@main/stt/types';
import { logger } from '@main/logging/logger';

type QueuedTranscription = {
  recordingId: string;
  jobId: string;
  resolve: (recording: RecordingDetail) => void;
  reject: (error: unknown) => void;
};

export class TranscriptionService {
  private readonly queue: QueuedTranscription[] = [];
  private draining = false;

  constructor(
    private readonly recordings: RecordingRepository,
    private readonly speechToText: SpeechToTextService
  ) {}

  async transcribeRecording(recordingId: string): Promise<RecordingDetail> {
    const prepared = this.prepareTranscription(recordingId);
    return this.enqueue(prepared.recording.id, prepared.job.id);
  }

  startTranscription(recordingId: string): RecordingDetail {
    const recording = this.recordings.getRecording(recordingId);
    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    if (recording.jobs.some((job) => job.kind === 'transcription' && (job.state === 'pending' || job.state === 'running'))) {
      return recording;
    }

    const prepared = this.prepareTranscription(recordingId);
    void this.enqueue(prepared.recording.id, prepared.job.id).catch(() => undefined);
    const updated = this.recordings.getRecording(recordingId);
    if (!updated) {
      throw new Error('Recording disappeared after transcription start.');
    }
    return updated;
  }

  resumePendingTranscriptions(): number {
    const jobs = this.recordings.listPendingTranscriptionJobs();
    for (const job of jobs) {
      void this.enqueue(job.recordingId, job.id).catch(() => undefined);
    }
    return jobs.length;
  }

  private prepareTranscription(recordingId: string) {
    const recording = this.recordings.getRecording(recordingId);
    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    if (!fs.existsSync(recording.filePath)) {
      throw new Error('原始音频文件不存在，无法转写。');
    }

    const job = this.recordings.createProcessingJob(recordingId, 'transcription', 'pending');
    this.recordings.updateRecordingProcessingState(recordingId, 'pending');
    logger.info('STT', 'Queued transcription job', { recordingId, jobId: job.id });

    return { recording, job };
  }

  private enqueue(recordingId: string, jobId: string): Promise<RecordingDetail> {
    const promise = new Promise<RecordingDetail>((resolve, reject) => {
      this.queue.push({ recordingId, jobId, resolve, reject });
    });
    void this.drainQueue();
    return promise;
  }

  private async drainQueue(): Promise<void> {
    if (this.draining) {
      return;
    }

    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const queued = this.queue.shift();
        if (!queued) {
          continue;
        }

        const recording = this.recordings.getRecording(queued.recordingId);
        if (!recording) {
          queued.reject(new Error(`Recording not found: ${queued.recordingId}`));
          continue;
        }

        try {
          this.recordings.markProcessingJobRunning(queued.jobId);
          this.recordings.updateRecordingProcessingState(queued.recordingId, 'running');
          logger.info('STT', 'Started queued transcription job', {
            recordingId: queued.recordingId,
            jobId: queued.jobId,
            remainingQueueLength: this.queue.length
          });
          queued.resolve(await this.runTranscriptionJob(recording, queued.jobId));
        } catch (error) {
          queued.reject(error);
        }
      }
    } finally {
      this.draining = false;
      if (this.queue.length > 0) {
        void this.drainQueue();
      }
    }
  }

  private async runTranscriptionJob(recording: RecordingDetail, jobId: string): Promise<RecordingDetail> {
    const recordingId = recording.id;
    try {
      const status = await this.speechToText.getStatus();
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
        provider: status.provider,
        model: status.modelName,
        sourceJobId: jobId,
        fullText: segments.map((segment) => segment.text).join('\n'),
        segments
      });
      this.recordings.markProcessingJobSucceeded(jobId);
      logger.info('STT', 'Transcription job succeeded', { recordingId, jobId, segmentCount: segments.length });

      const updated = this.recordings.getRecording(recordingId);
      if (!updated) {
        throw new Error('Recording disappeared after transcription.');
      }
      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : '转写失败。';
      this.recordings.markProcessingJobFailed(jobId, message, error instanceof Error ? error.stack ?? null : null);
      this.recordings.updateRecordingProcessingState(recordingId, 'failed');
      logger.error('STT', 'Transcription job failed', { recordingId, jobId, error: message });
      throw error;
    }
  }
}
