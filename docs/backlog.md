# EasePaste — Epics, User Stories, Acceptance Tests & Sprint Backlog

**Team Size:** 6 senior engineers (recommended split below)
**Sprint Duration:** 2 weeks
**Velocity Assumption:** ~60 story points per sprint (team of 6 × ~10 SP avg)
**Total Sprints:** 6 (12 weeks to v1 launch)

### Team Roles
| Engineer | Domain |
|----------|--------|
| Eng-1 | Tech Lead / Backend Architecture |
| Eng-2 | Backend — Auth & Profile Service |
| Eng-3 | Backend — Document Service & Pipeline |
| Eng-4 | Backend — Field Mapping Engine & LLM Integration |
| Eng-5 | Frontend — React SPA |
| Eng-6 | Infrastructure, DevOps, Security |

---

## Epics

| ID | Epic | Description |
|----|------|-------------|
| E1 | Foundation & Infrastructure | Project scaffolding, CI/CD, environments, database, storage, secrets |
| E2 | Authentication & User Management | Registration, login, JWT, OAuth2, account deletion |
| E3 | User Profile | Profile CRUD, PII encryption, completeness scoring |
| E4 | Document Upload & Pipeline | Upload, validation, virus scan, job queue, status tracking |
| E5 | Field Detection & Mapping Engine | PDF/DOCX parsing, synonym mapping, contextual inference, LLM fallback |
| E6 | Document Rendering & Output | Fill documents, preserve layout, download via signed URL |
| E7 | Review UI | Flag ambiguous fields, user override flow, finalize |
| E8 | Security & Compliance | Encryption at rest, access control, audit logs, data retention |
| E9 | Frontend Application | Full React SPA — profile, upload, review, download pages |
| E10 | Observability & Quality | Logging, metrics, error tracking, performance benchmarks, test coverage |

---

## User Stories

### E1 — Foundation & Infrastructure

---

**US-101**
> As a developer, I need a local dev environment that mirrors production so that I can build and test with confidence.

**Acceptance Criteria:**
- Docker Compose spins up API, worker, PostgreSQL, Redis, and MinIO (local S3)
- `npm run dev` starts all services with hot reload
- `.env.example` documents all required environment variables
- README covers setup from zero to running in under 10 minutes

**Story Points:** 5
**Owner:** Eng-6

---

**US-102**
> As a developer, I need CI/CD pipelines so that every pull request is validated and deployments are automated.

**Acceptance Criteria:**
- GitHub Actions runs lint, type check, unit tests, and integration tests on every PR
- Failing checks block merge to main
- Merge to main triggers automated deploy to staging
- Manual approval gate before production deploy
- Secrets never appear in logs or artifacts

**Story Points:** 8
**Owner:** Eng-6

---

**US-103**
> As a developer, I need the database schema and migrations managed as code so that schema changes are versioned and repeatable.

**Acceptance Criteria:**
- Migration tool configured (e.g., `node-pg-migrate` or `drizzle-orm`)
- Initial migration creates all tables from spec: `users`, `profiles`, `documents`
- Migrations run automatically on container start in dev; manually triggered in prod
- Rollback scripts exist for every migration

**Story Points:** 5
**Owner:** Eng-1

---

**US-104**
> As a developer, I need S3-compatible object storage configured so that document files can be uploaded, stored, and retrieved securely.

**Acceptance Criteria:**
- Bucket `easepaste-documents` created with private ACL
- Server-side encryption enabled (SSE-S3)
- Lifecycle policies set: uploads deleted 24h post-download; processed deleted after 7 days
- Cross-region replication enabled in production
- Local dev uses MinIO with identical bucket configuration

**Story Points:** 5
**Owner:** Eng-6

---

### E2 — Authentication & User Management

---

**US-201**
> As a new user, I want to register with my email and password so that I can create a secure account.

**Acceptance Criteria:**
- `POST /api/auth/register` accepts `{ email, password }`
- Password must be ≥ 10 characters, contain uppercase, lowercase, and a number
- Password hashed with bcrypt (cost factor 12) before storage
- Duplicate email returns 409 with clear error message
- Returns 201 with `{ user_id, email }` on success (no password in response)

**Story Points:** 5
**Owner:** Eng-2

---

