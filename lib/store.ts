'use client'

import { create } from 'zustand'
import type { ThreadResponse, MessageResponse } from '@/types/api'

interface ChatStore {
  // スレッド
  threads: ThreadResponse[]
  activeThreadId: string | null
  setThreads: (threads: ThreadResponse[]) => void
  addThread: (thread: ThreadResponse) => void
  updateThread: (id: string, updates: Partial<ThreadResponse>) => void
  removeThread: (id: string) => void
  setActiveThreadId: (id: string | null) => void

  // メッセージ
  messages: MessageResponse[]
  setMessages: (messages: MessageResponse[]) => void
  addMessage: (msg: MessageResponse) => void
  updateLastAssistantMessage: (content: string) => void

  // UI状態
  isStreaming: boolean
  setIsStreaming: (v: boolean) => void
  isSidebarOpen: boolean
  toggleSidebar: () => void
}

export const useChatStore = create<ChatStore>((set) => ({
  threads: [],
  activeThreadId: null,
  setThreads: (threads) => set({ threads }),
  addThread: (thread) => set((s) => ({ threads: [thread, ...s.threads] })),
  updateThread: (id, updates) =>
    set((s) => ({
      threads: s.threads.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  removeThread: (id) =>
    set((s) => ({
      threads: s.threads.filter((t) => t.id !== id),
      activeThreadId: s.activeThreadId === id ? null : s.activeThreadId,
    })),
  setActiveThreadId: (id) => set({ activeThreadId: id, messages: [] }),

  messages: [],
  setMessages: (messages) => set({ messages }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  updateLastAssistantMessage: (content) =>
    set((s) => {
      const msgs = [...s.messages]
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, content }
      } else {
        msgs.push({
          id: 'streaming',
          threadId: s.activeThreadId ?? '',
          role: 'assistant',
          content,
          attachments: [],
          createdAt: new Date().toISOString(),
        })
      }
      return { messages: msgs }
    }),

  isStreaming: false,
  setIsStreaming: (v) => set({ isStreaming: v }),
  isSidebarOpen: true,
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
}))

// モデル設定（ローカルストレージ永続化）
export const DEFAULT_MODEL = {
  provider: 'claude' as const,
  model: 'claude-sonnet-4-6',
}

export const AVAILABLE_MODELS = [
  { provider: 'claude' as const, label: 'Claude Sonnet 4.6', model: 'claude-sonnet-4-6' },
  { provider: 'claude' as const, label: 'Claude Opus 4.6', model: 'claude-opus-4-6' },
  { provider: 'claude' as const, label: 'Claude Haiku 4.5', model: 'claude-haiku-4-5-20251001' },
  { provider: 'gemini' as const, label: 'Gemini 2.5 Pro', model: 'gemini-2.5-pro-preview-06-05' },
  { provider: 'gemini' as const, label: 'Gemini 2.0 Flash', model: 'gemini-2.0-flash' },
  { provider: 'gemini' as const, label: 'Gemini 2.0 Flash Lite', model: 'gemini-2.0-flash-lite' },
]
