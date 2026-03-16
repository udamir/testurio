# @testurio/adapter-pg

PostgreSQL integration for Testurio via the `DataSource` component.

```bash
npm install @testurio/adapter-pg pg --save-dev
```

**Peer dependency:** `pg`

## PgAdapter

```typescript
import { DataSource } from 'testurio';
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
```

### Constructor Options

| Option | Type | Description |
|--------|------|-------------|
| `host` | `string` | PostgreSQL host |
| `port` | `number` | PostgreSQL port |
| `database` | `string` | Database name |
| `user` | `string` | Database user |
| `password` | `string` | Database password |

### Usage in Tests

The adapter exposes the `pg` `Pool` client:

```typescript
const tc = testCase('pg test', (test) => {
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
    return result.rows;
  }).assert('user should exist', (rows) => rows.length === 1);
});
```

### Features

- Direct access to `pg.Pool` client
- Parameterized queries
- Connection lifecycle managed by `TestScenario`
