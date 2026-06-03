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

| Option               | Type       | Description                                                                                                                                                                                              |
| -------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brokers`            | `string[]` | Kafka broker addresses                                                                                                                                                                                   |
| `clientId`           | `string`   | _(optional)_ Kafka client identifier                                                                                                                                                                     |
| `groupId`            | `string`   | _(optional)_ Consumer group ID (required for subscribers)                                                                                                                                                |
| `fromBeginning`      | `boolean`  | _(optional, default `false`)_ Start consuming from offset 0 on first group join                                                                                                                          |
| `testMode`           | `boolean`  | _(optional, default `false`)_ Optimized timeouts for integration tests                                                                                                                                   |
| `groupJoinTimeoutMs` | `number`   | _(optional, default `10000`; `5000` when `testMode: true`)_ Max time `startConsuming()` waits for `GROUP_JOIN` before rejecting with `ConsumerJoinTimeoutError`. Only applies when at least one topic is subscribed. |

### `startConsuming` contract

`KafkaSubscriberAdapter.startConsuming()` resolves only after the consumer has
joined its group (`consumer.events.GROUP_JOIN`). Any message published after
`startConsuming()` returns is guaranteed to be delivered to subscribed topics.

If `GROUP_JOIN` does not fire within `groupJoinTimeoutMs`, the method rejects
with `ConsumerJoinTimeoutError` (named export). Use `Subscriber.autoSubscribe`
to trigger `startConsuming` eagerly — see the
[Kafka consumer-join timing](../examples/message-queues#kafka-consumer-join-timing-the-autosubscribe-option)
example.

### Features

- Topic-based publishing and subscribing
- Consumer group support
- Batch publishing via `publishBatch()`
- Message key support for partitioning
- JSON codec for message serialization
- `GROUP_JOIN`-aware `startConsuming` (eliminates publish-before-join race)
