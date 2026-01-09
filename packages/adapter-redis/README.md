# @testurio/adapter-redis

Redis adapter for [Testurio](https://github.com/udamir/testurio) DataSource.

## Installation

```bash
npm install @testurio/adapter-redis
```

## Usage

```typescript
import { TestScenario, testCase, DataSource, Client, Server, HttpProtocol } from 'testurio';
import { RedisAdapter } from '@testurio/adapter-redis';

const cache = new DataSource('cache', {
  adapter: new RedisAdapter({ host: 'localhost', port: 6379 }),
});

const server = new Server('backend', {
  protocol: new HttpProtocol(),
  listenAddress: { host: 'localhost', port: 3000 },
});

const client = new Client('api', {
  protocol: new HttpProtocol(),
  targetAddress: { host: 'localhost', port: 3000 },
});

const scenario = new TestScenario({
  name: 'Cache Integration Test',
  components: [cache, server, client],
});

const tc = testCase('should use cached data', (test) => {
  const redis = test.use(cache);
  const api = test.use(client);
  const mock = test.use(server);

  // Setup cache
  redis.exec('populate cache', async (client) => {
    await client.set('user:123', JSON.stringify({ id: 123, name: 'John' }));
  });

  // API request
  api.request('getUser', { method: 'GET', path: '/users/123' });
  mock.onRequest('getUser').mockResponse(() => ({
    code: 200,
    body: { id: 123, name: 'John' },
  }));

  // Verify cache
  redis.exec('verify cache', async (client) => client.get('user:123'))
    .assert('user should be cached', (data) => data !== null);
});
```

## Configuration

```typescript
const adapter = new RedisAdapter({
  host: 'localhost',
  port: 6379,
  password: 'secret',
  db: 0,
});
```

## Client Type

The `exec` callback receives an `ioredis` `Redis` client instance.

## License

MIT
