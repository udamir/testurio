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
});
```

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
