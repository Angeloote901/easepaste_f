import type { Pool } from 'pg'
import type { User, RefreshToken } from '../../../shared/types/domain'

export const authRepository = {
  async findUserByEmail(db: Pool, email: string): Promise<User | null> {
    const result = await db.query<User>(
      `SELECT id, email, password_hash, google_id, created_at, updated_at, deleted_at
       FROM users
       WHERE lower(email) = lower($1)
         AND deleted_at IS NULL
       LIMIT 1`,
      [email],
    )
    return result.rows[0] ?? null
  },

  async findUserById(db: Pool, id: string): Promise<User | null> {
    const result = await db.query<User>(
      `SELECT id, email, password_hash, google_id, created_at, updated_at, deleted_at
       FROM users
       WHERE id = $1
         AND deleted_at IS NULL
       LIMIT 1`,
      [id],
    )
    return result.rows[0] ?? null
  },

  async createUser(db: Pool, email: string, passwordHash: string): Promise<User> {
    const result = await db.query<User>(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, password_hash, google_id, created_at, updated_at, deleted_at`,
      [email, passwordHash],
    )
    const user = result.rows[0]
    if (!user) {
      throw new Error('Failed to create user — no row returned')
    }
    return user
  },

  async createRefreshToken(
    db: Pool,
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt],
    )
  },

  async findRefreshTokenByHash(db: Pool, tokenHash: string): Promise<RefreshToken | null> {
    const result = await db.query<RefreshToken>(
      `SELECT id, user_id, token_hash, expires_at, created_at
       FROM refresh_tokens
       WHERE token_hash = $1
         AND expires_at > now()
       LIMIT 1`,
      [tokenHash],
    )
    return result.rows[0] ?? null
  },

  async deleteRefreshToken(db: Pool, tokenHash: string): Promise<void> {
    await db.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash])
  },

  async deleteAllRefreshTokensForUser(db: Pool, userId: string): Promise<void> {
    await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId])
  },

  async recordLoginAttempt(
    db: Pool,
    email: string,
    success: boolean,
    ipAddress?: string,
  ): Promise<void> {
    await db.query(
      `INSERT INTO login_attempts (email, ip_address, success)
       VALUES ($1, $2, $3)`,
      [email, ipAddress ?? null, success],
    )
  },
}
