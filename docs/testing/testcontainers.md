# Testcontainers

Integration tests for external dependencies (databases, message brokers) use [testcontainers](https://node.testcontainers.org/) to run real services in Docker.

## Container Utilities

Located in `tests/containers/`:

| File                    | Service          | Image                          |
| ----------------------- | ---------------- | ------------------------------ |
| `redis.container.ts`    | Redis            | `redis:7-alpine`               |
| `kafka.container.ts`    | Kafka (Redpanda) | `redpandadata/redpanda`        |
| `rabbitmq.container.ts` | RabbitMQ         | `rabbitmq:3-management-alpine` |
| `postgres.container.ts` | PostgreSQL       | `postgres:16-alpine`           |
| `mongodb.container.ts`  | MongoDB          | `mongo:7`                      |

## Usage Pattern

Each container utility exports a setup function that starts the container and returns connection details:

```typescript
import { setupRedisContainer } from '../containers/redis.container';

describe('Redis Integration', () => {
  let container: StartedTestContainer;
  let connectionUrl: string;

  beforeAll(async () => {
    const result = await setupRedisContainer();
    container = result.container;
    connectionUrl = result.url;
  }, 60_000);

  afterAll(async () => {
    await container?.stop();
  });

  it('should connect and operate', async () => {
    const adapter = new RedisAdapter({ url: connectionUrl });
    // ... test logic
  });
});
```

## Key Considerations

### Dynamic Ports

Containers bind to random available ports. Always use the port returned by the container, not a hardcoded value:

```typescript
const port = container.getMappedPort(6379);
const url = `redis://localhost:${port}`;
```

### IPv4 Binding

Some containers need explicit IPv4 binding to avoid IPv6 issues:

```typescript
const container = await new GenericContainer('redis:7-alpine')
  .withExposedPorts(6379)
  .withStartupTimeout(30_000)
  .start();
```

### Timeout

Container startup can be slow. Set generous timeouts on `beforeAll`:

```typescript
beforeAll(async () => {
  // 60 second timeout for container startup
}, 60_000);
```

### Kafka / Redpanda

Kafka tests use Redpanda (Kafka API compatible) for faster startup:

```typescript
const container = await new GenericContainer('redpandadata/redpanda:latest')
  .withExposedPorts(9092)
  .withCommand([
    'redpanda', 'start',
    '--smp', '1',
    '--memory', '256M',
    '--overprovisioned',
    '--kafka-addr', 'PLAINTEXT://0.0.0.0:9092',
  ])
  .start();
```

Consumer group timing requires a small delay after subscribing for the consumer group to stabilize before publishing messages.

### RabbitMQ

RabbitMQ needs time for the management plugin to initialize. The container utility waits for the health check endpoint.

Pattern matching tests verify topic, direct, fanout, and headers exchange types.

## Running Tests

```bash
# Run all integration tests (requires Docker)
pnpm test

# Run specific adapter tests
vitest tests/integration/kafka-pubsub.integration.test.ts
vitest tests/integration/redis-datasource.integration.test.ts
```

Docker must be running for integration tests to pass. Tests that require containers are skipped if Docker is unavailable.