**US-202**
> As a registered user, I want to log in and receive a JWT so that I can make authenticated API calls.

**Acceptance Criteria:**
- `POST /api/auth/login` returns access token (15 min TTL) and refresh token (30 days TTL) in `httpOnly` cookie
- Invalid credentials return 401 with generic message (no enumeration leakage)
- Brute force protection: account locked for 15 min after 10 failed attempts
- `POST /api/auth/refresh` issues new access token using valid refresh token
- `POST /api/auth/logout` invalidates refresh token server-side

**Story Points:** 8
**Owner:** Eng-2

---

**US-203**
> As a user, I want to log in with my Google account so that I don't have to manage a separate password.

**Acceptance Criteria:**
- OAuth2 Google flow implemented via Passport.js
- New Google users get an account created automatically on first login
- Existing email users who connect Google are linked to the same account
- JWT issued after successful OAuth exchange (same format as email/password login)
- OAuth errors surface a user-friendly message, not a raw stack trace

**Story Points:** 8
**Owner:** Eng-2

---

**US-204**
> As a user, I want to permanently delete my account so that all my personal data is removed from the system.

**Acceptance Criteria:**
- `DELETE /api/auth/account` requires current password confirmation (or re-auth for OAuth users)
- All profile data deleted immediately from the database
- All documents and S3 objects purged within 24 hours via background job
- All active JWT tokens invalidated immediately
- Confirmation email sent after deletion
- Action is irreversible; UI presents a clear warning before proceeding

**Story Points:** 5
**Owner:** Eng-2

---

### E3 — User Profile

---

**US-301**
> As a user, I want to create and save my personal profile so that EasePaste can use it to fill documents automatically.

**Acceptance Criteria:**
- `PUT /api/profile` creates or updates profile for the authenticated user
- Required fields validated: `first_name`, `last_name`, `email`, `address_line1`, `city`, `state`, `zip`
- All optional fields accepted without error if absent
- Returns 200 with profile object (SSN/tax ID replaced with masked value: `"***-**-1234"`)
- Profile tied to `user_id`; cannot create a second profile for the same user

**Story Points:** 8
**Owner:** Eng-2

---

**US-302**
> As a user, I want my SSN and tax ID stored securely so that even a database breach can't expose them.

**Acceptance Criteria:**
- SSN and tax ID encrypted with AES-256-GCM before write
- Encryption key stored in AWS Secrets Manager, never in application config or DB
- Decryption happens only in-memory during the document fill job; value never logged
- `GET /api/profile` returns masked value, never raw
- Rotating the encryption key re-encrypts existing values without downtime

**Story Points:** 8
**Owner:** Eng-2 + Eng-6

---

**US-303**
> As a user, I want to see a profile completeness score before uploading a document so that I know if I'm missing data that will cause blank fields.

**Acceptance Criteria:**
- `GET /api/profile` includes `{ completeness_score: 0–100, missing_fields: [] }`
- Score is weighted by field importance (name/address = high, employment = medium, SSN = high)
- If score < 70, upload page shows a non-blocking warning listing missing fields
- Warning is dismissable; users can still upload

**Story Points:** 3
**Owner:** Eng-2

---

### E4 — Document Upload & Pipeline

---

**US-401**
> As a user, I want to upload a PDF or DOCX file so that EasePaste can auto-fill it with my profile data.

**Acceptance Criteria:**
- `POST /api/documents/upload` accepts `multipart/form-data` with a `file` field
- Accepted types: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- Files > 20 MB rejected with 413 before storage write
- Invalid file type rejected with 400
- Valid upload stored at `users/{user_id}/uploads/{document_id}/original.{ext}`
- Response: `202 { document_id, status: "processing" }`
- Processing job enqueued within 500ms of upload acknowledgement

**Story Points:** 8
**Owner:** Eng-3

---

**US-402**
> As a user, I want uploaded files scanned for viruses so that malicious documents are rejected before processing.

**Acceptance Criteria:**
- ClamAV (or equivalent) integrated into the processing pipeline
- Scan runs after upload, before parsing
- Infected files: storage object deleted, status set to `failed`, error code `VIRUS_DETECTED`
- Clean files proceed to parsing
- Scan adds < 5 seconds to total processing time for a 20-page document

