import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { ChatHeader } from '@/components/chat/ChatHeader'
import { ChatMessages } from '@/components/chat/ChatMessages'
import { ChatInput } from '@/components/chat/ChatInput'

export default function Home() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* サイドバー */}
      <ChatSidebar />

      {/* メインエリア */}
      <div className="flex flex-1 flex-col min-w-0">
        <ChatHeader />
        <ChatMessages />
        <ChatInput />
      </div>
    </div>
  )
}
