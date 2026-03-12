# Kafka Adapter (`@testurio/adapter-kafka`)

**Location:** `packages/adapter-kafka/`

Provides Apache Kafka integration for Testurio via `Publisher` and `Subscriber` components.

## Usage

```typescript
import { KafkaAdapter } from '@testurio/adapter-kafka';

const pub = new Publisher('kafka-pub', {
  adapter: new KafkaAdapter({
    brokers: ['localhost:9092'],
    clientId: 'test-producer',
  }),
  codec: new JsonCodec(),
});

const sub = new Subscriber('kafka-sub', {
  adapter: new KafkaAdapter({
    brokers: ['localhost:9092'],
    clientId: 'test-consumer',
    groupId: 'test-group',
  }),
  codec: new JsonCodec(),
  topics: ['user-events'],
});
```

## Configuration

| Option | Type | Description |
|--------|------|-------------|
| `brokers` | `string[]` | Kafka broker addresses |
| `clientId` | `string` | Kafka client identifier |
| `groupId` | `string` | Consumer group ID (subscriber only) |

## Features

- Topic-based publishing and subscribing
- Consumer group support
- Batch publishing via `publishBatch()`
- JSON codec for message serialization

## Testing

Integration tests use Redpanda (Kafka-compatible) via testcontainers. See [testing/testcontainers.md](../testing/testcontainers.md).

## Dependencies

- `kafkajs` - Kafka client