**Story Points:** 5
**Owner:** Eng-3 + Eng-6

---

**US-403**
> As a user, I want to see the real-time status of my document processing so that I know when it's ready to review.

**Acceptance Criteria:**
- `GET /api/documents/:id` returns `{ status, detected_fields?, error? }`
- Status transitions: `uploaded` → `processing` → `review` → `completed` | `failed`
- Frontend polls every 3 seconds while status is `processing` (or uses WebSocket if available)
- Processing failures surface a human-readable error message, not an error code alone
- Status page accessible from document history list

**Story Points:** 5
**Owner:** Eng-3 + Eng-5

---

**US-404**
> As a developer, I need the job queue to be reliable and retryable so that transient failures don't silently lose documents.

**Acceptance Criteria:**
- BullMQ jobs are idempotent (re-running produces the same result)
- Max 3 retry attempts with exponential backoff (1s, 4s, 16s)
- After all retries exhausted, document status set to `failed` with error code
- Dead-letter queue captures failed jobs for inspection
- Queue depth and worker health exposed as metrics

**Story Points:** 5
**Owner:** Eng-3

---

### E5 — Field Detection & Mapping Engine

---

**US-501**
> As a user, I want EasePaste to detect all form fields in my uploaded PDF so that every fillable area is identified.

**Acceptance Criteria:**
- AcroForm fields extracted with field name, type, and bounding box
- Non-AcroForm PDFs: text labels adjacent to input areas detected via heuristics
- All field types handled: `text`, `checkbox`, `date`, `signature`
- Output is a normalized `DetectedField[]` list stored on the document record
- Handles multi-page documents (up to 50 pages without timeout)

**Story Points:** 13
**Owner:** Eng-4

---

**US-502**
> As a user, I want EasePaste to detect all form fields in my uploaded DOCX so that Word-based contracts are supported.

**Acceptance Criteria:**
- Content controls (rich text, plain text, date picker, checkbox) extracted from DOCX
- Unstructured DOCX form fields (text after colon, underline spans) detected via heuristics
- Output normalized to same `DetectedField[]` format as PDF parser
- Bounding box approximated using paragraph/run position data

**Story Points:** 8
**Owner:** Eng-4

---

**US-503**
> As a user, I want common field names (like "First Name", "Given Name", "Applicant Name") to all map correctly to my profile so that I don't have to manually fill obvious fields.

**Acceptance Criteria:**
- Synonym dictionary covers all profile fields with ≥ 5 aliases each
- Exact synonym match produces confidence ≥ 0.95
- Fuzzy match (Levenshtein ≥ 0.85) produces confidence ≥ 0.80
- Dictionary is a versioned JSON file — no code change required to add new aliases
- Unit tests cover all 30+ profile field mappings with their known aliases

**Story Points:** 8
**Owner:** Eng-4

---

**US-504**
> As a user, I want contextually ambiguous fields (like "Name" near "Employer") to be resolved correctly using surrounding document context.

**Acceptance Criteria:**
- Positional and contextual heuristics implemented: proximity to section headers, preceding labels, field ordering
- "Name" preceded by "Employer" or in an "Employment" section maps to `employer_name`
- "Address" in a "Previous Residence" section maps to `prev_address`
- Contextual inference confidence: 0.75
- At least 10 contextual inference rules documented and tested

**Story Points:** 8
**Owner:** Eng-4

---

**US-505**
> As a user, I want unrecognized or ambiguous fields to be sent to an AI model so that even unusual document formats get a best-guess mapping.

**Acceptance Criteria:**
- Fields with confidence < 0.75 after heuristic passes are sent to Claude API
- Prompt includes field label, surrounding text (±200 chars), and profile schema
- LLM response parsed for mapping key and confidence score
- LLM-returned confidence capped at 0.85
- If LLM is unavailable (timeout/error), field proceeds with `requires_review: true` — no job failure
- LLM calls are batched per document (one API call with all unresolved fields, not one per field)

**Story Points:** 8
**Owner:** Eng-4

---

### E6 — Document Rendering & Output

---

**US-601**
> As a user, I want my filled PDF to preserve the original layout so that the output looks identical to the source document except for the filled values.

