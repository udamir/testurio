# DataSource Examples

Practical examples for testing with database and cache integrations.

## Overview

Testurio supports four DataSource adapters:

| Adapter    | Package                        | Client Type                                           |
| ---------- | ------------------------------ | ----------------------------------------------------- |
| Redis      | `@testurio/adapter-redis`      | ioredis `Redis`                                       |
| PostgreSQL | `@testurio/adapter-pg`         | pg `Pool`                                             |
| MongoDB    | `@testurio/adapter-mongo`      | mongodb `Db`                                          |
| ClickHouse | `@testurio/adapter-clickhouse` | `ClickHouseClientWrapper` (over `@clickhouse/client`) |

## Redis DataSource

```typescript
import { DataSource, TestScenario, testCase } from 'testurio';
import { RedisAdapter } from '@testurio/adapter-redis';

const cache = new DataSource('cache', {
  adapter: new RedisAdapter({
    host: 'localhost',
    port: 6379,
  }),
});

const scenario = new TestScenario({
  name: 'Redis Tests',
  components: [cache],
});

const tc = testCase('Cache operations', (test) => {
  const redis = test.use(cache);

  redis.exec('set value', async (client) => {
    await client.set('user:1', JSON.stringify({ id: 1, name: 'Alice' }));
  });

  redis
    .exec('get value', async (client) => client.get('user:1'))
    .assert('value exists', (result) => result !== null);
});
```

## PostgreSQL DataSource

```typescript
import { DataSource, TestScenario, testCase } from 'testurio';
import { PgAdapter } from '@testurio/adapter-pg';

const db = new DataSource('postgres', {
  adapter: new PgAdapter({
    host: 'localhost',
    port: 5432,
    database: 'testdb',
    user: 'postgres',
    password: 'password',
  }),
});

const scenario = new TestScenario({
  name: 'PostgreSQL Tests',
  components: [db],
});

const tc = testCase('Database operations', (test) => {
  const pg = test.use(db);

  pg.exec('create table', async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);
  });

  pg.exec('seed data', async (client) => {
    await client.query('INSERT INTO users (name) VALUES ($1)', ['Alice']);
  });

  pg.exec('verify', async (client) => {
    const result = await client.query('SELECT * FROM users WHERE name = $1', ['Alice']);
    return result.rows;
  }).assert('user exists', (rows) => rows.length === 1);
});
```

## MongoDB DataSource

```typescript
import { DataSource, TestScenario, testCase } from 'testurio';
import { MongoAdapter } from '@testurio/adapter-mongo';

const db = new DataSource('mongodb', {
  adapter: new MongoAdapter({
    url: 'mongodb://localhost:27017',
    database: 'testdb',
  }),
});

const scenario = new TestScenario({
  name: 'MongoDB Tests',
  components: [db],
});

const tc = testCase('Collection operations', (test) => {
  const mongo = test.use(db);

  mongo.exec('seed data', async (client) => {
    await client.collection('users').insertOne({ name: 'Alice', age: 30 });
  });

  mongo.exec('verify', async (client) => {
    return client.collection('users').findOne({ name: 'Alice' });
  }).assert('user exists', (user) => user !== null);
});
```

## ClickHouse DataSource

```typescript
import { DataSource, TestScenario, testCase } from 'testurio';
import { ClickHouseAdapter } from '@testurio/adapter-clickhouse';

const ch = new DataSource('clickhouse', {
  adapter: new ClickHouseAdapter({
    url: 'http://localhost:8123',
    username: 'default',
    password: '',
    database: 'default',
  }),
});

const scenario = new TestScenario({
  name: 'ClickHouse Tests',
  components: [ch],
});

const tc = testCase('DDL → insert → count', (test) => {
  const store = test.use(ch);

  store.exec('create table', async (db) => {
    await db.command({
      query: `CREATE TABLE events (id UInt32, name String) ENGINE = MergeTree() ORDER BY id`,
    });
  });

  store.exec('insert rows', async (db) => {
    await db.insert<{ id: number; name: string }>({
      table: 'events',
      values: [
        { id: 1, name: 'login' },
        { id: 2, name: 'logout' },
      ],
    });
  });

  store
    .exec('count', async (db) => {
      const rows = await db.query<{ c: string }>({
        query: 'SELECT count() AS c FROM events',
      });
      return Number(rows[0].c);
    })
    .assert('two events', (n) => n === 2);

  store.exec('cleanup', async (db) => {
    await db.command({ query: 'DROP TABLE events' });
  });
});
```

## Combined: DataSource + HTTP API

A common pattern is testing an API that reads from or writes to a database:

