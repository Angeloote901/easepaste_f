// ─── Users ───────────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  password_hash: string
  google_id: string | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

// ─── Profiles ────────────────────────────────────────────────────────────────

export interface Profile {
  id: string
  user_id: string
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  phone: string | null
  company: string | null
  job_title: string | null
  website: string | null
  timezone: string
  locale: string
  created_at: Date
  updated_at: Date
}

// ─── Documents ───────────────────────────────────────────────────────────────

export enum DocumentStatus {
  UPLOADED = 'uploaded',
  PROCESSING = 'processing',
  REVIEW = 'review',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum FileType {
  PDF = 'pdf',
  DOCX = 'docx',
}

export interface Document {
  id: string
  user_id: string
  original_filename: string
  storage_key: string
  file_type: FileType
  file_size_bytes: number
  status: DocumentStatus
  error_message: string | null
  page_count: number | null
  processing_started_at: Date | null
  processing_completed_at: Date | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

// ─── Refresh Tokens ───────────────────────────────────────────────────────────

export interface RefreshToken {
  id: string
  user_id: string
  token_hash: string
  expires_at: Date
  created_at: Date
}

// ─── Login Attempts ───────────────────────────────────────────────────────────

export interface LoginAttempt {
  id: string
  email: string
  ip_address: string | null
  success: boolean
  attempted_at: Date
}
