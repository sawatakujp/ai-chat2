import { Storage } from '@google-cloud/storage'
import { randomUUID } from 'crypto'
import path from 'path'

function getStorage() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID

  // Cloud Run: Secret Manager 経由で JSON キーを文字列として渡す場合
  const credJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
  if (credJson) {
    try {
      const credentials = JSON.parse(credJson)
      return new Storage({ projectId, credentials })
    } catch {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON が不正な JSON です。設定を確認してください。')
    }
  }

  // ローカル: GOOGLE_APPLICATION_CREDENTIALS ファイルパス or ADC を使用
  return new Storage({ projectId })
}

export interface UploadResult {
  url: string
  name: string
  mimeType: string
  size: number
}

export async function uploadToGCS(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<UploadResult> {
  const storage = getStorage()
  const bucketName = process.env.GCS_BUCKET_NAME

  if (!bucketName) {
    throw new Error('GCS_BUCKET_NAME が設定されていません')
  }

  const ext = path.extname(originalName) || ''
  const fileName = `uploads/${randomUUID()}${ext}`

  const bucket = storage.bucket(bucketName)
  const file = bucket.file(fileName)

  await file.save(buffer, {
    metadata: { contentType: mimeType },
    // バケットの公開設定に依存。IAM で allUsers に Storage Object Viewer を付与すること
  })

  const publicUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`

  return {
    url: publicUrl,
    name: originalName,
    mimeType,
    size: buffer.length,
  }
}

export function detectAttachmentType(
  mimeType: string,
): 'image' | 'pdf' | 'text' | 'video' | 'audio' {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'text'
}
