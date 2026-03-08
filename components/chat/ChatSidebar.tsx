'use client'

import { useState, useCallback, useRef, useEffect, type KeyboardEvent } from 'react'
import useSWR from 'swr'
import { Plus, Search, Trash2, Pencil, Check, X, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useChatStore, DEFAULT_MODEL } from '@/lib/store'
import type { ThreadResponse } from '@/types/api'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface ThreadItemProps {
  thread: ThreadResponse
  isActive: boolean
  onSelect: () => void
  onRename: (title: string) => void
  onDelete: () => void
}

function ThreadItem({ thread, isActive, onSelect, onRename, onDelete }: ThreadItemProps) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(thread.title)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const commitRename = () => {
    if (editValue.trim()) onRename(editValue.trim())
    setEditing(false)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (editing) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() }
  }

  return (
    <>
      <div
        role="option"
        aria-selected={isActive}
        tabIndex={0}
        className={cn(
          'group flex items-center gap-1 rounded-lg px-2 py-2 cursor-pointer hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isActive && 'bg-accent',
        )}
        onClick={() => !editing && onSelect()}
        onKeyDown={handleKeyDown}
      >
        <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />

        {editing ? (
          <div className="flex flex-1 items-center gap-1 min-w-0" onClick={(e) => e.stopPropagation()}>
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setEditing(false)
              }}
              className="h-6 text-xs px-1 flex-1"
              autoFocus
            />
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={commitRename}>
              <Check className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditing(false)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <>
            <span className="flex-1 text-sm truncate min-w-0">{thread.title}</span>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="h-6 w-6 opacity-0 group-hover:opacity-100 flex-shrink-0 flex items-center justify-center rounded hover:bg-accent-foreground/10 focus-visible:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-xs">⋮</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditing(true) }}>
                  <Pencil className="h-3.5 w-3.5 mr-2" /> 名前を変更
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(e) => { e.stopPropagation(); setConfirmOpen(true) }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> 削除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {/* 削除確認ダイアログ */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>スレッドを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{thread.title}」とすべてのメッセージが削除されます。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onDelete}
            >
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function SidebarContent() {
  const [inputQuery, setInputQuery] = useState('')
  const [query, setQuery] = useState('')

  // 検索デバウンス（300ms）
  useEffect(() => {
    const timer = setTimeout(() => setQuery(inputQuery), 300)
    return () => clearTimeout(timer)
  }, [inputQuery])

  const { data: threads = [], mutate } = useSWR<ThreadResponse[]>(
    `/api/threads${query ? `?q=${encodeURIComponent(query)}` : ''}`,
    fetcher,
    { revalidateOnFocus: false },
  )

  const {
    activeThreadId,
    setActiveThreadId,
    setMessages,
    setThreads,
    updateThread,
    removeThread,
    addThread,
    toggleSidebar,
  } = useChatStore()

  const listRef = useRef<HTMLDivElement>(null)

  const handleData = useCallback(() => {
    setThreads(threads)
  }, [threads, setThreads])
  if (threads.length !== useChatStore.getState().threads.length) handleData()

  const handleNewChat = async () => {
    try {
      const res = await fetch('/api/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...DEFAULT_MODEL, title: '新しいチャット' }),
      })
      if (!res.ok) throw new Error('作成に失敗しました')
      const thread: ThreadResponse = await res.json()
      addThread(thread)
      setActiveThreadId(thread.id)
      setMessages([])
      mutate()
    } catch (err) {
      toast.error('スレッド作成エラー', { description: (err as Error).message })
    }
  }

  const handleSelect = async (thread: ThreadResponse) => {
    setActiveThreadId(thread.id)
    if (window.innerWidth < 768) toggleSidebar()
    try {
      const res = await fetch(`/api/threads/${thread.id}/messages`)
      if (!res.ok) throw new Error('読み込みに失敗しました')
      const msgs = await res.json()
      setMessages(msgs)
    } catch (err) {
      toast.error('メッセージ読み込みエラー', { description: (err as Error).message })
    }
  }

  const handleRename = async (id: string, title: string) => {
    try {
      const res = await fetch(`/api/threads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (!res.ok) throw new Error('更新に失敗しました')
      updateThread(id, { title })
      mutate()
    } catch (err) {
      toast.error('名前の変更に失敗しました', { description: (err as Error).message })
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/threads/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('削除に失敗しました')
      removeThread(id)
      if (activeThreadId === id) setMessages([])
      mutate()
      toast.success('スレッドを削除しました')
    } catch (err) {
      toast.error('削除エラー', { description: (err as Error).message })
    }
  }

  const handleListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!listRef.current) return
    const items = Array.from(listRef.current.querySelectorAll<HTMLElement>('[role="option"]'))
    const focused = document.activeElement as HTMLElement
    const index = items.indexOf(focused)
    if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(index + 1, items.length - 1)]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(index - 1, 0)]?.focus() }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 flex flex-col gap-2">
        <Button className="w-full justify-start gap-2" onClick={handleNewChat} aria-label="新しいチャットを作成">
          <Plus className="h-4 w-4" /> 新しいチャット
        </Button>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="スレッドを検索..."
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>

      <div
        ref={listRef}
        role="listbox"
        aria-label="チャット履歴"
        className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-0.5"
        onKeyDown={handleListKeyDown}
      >
        {threads.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            {query ? '該当するスレッドがありません' : 'チャット履歴がありません'}
          </p>
        ) : (
          threads.map((t) => (
            <ThreadItem
              key={t.id}
              thread={t}
              isActive={t.id === activeThreadId}
              onSelect={() => handleSelect(t)}
              onRename={(title) => handleRename(t.id, title)}
              onDelete={() => handleDelete(t.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

export function ChatSidebar() {
  const { isSidebarOpen, toggleSidebar } = useChatStore()
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return (
    <>
      <aside
        className={cn(
          'hidden md:flex w-64 flex-shrink-0 flex-col border-r bg-background h-full transition-all',
          !isSidebarOpen && 'md:hidden',
        )}
        aria-label="チャット履歴サイドバー"
        role="complementary"
      >
        <SidebarContent />
      </aside>

      <Sheet open={isMobile && isSidebarOpen} onOpenChange={(open) => { if (!open) toggleSidebar() }}>
        <SheetContent side="left" className="w-72 p-0 flex flex-col" aria-label="チャット履歴サイドバー">
          <SidebarContent />
        </SheetContent>
      </Sheet>
    </>
  )
}
