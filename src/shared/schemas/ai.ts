import { z } from 'zod';

export const aiArtifactContentSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).default([]),
  todos: z.array(z.string().min(1)).default([]),
  tags: z.array(z.string().min(1)).default([])
});

export type AIArtifactContentInput = z.infer<typeof aiArtifactContentSchema>;

export function parseAIArtifactContent(raw: string): AIArtifactContentInput {
  const parsed = JSON.parse(raw) as unknown;
  return aiArtifactContentSchema.parse(parsed);
}
