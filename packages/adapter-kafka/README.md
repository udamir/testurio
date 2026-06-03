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

const adapter = new KafkaAdapter({
  brokers: ['localhost:9092'],
  clientId: 'my-app',
  groupId: 'my-consumer-group',
});

const publisher = new Publisher('pub', { adapter });
const subscriber = new Subscriber('sub', { adapter, topics: ['events'] });

const scenario = new TestScenario({
  name: 'Kafka Messaging Test',
  components: [subscriber, publisher],
});

const tc = testCase('should publish and receive message', (test) => {
  const pub = test.use(publisher);
  const sub = test.use(subscriber);

  // Wait for message before publishing
  sub.waitForMessage('events');

  // Publish message
  pub.publish('events', { type: 'user.created', userId: '123' });

  // Assert on received message
  sub.onMessage('events').assert((msg) => msg.payload.type === 'user.created');
});
```

## Configuration

```typescript
const adapter = new KafkaAdapter({
  // Required
  brokers: ['localhost:9092'],

  // Optional
  clientId: 'testurio-kafka-adapter',
  groupId: 'my-consumer-group',  // Required for subscribers
  fromBeginning: false,
  connectionTimeout: 30000,
  requestTimeout: 30000,

  // SSL/TLS
  ssl: true,

  // SASL authentication
  sasl: {
    mechanism: 'plain',
    username: 'user',
    password: 'password',
  },

  // Test mode (faster timeouts for integration tests)
  testMode: true,

  // Max time (ms) startConsuming() will wait for GROUP_JOIN before rejecting
  // with ConsumerJoinTimeoutError. Default: 10000 (5000 when testMode: true).
  groupJoinTimeoutMs: 10000,
});
```

### `startConsuming` contract

`KafkaSubscriberAdapter.startConsuming()` does not resolve until the consumer
has joined its group (`consumer.events.GROUP_JOIN`). Any message published
after `startConsuming()` returns is guaranteed to be delivered to subscribed
topics.

If `GROUP_JOIN` does not fire within `groupJoinTimeoutMs`, the method rejects
with `ConsumerJoinTimeoutError` (exported from the package). To trigger
`startConsuming` eagerly in test scenarios, set
`SubscriberOptions.autoSubscribe` on the `Subscriber` component — see the
[Kafka consumer-join timing](https://testurio.dev/examples/message-queues#kafka-consumer-join-timing-the-autosubscribe-option) example.

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
