# Redis Adapter (`@testurio/adapter-redis`)

**Location:** `packages/adapter-redis/`

Provides Redis integration for Testurio in two modes: DataSource (direct SDK access) and Pub/Sub (message queue).

## DataSource Mode

Direct access to Redis commands via the `DataSource` component.

```typescript
import { RedisAdapter } from '@testurio/adapter-redis';

const redis = new DataSource('redis', {
  adapter: new RedisAdapter({ url: 'redis://localhost:6379' }),
});

// In test case:
const db = test.use(redis);
db.exec('seed data', async (client) => {
  await client.set('user:1', JSON.stringify({ name: 'Alice' }));
});
db.exec('verify', async (client) => {
  const user = await client.get('user:1');
  expect(JSON.parse(user!)).toEqual({ name: 'Alice' });
});
```

## Pub/Sub Mode

Message publishing and subscribing via `Publisher` and `Subscriber` components.

```typescript
import { RedisAdapter } from '@testurio/adapter-redis';

const pub = new Publisher('redis-pub', {
  adapter: new RedisAdapter({ url: 'redis://localhost:6379' }),
  codec: new JsonCodec(),
});

const sub = new Subscriber('redis-sub', {
  adapter: new RedisAdapter({ url: 'redis://localhost:6379' }),
  codec: new JsonCodec(),
  topics: ['events'],
});
```

## Configuration

| Option | Type | Description |
|--------|------|-------------|
| `url` | `string` | Redis connection URL |

## Dependencies

- `ioredis` - Redis client
