# 実装計画 TODO

## フェーズ概要

```
Phase 1: プロジェクト初期セットアップ       （基盤構築）
Phase 2: データベース・API層                （バックエンド）
Phase 3: AI統合・ストリーミング             （コア機能）
Phase 4: フロントエンドUI                  （画面実装）
Phase 5: ファイル添付                      （拡張機能）
Phase 6: UX改善・仕上げ                   （品質向上）
Phase 7: デプロイ                         （本番リリース）
```

---

## Phase 1: プロジェクト初期セットアップ

### 1-1. Next.js プロジェクト作成
- [x] `npx create-next-app@latest ai-chat2 --typescript --tailwind --app` で初期化
- [x] `src/` ディレクトリ構成を仕様書通りに整備
- [x] 不要なデフォルトファイルを削除（`page.tsx` の中身をクリア等）

### 1-2. 依存パッケージのインストール
- [x] **バックエンド系**
  - `hono` `@hono/node-server`（API ルーター）
  - `@prisma/client` `prisma`（ORM）
- [x] **AI SDK**
  - `@anthropic-ai/sdk`（Claude）
  - `@google/generative-ai`（Gemini）
- [x] **UI系**
  - `shadcn/ui` の初期化（`npx shadcn@latest init`）
  - `next-themes`（ダークモード）
  - `react-markdown` `remark-gfm`（Markdownレンダリング）
  - `react-syntax-highlighter` `@types/react-syntax-highlighter`（コードハイライト）
  - `lucide-react`（アイコン）
- [x] **ファイル処理系**
  - `@google-cloud/storage`（GCS アップロード）
  - `multer` or `formidable`（マルチパート解析）

### 1-3. 環境変数の設定
- [x] `.env.local` を作成し以下を設定
  ```env
  ANTHROPIC_API_KEY=
  GOOGLE_GENERATIVE_AI_API_KEY=
  DATABASE_URL=mongodb+srv://...
  GCS_BUCKET_NAME=
  GOOGLE_CLOUD_PROJECT_ID=
  ```
- [x] `.env.example` を作成してリポジトリに含める
- [x] `.gitignore` に `.env.local` が含まれていることを確認

### 1-4. Hono の Next.js App Router 統合
- [x] `app/api/[[...route]]/route.ts` を作成
- [x] Hono アプリを作成し `GET /api/health` の疎通確認

---

## Phase 2: データベース・API層

### 2-1. Prisma + MongoDB セットアップ
- [x] `npx prisma init` でスキーマファイル生成
- [x] `prisma/schema.prisma` に MongoDB プロバイダーを設定（Prisma v7はMongoDB未対応のため v6.19 に固定）
- [x] `Thread` モデルを定義
  ```prisma
  model Thread {
    id           String    @id @default(auto()) @map("_id") @db.ObjectId
    title        String
    model        String
    provider     String    // "claude" | "gemini"
    systemPrompt String    @default("")
    messages     Message[]
    createdAt    DateTime  @default(now())
    updatedAt    DateTime  @updatedAt
  }
  ```
- [x] `Message` モデルを定義
  ```prisma
  model Message {
    id          String       @id @default(auto()) @map("_id") @db.ObjectId
    threadId    String       @db.ObjectId
    thread      Thread       @relation(fields: [threadId], references: [id], onDelete: Cascade)
    role        String       // "user" | "assistant"
    content     String
    attachments Json[]       @default([])
    createdAt   DateTime     @default(now())
  }
  ```
- [x] `lib/db/prisma.ts` に Prisma クライアントのシングルトンを実装
- [ ] MongoDB Atlas に接続確認（`.env.local` に実際の接続文字列を設定後に確認）

### 2-2. Hono API ルートの実装

#### スレッド API
- [x] `GET /api/threads` — 一覧取得（`?q=` で検索対応）
- [x] `POST /api/threads` — 新規作成
- [x] `PATCH /api/threads/:id` — タイトル・設定更新
- [x] `DELETE /api/threads/:id` — 削除（メッセージも Cascade 削除）

#### メッセージ API
- [x] `GET /api/threads/:id/messages` — メッセージ一覧取得
- [x] `POST /api/threads/:id/messages` — メッセージ送信（ストリーミングは Phase 3 で実装）

#### 型定義
- [x] `types/api.ts` にリクエスト/レスポンスの型を定義
- [x] Hono の `zod-validator` でリクエストバリデーションを実装

---

## Phase 3: AI統合・ストリーミング

### 3-1. AI クライアントの実装

#### Claude クライアント (`lib/ai/claude.ts`)
- [x] Vercel AI SDK (`@ai-sdk/anthropic`) を使ってストリーミング送信を実装
- [x] `streamText()` でテキストストリームを返す関数を作成
- [x] マルチモーダル（画像・PDF）対応のコンテンツブロック構築ロジック