**Acceptance Criteria:**
- AcroForm fields filled using `pdf-lib` setField API
- Non-AcroForm PDFs: text overlaid at bounding box coordinates with matching font size
- Font, size, and color matched to surrounding text where detectable
- Original document metadata preserved (author, creation date not modified)
- Output file ≤ 110% of original file size

**Story Points:** 13
**Owner:** Eng-3

---

**US-602**
> As a user, I want my filled DOCX to preserve styles, fonts, and formatting so that the completed contract looks professional.

**Acceptance Criteria:**
- Content control values replaced using `docx` library
- Paragraph styles, fonts, and text formatting preserved
- Track changes not introduced by the fill operation
- Output `.docx` opens without warnings in Microsoft Word and Google Docs

**Story Points:** 8
**Owner:** Eng-3

---

**US-603**
> As a user, I want to download my completed document with a single click so that I can get my file immediately after review.

**Acceptance Criteria:**
- `GET /api/documents/:id/download` returns a pre-signed S3 URL (1 hour TTL)
- Download triggers immediately on click — no intermediate screen
- Filename: `{original_filename}_filled.{ext}`
- After download event detected, 24-hour deletion timer starts for the raw upload
- Download link shown prominently after finalization with copy-to-clipboard option

**Story Points:** 3
**Owner:** Eng-3 + Eng-5

---

### E7 — Review UI

---

**US-701**
> As a user, I want to see all detected fields and their auto-filled values before finalizing so that I can catch any errors.

**Acceptance Criteria:**
- Review page lists all `DetectedField` items with label, suggested value, and confidence indicator
- High-confidence fields (≥ 0.95) shown collapsed by default with a summary count
- Low-confidence and review-required fields expanded and highlighted
- User can edit any field value regardless of confidence
- Document page preview shown alongside the field list

**Story Points:** 13
**Owner:** Eng-5

---

**US-702**
> As a user, I want fields that EasePaste couldn't confidently fill to be clearly flagged so that I know exactly what needs my attention.

**Acceptance Criteria:**
- Fields with `requires_review: true` displayed with a visual warning indicator (yellow badge)
- These fields are empty by default — no guess pre-populated
- User must explicitly fill or skip each flagged field before finalize is enabled
- Count of remaining required fields shown in a progress indicator
- "Finalize" button disabled until all flagged fields are addressed

**Story Points:** 8
**Owner:** Eng-5

---

**US-703**
> As a user, I want to finalize the document from the review screen so that my confirmed values are written into the output file.

**Acceptance Criteria:**
- "Finalize" button calls `PUT /api/documents/:id/review` then `POST /api/documents/:id/finalize`
- Loading state shown during rendering (typically < 30s)
- On completion, user lands on a download page with a prominent download button
- Error during render surfaces a friendly message with retry option
- Once finalized, the review cannot be re-opened (immutable output)

**Story Points:** 5
**Owner:** Eng-5 + Eng-3

---

### E8 — Security & Compliance

---

**US-801**
> As a user, I want all my data protected in transit so that it cannot be intercepted.

**Acceptance Criteria:**
- TLS 1.3 enforced on all endpoints; TLS 1.2 rejected
- HSTS header set with `max-age=31536000; includeSubDomains`
- Certificate auto-renewed via Let's Encrypt or AWS ACM
- All internal service-to-service communication uses TLS

**Story Points:** 3
**Owner:** Eng-6

---

**US-802**
> As a user, I want an audit log of every time my profile data was accessed so that I can verify my data was only used for my own documents.

**Acceptance Criteria:**
- Every profile read during document fill writes an audit record: `{ user_id, document_id, fields_accessed, timestamp }`
- Audit records stored in an append-only table with no delete permission for the application role
- `GET /api/profile/audit-log` returns paginated audit history for the authenticated user
- Audit records retained for 12 months

**Story Points:** 5
**Owner:** Eng-2

---

**US-803**
> As a user, I want my documents automatically deleted on schedule so that my sensitive files are not retained longer than necessary.

**Acceptance Criteria:**
- S3 lifecycle policy deletes raw uploads 24h after download event is recorded
- Processed documents deleted 7 days after creation (unless pinned)
- Deletion events logged in audit trail
- Account deletion triggers immediate async job to purge all files within 24h
- Cron job runs daily to enforce any lifecycle rules that S3 policy missed

