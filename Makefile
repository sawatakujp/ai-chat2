# ============================================================
# ai-chat2 Makefile
# ============================================================

# .env.local を自動読み込み
-include .env.local
export

# --- 設定変数（必要に応じて上書き） ---
PROJECT_ID  ?= $(shell gcloud config get-value project 2>/dev/null)
REGION      ?= asia-northeast1
REPO        ?= ai-chat2
SERVICE     ?= ai-chat2
IMAGE       := $(REGION)-docker.pkg.dev/$(PROJECT_ID)/$(REPO)/$(SERVICE)
TAG         ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo latest)

.PHONY: help init setup db-push db-studio dev build \
        docker-build docker-run docker-push deploy \
        secrets-setup gcp-setup logs clean

# ============================================================
# ヘルプ
# ============================================================
help: ## コマンド一覧を表示
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*##"}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ============================================================
# 初期化
# ============================================================
init: ## 依存インストール + Prisma クライアント生成
	npm install
	@echo "→ 開発サーバーを停止してから Prisma クライアントを生成します"
	-pkill -f "next dev" 2>/dev/null || true
	@sleep 1
	npx dotenv -e .env.local -- prisma generate

setup: init db-push ## init + DB スキーマ同期（初回セットアップ）

db-push: ## Prisma スキーマを DB に反映
	npx dotenv -e .env.local -- prisma db push

db-studio: ## Prisma Studio を起動（DB GUI）
	npx dotenv -e .env.local -- prisma studio

# ============================================================
# 開発
# ============================================================
dev: ## 開発サーバーを起動 (http://localhost:3000)
	npm run dev

# ============================================================
# ビルド
# ============================================================
build: ## プロダクションビルド
	npm run build

# ============================================================
# Docker（ローカル確認用）
# ============================================================
docker-build: ## Docker イメージをローカルビルド
	docker build -t $(SERVICE):$(TAG) .

docker-run: ## ローカルビルドイメージを起動 (.env.local を読み込み)
	docker run --rm -p 3000:8080 --env-file .env.local $(SERVICE):$(TAG)

# ============================================================
# Google Cloud デプロイ
# ============================================================
docker-push: ## Artifact Registry にプッシュ
	docker tag $(SERVICE):$(TAG) $(IMAGE):$(TAG)
	docker tag $(SERVICE):$(TAG) $(IMAGE):latest
	docker push $(IMAGE):$(TAG)
	docker push $(IMAGE):latest

deploy: ## Cloud Run に手動デプロイ（docker-push 後に実行）
	gcloud run deploy $(SERVICE) \
		--image=$(IMAGE):$(TAG) \
		--region=$(REGION) \
		--platform=managed \
		--allow-unauthenticated \
		--memory=1Gi \
		--cpu=1 \
		--min-instances=0 \
		--max-instances=10 \
		--set-secrets=ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,\
GOOGLE_GENERATIVE_AI_API_KEY=GOOGLE_GENERATIVE_AI_API_KEY:latest,\
DATABASE_URL=DATABASE_URL:latest,\
GCS_BUCKET_NAME=GCS_BUCKET_NAME:latest,\
GOOGLE_CLOUD_PROJECT_ID=GOOGLE_CLOUD_PROJECT_ID:latest,\
GOOGLE_APPLICATION_CREDENTIALS_JSON=GOOGLE_APPLICATION_CREDENTIALS_JSON:latest

deploy-ci: ## Cloud Build でビルド＆デプロイ（cloudbuild.yaml を使用）
	gcloud builds submit --config cloudbuild.yaml .

# ============================================================
# GCP セットアップ（初回のみ）
# ============================================================
gcp-setup: ## GCP API 有効化 + Artifact Registry リポジトリ作成
	gcloud services enable \
		run.googleapis.com \
		cloudbuild.googleapis.com \
		artifactregistry.googleapis.com \
		storage.googleapis.com \
		secretmanager.googleapis.com
	gcloud artifacts repositories create $(REPO) \
		--repository-format=docker \
		--location=$(REGION) \
		--description="$(SERVICE) Docker images" || true
	gcloud auth configure-docker $(REGION)-docker.pkg.dev

