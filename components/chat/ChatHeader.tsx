'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import useSWR from 'swr'
import { useTheme } from 'next-themes'
import { Sun, Moon, PanelLeft, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useChatStore } from '@/lib/store'

type ModelEntry = { provider: 'claude' | 'gemini'; label: string; model: string }
const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function ChatHeader() {
  const { theme, setTheme } = useTheme()
  const { activeThreadId, threads, updateThread, toggleSidebar } = useChatStore()
  const { data: availableModels = [] } = useSWR<ModelEntry[]>('/api/models', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000, // 1分間はキャッシュを使い回す
  })
  const [systemPromptOpen, setSystemPromptOpen] = useState(false)
  const [systemPromptDraft, setSystemPromptDraft] = useState('')

  const activeThread = threads.find((t) => t.id === activeThreadId)
  const currentModelKey = activeThread
    ? `${activeThread.provider}::${activeThread.model}`
    : 'claude::claude-sonnet-4-6'

  const handleModelChange = async (value: string | null) => {
    if (!value || !activeThreadId) return
    const [provider, model] = value.split('::') as ['claude' | 'gemini', string]
    try {
      const res = await fetch(`/api/threads/${activeThreadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model }),
      })
      if (!res.ok) throw new Error('更新に失敗しました')
      updateThread(activeThreadId, { provider, model })
    } catch (err) {
      toast.error('モデルの変更に失敗しました', { description: (err as Error).message })
    }
  }

  const openSystemPrompt = () => {
    setSystemPromptDraft(activeThread?.systemPrompt ?? '')
    setSystemPromptOpen(true)
  }

  const saveSystemPrompt = async () => {
    if (!activeThreadId) return
    try {
      const res = await fetch(`/api/threads/${activeThreadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt: systemPromptDraft }),
      })
      if (!res.ok) throw new Error('保存に失敗しました')
      updateThread(activeThreadId, { systemPrompt: systemPromptDraft })
      setSystemPromptOpen(false)
      toast.success('システムプロンプトを保存しました')
    } catch (err) {
      toast.error('保存に失敗しました', { description: (err as Error).message })
    }
  }

  return (
    <>
      <header className="flex items-center gap-2 px-4 py-2 border-b bg-background">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="h-8 w-8">
          <PanelLeft className="h-4 w-4" />
        </Button>

        <div className="flex-1 flex items-center gap-2">
          {/* モデル選択 */}
          <Select value={currentModelKey} onValueChange={handleModelChange} disabled={!activeThreadId}>
            <SelectTrigger className="w-52 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((m) => (
                <SelectItem key={`${m.provider}::${m.model}`} value={`${m.provider}::${m.model}`}>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      {m.provider === 'claude' ? 'Claude' : 'Gemini'}
                    </Badge>
                    {m.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* システムプロンプト */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={!activeThreadId}
            onClick={openSystemPrompt}
          >
            <Settings className="h-3.5 w-3.5" />
            システムプロンプト
            {activeThread?.systemPrompt && (
              <Badge variant="secondary" className="text-[10px] px-1 py-0">設定済み</Badge>
            )}
          </Button>
        </div>

        {/* ダークモード切り替え */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </header>

      {/* システムプロンプト ダイアログ */}
      <Dialog open={systemPromptOpen} onOpenChange={setSystemPromptOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>システムプロンプト</DialogTitle>
          </DialogHeader>
          <Textarea
            value={systemPromptDraft}
            onChange={(e) => setSystemPromptDraft(e.target.value)}
            placeholder="AIへの指示を入力してください（例: あなたはプロのエンジニアです。常に日本語で回答してください。）"
            rows={8}
            className="resize-none"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSystemPromptOpen(false)}>キャンセル</Button>
            <Button onClick={saveSystemPrompt}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
