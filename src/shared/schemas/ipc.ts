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

export const libraryGroupIdRequestSchema = z.object({
  groupId: z.string().min(1)
});

export const createLibraryGroupRequestSchema = z.object({
  title: z.string().trim().max(120).optional()
});

export const renameLibraryGroupRequestSchema = z.object({
  groupId: z.string().min(1),
  title: z.string().trim().min(1).max(120)
});

export const libraryGroupItemRequestSchema = z.object({
  groupId: z.string().min(1),
  item: z.object({
    kind: z.enum(['recording', 'note']),
    id: z.string().min(1)
  })
});

export const libraryGroupSearchRequestSchema = z.object({
  groupId: z.string().min(1),
  query: z.string().default('')
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
export type LibraryGroupIdRequest = z.infer<typeof libraryGroupIdRequestSchema>;
export type CreateLibraryGroupRequest = z.infer<typeof createLibraryGroupRequestSchema>;
export type RenameLibraryGroupRequest = z.infer<typeof renameLibraryGroupRequestSchema>;
export type LibraryGroupItemRequest = z.infer<typeof libraryGroupItemRequestSchema>;
export type LibraryGroupSearchRequest = z.infer<typeof libraryGroupSearchRequestSchema>;
