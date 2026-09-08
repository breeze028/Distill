import { z } from 'zod';

export const importRecordingRequestSchema = z.object({
  filePath: z.string().min(1)
});

export const calendarMonthRequestSchema = z.object({
  year: z.number().int().min(1900).max(9999),
  month: z.number().int().min(1).max(12)
});

export const recordingDateRequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
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

export const recordingIdRequestSchema = z.object({
  recordingId: z.string().min(1)
});

const richTextDocumentSchema = z.object({
  type: z.string().min(1),
  content: z.array(z.unknown()).optional()
}).passthrough();

export const createNoteRequestSchema = z.object({
  title: z.string().trim().max(200).optional(),
  contentJson: richTextDocumentSchema.optional(),
  plainText: z.string().max(500_000).optional()
});

export const noteIdRequestSchema = z.object({
  noteId: z.string().min(1)
});

export const updateNoteRequestSchema = z.object({
  noteId: z.string().min(1),
  title: z.string().trim().max(200),
  contentJson: richTextDocumentSchema,
  plainText: z.string().max(500_000)
});

export const noteImagePathRequestSchema = z.object({
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
export type CalendarMonthRequest = z.infer<typeof calendarMonthRequestSchema>;
export type RecordingDateRequest = z.infer<typeof recordingDateRequestSchema>;
export type GenerateAIArtifactRequest = z.infer<typeof generateAIArtifactRequestSchema>;
export type EditTranscriptSegmentRequest = z.infer<typeof editTranscriptSegmentRequestSchema>;
export type DeleteAIArtifactRequest = z.infer<typeof deleteAIArtifactRequestSchema>;
export type RecordingIdRequest = z.infer<typeof recordingIdRequestSchema>;
export type CreateNoteRequest = z.infer<typeof createNoteRequestSchema>;
export type NoteIdRequest = z.infer<typeof noteIdRequestSchema>;
export type UpdateNoteRequest = z.infer<typeof updateNoteRequestSchema>;
export type NoteImagePathRequest = z.infer<typeof noteImagePathRequestSchema>;
