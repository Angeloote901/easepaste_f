import { runMigrations } from '../migrations/runner'

const direction = (process.argv[2] as 'up' | 'down' | undefined) ?? 'up'

runMigrations(direction)
  .then(() => process.exit(0))
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e)
    process.exit(1)
  })
