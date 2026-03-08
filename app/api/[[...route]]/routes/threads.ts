import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'

export const threadsRoute = new Hono()

const createThreadSchema = z.object({
  title: z.string().optional(),
  model: z.string().min(1),
  provider: z.enum(['claude', 'gemini']),
  systemPrompt: z.string().optional(),
})

const updateThreadSchema = z.object({
  title: z.string().optional(),
  model: z.string().optional(),
  provider: z.enum(['claude', 'gemini']).optional(),
  systemPrompt: z.string().optional(),
})

const searchQuerySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  cursor: z.string().optional(),
})

// GET /api/threads — 一覧取得（?q= で検索、?limit=&cursor= でページネーション）
threadsRoute.get(
  '/',
  zValidator('query', searchQuerySchema),
  async (c) => {
    const { q, limit, cursor } = c.req.valid('query')
    const threads = await prisma.thread.findMany({
      where: q ? { title: { contains: q, mode: 'insensitive' } } : undefined,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        title: true,
        model: true,
        provider: true,
        systemPrompt: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    return c.json(threads)
  }
)

// POST /api/threads — 新規作成
threadsRoute.post(
  '/',
  zValidator('json', createThreadSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'Invalid request', details: result.error.issues }, 400)
    }
  }),
  async (c) => {
    const data = c.req.valid('json')
    const thread = await prisma.thread.create({
      data: {
        title: data.title ?? '新しいチャット',
        model: data.model,
        provider: data.provider,
        systemPrompt: data.systemPrompt ?? '',
      },
    })
    return c.json(thread, 201)
  }
)

// PATCH /api/threads/:id — タイトル・設定更新
threadsRoute.patch(
  '/:id',
  zValidator('json', updateThreadSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'Invalid request', details: result.error.issues }, 400)
    }
  }),
  async (c) => {
    const { id } = c.req.param()
    const data = c.req.valid('json')

    const existing = await prisma.thread.findUnique({ where: { id } })
    if (!existing) {
      return c.json({ error: 'Thread not found' }, 404)
    }

    const thread = await prisma.thread.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.model !== undefined && { model: data.model }),
        ...(data.provider !== undefined && { provider: data.provider }),
        ...(data.systemPrompt !== undefined && { systemPrompt: data.systemPrompt }),
      },
    })
    return c.json(thread)
  }
)

// DELETE /api/threads/:id — 削除
threadsRoute.delete('/:id', async (c) => {
  const { id } = c.req.param()

  const existing = await prisma.thread.findUnique({ where: { id } })
  if (!existing) {
    return c.json({ error: 'Thread not found' }, 404)
  }

  await prisma.thread.delete({ where: { id } })
  return c.json({ success: true })
})
