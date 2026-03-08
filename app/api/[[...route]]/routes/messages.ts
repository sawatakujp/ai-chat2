import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { streamChatWithAttachments, generateTitle, type ChatMessage } from '@/lib/ai'
import type { Attachment } from '@/types/api'

export const messagesRoute = new Hono()

const attachmentSchema = z.object({
  type: z.enum(['image', 'pdf', 'text', 'video', 'audio']),
  url: z.string().url(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number().int().positive(),
})

const createMessageSchema = z.object({
  content: z.string().min(1),
  attachments: z.array(attachmentSchema).optional().default([]),
})

// GET /api/threads/:id/messages
messagesRoute.get('/:id/messages', async (c) => {
  const { id } = c.req.param()

  const thread = await prisma.thread.findUnique({ where: { id } })
  if (!thread) return c.json({ error: 'Thread not found' }, 404)

  const messages = await prisma.message.findMany({
    where: { threadId: id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      threadId: true,
      role: true,
      content: true,
      attachments: true,
      createdAt: true,
    },
  })
  return c.json(messages)
})

// POST /api/threads/:id/messages — ストリーミング送信
messagesRoute.post(
  '/:id/messages',
  zValidator('json', createMessageSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'Invalid request', details: result.error.issues }, 400)
    }
  }),
  async (c) => {
    const { id } = c.req.param()
    const data = c.req.valid('json')

    const thread = await prisma.thread.findUnique({ where: { id } })
    if (!thread) return c.json({ error: 'Thread not found' }, 404)

    // ユーザーメッセージを DB に保存
    await prisma.message.create({
      data: {
        threadId: id,
        role: 'user',
        content: data.content,
        attachments: (data.attachments ?? []) as object[],
      },
    })

    // 過去メッセージを取得して履歴を構成（直近50件でコンテキストウィンドウを制限）
    const history = await prisma.message.findMany({
      where: { threadId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    history.reverse() // 時系列順に戻す

    const chatMessages: ChatMessage[] = history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      attachments: (m.attachments ?? []) as unknown as Attachment[],
    }))

    // AbortController でキャンセル対応
    const abortController = new AbortController()
    c.req.raw.signal.addEventListener('abort', () => abortController.abort())

    // ストリーミング開始
    const result = await streamChatWithAttachments(
      thread.provider as 'claude' | 'gemini',
      thread.model,
      chatMessages,
      thread.systemPrompt || undefined,
      abortController.signal,
    )

    // SSE ストリームレスポンス
    const stream = new ReadableStream({
      async start(controller) {
        let fullText = ''
        try {
          for await (const chunk of result.textStream) {
            fullText += chunk
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ text: chunk })}\n\n`))
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Stream error'
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ error: msg })}\n\n`),
          )
        } finally {
          // アシスタントの返答を DB に保存
          if (fullText) {
            await prisma.message.create({
              data: {
                threadId: id,
                role: 'assistant',
                content: fullText,
                attachments: [],
              },
            })

            // 初回メッセージならタイトルを自動生成
            const msgCount = await prisma.message.count({ where: { threadId: id } })
            if (msgCount <= 2 && thread.title === '新しいチャット') {
              try {
                const title = await generateTitle(
                  thread.provider as 'claude' | 'gemini',
                  thread.model,
                  data.content,
                )
                await prisma.thread.update({ where: { id }, data: { title } })
                controller.enqueue(
                  new TextEncoder().encode(`data: ${JSON.stringify({ titleUpdate: title })}\n\n`),
                )
              } catch {
                // タイトル生成失敗は無視
              }
            }
          }

          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  },
)