**Story Points:** 5
**Owner:** Eng-6

---

### E9 — Frontend Application

---

**US-901**
> As a user, I want a clean onboarding flow so that I know exactly what to do when I first arrive.

**Acceptance Criteria:**
- Landing page explains the 3-step process: fill profile → upload document → download filled doc
- "Get Started" CTA leads to registration
- After registration, user is immediately prompted to complete their profile
- Profile completeness progress bar shown; user can skip and go directly to upload
- Onboarding dismissable after first document download

**Story Points:** 8
**Owner:** Eng-5

---

**US-902**
> As a user, I want a document history page so that I can access and re-download past documents.

**Acceptance Criteria:**
- `/documents` page lists all user's documents with filename, status, and creation date
- Clicking a completed document shows download button if file still within retention window
- Expired documents shown with "Expired" label and option to re-upload
- Failed documents show error reason and option to retry
- List is paginated (20 per page)

**Story Points:** 5
**Owner:** Eng-5

---

**US-903**
> As a user, I want the app to be fully responsive so that I can use it on mobile if needed.

**Acceptance Criteria:**
- All pages functional at 375px width (iPhone SE) and 768px (tablet)
- Upload uses native file picker on mobile
- Review page field list scrollable; document preview hidden on small screens
- Touch targets ≥ 44px

**Story Points:** 5
**Owner:** Eng-5

---

### E10 — Observability & Quality

---

**US-1001**
> As a developer, I need structured logging across all services so that I can debug production issues quickly.

**Acceptance Criteria:**
- All services log in JSON (using `pino` or equivalent)
- Every request logged with: `request_id`, `user_id`, `method`, `path`, `status`, `duration_ms`
- No PII (name, SSN, email) in logs — logged as `[REDACTED]`
- Logs shipped to centralized store (e.g., CloudWatch, Datadog)
- Log level configurable per environment via env var

**Story Points:** 5
**Owner:** Eng-1

---

**US-1002**
> As a developer, I need unit and integration test coverage so that regressions are caught before production.

**Acceptance Criteria:**
- Unit test coverage ≥ 80% across all backend services
- Integration tests cover all API endpoints using a real test database
- Field mapping engine has a dedicated test suite covering all synonym mappings and edge cases
- Tests run in < 3 minutes in CI
- Coverage report published as a CI artifact

**Story Points:** 8
**Owner:** Eng-1 (lead) + all engineers own coverage for their modules

---

**US-1003**
> As a developer, I need performance benchmarks validated in CI so that we catch regressions against NFR targets.

**Acceptance Criteria:**
- Benchmark test: upload + process a 10-page PDF in < 30s (p95)
- Benchmark test: download signed URL returned in < 500ms
- API response time p99 < 300ms measured under 100 concurrent users
- Benchmarks run in a dedicated staging environment weekly
- Failure alerts sent to team Slack channel

**Story Points:** 5
**Owner:** Eng-6

---

## Acceptance Tests (User-Facing)

These are end-to-end behavioral tests written from the user's perspective. Run against a full staging stack.

### AT-01 — Happy Path: Profile → Upload → Download

```
GIVEN a registered user with a complete profile
WHEN they upload a standard W-9 tax form PDF
THEN:
  - Processing completes within 60 seconds
  - All standard W-9 fields (name, address, SSN, tax classification) are auto-filled
  - Review page shows 0 flagged fields
  - User clicks Finalize
  - Filled PDF downloads with correct values in all fields
  - Original document layout is preserved
```

### AT-02 — Partial Profile Warning

```
GIVEN a user with profile missing employer info and SSN
WHEN they navigate to the upload page
THEN:
  - A non-blocking warning lists the missing fields
  - User can dismiss and proceed with upload
WHEN a document with an SSN field is processed
THEN:
  - SSN field is flagged as requires_review
  - User must manually enter SSN before finalizing
```

### AT-03 — Ambiguous Field Review Flow

```
GIVEN a real estate purchase agreement with an unusual field labeled "Purchaser"
WHEN the document is processed
THEN:
  - "Purchaser" field is mapped to first_name + last_name with confidence ≥ 0.75
  OR
  - "Purchaser" field is flagged for review if confidence < 0.75
WHEN user is on review page
THEN:
  - Flagged fields are visually distinct
  - User can type a value and proceed
  - Finalize button only enables after all flagged fields are addressed
```

