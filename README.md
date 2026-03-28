# EasePaste

A document management and paste platform. Users upload PDF or DOCX files; the platform processes them, extracts fields, and presents a clean review interface.

## Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/)

## Quick Start

```bash
# 1. Clone the repository
git clone <repo-url>
cd easepaste

# 2. Create your local environment file
cp .env.example .env
# Edit .env and fill in any secrets you want to change

# 3. Start all infrastructure and application services
docker compose up

# 4. (First run) Run database migrations
docker compose exec api npm run migrate:up
```

The API will be available at **http://localhost:3000**.
The MinIO console is at **http://localhost:9001** (user: `minioadmin` / password: `minioadmin`).

## Development Without Docker

```bash
# Install dependencies
npm install

# Start Postgres, Redis, and MinIO via Docker (infrastructure only)
docker compose up postgres redis minio minio-init

# Apply migrations
npm run migrate:up

# Start API in watch mode
npm run dev:api

# In a second terminal, start the worker in watch mode
npm run dev:worker
```

## Running Migrations

```bash
# Apply all pending migrations
npm run migrate:up

# Roll back the most recent migration
npm run migrate:down
```

Migrations are plain SQL files in `migrations/` numbered `NNN_name.sql`.
Each is applied in a transaction and recorded in the `schema_migrations` table.

## Running Tests

```bash
# Run unit tests (no external services needed)
npm test

# Run in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run integration tests (requires Postgres + Redis)
# Start test services first:
docker compose -f docker-compose.test.yml up -d
# Then:
DATABASE_URL=postgresql://easepaste:easepaste@localhost:5432/easepaste_test \
REDIS_URL=redis://localhost:6379 \
npm run migrate:up
npm test -- --testPathPattern=integration
```

## Building for Production

```bash
npm run build
# Outputs compiled JS to dist/

npm run start:api
npm run start:worker
```

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | Runtime environment (`development`, `test`, `production`) |
| `PORT` | No | `3000` | Port the API listens on |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string |
| `REDIS_URL` | **Yes** | — | Redis connection URL |
| `JWT_ACCESS_SECRET` | **Yes** | — | Secret for signing access tokens (min 32 chars) |
| `JWT_REFRESH_SECRET` | **Yes** | — | Secret for signing refresh tokens (min 32 chars) |
| `JWT_ACCESS_EXPIRES_IN` | No | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | No | `30d` | Refresh token lifetime |
| `S3_ENDPOINT` | **Yes** | — | S3 or MinIO endpoint URL |
| `S3_REGION` | No | `us-east-1` | S3 region |
| `S3_ACCESS_KEY_ID` | **Yes** | — | S3 access key |
| `S3_SECRET_ACCESS_KEY` | **Yes** | — | S3 secret key |
| `S3_BUCKET` | No | `easepaste-documents` | S3 bucket name |
| `S3_FORCE_PATH_STYLE` | No | `false` | Set `true` for MinIO / path-style S3 |
| `LOG_LEVEL` | No | `info` | Pino log level |
| `BF_MAX_ATTEMPTS` | No | `10` | Max failed login attempts before lockout |
| `BF_WINDOW_SECONDS` | No | `900` | Lockout window in seconds (900 = 15 min) |

## Sprint 1 API Endpoints

### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | None | Register a new account |
| `POST` | `/api/auth/login` | None | Log in and receive tokens |
| `POST` | `/api/auth/refresh` | Cookie | Rotate the refresh token |
| `POST` | `/api/auth/logout` | Bearer | Revoke the refresh token |

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Returns service health status |

#### POST /api/auth/register

```json
// Request
{ "email": "user@example.com", "password": "SecurePass1!" }

// 201 Created
{ "user_id": "uuid", "email": "user@example.com" }

// 409 Conflict
{ "error": { "code": "DUPLICATE_EMAIL", "message": "..." } }
```

#### POST /api/auth/login

```json
// Request
{ "email": "user@example.com", "password": "SecurePass1!" }

// 200 OK (refresh_token set as httpOnly cookie)
{ "access_token": "<jwt>" }

// 401 Unauthorized
{ "error": { "code": "INVALID_CREDENTIALS", "message": "Invalid email or password" } }

// 423 Locked
{ "error": { "code": "ACCOUNT_LOCKED", "message": "..." } }
```

#### POST /api/auth/refresh

Reads the `refresh_token` cookie. Sets a rotated `refresh_token` cookie on success.

```json
// 200 OK
{ "access_token": "<new-jwt>" }
```

#### POST /api/auth/logout

Requires `Authorization: Bearer <access_token>` header.

```
// 204 No Content
```

#### GET /health

```json
// 200 OK
{ "status": "ok", "db": "ok", "redis": "ok", "timestamp": "2026-03-28T00:00:00.000Z" }

// 503 Service Unavailable (if any dependency is down)
{ "status": "degraded", "db": "error", "redis": "ok", "timestamp": "..." }
```