secrets-setup: ## Secret Manager にシークレットを登録（.env.local から読み込み）
	@echo "→ ANTHROPIC_API_KEY"
	@grep ANTHROPIC_API_KEY .env.local | cut -d= -f2- | \
		gcloud secrets create ANTHROPIC_API_KEY --data-file=- 2>/dev/null || \
		grep ANTHROPIC_API_KEY .env.local | cut -d= -f2- | \
		gcloud secrets versions add ANTHROPIC_API_KEY --data-file=-
	@echo "→ GOOGLE_GENERATIVE_AI_API_KEY"
	@grep GOOGLE_GENERATIVE_AI_API_KEY .env.local | cut -d= -f2- | \
		gcloud secrets create GOOGLE_GENERATIVE_AI_API_KEY --data-file=- 2>/dev/null || \
		grep GOOGLE_GENERATIVE_AI_API_KEY .env.local | cut -d= -f2- | \
		gcloud secrets versions add GOOGLE_GENERATIVE_AI_API_KEY --data-file=-
	@echo "→ DATABASE_URL"
	@grep DATABASE_URL .env.local | cut -d= -f2- | \
		gcloud secrets create DATABASE_URL --data-file=- 2>/dev/null || \
		grep DATABASE_URL .env.local | cut -d= -f2- | \
		gcloud secrets versions add DATABASE_URL --data-file=-
	@echo "→ GCS_BUCKET_NAME"
	@grep GCS_BUCKET_NAME .env.local | cut -d= -f2- | \
		gcloud secrets create GCS_BUCKET_NAME --data-file=- 2>/dev/null || \
		grep GCS_BUCKET_NAME .env.local | cut -d= -f2- | \
		gcloud secrets versions add GCS_BUCKET_NAME --data-file=-
	@echo "→ GOOGLE_CLOUD_PROJECT_ID"
	@grep GOOGLE_CLOUD_PROJECT_ID .env.local | cut -d= -f2- | \
		gcloud secrets create GOOGLE_CLOUD_PROJECT_ID --data-file=- 2>/dev/null || \
		grep GOOGLE_CLOUD_PROJECT_ID .env.local | cut -d= -f2- | \
		gcloud secrets versions add GOOGLE_CLOUD_PROJECT_ID --data-file=-
	@echo "→ GOOGLE_CLOUD_LOCATION"
	@grep GOOGLE_CLOUD_LOCATION .env.local | cut -d= -f2- | \
		gcloud secrets create GOOGLE_CLOUD_LOCATION --data-file=- 2>/dev/null || \
		grep GOOGLE_CLOUD_LOCATION .env.local | cut -d= -f2- | \
		gcloud secrets versions add GOOGLE_CLOUD_LOCATION --data-file=-
	@if grep -q "^GOOGLE_APPLICATION_CREDENTIALS_JSON=" .env.local; then \
		echo "→ GOOGLE_APPLICATION_CREDENTIALS_JSON"; \
		grep GOOGLE_APPLICATION_CREDENTIALS_JSON .env.local | cut -d= -f2- | \
		gcloud secrets create GOOGLE_APPLICATION_CREDENTIALS_JSON --data-file=- 2>/dev/null || \
		grep GOOGLE_APPLICATION_CREDENTIALS_JSON .env.local | cut -d= -f2- | \
		gcloud secrets versions add GOOGLE_APPLICATION_CREDENTIALS_JSON --data-file=-; \
	fi
	@echo "シークレット登録完了"

# ============================================================
# ユーティリティ
# ============================================================
logs: ## Cloud Run のログを表示
	gcloud run services logs read $(SERVICE) --region=$(REGION) --limit=100

clean: ## ビルド成果物を削除
	rm -rf .next node_modules
