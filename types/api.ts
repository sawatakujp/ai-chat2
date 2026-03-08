export type Provider = 'claude' | 'gemini'

export type AttachmentType = 'image' | 'pdf' | 'text' | 'video' | 'audio'

export interface Attachment {
  type: AttachmentType
  url: string
  name: string
  mimeType: string
  size: number
}

export interface ThreadResponse {
  id: string
  title: string
  model: string
  provider: Provider
  systemPrompt: string
  createdAt: string
  updatedAt: string
}

export interface MessageResponse {
  id: string
  threadId: string
  role: 'user' | 'assistant'
  content: string
  attachments: Attachment[]
  createdAt: string
}

export interface CreateThreadRequest {
  title?: string
  model: string
  provider: Provider
  systemPrompt?: string
}

export interface UpdateThreadRequest {
  title?: string
  model?: string
  provider?: Provider
  systemPrompt?: string
}

export interface CreateMessageRequest {
  content: string
  attachments?: Attachment[]
}
