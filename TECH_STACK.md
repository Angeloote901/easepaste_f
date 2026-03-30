# EasePaste — Tech Stack

## Frontend

**Core:** Vanilla HTML, CSS, and JavaScript (ES6+ modules) — no frontend framework.

- **Build Tool:** Vite
- **Fonts:** Google Fonts (DM Sans, Syne)
- **PDF Rendering:** pdf.js (via CDN)
- **Authentication:** Firebase Auth (Google OAuth)
- **Hosting:** Vercel / Firebase Hosting

## Backend

### API Server

**Framework:** Fastify (Node.js + TypeScript)

| Category | Technology |
|---|---|
| Language | TypeScript |
| Runtime | Node.js 20+ |
| Framework | Fastify |
| Authentication | JWT (`jsonwebtoken`), bcrypt |
| Validation | Zod |
| Logging | Pino |

**Fastify Plugins:** `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/cookie`, `@fastify/static`

### Worker Service

A separate BullMQ-based worker that handles async document processing jobs. Shares the same TypeScript/Node.js stack as the API server.

### Firebase Cloud Functions

Located in `easepaste_f/functions/`, written in TypeScript and deployed to Firebase.

- `demoFill` — extracts fields from user profiles
- `saveProfile` — persists profile data to Firestore

## Databases & Storage

| Service | Purpose |
|---|---|
| PostgreSQL 16 | Primary relational database (users, document metadata) |
| Redis 7 | Caching, rate limiting, BullMQ job queue |
| MinIO (S3-compatible) | Document file storage (local dev); S3 in production |
| Firestore | Cloud document/profile storage via Firebase |

## Infrastructure

- **Containers:** Docker + Docker Compose (multi-stage builds for dev and production)
- **Job Queue:** BullMQ (backed by Redis)
- **Object Storage SDK:** AWS SDK v3 (`@aws-sdk/client-s3`)

## Testing & Tooling

- **Test Runner:** Vitest
- **Coverage:** `@vitest/coverage-v8`
- **Linting:** ESLint + `@typescript-eslint`
- **Formatting:** Prettier
