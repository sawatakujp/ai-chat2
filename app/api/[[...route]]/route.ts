import { Hono } from 'hono'
import { handle } from 'hono/vercel'
import { threadsRoute } from './routes/threads'
import { messagesRoute } from './routes/messages'
import { uploadRoute } from './routes/upload'
import { modelsRoute } from './routes/models'

export const runtime = 'nodejs'

const app = new Hono().basePath('/api')

// ヘルスチェック
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// スレッド API
app.route('/threads', threadsRoute)

// メッセージ API（/threads/:id/messages）
app.route('/threads', messagesRoute)

// ファイルアップロード API
app.route('/upload', uploadRoute)

// 利用可能モデル一覧 API
app.route('/models', modelsRoute)

export const GET = handle(app)
export const POST = handle(app)
export const PATCH = handle(app)
export const DELETE = handle(app)
