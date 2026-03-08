import { createAnthropic } from '@ai-sdk/anthropic'
import type { Attachment } from '@/types/api'

export function getClaudeModel(modelId: string) {
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return anthropic(modelId)
}

export function buildClaudeContent(text: string, attachments: Attachment[]) {
  if (!attachments || attachments.length === 0) {
    return text
  }

  const parts: object[] = []

  for (const att of attachments) {
    if (att.type === 'image') {
      parts.push({
        type: 'image',
        image: att.url,
      })
    } else if (att.type === 'pdf' || att.type === 'text') {
      parts.push({
        type: 'text',
        text: `[添付ファイル: ${att.name}]\n${att.url}`,
      })
    }
  }

  parts.push({ type: 'text', text })
  return parts
}
