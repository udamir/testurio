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
    // Omit defaultSubscribeParams.groupId for per-test-case auto-generated groupId.
    // Provide it for shared-group opt-out.
  }),
});
```

### Constructor Options

| Option                   | Type                    | Description                                                                                                                                                                                                                |
| ------------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brokers`                | `string[]`              | Kafka broker addresses                                                                                                                                                                                                     |
| `clientId`               | `string`                | _(optional)_ Kafka client identifier                                                                                                                                                                                       |
| `defaultSubscribeParams` | `KafkaSubscribeParams`  | _(optional)_ Adapter-wide subscribe-time defaults. See [`KafkaSubscribeParams`](#kafkasubscribeparams) below.                                                                                                                |
| `testMode`               | `boolean`               | _(optional, default `false`)_ Optimized timeouts for integration tests                                                                                                                                                     |
| `groupJoinTimeoutMs`     | `number`                | _(optional, default `30000`; `5000` when `testMode: true`)_ Max time the subscriber adapter waits for `GROUP_JOIN` after `consumer.run()` before rejecting with `ConsumerJoinTimeoutError`.                                  |

#### `KafkaSubscribeParams`

```typescript
interface KafkaSubscribeParams {
  groupId?: string;       // omit → auto-generated `testurio-${randomSuffix(8)}` per TC (recommended)
  fromBeginning?: boolean;
}
```

Per-call overrides flow through the builder: `ev.subscribe('topic', { fromBeginning: true })`.

> **Migration from master** — `KafkaAdapterConfig.groupId` and `KafkaAdapterConfig.fromBeginning` are removed; they move to `defaultSubscribeParams`.

### Per-test-case isolation

Under v0.6.5, `Subscriber` is always per-test-case isolated. The `KafkaAdapter` is a **factory** — every test case materializes its own `KafkaSubscriberAdapter` via `adapter.createSubscriber()`. With `defaultSubscribeParams.groupId` omitted (the recommended default), each TC's consumer group is unique: `testurio-${randomSuffix(8)}`. Auto-generated groupIds are tracked on the parent adapter and swept via one shared `admin().deleteGroups([...])` call at `dispose()` time — eliminating the cross-TC offset leak from master.

### Subscribe contract

`KafkaSubscriberAdapter.subscribe(topic | topics, params?)` is the single activation method (master's `startConsuming?()` is gone — folded in). On the first call, the adapter issues `consumer.subscribe({ topics })`, calls `consumer.run(...)`, and awaits `consumer.events.GROUP_JOIN`. Any message published after `subscribe` returns is guaranteed to be delivered.

Adding a topic after the consumer is already running triggers a disconnect-reconnect restart that preserves per-topic `fromBeginning` for already-active topics.

If `GROUP_JOIN` does not fire within `groupJoinTimeoutMs`, the call rejects with `ConsumerJoinTimeoutError` (named export).

### Features

- Topic-based publishing and subscribing under per-TC consumer-group isolation
- Batched subscribe (single `consumer.subscribe + consumer.run` cycle per TC)
- Disconnect-reconnect restart preserves per-topic `fromBeginning` for already-active topics
- Auto-generated consumer-group sweep at scenario teardown via one shared admin client
- Message key support for partitioning
- Configurable codec for message serialization (JSON default; binary codecs supported)
- `GROUP_JOIN`-aware subscribe (eliminates publish-before-join race)