### AT-04 — Unsupported Document Graceful Failure

```
GIVEN a user uploads a scanned image-only PDF (no text layer)
WHEN the document is processed
THEN:
  - Status is set to "failed" with error code NO_FIELDS_DETECTED
  - User sees a friendly message: "We couldn't detect any fillable fields. Try a text-based PDF."
  - Original file is not deleted
  - User is offered a link to re-upload
```

### AT-05 — Security: Cross-User Access Denied

```
GIVEN User A has document ID "doc-123"
WHEN User B (different authenticated user) requests GET /api/documents/doc-123
THEN:
  - Response is 403 Forbidden
  - No document data is returned
  - Access attempt is logged in audit trail
```

### AT-06 — Account Deletion Data Purge

```
GIVEN a user with a complete profile and 3 completed documents
WHEN they delete their account
THEN:
  - Login with the same credentials returns 401 immediately
  - GET /api/profile returns 401 (token invalidated)
  - Within 24 hours, all S3 objects under users/{user_id}/ are deleted
  - No rows remain in users, profiles, or documents tables for that user_id
```

### AT-07 — DOCX Contract Fill

```
GIVEN a user uploads a job offer letter DOCX with fields: Full Name, Start Date, Job Title, Salary
WHEN the document is processed
THEN:
  - Full Name maps to first_name + last_name (concatenated)
  - Job Title maps to job_title from profile
  - Start Date is flagged for review (not in profile)
  - Salary is flagged for review (not in profile)
WHEN user fills Start Date and Salary and finalizes
THEN:
  - Downloaded DOCX has all 4 fields filled
  - Document opens in Word without corruption or formatting loss
```

---

## Sprint Backlog

### Sprint 1 — Foundation (Weeks 1–2)
**Goal:** Dev environment running, CI/CD wired, database schema live, core auth working

| Story | Points | Owner |
|-------|--------|-------|
| US-101 Docker Compose dev environment | 5 | Eng-6 |
| US-102 GitHub Actions CI/CD pipelines | 8 | Eng-6 |
| US-103 Database schema + migrations | 5 | Eng-1 |
| US-104 S3 bucket setup + lifecycle policies | 5 | Eng-6 |
| US-201 User registration | 5 | Eng-2 |
| US-202 Login + JWT (access + refresh) | 8 | Eng-2 |
| US-1001 Structured logging baseline | 5 | Eng-1 |
| **Sprint Total** | **41** | |

**Sprint 1 Exit Criteria:**
- `docker compose up` starts all services cleanly
- User can register, login, and call an authenticated endpoint
- All CI checks pass on a sample PR

---

### Sprint 2 — Profile & Upload Entry Point (Weeks 3–4)
**Goal:** Users can build a complete profile and upload documents into the pipeline

| Story | Points | Owner |
|-------|--------|-------|
| US-203 Google OAuth2 login | 8 | Eng-2 |
| US-301 Profile CRUD API | 8 | Eng-2 |
| US-302 SSN/Tax ID encryption at rest | 8 | Eng-2 + Eng-6 |
| US-303 Profile completeness score | 3 | Eng-2 |
| US-401 Document upload endpoint + storage | 8 | Eng-3 |
| US-404 BullMQ job queue + retry logic | 5 | Eng-3 |
| US-901 Onboarding + profile UI (frontend) | 8 | Eng-5 |
| **Sprint Total** | **48** | |

**Sprint 2 Exit Criteria:**
- User can complete a profile with PII fields encrypted
- User can upload a document and receive a `202 processing` response
- Job is enqueued and visible in BullMQ dashboard

---

### Sprint 3 — Parsing & Field Detection (Weeks 5–6)
**Goal:** Documents are parsed and all fields detected and normalized

| Story | Points | Owner |
|-------|--------|-------|
| US-402 Virus scan integration | 5 | Eng-3 + Eng-6 |
| US-403 Document status polling + UI | 5 | Eng-3 + Eng-5 |
| US-501 PDF field detection (AcroForm + heuristics) | 13 | Eng-4 |
| US-502 DOCX field detection | 8 | Eng-4 |
| US-801 TLS 1.3 + HSTS enforcement | 3 | Eng-6 |
| US-802 Audit log for profile reads | 5 | Eng-2 |
| US-1002 Test coverage baseline (≥80%) | 8 | Eng-1 + all |
| **Sprint Total** | **47** | |

