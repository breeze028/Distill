import { z } from 'zod';

export const agentScopeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('all')
  }),
  z.object({
    kind: z.literal('current'),
    item: z.object({
      kind: z.enum(['recording', 'note']),
      id: z.string().min(1)
    })
  })
]);

export const agentSourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('recording'),
    recordingId: z.string().min(1),
    title: z.string().min(1),
    date: z.string().min(1),
    segmentId: z.string().min(1).optional(),
    startTime: z.number().optional(),
    snippet: z.string().optional()
  }),
  z.object({
    kind: z.literal('note'),
    noteId: z.string().min(1),
    title: z.string().min(1),
    date: z.string().min(1),
    snippet: z.string().optional()
  })
]);

export const agentRunRequestSchema = z.object({
  conversationId: z.string().min(1).optional(),
  question: z.string().trim().min(1).max(8000),
  scope: agentScopeSchema.default({ kind: 'all' })
});

export const agentConversationIdRequestSchema = z.object({
  conversationId: z.string().min(1)
});

export type AgentRunRequest = z.infer<typeof agentRunRequestSchema>;
export type AgentConversationIdRequest = z.infer<typeof agentConversationIdRequestSchema>;
