# RabbitMQ Adapter (`@testurio/adapter-rabbitmq`)

**Location:** `packages/adapter-rabbitmq/`

Provides RabbitMQ integration for Testurio via `Publisher` and `Subscriber` components.

## Usage

```typescript
import { RabbitMQAdapter } from '@testurio/adapter-rabbitmq';

const pub = new Publisher('rmq-pub', {
  adapter: new RabbitMQAdapter({
    url: 'amqp://localhost:5672',
    exchange: 'test-exchange',
    exchangeType: 'topic',
  }),
  codec: new JsonCodec(),
});

const sub = new Subscriber('rmq-sub', {
  adapter: new RabbitMQAdapter({
    url: 'amqp://localhost:5672',
    exchange: 'test-exchange',
    exchangeType: 'topic',
  }),
  codec: new JsonCodec(),
  topics: ['user.#'],  // Pattern matching supported
});
```

## Configuration

| Option | Type | Description |
|--------|------|-------------|
| `url` | `string` | AMQP connection URL |
| `exchange` | `string` | Exchange name |
| `exchangeType` | `string` | Exchange type (`direct`, `topic`, `fanout`, `headers`) |

## Features

- Exchange-based routing
- Topic pattern matching (e.g., `user.#`, `order.*`)
- Direct, topic, fanout, and headers exchange types
- Auto-generated queue names for subscribers

## Testing

Integration tests use RabbitMQ via testcontainers. See [testing/testcontainers.md](../testing/testcontainers.md).

## Dependencies

- `amqplib` - AMQP client
