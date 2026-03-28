# EasePaste — Software Engineering Specification

**Version:** 1.0
**Status:** Draft
**Date:** 2026-03-28

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Data Models](#3-data-models)
4. [API Specification](#4-api-specification)
5. [Module Breakdown](#5-module-breakdown)
6. [Security & Privacy](#6-security--privacy)
7. [File Processing Pipeline](#7-file-processing-pipeline)
8. [Field Mapping Engine](#8-field-mapping-engine)
9. [Storage](#9-storage)
10. [Error Handling](#10-error-handling)
11. [Non-Functional Requirements](#11-non-functional-requirements)
12. [Tech Stack](#12-tech-stack)

---

## 1. System Overview

EasePaste is a web application with three primary flows:

1. **Profile Setup** — user enters personal data once into a structured profile
2. **Document Processing** — user uploads a document; the system detects fields and auto-fills them from the profile
3. **Output & Download** — user reviews the filled document and downloads it

### High-Level Flow

```
User → Upload Document
         ↓
   Document Parser
         ↓
   Field Detection (AI + heuristics)
         ↓
   Profile Field Mapper
         ↓
   Review UI (flag ambiguous fields)
         ↓
   Document Renderer
         ↓
   Download
```

---

## 2. Architecture

### System Components

```
┌─────────────────────────────────────────────────────┐
│                     Client (Web)                     │
│         React SPA — Profile, Upload, Review         │
└────────────────────────┬────────────────────────────┘
                         │ HTTPS / REST
┌────────────────────────▼────────────────────────────┐
│                   API Gateway                        │
│              Auth, Rate Limiting, Routing            │
└──────┬──────────────────────────────────────────────┘
       │
┌──────▼──────────┐   ┌──────────────────┐   ┌────────────────────┐
│   Auth Service  │   │  Profile Service  │   │ Document Service   │
│  (JWT / OAuth)  │   │  (CRUD profile)   │   │ (upload, parse,    │
│                 │   │                   │   │  fill, export)     │
└─────────────────┘   └────────┬──────────┘   └────────┬───────────┘
                               │                        │
                    ┌──────────▼────────────────────────▼──────────┐
                    │               PostgreSQL (primary DB)         │
                    └───────────────────────────────────────────────┘
                                        │
                    ┌───────────────────▼───────────────────────────┐
                    │            Object Storage (S3-compatible)      │
                    │   uploaded docs, processed docs, temp files    │
                    └───────────────────────────────────────────────┘
```

### Deployment

- Containerized via Docker; orchestrated with Docker Compose (dev) / Kubernetes (prod)
- Frontend served via CDN
- Backend services deployed as stateless containers behind a load balancer

---

## 3. Data Models

### User

```ts
User {
  id: uuid
  email: string (unique)
  password_hash: string
  created_at: timestamp
  updated_at: timestamp
}
```

### Profile

```ts
Profile {
  id: uuid
  user_id: uuid (FK → User)

  // Personal
  first_name: string
  middle_name: string | null
  last_name: string
  date_of_birth: date
  ssn_encrypted: string | null       // AES-256 encrypted at rest
  tax_id_encrypted: string | null

  // Contact
  email: string
  phone: string

  // Address
  address_line1: string
  address_line2: string | null
  city: string
  state: string
  zip: string
  country: string

  // Previous address (optional)
  prev_address: Address | null

  // Employment
  employer_name: string | null
  job_title: string | null
  annual_income: number | null
  employment_start_date: date | null

  created_at: timestamp
  updated_at: timestamp
}
```

### Document

```ts
Document {
  id: uuid
  user_id: uuid (FK → User)
  original_filename: string
  file_type: enum('pdf', 'docx')
  storage_key: string               // S3 object key for uploaded file
  processed_storage_key: string | null  // S3 key for filled output
  status: enum('uploaded', 'processing', 'review', 'completed', 'failed')
  detected_fields: JSON             // array of DetectedField
  fill_result: JSON | null          // array of FilledField
  created_at: timestamp
  updated_at: timestamp
}
```

### DetectedField

```ts
DetectedField {
  field_id: string             // internal identifier
  label: string                // text label found in document
  field_type: enum('text', 'checkbox', 'date', 'signature')
  page: number
  bounding_box: { x, y, width, height }
  mapped_profile_key: string | null   // e.g. "first_name"
  confidence: number                  // 0.0 – 1.0
  requires_review: boolean
}
```

### FilledField

```ts
FilledField {
  field_id: string
  value: string
  source: enum('profile', 'user_override')
}
```

---

## 4. API Specification

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login, returns JWT |
| POST | `/api/auth/logout` | Invalidate token |
| POST | `/api/auth/refresh` | Refresh access token |

### Profile

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/profile` | Get current user's profile |
| PUT | `/api/profile` | Create or update profile |
| DELETE | `/api/profile` | Delete profile and all associated data |

### Documents

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/documents/upload` | Upload a document (multipart/form-data) |
| GET | `/api/documents` | List user's documents |
| GET | `/api/documents/:id` | Get document status and detected fields |
| PUT | `/api/documents/:id/review` | Submit user overrides for flagged fields |
| POST | `/api/documents/:id/finalize` | Trigger final render and generate download |
| GET | `/api/documents/:id/download` | Download the completed document (signed URL) |
| DELETE | `/api/documents/:id` | Delete document and all associated files |

### Request / Response Examples

**POST /api/documents/upload**
```json
// Request: multipart/form-data
// field: "file" (PDF or DOCX)

// Response 202
{
  "document_id": "d1a2b3c4-...",
  "status": "processing"
}
```

**GET /api/documents/:id**
```json
// Response 200
{
  "id": "d1a2b3c4-...",
  "status": "review",
  "detected_fields": [
    {
      "field_id": "f_001",
      "label": "Applicant First Name",
      "mapped_profile_key": "first_name",
      "confidence": 0.97,
      "requires_review": false,
      "suggested_value": "Jane"
    },
    {
      "field_id": "f_008",
      "label": "Co-Signer SSN",
      "mapped_profile_key": null,
      "confidence": 0.0,
      "requires_review": true,
      "suggested_value": null
    }
  ]
}
```

**PUT /api/documents/:id/review**
```json
// Request
{
  "overrides": [
    { "field_id": "f_008", "value": "provided-by-user" }
  ]
}

// Response 200
{ "status": "ready_to_finalize" }
```

---

## 5. Module Breakdown

### 5.1 Auth Service
- JWT-based authentication (access token: 15 min, refresh token: 30 days)
- Passwords hashed with bcrypt (cost factor 12)
- OAuth2 login (Google) as optional provider

### 5.2 Profile Service
- CRUD operations on user profile
- Sensitive fields (SSN, tax ID) encrypted with AES-256-GCM before DB write; decrypted only in-memory during document fill
- Profile completeness score returned on GET (used to warn users before upload)

### 5.3 Document Service

Orchestrates the full document lifecycle:

1. Accept upload → validate file type and size (max 20 MB)
2. Store original in object storage
3. Enqueue processing job
4. On job completion: persist `detected_fields`, set status to `review`
5. Accept review overrides
6. Trigger final render → store output → set status to `completed`
7. Return signed download URL (expires in 1 hour)

### 5.4 Document Parser

Responsible for extracting text content and field locations from uploaded files.

- **PDF:** Use `pdf-lib` + `pdfjs-dist` to extract AcroForm fields and raw text with coordinates
- **DOCX:** Use `mammoth` + `docx` to extract content controls and form fields
- Output: normalized list of `DetectedField` objects with bounding boxes and labels

### 5.5 Field Mapping Engine

Maps detected field labels to profile keys. See [Section 8](#8-field-mapping-engine).

### 5.6 Document Renderer

Writes profile values back into the original document:

- **PDF:** Use `pdf-lib` to fill AcroForm fields; for non-AcroForm PDFs, use coordinate-based text overlay
- **DOCX:** Replace content control values using `docx` library
- Output: filled document stored in object storage under `processed_storage_key`

---

## 6. Security & Privacy

### Encryption
- All data in transit: TLS 1.3
- Sensitive profile fields (SSN, tax ID): AES-256-GCM encrypted at rest; encryption key stored in a secrets manager (AWS Secrets Manager / HashiCorp Vault)
- Uploaded and processed documents: stored in private S3 bucket with server-side encryption (SSE-S3)

### Access Control
- All API routes require valid JWT (except auth endpoints)
- Users can only access their own profile and documents (enforced at query level, not just route level)
- Document download URLs are pre-signed and time-limited (1 hour)

### Data Retention
- Raw uploaded documents: deleted from storage 24 hours after the processed output is downloaded
- Processed documents: deleted 7 days after creation unless saved by user
- Profile data: retained until user deletes account
- On account deletion: all profile data, documents, and storage objects purged within 24 hours

### Compliance Considerations
- PII handling aligned with CCPA / GDPR principles
- No user data sold or shared with third parties
- Audit log of all profile reads during document fill (user-accessible)

---

## 7. File Processing Pipeline

```
Upload (multipart)
    ↓
Validate (type: pdf|docx, size: ≤20MB, virus scan)
    ↓
Store original → object storage
    ↓
Enqueue job (document_id) → job queue
    ↓
Worker picks up job
    ↓
Parse document → extract fields + bounding boxes
    ↓
Run Field Mapping Engine → assign profile keys + confidence scores
    ↓
Fetch profile data (decrypt sensitive fields in-memory)
    ↓
Build DetectedField list; flag fields with confidence < 0.75 as requires_review
    ↓
Persist detected_fields → DB; set status = 'review'
    ↓
Notify client (WebSocket or polling)
    ↓
User submits review overrides (if any)
    ↓
Renderer writes values into document
    ↓
Store processed doc → object storage
    ↓
Set status = 'completed'; generate signed download URL
```

### Job Queue
- Use Redis-backed queue (BullMQ)
- Jobs are idempotent (safe to retry)
- Max 3 retry attempts with exponential backoff
- Failed jobs set document status to `failed` with error code

---

## 8. Field Mapping Engine

### Strategy (in priority order)

1. **AcroForm field name matching** — PDF AcroForm fields often have machine-readable names (e.g., `applicant_first_name`). Direct key mapping against a profile field dictionary.

2. **Label text matching** — Normalize label text (lowercase, strip punctuation) and match against a curated synonym dictionary:

```json
{
  "first_name": ["first name", "given name", "applicant first name", "buyer first name"],
  "last_name": ["last name", "surname", "family name", "applicant last name"],
  "ssn": ["social security number", "ssn", "taxpayer id", "tin"],
  "date_of_birth": ["date of birth", "dob", "birth date", "birthdate"],
  ...
}
```

3. **Contextual / positional inference** — Use surrounding text and field proximity to disambiguate. E.g., a field labeled "Name" after "Employer" maps to `employer_name`, not `first_name`.

4. **LLM-assisted mapping (fallback)** — For fields that score below confidence threshold after steps 1–3, call an LLM (Claude API) with the field label, surrounding document text, and the profile schema to produce a best-guess mapping and confidence score.

### Confidence Scoring
- AcroForm exact match: 1.0
- Synonym dictionary exact match: 0.95
- Synonym dictionary fuzzy match (≥0.85 similarity): 0.80
- Contextual inference: 0.75
- LLM-assisted: LLM-returned confidence, capped at 0.85
- No match: 0.0 → `requires_review = true`

Fields with confidence < 0.75 are always flagged for user review.

---

## 9. Storage

### PostgreSQL
- Users, profiles, document metadata, detected fields, fill results
- Encrypted columns for SSN and tax ID (application-level encryption)
- Connection pooling via PgBouncer

### Object Storage (S3-compatible)
- Bucket: `easepaste-documents`
- Key structure:
  - `users/{user_id}/uploads/{document_id}/original.{ext}`
  - `users/{user_id}/processed/{document_id}/filled.{ext}`
- Private access only; downloads via pre-signed URLs
- Lifecycle policy: auto-delete uploads after 24h post-download; processed after 7 days

### Redis
- Job queue (BullMQ)
- Session/token cache
- Rate limiting counters

---

## 10. Error Handling

### HTTP Error Codes

| Code | Scenario |
|------|----------|
| 400 | Invalid file type, oversized file, malformed request body |
| 401 | Missing or expired JWT |
| 403 | Attempting to access another user's resource |
| 404 | Document or profile not found |
| 409 | Profile already exists on create |
| 413 | File exceeds 20 MB limit |
| 422 | Document processed but no fillable fields detected |
| 500 | Unhandled server error |
| 503 | Job queue unavailable |

### Document Processing Failures
- Virus scan fail → document rejected, storage object deleted, status: `failed`, error: `VIRUS_DETECTED`
- Unsupported document structure (e.g., scanned image-only PDF with no text layer) → status: `failed`, error: `NO_FIELDS_DETECTED`; user advised to use a text-based PDF
- Render failure → status: `failed`, error: `RENDER_ERROR`; original file preserved

---

## 11. Non-Functional Requirements

### Performance
- Document upload acknowledgement: < 500ms
- Field detection and mapping: < 30 seconds for documents up to 20 pages
- Filled document available for download: < 60 seconds end-to-end
- API p99 response time: < 300ms (excluding file processing jobs)

### Scalability
- Stateless API services — horizontally scalable
- Job workers scaled independently based on queue depth
- Target: 1,000 concurrent document processing jobs

### Reliability
- API uptime target: 99.9%
- Job queue with retry ensures no document is silently dropped
- Graceful degradation: if LLM fallback is unavailable, fields proceed without it and are flagged for review

### Availability
- Multi-AZ database deployment with automated failover
- Object storage with cross-region replication for processed outputs

---

## 12. Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React, TypeScript, Tailwind CSS |
| API | Node.js, Express (or Fastify) |
| Auth | JWT + bcrypt, optional OAuth2 (Passport.js) |
| Job Queue | BullMQ + Redis |
| Database | PostgreSQL |
| Object Storage | AWS S3 (or compatible: Cloudflare R2, MinIO) |
| PDF Processing | `pdf-lib`, `pdfjs-dist` |
| DOCX Processing | `mammoth`, `docx` |
| LLM (field mapping fallback) | Claude API (`claude-sonnet-4-6`) |
| Infrastructure | Docker, Kubernetes |
| CI/CD | GitHub Actions |
| Secrets Management | AWS Secrets Manager |