**Sprint 3 Exit Criteria:**
- PDF and DOCX documents produce normalized `DetectedField[]` lists
- W-9 and a real estate PDF correctly detect all fields in manual test
- Virus scan rejects a test EICAR file

---

### Sprint 4 — Field Mapping Engine (Weeks 7–8)
**Goal:** Detected fields are mapped to profile keys with confidence scores; LLM fallback live

| Story | Points | Owner |
|-------|--------|-------|
| US-503 Synonym dictionary mapping | 8 | Eng-4 |
| US-504 Contextual/positional inference | 8 | Eng-4 |
| US-505 LLM-assisted fallback (Claude API) | 8 | Eng-4 |
| US-204 Account deletion + data purge | 5 | Eng-2 |
| US-803 Automated document retention/deletion | 5 | Eng-6 |
| US-902 Document history page | 5 | Eng-5 |
| US-1003 Performance benchmarks in CI | 5 | Eng-6 |
| **Sprint Total** | **44** | |

**Sprint 4 Exit Criteria:**
- Standard W-9 mapped with ≥ 95% field accuracy (all fields hit synonym or AcroForm match)
- Unrecognized field falls back to LLM and returns a confidence score
- LLM unavailability does not fail the job

---

### Sprint 5 — Rendering, Review UI & Output (Weeks 9–10)
**Goal:** Filled documents generated, review flow complete, download working

| Story | Points | Owner |
|-------|--------|-------|
| US-601 PDF rendering (AcroForm + overlay) | 13 | Eng-3 |
| US-602 DOCX rendering (content controls) | 8 | Eng-3 |
| US-603 Signed download URL | 3 | Eng-3 + Eng-5 |
| US-701 Review page — field list + preview | 13 | Eng-5 |
| US-702 Flagged field highlighting + required fill | 8 | Eng-5 |
| US-703 Finalize flow | 5 | Eng-5 + Eng-3 |
| **Sprint Total** | **50** | |

**Sprint 5 Exit Criteria:**
- End-to-end happy path works: upload W-9 → review → finalize → download filled PDF
- Flagged fields block finalize until addressed
- DOCX opens in Word without errors after fill

---

### Sprint 6 — Hardening, Polish & Launch (Weeks 11–12)
**Goal:** Security hardened, mobile responsive, all acceptance tests passing, production deploy

| Story | Points | Owner |
|-------|--------|-------|
| US-903 Mobile responsiveness | 5 | Eng-5 |
| AT-01 through AT-07 — full acceptance test pass | 13 | Eng-1 + Eng-5 |
| Security penetration test + remediation | 8 | Eng-6 + Eng-1 |
| Production infra: Kubernetes, multi-AZ DB, CDN | 8 | Eng-6 |
| Load testing: 1,000 concurrent jobs | 5 | Eng-6 |
| Bug bash + polish pass | 8 | All |
| Production deploy + smoke tests | 3 | Eng-6 + Eng-1 |
| **Sprint Total** | **50** | |

**Sprint 6 Exit Criteria:**
- All 7 acceptance tests pass on staging
- Load test confirms 1,000 concurrent jobs without queue saturation
- Zero P0/P1 security findings open
- Production deployment live and smoke-tested

---

## Velocity & Capacity Summary

| Sprint | Points | Focus |
|--------|--------|-------|
| 1 | 41 | Foundation, CI/CD, Auth |
| 2 | 48 | Profile, Upload, Onboarding |
| 3 | 47 | Parsing, Field Detection, Security baseline |
| 4 | 44 | Field Mapping Engine, LLM, Data retention |
| 5 | 50 | Rendering, Review UI, Download |
| 6 | 50 | Hardening, Polish, Launch |
| **Total** | **280** | **12 weeks** |

> Backlog is deliberately under-loaded vs. max velocity (~60 SP/sprint) to preserve capacity for code review, architecture discussions, incident response, and unplanned complexity — especially in the parsing and rendering modules which carry the highest technical risk.
