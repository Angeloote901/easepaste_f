import * as fs from 'fs'
import * as path from 'path'
import { Client } from 'pg'

// ─── Types ───────────────────────────────────────────────────────────────────

interface MigrationFile {
  version: string
  name: string
  upFile: string
  downFile: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMigrationsDir(): string {
  return path.resolve(__dirname)
}

/**
 * Scan the migrations directory and return an ordered list of migration
 * descriptors.  Only forward-migration files (NNN_name.sql, NOT _down.sql)
 * are returned.
 */
function discoverMigrations(): MigrationFile[] {
  const dir = getMigrationsDir()
  const files = fs.readdirSync(dir).filter((f) => {
    return f.endsWith('.sql') && !f.endsWith('_down.sql') && /^\d{3}_/.test(f)
  })

  files.sort()

  return files.map((f) => {
    const base = f.replace(/\.sql$/, '')
    const version = base.match(/^(\d{3})/)?.[1] ?? base
    return {
      version,
      name: base,
      upFile: path.join(dir, f),
      downFile: path.join(dir, `${base}_down.sql`),
    }
  })
}

async function ensureMigrationsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
}

async function getAppliedVersions(client: Client): Promise<Set<string>> {
  const result = await client.query<{ version: string }>(
    'SELECT version FROM schema_migrations ORDER BY version',
  )
  return new Set(result.rows.map((r) => r.version))
}

// ─── Migration runners ───────────────────────────────────────────────────────

async function runUp(client: Client, migrations: MigrationFile[]): Promise<void> {
  const applied = await getAppliedVersions(client)
  const pending = migrations.filter((m) => !applied.has(m.version))

  if (pending.length === 0) {
    // eslint-disable-next-line no-console
    console.log('Nothing to migrate — all migrations already applied.')
    return
  }

  for (const migration of pending) {
    // eslint-disable-next-line no-console
    console.log(`Applying migration ${migration.version}: ${migration.name}`)

    const sql = fs.readFileSync(migration.upFile, 'utf-8')

    await client.query('BEGIN')
    try {
      await client.query(sql)
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1)',
        [migration.version],
      )
      await client.query('COMMIT')
      // eslint-disable-next-line no-console
      console.log(`  ✓ Applied ${migration.name}`)
    } catch (err) {
      await client.query('ROLLBACK')
      // eslint-disable-next-line no-console
      console.error(`  ✗ Failed to apply ${migration.name}:`, err)
      throw err
    }
  }
}

async function runDown(client: Client, migrations: MigrationFile[]): Promise<void> {
  const applied = await getAppliedVersions(client)
  const toRevert = migrations
    .filter((m) => applied.has(m.version))
    .reverse() // reverse order for down migrations

  if (toRevert.length === 0) {
    // eslint-disable-next-line no-console
    console.log('Nothing to revert — no migrations currently applied.')
    return
  }

  // Only revert the most recent migration
  const migration = toRevert[0]
  if (!migration) return

  if (!fs.existsSync(migration.downFile)) {
    throw new Error(`Down migration file not found: ${migration.downFile}`)
  }

  // eslint-disable-next-line no-console
  console.log(`Reverting migration ${migration.version}: ${migration.name}`)

  const sql = fs.readFileSync(migration.downFile, 'utf-8')

  await client.query('BEGIN')
  try {
    await client.query(sql)
    await client.query('DELETE FROM schema_migrations WHERE version = $1', [migration.version])
    await client.query('COMMIT')
    // eslint-disable-next-line no-console
    console.log(`  ✓ Reverted ${migration.name}`)
  } catch (err) {
    await client.query('ROLLBACK')
    // eslint-disable-next-line no-console
    console.error(`  ✗ Failed to revert ${migration.name}:`, err)
    throw err
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function runMigrations(direction: 'up' | 'down' = 'up'): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL']
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set')
  }

  const client = new Client({ connectionString: databaseUrl })
  await client.connect()

  try {
    await ensureMigrationsTable(client)
    const migrations = discoverMigrations()

    // eslint-disable-next-line no-console
    console.log(`Found ${migrations.length} migration file(s). Direction: ${direction}`)

    if (direction === 'up') {
      await runUp(client, migrations)
    } else {
      await runDown(client, migrations)
    }

    // eslint-disable-next-line no-console
    console.log('Migrations complete.')
  } finally {
    await client.end()
  }
}

// ─── CLI entrypoint ───────────────────────────────────────────────────────────

// Run when invoked directly via ts-node / node
if (require.main === module) {
  const direction = (process.argv[2] as 'up' | 'down' | undefined) ?? 'up'
  runMigrations(direction)
    .then(() => process.exit(0))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err)
      process.exit(1)
    })
}