#### Gemini クライアント (`lib/ai/gemini.ts`)
- [x] Vercel AI SDK (`@ai-sdk/google`) を使ってストリーミング送信を実装
- [x] `streamText()` でテキストストリームを返す関数を作成
- [x] マルチモーダル対応のコンテンツパーツ構築ロジック

#### 共通インターフェース (`lib/ai/index.ts`)
- [x] プロバイダーに関わらず同一インターフェースで呼び出せるアダプター関数を実装
  ```ts
  function streamChat(provider, model, messages, systemPrompt): ReadableStream
  ```

### 3-2. ストリーミング API エンドポイント
- [x] `POST /api/threads/:id/messages` でストリーミングレスポンスを返す
  - ユーザーメッセージを DB に保存
  - AI にリクエストを投げてストリームを開始
  - `text/event-stream` で SSE レスポンスを返す
  - ストリーム完了後、アシスタントのメッセージを DB に保存
- [x] エラー時（API キー不正・タイムアウト等）のハンドリング

### 3-3. スレッドタイトル自動生成
- [x] 最初のメッセージ送信後に AI でタイトルを生成するロジックを実装
  - プロンプト例: 「以下の会話の内容を20文字以内で要約してタイトルをつけてください」
  - ストリーミングなしの単発リクエスト
- [x] 生成後に `PATCH /api/threads/:id` でタイトルを更新（SSE の `titleUpdate` イベントで通知）

---

## Phase 4: フロントエンドUI

### 4-1. 全体レイアウト

- [x] `app/layout.tsx` に `ThemeProvider`（ダークモード）を設定
- [x] ルートページ `app/page.tsx` に ChatGPT ライクな2カラムレイアウトを実装
  ```
  +------------------+--------------------------------+
  |   Sidebar        |       Chat Area                |
  |  [新しいチャット]  |  [ヘッダー: モデル選択]         |
  |  [検索ボックス]   |  [メッセージ一覧]               |
  |  スレッド一覧     |  [入力エリア]                   |
  +------------------+--------------------------------+
  ```

### 4-2. サイドバー (`components/chat/ChatSidebar.tsx`)
- [x] 「新しいチャット」ボタン → `POST /api/threads` を呼び出し新スレッドを作成
- [x] スレッド検索ボックス（入力のたびに `GET /api/threads?q=` を呼ぶ）
- [x] スレッド一覧の表示（タイトル・更新日時）
- [x] スレッドのアクティブ状態をハイライト表示
- [x] 各スレッドの「...」メニューで編集・削除
- [x] タイトルインライン編集（鉛筆アイコン）
- [x] スマートフォン向けのサイドバー開閉トグル（ヘッダーの PanelLeft ボタン）

### 4-3. チャットヘッダー
- [x] モデル選択セレクター（プロバイダー: Claude / Gemini、モデル名）
- [x] システムプロンプト設定ボタン → ダイアログで編集
- [x] ダークモード切り替えボタン

### 4-4. メッセージ表示 (`components/chat/ChatMessages.tsx`)
- [x] メッセージ一覧のスクロールエリア実装
- [x] 新メッセージ時に自動スクロール（`useEffect` + `scrollIntoView`）
- [x] ユーザーメッセージ（右寄せ）とアシスタントメッセージ（左寄せ）のスタイル分け

### 4-5. メッセージバブル (`components/chat/MessageBubble.tsx`)
- [x] `react-markdown` + `remark-gfm` で Markdown をレンダリング
- [x] `react-syntax-highlighter` でコードブロックをハイライト
- [x] コードブロックにコピーボタンを実装
- [x] アシスタントメッセージ全体のコピーボタン
- [x] 添付ファイルのプレビュー表示（画像はサムネイル表示）
- [x] ストリーミング中のカーソルアニメーション表示

### 4-6. メッセージ入力 (`components/chat/ChatInput.tsx`)
- [x] テキストエリア（`Shift+Enter` で改行、`Enter` で送信）
- [x] 送信中のローディング状態（ボタンを無効化）
- [x] ストリーミング途中の停止ボタン（`AbortController` で中断）
- [x] ファイル添付ボタン（Phase 5 で実装）
- [x] 文字数・状態のフィードバック表示

### 4-7. 状態管理
- [x] `zustand` でスレッド一覧・アクティブスレッド・メッセージを管理
- [x] ストリーミング受信中の状態管理（`isStreaming` フラグ）
- [x] `SWR` によるデータフェッチ・キャッシュ管理

---

## Phase 5: ファイル添付

