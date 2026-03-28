CREATE TYPE document_status AS ENUM (
  'uploaded',
  'processing',
  'review',
  'completed',
  'failed'
);

CREATE TYPE file_type AS ENUM (
  'pdf',
  'docx'
);

CREATE TABLE documents (
  id                       UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_filename        TEXT            NOT NULL,
  storage_key              TEXT            NOT NULL,
  file_type                file_type       NOT NULL,
  file_size_bytes          BIGINT          NOT NULL,
  status                   document_status NOT NULL DEFAULT 'uploaded',
  error_message            TEXT,
  page_count               INTEGER,
  processing_started_at    TIMESTAMPTZ,
  processing_completed_at  TIMESTAMPTZ,
  created_at               TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ     NOT NULL DEFAULT now(),
  deleted_at               TIMESTAMPTZ
);

CREATE INDEX documents_user_id_idx        ON documents (user_id)  WHERE deleted_at IS NULL;
CREATE INDEX documents_status_idx         ON documents (status)   WHERE deleted_at IS NULL;
CREATE INDEX documents_user_status_idx    ON documents (user_id, status) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX documents_storage_key_idx ON documents (storage_key);

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
