# @testurio/adapter-redis

Redis integration for Testurio providing both DataSource (direct SDK access) and Pub/Sub (message queue) modes.

```bash
npm install @testurio/adapter-redis ioredis --save-dev
```

**Peer dependency:** `ioredis`

## RedisAdapter

### DataSource Mode

Direct access to Redis commands via the `DataSource` component. The adapter exposes the `ioredis` `Redis` client.

```typescript
import { DataSource } from 'testurio';
import { RedisAdapter } from '@testurio/adapter-redis';

const redis = new DataSource('cache', {
  adapter: new RedisAdapter({ url: 'redis://localhost:6379' }),
});
```

#### Usage in Tests

```typescript
const tc = testCase('cache test', (test) => {
  const cache = test.use(redis);

  cache.exec('seed data', async (client) => {
    // client is an ioredis Redis instance
    await client.set('user:1', JSON.stringify({ name: 'Alice' }));
  });

  cache.exec('verify', async (client) => client.get('user:1'))
    .assert('should be cached', (data) => data !== null);
});
```

### Pub/Sub Mode

Message publishing and subscribing via `Publisher` and `Subscriber` components.

```typescript
import { Publisher, Subscriber } from 'testurio';
import { RedisAdapter } from '@testurio/adapter-redis';

const pub = new Publisher('redis-pub', {
  adapter: new RedisAdapter({ url: 'redis://localhost:6379' }),
});

const sub = new Subscriber('redis-sub', {
  adapter: new RedisAdapter({ url: 'redis://localhost:6379' }),
});
```

### Constructor Options

| Option | Type | Description |
|--------|------|-------------|
| `url` | `string` | Redis connection URL (e.g., `redis://localhost:6379`) |
| `host` | `string` | Redis host (alternative to `url`) |
| `port` | `number` | Redis port (alternative to `url`) |