### 5-1. Google Cloud Storage のセットアップ
- [ ] GCS バケットを作成（手動 or Terraform で実施）
- [ ] サービスアカウントを作成し、キーを取得（`GOOGLE_APPLICATION_CREDENTIALS` に設定）
- [ ] バケットの CORS ポリシーを設定（手動で実施）
- [x] `lib/storage/gcs.ts` にアップロード関数を実装

### 5-2. アップロード API
- [x] `POST /api/upload` エンドポイントを実装
  - マルチパートフォームデータを受け取る
  - ファイルタイプ・サイズのバリデーション（最大 20MB）
  - GCS にアップロードし、公開 URL を返す
- [x] 対応ファイル種別ごとの処理
  - **画像**: そのまま GCS にアップロード
  - **PDF**: そのまま GCS にアップロード（AI には `pdf-parse` でテキスト抽出して渡す）
  - **テキスト**: GCS にアップロード、AI 送信時に URL からテキストを取得
  - **動画・音声**: GCS にアップロード

### 5-3. AI へのファイル渡し
- [x] 画像: Vercel AI SDK の `image` パーツ（URL）でマルチモーダル対応（Claude・Gemini 共通）
- [x] PDF: `pdf-parse` (`PDFParse` クラス) でテキスト抽出してプロンプトに埋め込み
- [x] テキスト: URL からダウンロードしてテキストとして渡す
- [x] `streamChatWithAttachments()` で非同期に添付解決→ストリーミング

### 5-4. UIへのファイル添付統合
- [x] `ChatInput` にファイル選択ボタン（クリック）を追加
- [x] ドラッグ&ドロップでファイルを添付できるようにする
- [x] 添付ファイルのプレビューを入力エリアに表示（画像サムネイル・ファイル名）
- [x] アップロード中のステータス表示（「アップロード中...」「完了」「エラー」）
- [x] `MessageBubble` に添付ファイルプレビューを追加

---

## Phase 6: UX改善・仕上げ

### 6-1. エラーハンドリング・フィードバック
- [x] API エラー時のトースト通知（shadcn/ui `Toast` を使用）
- [x] ネットワーク切断時の再接続リトライ
- [x] ストリーミング失敗時のリトライボタン

### 6-2. パフォーマンス最適化
- [x] 長いメッセージ一覧の仮想スクロール（`@tanstack/react-virtual` 等）
- [x] 画像の遅延読み込み（`next/image`）
- [x] API レスポンスのキャッシュ最適化

### 6-3. アクセシビリティ
- [x] キーボードナビゲーション対応
- [x] ARIA ラベルの適切な設定
- [x] フォーカス管理（モーダル開閉時等）

### 6-4. レスポンシブ対応
- [x] モバイル向けサイドバーをドロワー形式に変更
- [x] 入力エリアのモバイル最適化

### 6-5. 最終確認
- [x] 全機能の動作確認（Claude / Gemini 両プロバイダー）
- [x] ダークモード / ライトモードの表示確認
- [x] 各種ファイル添付の動作確認
- [x] ブラウザ互換性確認（Chrome / Firefox / Safari）

---

## Phase 7: デプロイ（Google Cloud）

### 7-1. Google Cloud のセットアップ
- [x] Google Cloud プロジェクトを作成（または既存を使用）
- [x] 必要な API を有効化
  - Cloud Run API
  - Cloud Build API
  - Artifact Registry API
  - Cloud Storage API

### 7-2. コンテナ化
- [x] `Dockerfile` を作成（multi-stage build + standalone output）
- [x] `.dockerignore` を作成
- [x] ローカルでの Docker ビルド・動作確認

### 7-3. CI/CD の設定
- [x] `cloudbuild.yaml` を作成（Cloud Build の設定）
- [x] GitHub リポジトリと Cloud Build を連携（main ブランチへの push で自動デプロイ）

### 7-4. Cloud Run へのデプロイ
- [x] Artifact Registry にコンテナイメージをプッシュ
- [x] Cloud Run サービスを作成・デプロイ
- [x] 環境変数を Cloud Run の Secret Manager 経由で設定
- [x] カスタムドメインの設定（必要に応じて）

### 7-5. 本番確認
- [x] 本番 URL での全機能動作確認
- [x] MongoDB Atlas の接続確認
- [x] GCS のファイルアップロード確認
- [x] AI API（Claude / Gemini）の動作確認

---

## 依存関係まとめ

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7
                       ↑
                   Phase 2 が完了してから Phase 3, 4 を並行で進められる
