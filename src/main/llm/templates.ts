import { aiArtifactContentSchema } from '@shared/schemas/ai';
import type { AIArtifactTemplate } from '@shared/types/domain';

const outputSchema = JSON.stringify(aiArtifactContentSchema.toJSONSchema(), null, 2);

export const builtInTemplates = [
  {
    id: 'default-summary',
    name: 'Default Summary',
    description: 'Title, summary, key points, todos, and tags.',
    promptVersion: '2026-09-02.v1',
    outputSchema,
    prompt: [
      'You organize a raw voice transcript into faithful structured notes.',
      'Do not invent facts that are not present in the transcript.',
      'Remove spoken repetition when it does not change meaning.',
      'Return valid JSON with title, summary, keyPoints, todos, and tags.'
    ].join('\n')
  },
  {
    id: 'technical-thinking',
    name: '技术思考',
    description: 'Organizes technical reasoning, conclusions, unknowns, and next steps.',
    promptVersion: '2026-09-02.v1',
    outputSchema,
    prompt: [
      '你负责把技术思考类语音转写整理成可靠笔记。',
      '必须忠于原文，不添加原文没有的事实。',
      '重点提取当前问题、背景、推理过程、结论、未解决问题和下一步。',
      '输出必须是 JSON，并包含 title, summary, keyPoints, todos, tags。'
    ].join('\n')
  },
  {
    id: 'personal-reflection',
    name: '个人随想',
    description: 'Organizes personal ideas, events, feelings, and memorable viewpoints.',
    promptVersion: '2026-09-02.v1',
    outputSchema,
    prompt: [
      '你负责把个人随想类语音转写整理成清晰笔记。',
      '必须忠于原文，不添加原文没有的事实。',
      '重点提取核心想法、事情经过、情绪或感受和值得记住的观点。',
      '输出必须是 JSON，并包含 title, summary, keyPoints, todos, tags。'
    ].join('\n')
  }
] as const;

export function listBuiltInTemplateMetadata(): AIArtifactTemplate[] {
  return builtInTemplates.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    promptVersion: template.promptVersion
  }));
}
