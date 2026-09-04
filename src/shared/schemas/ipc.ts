import { z } from 'zod';

export const importRecordingRequestSchema = z.object({
  filePath: z.string().min(1)
});

export const generateAIArtifactRequestSchema = z.object({
  recordingId: z.string().min(1),
  templateId: z.string().min(1).default('default-summary')
});

export const editTranscriptSegmentRequestSchema = z.object({
  recordingId: z.string().min(1),
  transcriptId: z.string().min(1),
  segmentId: z.string().min(1),
  text: z.string().trim().min(1)
});

export const deleteAIArtifactRequestSchema = z.object({
  recordingId: z.string().min(1),
  artifactId: z.string().min(1)
});

export const saveSettingsRequestSchema = z.object({
  aiProvider: z.string().min(1).optional(),
  deepSeekApiKey: z.string().optional(),
  deepSeekModel: z.string().min(1).optional(),
  watchFolder: z.string().optional(),
  speechProvider: z.enum(['mock', 'python']).optional(),
  speechModel: z.string().min(1).optional(),
  autoTranscribeOnImport: z.boolean().optional()
});

export type SaveSettingsRequest = z.infer<typeof saveSettingsRequestSchema>;
export type GenerateAIArtifactRequest = z.infer<typeof generateAIArtifactRequestSchema>;
export type EditTranscriptSegmentRequest = z.infer<typeof editTranscriptSegmentRequestSchema>;
export type DeleteAIArtifactRequest = z.infer<typeof deleteAIArtifactRequestSchema>;
