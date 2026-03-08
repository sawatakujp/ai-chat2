'use client'

import { useRef, useState, useCallback, type KeyboardEvent, type DragEvent } from 'react'
import { Send, Square, Paperclip, X, FileText, FileImage, File, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useChatStore } from '@/lib/store'
import type { Attachment, MessageResponse } from '@/types/api'

function AttachmentIcon({ type }: { type: Attachment['type'] }) {
  if (type === 'image') return <FileImage className="h-3.5 w-3.5" />
  if (type === 'pdf' || type === 'text') return <FileText className="h-3.5 w-3.5" />
  return <File className="h-3.5 w-3.5" />
}

interface PendingFile {
  file: File
  preview?: string
  uploading: boolean
  attachment?: Attachment
  error?: string
}

export function ChatInput() {
  const [input, setInput] = useState('')
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [lastFailedPayload, setLastFailedPayload] = useState<{
    content: string
    attachments: Attachment[]
  } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const {
    activeThreadId,
    isStreaming,
    setIsStreaming,
    addMessage,
    updateLastAssistantMessage,
    updateThread,
  } = useChatStore()

  const uploadFile = useCallback(async (file: File, index: number) => {
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'アップロード失敗')

      setPendingFiles((prev) =>
        prev.map((f, i) => (i === index ? { ...f, uploading: false, attachment: data as Attachment } : f)),
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'アップロード失敗'
      toast.error('ファイルアップロードエラー', { description: msg })
      setPendingFiles((prev) =>
        prev.map((f, i) => (i === index ? { ...f, uploading: false, error: msg } : f)),
      )
    }
  }, [])

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files)
      setPendingFiles((prev) => {
        const startIndex = prev.length
        const newPending: PendingFile[] = arr.map((file) => ({
          file,
          preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
          uploading: true,
        }))
        arr.forEach((file, i) => uploadFile(file, startIndex + i))
        return [...prev, ...newPending]
      })
    },
    [uploadFile],
  )

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => {
      const pf = prev[index]
      if (pf.preview) URL.revokeObjectURL(pf.preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  const handleDragOver = (e: DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = () => setIsDragging(false)
  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files)
  }

  const handleStop = () => {
    abortRef.current?.abort()
    setIsStreaming(false)
  }

  const doSend = useCallback(async (content: string, attachments: Attachment[]) => {
    if (!activeThreadId) return
    setLastFailedPayload(null)

    const userMsg: MessageResponse = {
      id: `tmp-${Date.now()}`,
      threadId: activeThreadId,
      role: 'user',
      content,
      attachments,
      createdAt: new Date().toISOString(),
    }
    addMessage(userMsg)
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    // ネットワークリトライ（最大2回）
    let attempt = 0
    const maxRetries = 2

    while (attempt <= maxRetries) {
      try {
        const res = await fetch(`/api/threads/${activeThreadId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, attachments }),
          signal: controller.signal,
        })

        if (!res.ok || !res.body) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error ?? `HTTP ${res.status}`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let assistantText = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const lines = decoder.decode(value).split('\n')
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const payload = line.slice(6)
            if (payload === '[DONE]') break
            try {
              const parsed = JSON.parse(payload)
              if (parsed.text) { assistantText += parsed.text; updateLastAssistantMessage(assistantText) }
              if (parsed.titleUpdate) updateThread(activeThreadId, { title: parsed.titleUpdate })
              if (parsed.error) throw new Error(parsed.error)
            } catch {
              // JSON parse エラーは無視
            }
          }
        }
        // 成功
        setIsStreaming(false)
        abortRef.current = null
        return

      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setIsStreaming(false)
          abortRef.current = null
          return
        }

        attempt++
        if (attempt > maxRetries) {
          const msg = err instanceof Error ? err.message : '送信に失敗しました'
          toast.error('送信エラー', {
            description: msg,
            action: {
              label: 'リトライ',
              onClick: () => doSend(content, attachments),
            },
          })
          setLastFailedPayload({ content, attachments })
          setIsStreaming(false)
          abortRef.current = null
          return
        }

        // 500ms 待ってリトライ
        await new Promise((r) => setTimeout(r, 500 * attempt))
      }
    }
  }, [activeThreadId, addMessage, setIsStreaming, updateLastAssistantMessage, updateThread])

  const handleSend = async () => {
    const hasUploading = pendingFiles.some((f) => f.uploading)
    if ((!input.trim() && pendingFiles.length === 0) || !activeThreadId || isStreaming || hasUploading) return

    const content = input.trim()
    const attachments: Attachment[] = pendingFiles.filter((f) => f.attachment).map((f) => f.attachment!)

    setInput('')
    // ObjectURL を解放してからクリア（メモリリーク防止）
    pendingFiles.forEach((pf) => { if (pf.preview) URL.revokeObjectURL(pf.preview) })
    setPendingFiles([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    await doSend(content, attachments)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const hasUploading = pendingFiles.some((f) => f.uploading)
  const canSend = (input.trim() || pendingFiles.length > 0) && activeThreadId && !isStreaming && !hasUploading

  return (
    <div
      role="region"
      aria-label="メッセージ入力エリア"
      className={`border-t bg-background px-4 py-4 transition-colors ${isDragging ? 'bg-primary/5 border-primary' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="max-w-3xl mx-auto flex flex-col gap-2">
        {/* 添付ファイルプレビュー */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2" role="list" aria-label="添付ファイル">
            {pendingFiles.map((pf, i) => (
              <div
                key={i}
                role="listitem"
                className="relative flex items-center gap-1.5 rounded-lg border bg-muted px-2 py-1.5 text-xs max-w-[180px]"
              >
                {pf.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pf.preview} alt={pf.file.name} className="h-8 w-8 rounded object-cover flex-shrink-0" />
                ) : (
                  <AttachmentIcon type={pf.attachment?.type ?? 'text'} />
                )}
                <div className="flex flex-col min-w-0">
                  <span className="truncate font-medium">{pf.file.name}</span>
                  {pf.uploading && <span className="text-muted-foreground">アップロード中...</span>}
                  {pf.error && <span className="text-destructive truncate">{pf.error}</span>}
                  {pf.attachment && !pf.uploading && <span className="text-muted-foreground">完了</span>}
                </div>
                <button
                  onClick={() => removePendingFile(i)}
                  aria-label={`${pf.file.name} を削除`}
                  className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-foreground text-background flex items-center justify-center hover:bg-foreground/80"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* リトライバナー */}
        {lastFailedPayload && !isStreaming && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <span className="flex-1">送信に失敗しました</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 text-xs text-destructive hover:text-destructive"
              onClick={() => doSend(lastFailedPayload.content, lastFailedPayload.attachments)}
            >
              <RefreshCw className="h-3 w-3" /> リトライ
            </Button>
          </div>
        )}

        {/* 入力エリア */}
        <div className="flex gap-2 items-end">
          <Button
            variant="ghost"
            size="icon"
            type="button"
            disabled={!activeThreadId || isStreaming}
            className="flex-shrink-0 h-11 w-11"
            onClick={() => fileInputRef.current?.click()}
            aria-label="ファイルを添付"
            title="ファイルを添付 (画像・PDF・テキスト・動画・音声)"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept="image/*,application/pdf,text/*,video/*,audio/*"
            aria-label="ファイル選択"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />

          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isDragging
                ? 'ファイルをドロップしてください'
                : activeThreadId
                ? 'メッセージを入力… (Enter で送信 / Shift+Enter で改行)'
                : 'スレッドを選択してください'
            }
            disabled={!activeThreadId || isStreaming}
            rows={1}
            aria-label="メッセージ入力"
            aria-multiline="true"
            className="resize-none min-h-[44px] max-h-[200px] overflow-y-auto"
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 200)}px`
            }}
          />

          {isStreaming ? (
            <Button
              variant="destructive"
              size="icon"
              className="flex-shrink-0 h-11 w-11"
              onClick={handleStop}
              aria-label="生成を停止"
              title="生成を停止"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="flex-shrink-0 h-11 w-11"
              onClick={handleSend}
              disabled={!canSend}
              aria-label="送信"
              title={hasUploading ? 'アップロード中...' : '送信 (Enter)'}
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>

        {isDragging && (
          <p className="text-xs text-center text-primary animate-pulse" aria-live="polite">
            ここにファイルをドロップ
          </p>
        )}
      </div>
    </div>
  )
}
