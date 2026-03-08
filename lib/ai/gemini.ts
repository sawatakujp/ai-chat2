import { createVertex } from '@ai-sdk/google-vertex'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Attachment } from '@/types/api'

// 一時ファイルへの書き出しは初回のみ実行（シングルトン）
let credentialsReady = false

function ensureCredentials() {
  if (credentialsReady) return
  const credJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
  if (credJson && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const tmpPath = join(tmpdir(), `gcp-credentials-${process.pid}.json`)
    writeFileSync(tmpPath, credJson, { mode: 0o600 }) // オーナーのみ読み取り可
    process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpPath
    // プロセス終了時に一時ファイルを削除
    process.once('exit', () => { try { unlinkSync(tmpPath) } catch { /* ignore */ } })
  }
  credentialsReady = true
}

function getVertexClient() {
  ensureCredentials()
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID
  const location = process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1'
  return createVertex({ project, location })
}

export function getGeminiModel(modelId: string) {
  const vertex = getVertexClient()
  return vertex(modelId)
}

export function buildGeminiContent(text: string, attachments: Attachment[]) {
  if (!attachments || attachments.length === 0) return text
  const parts: object[] = []
  for (const att of attachments) {
    if (att.type === 'image') {
      parts.push({ type: 'image', image: att.url })
    } else if (att.type === 'pdf' || att.type === 'text') {
      parts.push({ type: 'text', text: `[添付ファイル: ${att.name}]\n${att.url}` })
    }
  }
  parts.push({ type: 'text', text })
  return parts
}
