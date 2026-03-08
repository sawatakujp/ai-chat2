# AIチャットボット 仕様書

## プロジェクト概要

複数のAIモデル（Claude / Gemini）に対応したチャットボットWebアプリケーション。
ChatGPTライクなUIで、会話スレッドの管理・ファイル添付・ストリーミング応答などを実現する。

---

## 技術スタック

| カテゴリ | 技術 |
|---|---|
| フレームワーク | Next.js (App Router) |
| バックエンド | Hono (Next.js API Routes内) |
| ORM | Prisma v6.19（v7はMongoDB未対応のため v6.19 固定） |
| データベース | MongoDB |
| UI | Tailwind CSS + shadcn/ui |
| AI SDK | Anthropic SDK (Claude) / Google Generative AI SDK (Gemini) |
| デプロイ | Google Cloud |

---

## AI モデル対応

### 対応モデル
- **Claude** (Anthropic): claude-opus-4-6 / claude-sonnet-4-6 / claude-haiku-4-5 など
- **Gemini** (Google): gemini-1.5-pro / gemini-1.5-flash など

### モデル切り替え
- UIのセレクターからモデルをリアルタイムに切り替え可能
- プロバイダー（Claude / Gemini）とモデル名を個別に選択
- 選択中のモデルはローカルストレージまたはスレッドごとに保存

---

## 機能一覧

### チャット機能
- **ストリーミング応答**: AI の回答をリアルタイムに1文字ずつ表示（Server-Sent Events）
- **Markdown レンダリング**: AI の回答を Markdown 形式で整形表示
- **コードハイライト**: コードブロックのシンタックスハイライト（`react-syntax-highlighter` 等）
- **メッセージコピー**: AI の回答をクリップボードにコピーするボタン
- **システムプロンプト設定**: UIからAIのキャラクターや役割をカスタマイズ

### 会話スレッド管理
- **新規作成**: 「新しいチャット」ボタンでスレッドを作成
- **タイトル自動生成**: 最初のメッセージを元にAIがタイトルを自動生成
- **タイトル編集**: スレッド名をユーザーが手動で編集可能
- **削除**: 不要なスレッドを削除
- **検索**: キーワードでスレッドを検索

### ファイル添付
- **画像**: PNG / JPG / WEBP / GIF（AIのビジョン機能で解析）
- **PDF**: ドキュメント内容をAIに分析させる
- **テキストファイル**: CSV / TXT / コードファイル等
- **動画・音声**: アップロード対応（モデルが対応している場合に解析）
- ファイルはサーバー側またはクラウドストレージ（GCS等）に保存

### UI/UX
- **ダークモード**: ライト / ダーク切り替え対応（`next-themes` 等）
- **ChatGPT ライクレイアウト**:
  - 左サイドバー: スレッド一覧、検索、新規作成
  - メイン: チャット画面（メッセージ履歴 + 入力エリア）
  - ヘッダー: モデル選択、システムプロンプト設定
- **レスポンシブ対応**: スマートフォン・タブレット対応

---

## データモデル（MongoDB）

### Thread（スレッド）
```ts
{
  _id: ObjectId
  title: string              // AIが自動生成 or ユーザーが編集
  model: string              // 使用中のAIモデルID
  provider: "claude" | "gemini"
  systemPrompt: string       // カスタムシステムプロンプト
  createdAt: Date
  updatedAt: Date
}
```

### Message（メッセージ）
```ts
{
  _id: ObjectId
  threadId: ObjectId         // 所属スレッド
  role: "user" | "assistant"
  content: string            // テキスト内容
  attachments: Attachment[]  // 添付ファイル情報
  createdAt: Date
}
```

### Attachment（添付ファイル）
```ts
{
  type: "image" | "pdf" | "text" | "video" | "audio"
  url: string                // ストレージのURL
  name: string               // ファイル名
  mimeType: string
  size: number               // バイト数
}
```

---

## API 設計（Hono on Next.js App Router）

| メソッド | エンドポイント | 説明 |
|---|---|---|
| GET | `/api/threads` | スレッド一覧取得（検索クエリ対応）|
| POST | `/api/threads` | スレッド新規作成 |
| PATCH | `/api/threads/:id` | スレッドタイトル・設定更新 |
| DELETE | `/api/threads/:id` | スレッド削除 |
| GET | `/api/threads/:id/messages` | メッセージ一覧取得 |
| POST | `/api/threads/:id/messages` | メッセージ送信（ストリーミング応答）|
| POST | `/api/upload` | ファイルアップロード |

---

## ディレクトリ構成（想定）

```
ai-chat2/
├── app/
│   ├── api/
│   │   └── [[...route]]/
│   │       └── route.ts       # Hono ルーター
│   ├── layout.tsx
│   └── page.tsx               # チャット画面
├── components/
│   ├── chat/
│   │   ├── ChatSidebar.tsx    # スレッド一覧サイドバー
│   │   ├── ChatMessages.tsx   # メッセージ表示エリア
│   │   ├── ChatInput.tsx      # メッセージ入力
│   │   └── MessageBubble.tsx  # 1件のメッセージ
│   ├── ui/                    # shadcn/ui コンポーネント
│   └── providers/
│       └── ThemeProvider.tsx  # ダークモード
├── lib/
│   ├── ai/
│   │   ├── claude.ts          # Claude API クライアント
│   │   └── gemini.ts          # Gemini API クライアント
│   ├── db/
│   │   └── prisma.ts          # Prisma クライアント
│   └── utils.ts
├── prisma/
│   └── schema.prisma          # MongoDB スキーマ定義
├── public/
├── .env.local                 # 環境変数（APIキー等）
├── CLAUDE.md                  # 本仕様書
└── package.json
```

---

## 環境変数

```env
# AI API Keys
ANTHROPIC_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=

# Database
DATABASE_URL=mongodb+srv://...

# File Storage (Google Cloud Storage)
GCS_BUCKET_NAME=
GOOGLE_CLOUD_PROJECT_ID=
```

---

## 開発ルール

- TypeScript を使用し `any` 型は原則禁止
- コンポーネントは Server Components / Client Components を適切に分離
- ストリーミングは `ReadableStream` / SSE を使用
- APIキーはサーバーサイドのみで使用し、クライアントに露出させない
- エラーハンドリングは必ずAPI層で行い、ユーザーに適切なメッセージを返す
- ファイルアップロードはサーバー経由で行い、クライアントから直接ストレージに書き込まない

---

## 今後の拡張候補（スコープ外）

- ユーザー認証（マルチユーザー対応）
- レート制限
- 多言語対応（i18n）
- 音声入力
- トークン数・コスト表示
