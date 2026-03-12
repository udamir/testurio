# PostgreSQL Adapter (`@testurio/adapter-pg`)

**Location:** `packages/adapter-pg/`

Provides PostgreSQL integration for Testurio via the `DataSource` component.

## Usage

```typescript
import { PgAdapter } from '@testurio/adapter-pg';

const pg = new DataSource('postgres', {
  adapter: new PgAdapter({
    host: 'localhost',
    port: 5432,
    database: 'testdb',
    user: 'postgres',
    password: 'password',
  }),
});

// In test case:
const db = test.use(pg);
db.exec('create table', async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL
    )
  `);
});
db.exec('seed data', async (client) => {
  await client.query('INSERT INTO users (name) VALUES ($1)', ['Alice']);
});
db.exec('verify', async (client) => {
  const result = await client.query('SELECT * FROM users WHERE name = $1', ['Alice']);
  expect(result.rows).toHaveLength(1);
});
```

## Configuration

| Option | Type | Description |
|--------|------|-------------|
| `host` | `string` | PostgreSQL host |
| `port` | `number` | PostgreSQL port |
| `database` | `string` | Database name |
| `user` | `string` | Database user |
| `password` | `string` | Database password |

## Features

- Direct access to `pg.Client` object
- Parameterized queries
- Connection lifecycle managed by `TestScenario`

## Testing

Integration tests use PostgreSQL via testcontainers. See [testing/testcontainers.md](../testing/testcontainers.md).

## Dependencies

- `pg` - PostgreSQL client
