# DataSource Examples

Practical examples for testing with database and cache integrations.

## Overview

Testurio supports three DataSource adapters:

| Adapter | Package | Client Type |
|---------|---------|-------------|
| Redis | `@testurio/adapter-redis` | ioredis `Redis` |
| PostgreSQL | `@testurio/adapter-pg` | pg `Pool` |
| MongoDB | `@testurio/adapter-mongo` | mongodb `Db` |

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
