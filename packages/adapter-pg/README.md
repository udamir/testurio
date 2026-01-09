# @testurio/adapter-pg

PostgreSQL adapter for [Testurio](https://github.com/udamir/testurio) DataSource.

## Installation

```bash
npm install @testurio/adapter-pg
```

## Usage

```typescript
import { TestScenario, testCase, DataSource } from 'testurio';
import { PostgresAdapter } from '@testurio/adapter-pg';

const db = new DataSource('database', {
  adapter: new PostgresAdapter({
    host: 'localhost',
    port: 5432,
    database: 'testdb',
    user: 'postgres',
    password: 'secret',
  }),
});

const scenario = new TestScenario({
  name: 'Database Test',
  components: [db],
});

const tc = testCase('should query users', (test) => {
  const postgres = test.use(db);

  // Setup test data
  postgres.exec('insert user', async (pool) => {
    await pool.query('INSERT INTO users (name, email) VALUES ($1, $2)', ['John', 'john@example.com']);
  });

  // Query and assert
  postgres.exec('get user', async (pool) => {
    const result = await pool.query('SELECT * FROM users WHERE name = $1', ['John']);
    return result.rows[0];
  }).assert('user should exist', (user) => user.email === 'john@example.com');

  // Cleanup
  postgres.exec('cleanup', async (pool) => {
    await pool.query('DELETE FROM users WHERE name = $1', ['John']);
  });
});
```

## Configuration

```typescript
const adapter = new PostgresAdapter({
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'postgres',
  password: 'secret',
  max: 10, // max pool size
});
```

## Client Type

The `exec` callback receives a `pg` `Pool` instance.

## License

MIT
