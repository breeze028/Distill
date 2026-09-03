import type { RecordingDetail } from '@shared/types/domain';
import type { RecordingRepository } from '@main/repositories/recordingRepository';
import type { LLMProvider } from '@main/llm/types';
import { builtInTemplates } from '@main/llm/templates';
import { LLMProviderError } from '@main/llm/types';
import { logger } from '@main/logging/logger';

type AISettings = {
  getSettings(): { deepSeekModel: string };
};

export class AIArtifactService {
  constructor(
    private readonly recordings: RecordingRepository,
    private readonly llm: LLMProvider,
    private readonly settings: AISettings
  ) {}

  async generateArtifact(recordingId: string, templateId = 'default-summary'): Promise<RecordingDetail> {
    const prepared = this.prepareGeneration(recordingId, templateId);
    return this.runGenerationJob(prepared.recording, prepared.template, prepared.job.id);
  }

  startGeneration(recordingId: string, templateId = 'default-summary'): RecordingDetail {
    const recording = this.recordings.getRecording(recordingId);
    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    if (recording.jobs.some((job) => job.kind === 'ai' && job.state === 'running')) {
      return recording;
    }

    const prepared = this.prepareGeneration(recordingId, templateId);
    void this.runGenerationJob(prepared.recording, prepared.template, prepared.job.id).catch(() => undefined);
    const updated = this.recordings.getRecording(recordingId);
    if (!updated) {
      throw new Error('Recording disappeared after AI generation start.');
    }
    return updated;
  }

  private prepareGeneration(recordingId: string, templateId: string) {
    const recording = this.recordings.getRecording(recordingId);
    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }
    if (!recording.transcript?.fullText.trim()) {
      throw new Error('需要先完成转写，才能生成 AI 笔记。');
    }

    const template = builtInTemplates.find((item) => item.id === templateId);
    if (!template) {
      throw new Error(`AI template not found: ${templateId}`);
    }

    const job = this.recordings.createProcessingJob(recordingId, 'ai', 'running');
    this.recordings.updateRecordingProcessingState(recordingId, 'running');
    logger.info('AI', 'Started artifact generation job', { recordingId, jobId: job.id, templateId });

    return { recording, template, job };
  }

  private async runGenerationJob(
    recording: RecordingDetail,
    template: (typeof builtInTemplates)[number],
    jobId: string
  ): Promise<RecordingDetail> {
    const recordingId = recording.id;
    try {
      const settings = this.settings.getSettings();
      const prompt = [
        template.prompt,
        '',
        '输出 JSON 必须符合以下 schema：',
        template.outputSchema
      ].join('\n');
      const response = await this.llm.generate({
        transcript: recording.transcript?.fullText ?? '',
        templateId: template.id,
        prompt,
        model: settings.deepSeekModel
      });

      this.recordings.addAIArtifact({
        recordingId,
        templateId: template.id,
        provider: this.llm.id,
        model: settings.deepSeekModel,
        promptVersion: template.promptVersion,
        rawResponse: response.rawResponse,
        content: response.content
      });
      this.recordings.markProcessingJobSucceeded(jobId);
      this.recordings.updateRecordingProcessingState(recordingId, 'succeeded');
      logger.info('AI', 'Artifact generation job succeeded', { recordingId, jobId, templateId: template.id });

      const updated = this.recordings.getRecording(recordingId);
      if (!updated) {
        throw new Error('Recording disappeared after AI generation.');
      }
      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 笔记生成失败。';
      const detail = error instanceof LLMProviderError && error.details.rawResponse
        ? error.details.rawResponse
        : error instanceof Error
          ? error.stack ?? null
          : null;
      this.recordings.updateRecordingProcessingState(recordingId, 'failed');
      this.recordings.markProcessingJobFailed(jobId, message, detail);
      logger.error('AI', 'Artifact generation job failed', { recordingId, jobId, error: message });
      throw error;
    }
  }
}
