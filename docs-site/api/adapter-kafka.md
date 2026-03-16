# @testurio/adapter-kafka

Apache Kafka integration for Testurio via `Publisher` and `Subscriber` components.

```bash
npm install @testurio/adapter-kafka --save-dev
```

**Peer dependency:** `kafkajs`

## KafkaAdapter

```typescript
import { Publisher, Subscriber } from 'testurio';
import { KafkaAdapter } from '@testurio/adapter-kafka';

const pub = new Publisher('kafka-pub', {
  adapter: new KafkaAdapter({
    brokers: ['localhost:9092'],
    clientId: 'test-producer',
  }),
});

const sub = new Subscriber('kafka-sub', {
  adapter: new KafkaAdapter({
    brokers: ['localhost:9092'],
    clientId: 'test-consumer',
    groupId: 'test-group',
  }),
});
```

### Constructor Options

| Option | Type | Description |
|--------|------|-------------|
| `brokers` | `string[]` | Kafka broker addresses |
| `clientId` | `string` | _(optional)_ Kafka client identifier |
| `groupId` | `string` | _(optional)_ Consumer group ID (required for subscribers) |

### Features

- Topic-based publishing and subscribing
- Consumer group support
- Batch publishing via `publishBatch()`
- Message key support for partitioning
- JSON codec for message serialization
