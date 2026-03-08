import { Hono } from 'hono'
import { uploadToGCS, detectAttachmentType } from '@/lib/storage/gcs'

export const uploadRoute = new Hono()

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB

// シンプルな IP ベースのレート制限（1分間に10ファイルまで）
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX) return false
  entry.count++
  return true
}

const ALLOWED_MIME_TYPES = new Set([
  // 画像
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  // PDF
  'application/pdf',
  // テキスト
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
  // 動画
  'video/mp4',
  'video/webm',
  'video/quicktime',
  // 音声
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
])

// POST /api/upload — マルチパートフォームでファイルを受け取り GCS にアップロード
uploadRoute.post('/', async (c) => {
  // レート制限チェック
  const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return c.json({ error: '短時間に多くのファイルをアップロードしています。しばらく待ってから再試行してください。' }, 429)
  }

  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return c.json({ error: 'ファイルが見つかりません' }, 400)
    }

    // MIME タイプ検証
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return c.json({ error: `非対応のファイル形式です: ${file.type}` }, 400)
    }

    // サイズ検証
    if (file.size > MAX_FILE_SIZE) {
      return c.json({ error: `ファイルサイズが上限 (20MB) を超えています` }, 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await uploadToGCS(buffer, file.name, file.type)
    const attachmentType = detectAttachmentType(file.type)

    return c.json({
      type: attachmentType,
      url: result.url,
      name: result.name,
      mimeType: result.mimeType,
      size: result.size,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'アップロードに失敗しました'
    console.error('[upload]', err)
    return c.json({ error: message }, 500)
  }
})
