import { z } from 'zod';

export const importRecordingRequestSchema = z.object({
  filePath: z.string().min(1)
});

export const saveSettingsRequestSchema = z.object({
  aiProvider: z.string().min(1).optional(),
  deepSeekApiKey: z.string().optional(),
  deepSeekModel: z.string().min(1).optional(),
  watchFolder: z.string().optional(),
  speechModel: z.string().min(1).optional()
});

export type SaveSettingsRequest = z.infer<typeof saveSettingsRequestSchema>;
