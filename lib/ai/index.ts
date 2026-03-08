import { streamText, generateText } from 'ai'
import type { UserModelMessage, AssistantModelMessage } from 'ai'
import { getClaudeModel } from './claude'
import { getGeminiModel } from './gemini'
import type { Provider, Attachment } from '@/types/api'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  attachments?: Attachment[]
}

type ModelMessage = UserModelMessage | AssistantModelMessage

/** 添付ファイル付きのユーザーメッセージ content を構築 */
async function buildUserContent(
  text: string,
  attachments: Attachment[],
): Promise<string | object[]> {
  if (!attachments || attachments.length === 0) return text

  const parts: object[] = []

  for (const att of attachments) {
    if (att.type === 'image') {
      // 画像: URL をそのまま渡す（Vercel AI SDK が処理）
      parts.push({ type: 'image', image: new URL(att.url) })
    } else if (att.type === 'pdf') {
      // PDF: サーバーでテキスト抽出してテキストとして渡す
      try {
        const pdfText = await extractPdfText(att.url)
        parts.push({
          type: 'text',
          text: `--- 添付PDF: ${att.name} ---\n${pdfText}\n--- END ---`,
        })
      } catch {
        parts.push({ type: 'text', text: `[PDF: ${att.name} - テキスト抽出失敗]` })
      }
    } else if (att.type === 'text') {
      // テキストファイル: URL からダウンロードして内容を渡す
      try {
        if (!validateAttachmentUrl(att.url)) throw new Error('不正な URL')
        const res = await fetch(att.url, { signal: AbortSignal.timeout(30_000) })
        const textContent = await res.text()
        parts.push({
          type: 'text',
          text: `--- 添付ファイル: ${att.name} ---\n${textContent.slice(0, 10000)}\n--- END ---`,
        })
      } catch {
        parts.push({ type: 'text', text: `[ファイル: ${att.name} - 読み込み失敗]` })
      }
    } else {
      // 動画・音声: URL のみ通知（モデル非対応の場合）
      parts.push({ type: 'text', text: `[添付ファイル: ${att.name} (${att.mimeType})]` })
    }
  }

  parts.push({ type: 'text', text })
  return parts
}

/** 許可する添付ファイルのホスト（SSRF 対策） */
const ALLOWED_ATTACHMENT_HOSTS = ['storage.googleapis.com']

function validateAttachmentUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return ALLOWED_ATTACHMENT_HOSTS.includes(hostname)
  } catch {
    return false
  }
}

async function extractPdfText(url: string): Promise<string> {
  if (!validateAttachmentUrl(url)) throw new Error('不正な添付ファイル URL です')

  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  const arrayBuffer = await res.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // pdf-parse を動的インポートして呼び出す
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfModule = await import('pdf-parse') as any
  const pdfParse = pdfModule.default ?? pdfModule
  const data = await pdfParse(buffer)
  return data.text.slice(0, 20000) // 最大 20000 文字
}

export function streamChat(
  provider: Provider,
  modelId: string,
  messages: ChatMessage[],
  systemPrompt?: string,
  signal?: AbortSignal,
) {
  const model =
    provider === 'claude' ? getClaudeModel(modelId) : getGeminiModel(modelId)

  // 同期的にメッセージを構築（添付は事前に解決済みであることを想定）
  const formattedMessages: ModelMessage[] = messages.map((msg) => {
    if (msg.role === 'assistant') {
      return { role: 'assistant', content: msg.content } as AssistantModelMessage
    }
    return { role: 'user', content: msg.content } as UserModelMessage
  })

  return streamText({
    model,
    system: systemPrompt || undefined,
    messages: formattedMessages,
    abortSignal: signal,
  })
}

/** 添付ファイルを解決してからストリーミング */
export async function streamChatWithAttachments(
  provider: Provider,
  modelId: string,
  messages: ChatMessage[],
  systemPrompt?: string,
  signal?: AbortSignal,
) {
  const model =
    provider === 'claude' ? getClaudeModel(modelId) : getGeminiModel(modelId)

  const formattedMessages: ModelMessage[] = await Promise.all(
    messages.map(async (msg) => {
      if (msg.role === 'assistant') {
        return { role: 'assistant', content: msg.content } as AssistantModelMessage
      }
      const content = await buildUserContent(msg.content, msg.attachments ?? [])
      return { role: 'user', content } as UserModelMessage
    }),
  )

  return streamText({
    model,
    system: systemPrompt || undefined,
    messages: formattedMessages,
    abortSignal: signal,
  })
}

export async function generateTitle(
  provider: Provider,
  modelId: string,
  userMessage: string,
): Promise<string> {
  const model =
    provider === 'claude' ? getClaudeModel(modelId) : getGeminiModel(modelId)

  const { text } = await generateText({
    model,
    messages: [
      {
        role: 'user',
        content: `次の会話の最初のメッセージを元に、20文字以内で会話のタイトルをつけてください。タイトルのみを返してください。余分な記号や説明は不要です。\n\n「${userMessage}」`,
      } as UserModelMessage,
    ],
  })

  return text.trim().slice(0, 40) || '新しいチャット'
}
