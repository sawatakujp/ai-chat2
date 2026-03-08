'use client'

import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { MessageBubble } from './MessageBubble'
import { Bot } from 'lucide-react'
import { useChatStore } from '@/lib/store'

const VIRTUALIZER_THRESHOLD = 30 // この件数以上で仮想スクロールを有効化

export function ChatMessages() {
  const { messages, isStreaming, activeThreadId } = useChatStore()
  const parentRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // 仮想スクロール（メッセージ数が多い場合のみ有効化）
  const useVirtual = messages.length >= VIRTUALIZER_THRESHOLD
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => (useVirtual ? parentRef.current : null),
    estimateSize: () => 120,
    overscan: 5,
    enabled: useVirtual,
  })

  // 新メッセージ時に最下部へスクロール
  useEffect(() => {
    if (!useVirtual) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else if (messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { behavior: 'smooth' })
    }
  }, [messages.length, isStreaming, useVirtual, virtualizer])

  if (!activeThreadId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground p-8" role="main" aria-label="チャットエリア">
        <Bot className="h-12 w-12 opacity-30" aria-hidden="true" />
        <p className="text-lg font-medium">AI チャットボット</p>
        <p className="text-sm text-center max-w-sm">
          左のサイドバーから「新しいチャット」を作成するか、既存のスレッドを選択してください。
        </p>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground" role="main" aria-label="チャットエリア" aria-live="polite">
        <p className="text-sm">メッセージを入力してチャットを開始しましょう</p>
      </div>
    )
  }

  // 通常スクロール（件数少ない）
  if (!useVirtual) {
    return (
      <div
        ref={parentRef}
        className="flex-1 overflow-y-auto px-4 py-6"
        role="main"
        aria-label="メッセージ一覧"
        aria-live="polite"
      >
        <div className="max-w-3xl mx-auto flex flex-col gap-6">
          {messages.map((msg, i) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isStreaming={isStreaming && i === messages.length - 1 && msg.role === 'assistant'}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    )
  }

  // 仮想スクロール（件数多い）
  const virtualItems = virtualizer.getVirtualItems()
  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto"
      role="main"
      aria-label="メッセージ一覧"
      aria-live="polite"
      style={{ contain: 'strict' }}
    >
      <div
        style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
          }}
        >
          {virtualItems.map((virtualRow) => {
            const msg = messages[virtualRow.index]
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="px-4 py-3 max-w-3xl mx-auto"
              >
                <MessageBubble
                  message={msg}
                  isStreaming={
                    isStreaming &&
                    virtualRow.index === messages.length - 1 &&
                    msg.role === 'assistant'
                  }
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