```typescript
import { Client, DataSource, HttpProtocol, Server, TestScenario, testCase } from 'testurio';
import { RedisAdapter } from '@testurio/adapter-redis';

interface UserApi {
  getUser: {
    request: { method: 'GET'; path: '/users/1' };
    response: { code: 200; body: { id: number; name: string } };
  };
}

const cache = new DataSource('cache', {
  adapter: new RedisAdapter({ host: 'localhost', port: 6379 }),
});

const server = new Server('backend', {
  protocol: new HttpProtocol<UserApi>(),
  listenAddress: { host: 'localhost', port: 4000 },
});

const client = new Client('api', {
  protocol: new HttpProtocol<UserApi>(),
  targetAddress: { host: 'localhost', port: 4000 },
});

const scenario = new TestScenario({
  name: 'Cache + API',
  components: [cache, server, client],
});

const tc = testCase('Populate cache then verify API', (test) => {
  const redis = test.use(cache);
  const api = test.use(client);
  const mock = test.use(server);

  // Step 1: Populate cache
  redis.exec('setup cache', async (client) => {
    await client.set('user:1', JSON.stringify({ id: 1, name: 'Alice' }));
  });

  // Step 2: Make API request
  api.request('getUser', { method: 'GET', path: '/users/1' });

  mock.onRequest('getUser').mockResponse(() => ({
    code: 200,
    body: { id: 1, name: 'Alice' },
  }));

  api.onResponse('getUser').assert((res) => res.body.name === 'Alice');

  // Step 3: Verify cache still holds data
  redis
    .exec('verify cache', async (client) => client.get('user:1'))
    .assert('cached', (result) => result !== null);
});
```

## Chained Assertions

```typescript
const tc = testCase('Chained assertions', (test) => {
  const redis = test.use(cache);

  redis.exec(async (client) => {
    await client.set('counter', '0');
    await client.set('user:test', JSON.stringify({ id: 99, name: 'Test User' }));
  });

  redis
    .exec('get counter', async (client) => client.get('counter'))
    .assert('counter is zero', (result) => result === '0');

  redis
    .exec('get user', async (client) => {
      const raw = await client.get('user:test');
      return raw ? JSON.parse(raw) : null;
    })
    .assert('user exists', (result) => result !== null)
    .assert('correct id', (result) => result.id === 99)
    .assert('correct name', (result) => result.name === 'Test User');
});
```

## Timeout

```typescript
const tc = testCase('With timeout', (test) => {
  const redis = test.use(cache);

  redis.exec(
    'fast operation',
    async (client) => {
      await client.set('key', 'value');
      return client.get('key');
    },
  ).timeout(1000);
});
```

## Polling for Convergence

Use `.retry(predicate)` on a `.exec(...)` step to poll the data store until it converges to the expected state — wait for a row to appear, for a job status to flip, for a queue to drain. See the [Polling & Retry guide](/guide/polling-and-retry) for full semantics.

### Wait for row to appear (defaults)

The polling step starts immediately. A sibling exec step schedules an insert via `setTimeout` so the row only lands part-way through the loop:

```typescript
import { ClickHouseAdapter } from '@testurio/adapter-clickhouse';
import { DataSource, TestScenario, testCase } from 'testurio';

const db = new DataSource('clickhouse', {
  adapter: new ClickHouseAdapter({ url: 'http://localhost:8123' }),
});

const scenario = new TestScenario({
  name: 'Wait for row',
  components: [db],
});

const tc = testCase('Wait for row to appear', (test) => {
  const store = test.use(db);

  store.exec('setup', async (wrapper) => {
    await wrapper.command({
      query: 'CREATE TABLE events (id UInt32) ENGINE = MergeTree() ORDER BY id',
    });
  });

  // The exec callback returns immediately; the setTimeout fires later.
  store.exec('schedule insert', async (wrapper) => {
    setTimeout(() => {
      void wrapper.insert({ table: 'events', values: [{ id: 1 }] });
    }, 1500);
  });

  // Poll until at least one row exists. Defaults: timeout 5s, interval 1s.
  store
    .exec('wait for row', async (wrapper) => {
      const rows = await wrapper.query<{ c: string }>({
        query: 'SELECT count() AS c FROM events',
      });
      return Number(rows[0].c);
    })
    .retry((n) => n === 0)
    .assert('row exists', (n) => n > 0);
});
```

### Step-level timeout caps the retry loop

`.timeout(ms)` is a **step-level wall-clock deadline**. When `.retry(...)` is set, it caps the entire polling loop — when the deadline fires, retry is terminated and the step fails with `TimeoutError` (distinct from `RetryTimeoutError`, which means the retry budget elapsed naturally between attempts).

```typescript
const tc = testCase('Step-level timeout', (test) => {
  const store = test.use(db);

  store
    .exec('poll empty', async (wrapper) => {
      const rows = await wrapper.query<{ c: string }>({
        query: 'SELECT count() AS c FROM events',
      });
      return Number(rows[0].c);
    })
    .timeout(1500)                                              // step-level deadline (caps the whole loop)
    .retry((n) => n === 0, { interval: 200 });                  // poll forever until cap fires
});
```

The step fails with a `TimeoutError` after ~1500 ms. When `.timeout(ms)` and `.retry({ timeout })` are both set, whichever elapses first wins.

::: warning In-flight call is abandoned
The SDK call running when the deadline fires is abandoned, not cancelled — the framework stops awaiting but the underlying query may still complete on the server. Cooperative cancellation via `AbortSignal` is planned in a follow-up release.
:::