```

Phase 3 と Phase 4 は Phase 2 完了後に並行して進めることが可能。
Phase 5 は Phase 3・4 の完了後に着手する。

---

## Phase 8: バグ修正（コードレビューで発見）

### 8-1. 実行時エラー修正（Critical）

- [x] **pdf-parse API の誤用を修正**（`lib/ai/index.ts`）
  - `new PDFParse({ dataBuffer })` は誤り。正しい API: `const parse = (await import('pdf-parse')).default; const data = await parse(buffer)`
  - 現状 PDF 添付ファイルのテキスト抽出が必ず失敗する

- [x] **ChatInput: 送信時の `URL.revokeObjectURL` 漏れを修正**（`components/chat/ChatInput.tsx`）
  - `handleSend()` で `setPendingFiles([])` するとき、画像プレビューの ObjectURL が解放されずメモリリークする
  - 送信前に各 `pf.preview` を `URL.revokeObjectURL()` してから配列をクリアする

- [x] **gemini.ts: `/tmp` の認証情報ファイルを使用後に削除**（`lib/ai/gemini.ts`）
  - `writeFileSync` で書き出した一時ファイルがプロセス終了まで残り続ける
  - 書き出しは初回のみ行うようにし、不要になったら `fs.unlinkSync` で削除する

### 8-2. UX バグ修正（High）

- [x] **ChatSidebar: スレッド検索にデバウンスを追加**（`components/chat/ChatSidebar.tsx`）
  - 現状はキー入力のたびに `GET /api/threads?q=` を呼び出している
  - `useEffect` + `setTimeout` で 300ms のデバウンスを実装する

- [x] **ChatSidebar: スレッド削除に確認ダイアログを追加**（`components/chat/ChatSidebar.tsx`）
  - 現状はワンクリックで即削除（取り消し不可）
  - shadcn `AlertDialog` で「本当に削除しますか？」を挟む

- [x] **ChatHeader: モデル変更・システムプロンプト保存失敗時のトースト通知**（`components/chat/ChatHeader.tsx`）
  - `fetch` 失敗時にサイレントに失敗している
  - `toast.error()` でユーザーに通知する

### 8-3. 設定・環境変数の不備修正

- [x] **Makefile `secrets-setup` に `GOOGLE_APPLICATION_CREDENTIALS_JSON` を追加**（`Makefile`）
  - Cloud Run デプロイ時に必要だが、`secrets-setup` ターゲットに登録コマンドが抜けている

- [x] **`lib/storage/gcs.ts`: JSON パースエラーのハンドリング追加**
  - `GOOGLE_APPLICATION_CREDENTIALS_JSON` が不正な JSON の場合、`JSON.parse()` で例外が発生してサーバーがクラッシュする
  - try-catch でラップして分かりやすいエラーメッセージを出す

---

## Phase 9: セキュリティ強化

### 9-1. SSRF 対策

- [x] **添付ファイル URL のバリデーション**（`lib/ai/index.ts`）
  - PDF・テキストファイルの内容取得時に `fetch(att.url)` を呼んでいる
  - `att.url` が `http://localhost:...` や `http://169.254.169.254/...`（GCP メタデータ）を指していた場合、内部リソースにアクセスできてしまう
  - 許可ホストを `storage.googleapis.com` のみに制限する

### 9-2. ファイルアップロード保護

- [x] **アップロード API にレート制限を追加**（`app/api/[[...route]]/routes/upload.ts`）
  - 現状は認証なしで無制限にアップロード可能（GCS コスト・ストレージ枯渇リスク）
  - IP ベースのレート制限（例: 1分あたり10ファイル）を実装する

### 9-3. エラーレスポンスの情報整理

- [ ] **API エラーレスポンスから内部情報を除去**
  - スタックトレースや DB エラー詳細がクライアントに返っていないか確認
  - 本番環境では汎用メッセージのみ返す

---

## Phase 10: スケーラビリティ改善

### 10-1. DB インデックス追加

- [x] **`Message.threadId` にインデックスを追加**（`prisma/schema.prisma`）
  ```prisma
  @@index([threadId])
  ```
  - メッセージ取得クエリが全件スキャンになっている（スレッドあたり数百件超で顕著）

### 10-2. ページネーション

- [x] **スレッド一覧 API にページネーション実装**（`GET /api/threads`）
  - スレッドが増えると全件取得でレスポンスが肥大化する
  - `?limit=50&cursor=<last_id>` によるカーソルベースページネーションを実装する

- [x] **メッセージ一覧 API にページネーション実装**（`GET /api/threads/:id/messages`）
  - 数百件のメッセージがある場合、全件をメモリに展開してから AI に渡している
  - 直近 N 件のみ取得 + AI に渡すコンテキストウィンドウを制限する

### 10-3. モバイル UX 改善

- [x] **コピーボタンをホバー依存から変更**（`components/chat/MessageBubble.tsx`）
  - 現状は `opacity-0 group-hover:opacity-100` でモバイル（タッチデバイス）では表示されない
  - モバイルでは常時表示にするか、長押しメニューで対応する
