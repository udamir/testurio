# @testurio/adapter-rabbitmq

RabbitMQ adapter for [Testurio](https://github.com/udamir/testurio) Publisher/Subscriber components.

## Installation

```bash
npm install @testurio/adapter-rabbitmq
```

## Usage

```typescript
import { TestScenario, testCase, Publisher, Subscriber } from 'testurio';
import { RabbitMQAdapter } from '@testurio/adapter-rabbitmq';

const adapter = new RabbitMQAdapter({
  url: 'amqp://localhost:5672',
  exchange: 'events',
  exchangeType: 'topic',
});

const publisher = new Publisher('pub', { adapter });
const subscriber = new Subscriber('sub', { adapter, topics: ['orders.#'] });

const scenario = new TestScenario({
  name: 'RabbitMQ Messaging Test',
  components: [subscriber, publisher],
});

const tc = testCase('should publish and receive message', (test) => {
  const pub = test.use(publisher);
  const sub = test.use(subscriber);

  // Wait for message before publishing
  sub.waitForMessage('orders.#');

  // Publish message with routing key
  pub.publish('orders.created', { orderId: '123' });

  // Assert on received message
  sub.onMessage('orders.#').assert((msg) => msg.payload.orderId === '123');
});
```

## Configuration

```typescript
const adapter = new RabbitMQAdapter({
  // Required
  url: 'amqp://localhost:5672',

  // Optional
  exchange: '',           // Default exchange
  exchangeType: 'topic',  // 'direct' | 'fanout' | 'topic' | 'headers'
  durable: true,          // Exchange survives broker restarts
  prefetch: 1,            // Consumer prefetch count
  autoAck: true,          // Auto-acknowledge messages
  heartbeat: 60,          // Connection heartbeat in seconds
});
```

## Topic Patterns

RabbitMQ topic exchange supports pattern matching:

- `*` matches exactly one word (e.g., `orders.*` matches `orders.created`)
- `#` matches zero or more words (e.g., `orders.#` matches `orders.created.eu`)

```typescript
// Subscribe to all order events
const subscriber = new Subscriber('sub', {
  adapter,
  topics: ['orders.#']
});

// Subscribe to specific event type across all entities
const subscriber = new Subscriber('sub', {
  adapter,
  topics: ['*.created']
});
```

## Message Metadata

Access RabbitMQ-specific metadata from received messages:

```typescript
import { getRoutingKey, getDeliveryTag, isRedelivered } from '@testurio/adapter-rabbitmq';

sub.onMessage('orders.#').assert((msg) => {
  console.log('Routing key:', getRoutingKey(msg.metadata));
  console.log('Delivery tag:', getDeliveryTag(msg.metadata));
  console.log('Redelivered:', isRedelivered(msg.metadata));
  return true;
});
```

## License

MIT
