# PDF RAG Workspace

Production-style PDF RAG app with:

- Next.js frontend for upload, document management, and grounded chat
- Express API for document lifecycle, retrieval, and streaming answers
- BullMQ worker for async PDF ingestion
- Qdrant for vector search
- Redis for ingestion queueing
- Dockerized deployment with Redis and Qdrant isolated inside the app network

## What Changed

The project was refactored from a single-file prototype into a more maintainable structure:

```text
client/
  app/
  components/rag/
  lib/
server/
  src/
    config/
    repositories/
    routes/
    services/
    queues/
  storage/
docker-compose.yml
```

Major upgrades:

- Multi-document support with document-specific retrieval
- Async ingestion pipeline with `queued`, `processing`, `ready`, and `failed` states
- Persistent document metadata in `server/storage/documents.json`
- Safer Qdrant indexing with `documentId` payload filtering
- Better chunking and source citation handling
- Cleaner RAG workspace UI with retrieval controls
- Full frontend + API + worker + Redis + Qdrant Docker setup

## Features

- Upload and track PDFs through ingestion
- Select any indexed document for chat
- Stream grounded answers from retrieved context
- Show source snippets and similarity scores
- Tune retrieval depth with Top-K controls
- Delete documents and clean up their vectors
- Keep Redis and Qdrant private to Docker by default

## Local Development

### 1. Environment

Root Docker env example:

```bash
cp .env.example .env
```

API env example:

```bash
cp server/.env.sample server/.env
```

Required keys:

- `GOOGLE_API_KEY`
- `GROQ_API_KEY`

### 2. Start infrastructure

If you want Redis and Qdrant locally with Docker:

```bash
docker compose up -d redis qdrant
```

If you already run them locally, point `server/.env` at your existing services instead.

### 3. Start the backend

```bash
cd server
pnpm install
pnpm dev
```

In another terminal:

```bash
cd server
pnpm dev:worker
```

### 4. Start the frontend

```bash
cd client
pnpm install
pnpm dev
```

Frontend defaults to `http://localhost:3000` and the API defaults to `http://localhost:4000`.

## Docker Deployment

### 1. Configure env

```bash
cp .env.example .env
```

Fill in:

- `GOOGLE_API_KEY`
- `GROQ_API_KEY`

Optional ports:

- `FRONTEND_PORT`
- `API_PORT`
- `NEXT_PUBLIC_API_URL`
- `CORS_ORIGIN`

### 2. Start the full stack

```bash
docker compose up --build
```

This starts:

- `frontend` on `${FRONTEND_PORT:-3000}`
- `api` on `${API_PORT:-4000}`
- `worker`
- internal-only `redis`
- internal-only `qdrant`

Redis and Qdrant are not published to host ports by default, which avoids conflicts with services already installed on the machine.

## API Overview

### Health

- `GET /api/health`

### Documents

- `GET /api/documents`
- `GET /api/documents/:documentId`
- `POST /api/documents/upload`
- `DELETE /api/documents/:documentId`

### Chat

- `POST /api/chat`
- `POST /api/chat/stream`

Request body for chat:

```json
{
  "documentId": "uuid",
  "query": "Summarize the contract obligations",
  "topK": 6,
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

## Verification

Verified during refactor:

- `node --check server/index.js`
- `node --check server/worker.js`
- `pnpm exec tsc --noEmit` in `client/`
- `pnpm build` in `client/`
