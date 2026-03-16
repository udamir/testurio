# Message Queue Examples

Practical examples for testing message queue patterns with Testurio.

## Overview

Testurio supports three MQ adapters:

| Adapter | Package | Underlying Library |
|---------|---------|-------------------|
| Kafka | `@testurio/adapter-kafka` | kafkajs |
| RabbitMQ | `@testurio/adapter-rabbitmq` | amqplib |
| Redis Pub/Sub | `@testurio/adapter-redis` | ioredis |

All MQ adapters use the same `Publisher` / `Subscriber` API.

## Kafka Example

```typescript
import { Publisher, Subscriber, TestScenario, testCase } from 'testurio';
import { KafkaAdapter } from '@testurio/adapter-kafka';

interface OrderTopics {
  'order-created': { orderId: string; customerId: string; total: number };
  'order-shipped': { orderId: string; trackingNumber: string };
  'order-cancelled': { orderId: string; reason: string };
}

const pub = new Publisher<OrderTopics>('order-pub', {
  adapter: new KafkaAdapter({
    brokers: ['localhost:9092'],
  }),
});

const sub = new Subscriber<OrderTopics>('order-sub', {
  adapter: new KafkaAdapter({
    brokers: ['localhost:9092'],
    groupId: 'test-group',
  }),
});

// Subscribers should be listed before Publishers
const scenario = new TestScenario({
  name: 'Order Events',
  components: [sub, pub],
});
```

## RabbitMQ Example

```typescript
import { Publisher, Subscriber, TestScenario, testCase } from 'testurio';
import { RabbitMQAdapter } from '@testurio/adapter-rabbitmq';

const pub = new Publisher<OrderTopics>('rmq-pub', {
  adapter: new RabbitMQAdapter({
    url: 'amqp://localhost:5672',
    exchange: 'orders',
    exchangeType: 'topic',
  }),
});

const sub = new Subscriber<OrderTopics>('rmq-sub', {
  adapter: new RabbitMQAdapter({
    url: 'amqp://localhost:5672',
    exchange: 'orders',
    exchangeType: 'topic',
  }),
});
```

## Redis Pub/Sub Example

```typescript
import { Publisher, Subscriber, TestScenario, testCase } from 'testurio';
import { RedisPubSubAdapter } from '@testurio/adapter-redis';

const pub = new Publisher<OrderTopics>('redis-pub', {
  adapter: new RedisPubSubAdapter({
    host: 'localhost',
    port: 6379,
  }),
});

const sub = new Subscriber<OrderTopics>('redis-sub', {
  adapter: new RedisPubSubAdapter({
    host: 'localhost',
    port: 6379,
  }),
});
```

## Basic Publish and Subscribe

```typescript
const tc = testCase('Basic publish and subscribe', (test) => {
  const publisher = test.use(pub);
  const subscriber = test.use(sub);

  publisher.publish('order-created', {
    orderId: 'ORD-001',
    customerId: 'CUST-123',
    total: 99.99,
  });

  subscriber
    .waitMessage('order-created')
    .assert('orderId matches', (msg) => msg.payload.orderId === 'ORD-001')
    .assert('customerId matches', (msg) => msg.payload.customerId === 'CUST-123')
    .assert('total is correct', (msg) => msg.payload.total === 99.99);
});
```

## Sequential Message Flow

```typescript
const tc = testCase('Sequential message flow', (test) => {
  const publisher = test.use(pub);
  const subscriber = test.use(sub);

  // Publish order created
  publisher.publish('order-created', {
    orderId: 'ORD-002',
    customerId: 'CUST-456',
    total: 150.0,
  });

  subscriber.waitMessage('order-created')
    .assert('order created', (msg) => msg.payload.orderId === 'ORD-002');

  // Then publish order shipped
  publisher.publish('order-shipped', {
    orderId: 'ORD-002',
    trackingNumber: 'TRACK-789',
  });

  subscriber.waitMessage('order-shipped')
    .assert('orderId matches', (msg) => msg.payload.orderId === 'ORD-002')
    .assert('tracking set', (msg) => msg.payload.trackingNumber === 'TRACK-789');
});
```

## Multi-Topic with Multiple Publishers

```typescript
interface NotificationTopics {
  'email-sent': { to: string; subject: string; status: 'sent' | 'failed' };
  'sms-sent': { phone: string; message: string; status: 'sent' | 'failed' };
}

const notifPub = new Publisher<NotificationTopics>('notif-pub', {
  adapter: new KafkaAdapter({ brokers: ['localhost:9092'] }),
});

const notifSub = new Subscriber<NotificationTopics>('notif-sub', {
  adapter: new KafkaAdapter({ brokers: ['localhost:9092'], groupId: 'notif-group' }),
});

const scenario = new TestScenario({
  name: 'Multi-topic',
  components: [sub, pub, notifSub, notifPub],
});

const tc = testCase('Multi-topic pub/sub', (test) => {
  const orderPub = test.use(pub);
  const orderSub = test.use(sub);
  const nPub = test.use(notifPub);
  const nSub = test.use(notifSub);

  orderPub.publish('order-created', {
    orderId: 'ORD-003',
    customerId: 'CUST-789',
    total: 200.0,
  });

  orderSub.waitMessage('order-created')
    .assert('order received', (msg) => msg.payload.orderId === 'ORD-003');

  nPub.publish('email-sent', {
    to: 'customer@example.com',
    subject: 'Order Confirmation',
    status: 'sent',
  });

  nSub.waitMessage('email-sent')
    .assert('email to correct recipient', (msg) => msg.payload.to === 'customer@example.com')
    .assert('email sent', (msg) => msg.payload.status === 'sent');
});
```

## Custom Matchers

Filter for specific messages when multiple are published:

```typescript
const tc = testCase('Custom matcher', (test) => {
  const publisher = test.use(pub);
  const subscriber = test.use(sub);

  // Publish multiple orders
  publisher.publish('order-created', {
    orderId: 'ORD-100',
    customerId: 'CUST-A',
    total: 10.0,
  });

  publisher.publish('order-created', {
    orderId: 'ORD-200',
    customerId: 'CUST-B',
    total: 200.0,
  });

  // Wait for specific message using matcher
  subscriber
    .waitMessage('order-created', {
      matcher: (msg) => msg.payload.total > 100,
    })
    .assert('high-value order', (msg) => msg.payload.orderId === 'ORD-200');
});
```

## Schema Validation for MQ

```typescript
import { z } from 'zod';

const orderSchema = z.object({
  orderId: z.string(),
  customerId: z.string(),
  total: z.number().positive(),
});

const pub = new Publisher<OrderTopics>('order-pub', {
  adapter: new KafkaAdapter({ brokers: ['localhost:9092'] }),
  schema: {
    'order-created': orderSchema,
  },
});
```

Messages are automatically validated against the schema before publishing.
