'use client'

import { useState } from 'react'
import Image from 'next/image'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Check, Copy, User, Bot, FileText, File } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MessageResponse, Attachment } from '@/types/api'

function AttachmentPreview({ attachments }: { attachments: Attachment[] }) {
  if (!attachments || attachments.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 mb-1.5">
      {attachments.map((att, i) => (
        <a
          key={i}
          href={att.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded border bg-background/50 px-2 py-1 text-xs hover:bg-background transition-colors max-w-[160px]"
        >
          {att.type === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <Image src={att.url} alt={att.name} width={24} height={24} className="rounded object-cover flex-shrink-0" />
          ) : att.type === 'pdf' || att.type === 'text' ? (
            <FileText className="h-3.5 w-3.5 flex-shrink-0" />
          ) : (
            <File className="h-3.5 w-3.5 flex-shrink-0" />
          )}
          <span className="truncate">{att.name}</span>
        </a>
      ))}
    </div>
  )
}

interface Props {
  message: MessageResponse
  isStreaming?: boolean
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
      onClick={handleCopy}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  )
}

export function MessageBubble({ message, isStreaming }: Props) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-3 group', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* アバター */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm',
          isUser ? 'bg-primary' : 'bg-muted text-muted-foreground border',
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* バブル */}
      <div className={cn('flex flex-col gap-1 max-w-[80%]', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-3 text-sm',
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : 'bg-muted rounded-tl-sm',
          )}
        >
          {isUser ? (
            <>
              <AttachmentPreview attachments={message.attachments} />
              <p className="whitespace-pre-wrap">{message.content}</p>
            </>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '')
                    const codeString = String(children).replace(/\n$/, '')
                    const isBlock = match || codeString.includes('\n')

                    if (!isBlock) {
                      return (
                        <code className="bg-black/10 dark:bg-white/10 rounded px-1 py-0.5 text-xs font-mono" {...props}>
                          {children}
                        </code>
                      )
                    }

                    return (
                      <div className="relative group/code my-2">
                        <div className="absolute right-2 top-2 z-10 opacity-0 group-hover/code:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 bg-black/20 hover:bg-black/30 text-white"
                            onClick={() => navigator.clipboard.writeText(codeString)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <SyntaxHighlighter
                          style={oneDark}
                          language={match?.[1] ?? 'text'}
                          PreTag="div"
                          customStyle={{ borderRadius: '0.5rem', margin: 0, fontSize: '0.8rem' }}
                        >
                          {codeString}
                        </SyntaxHighlighter>
                      </div>
                    )
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-foreground/70 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
              )}
            </div>
          )}
        </div>

        {/* コピーボタン（アシスタントのみ） */}
        {!isUser && !isStreaming && (
          <CopyButton text={message.content} />
        )}
      </div>
    </div>
  )
}
