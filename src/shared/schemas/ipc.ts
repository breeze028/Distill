import { z } from 'zod';

export const importRecordingRequestSchema = z.object({
  filePath: z.string().min(1)
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
