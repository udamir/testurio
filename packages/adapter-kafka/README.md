# @testurio/adapter-kafka

Apache Kafka adapter for [Testurio](https://github.com/udamir/testurio) Publisher/Subscriber components.

## Installation

```bash
npm install @testurio/adapter-kafka
```

## Usage

```typescript
import { TestScenario, testCase, Publisher, Subscriber } from 'testurio';
import { KafkaAdapter } from '@testurio/adapter-kafka';

// Zero-config per-test-case isolation (recommended).
// Each TC gets its own consumer group `testurio-<random>` automatically.
const adapter = new KafkaAdapter({
  brokers: ['localhost:9092'],
  clientId: 'my-app',
});

const publisher = new Publisher('pub', { adapter });
const subscriber = new Subscriber('sub', { adapter });

const scenario = new TestScenario({
  name: 'Kafka Messaging Test',
  components: [subscriber, publisher],
});

const tc = testCase('publishes and receives a message', (test) => {
  const pub = test.use(publisher);
  const sub = test.use(subscriber);

  pub.publish('events', { type: 'user.created', userId: '123' });
  sub.waitMessage('events').assert((msg) => msg.payload.type === 'user.created');
});
```

## Configuration

```typescript
const adapter = new KafkaAdapter({
  // Required
  brokers: ['localhost:9092'],

  // Optional connection config
  clientId: 'testurio-kafka-adapter',
  connectionTimeout: 30000,
  requestTimeout: 30000,

  // Adapter-wide subscribe defaults.
  //   - omit `groupId` (recommended): auto-generated `testurio-${randomSuffix(8)}` per TC
  //   - provide `groupId`: every TC shares that group (Kafka partition-assignment semantics)
  defaultSubscribeParams: {
    groupId: 'shared-events',
    fromBeginning: true,
  },

  // SSL/TLS
  ssl: true,

  // SASL authentication
  sasl: { mechanism: 'plain', username: 'user', password: 'password' },

  // Test mode (faster timeouts for integration tests)
  testMode: true,

  // Max time (ms) the subscriber adapter waits for GROUP_JOIN after consumer.run()
  // before rejecting with ConsumerJoinTimeoutError.
  // Default: 30000 (5000 when testMode: true).
  groupJoinTimeoutMs: 30000,
});
```

### Per-test-case isolation

`Subscriber` is always per-test-case isolated: the `KafkaAdapter` is a **factory**, and every test case materializes its own `KafkaSubscriberAdapter` via `adapter.createSubscriber()`. Auto-generated groupIds are tracked on the adapter and swept via one shared `admin().deleteGroups([...])` call at `dispose()` time — eliminating the cross-TC offset leak from master.

### Per-call subscribe params

Per-call overrides flow through the builder:

```typescript
sub.subscribe('orders', { fromBeginning: true });
sub.subscribe(['orders', 'shipments']);                 // one Kafka subscribe+run cycle
sub.subscribe();                                        // all hook-derived topics for this TC
sub.unsubscribe();                                      // all currently-held
```

### Subscribe-time activation contract

`KafkaSubscriberAdapter.subscribe(...)` is the single activation method — the v0.6.4 `startConsuming` method is gone, folded in. On the first call, the adapter issues `consumer.subscribe({ topics: [...] })`, calls `consumer.run(...)`, and awaits `consumer.events.GROUP_JOIN` before resolving. Any message published after `subscribe` returns is guaranteed to be delivered.

Adding a topic after the consumer is already running triggers a disconnect-reconnect restart that preserves per-topic `fromBeginning` for already-active topics.

If `GROUP_JOIN` does not fire within `groupJoinTimeoutMs`, the call rejects with `ConsumerJoinTimeoutError` (exported from the package).

## Message Metadata

Access Kafka-specific metadata from received messages:

```typescript
import { getKafkaPartition, getKafkaOffset, isKafkaMetadata } from '@testurio/adapter-kafka';

sub.onMessage('events').assert((msg) => {
  if (isKafkaMetadata(msg.metadata)) {
    console.log('Partition:', msg.metadata.partition);
    console.log('Offset:', msg.metadata.offset);
  }
  return true;
});
```

## License

MIT
