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

## Type-Safe Topic Definitions

`Publisher<T>` and `Subscriber<T>` take a topics interface where each key is a topic name and each value is the payload shape for that topic. Both ends of the queue share the same interface, so the same typo or shape mismatch fails to compile on the publisher and on the subscriber.

```typescript
interface OrderTopics {
  'order-created':   { orderId: string; customerId: string; total: number };
  'order-shipped':   { orderId: string; trackingNumber: string };
  'order-cancelled': { orderId: string; reason: string };
}

const pub = new Publisher<OrderTopics>('order-pub', {
  adapter: new KafkaAdapter({ brokers: ['localhost:9092'] }),
});

const sub = new Subscriber<OrderTopics>('order-sub', {
  adapter: new KafkaAdapter({ brokers: ['localhost:9092'] }),
});
```

What the compiler catches:

```typescript
// ✗ Topic not declared on OrderTopics
pub.publish('order-pending', { orderId: 'ORD-1' });

// ✗ Wrong payload shape for the topic
pub.publish('order-shipped', { orderId: 'ORD-1', total: 99.99 });
//                                              ^^^^^ should be trackingNumber

// ✗ Field with the wrong type
pub.publish('order-created', { orderId: 'ORD-1', customerId: 'C-1', total: '99.99' });
//                                                                         ^^^^^^^ string ≠ number

// ✓ Subscriber payload is typed against the topic key
sub.waitMessage('order-created').assert((m) => m.payload.total > 0);
//                                                       ^^^^^ number from OrderTopics
```

See the [Type Safety guide](/guide/type-safety) for the full mode comparison and schema-first inference.

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
  adapter: new KafkaAdapter({ brokers: ['localhost:9092'] }),
  // Per-TC isolation: each TC gets its own `testurio-<random>` consumer group.
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

## Kafka consumer-join timing (per-TC isolation)

The `Subscriber` materializes a fresh `KafkaSubscriberAdapter` per test case. Phase 1.5 (after hook registration, before any action step) issues a single batched `consumer.subscribe + run` cycle for every topic referenced by `onMessage` / `waitMessage` / `waitMessageFrom` hooks in the TC and **awaits `GROUP_JOIN`**. Any publish that follows is guaranteed to be delivered.

### Zero-config — `autoSubscribe: true` is the default

```typescript
const events = new Subscriber('events', {
  adapter: new KafkaAdapter({ brokers: ['localhost:9092'] }),
});

const tc = testCase('order flow', (test) => {
  const api = test.use(orderApi);
  const ev  = test.use(events);

  api.request('placeOrder', { ... });
  api.onResponse('placeOrder').assert((r) => r.code === 200);

  ev.waitMessage('order.filled', { ... });      // deterministic — Phase 1.5 joined the group
});
```

`KafkaAdapter` omits `defaultSubscribeParams.groupId` by default, so each TC gets its own consumer group `testurio-${randomSuffix(8)}` — independent streams, no cross-TC offset leak.

### Imperative subscribe / unsubscribe

For `autoSubscribe: false` mode (or for mid-test imperative control):

```typescript
const events = new Subscriber('events', {
  adapter: new KafkaAdapter({ brokers: ['localhost:9092'] }),
  autoSubscribe: false,
});

const tc = testCase('imperative subscribe', (test) => {
  const ev = test.use(events);
  ev.subscribe(['order.filled', 'order.rejected']);   // one Kafka subscribe+run cycle
  // ... publish, wait, etc.
  ev.unsubscribe();                                    // shortcut — all currently-held
});
```

### Shared groupId opt-out

For tests that need Kafka partition-assignment semantics across TCs (e.g. load-balancing fan-out), provide an explicit `groupId`:

```typescript
const events = new Subscriber('events', {
  adapter: new KafkaAdapter({
    brokers: ['localhost:9092'],
    defaultSubscribeParams: { groupId: 'shared', fromBeginning: true },
  }),
});
// All TCs share the 'shared' consumer group.
```

### Configuring the GROUP_JOIN timeout

By default, the subscriber adapter waits up to 30 s (5 s under `testMode: true`) for `GROUP_JOIN` before rejecting with `ConsumerJoinTimeoutError`. Override via `KafkaAdapterConfig.groupJoinTimeoutMs`:

```typescript
new KafkaAdapter({
  brokers: ['localhost:9092'],
  groupJoinTimeoutMs: 2000, // fail fast in tight integration suites
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
  adapter: new KafkaAdapter({ brokers: ['localhost:9092'] }),
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

## Using a Custom Codec with Publisher / Subscriber

Both `Publisher` and `Subscriber` accept an optional `codec` option. The default is JSON (`defaultJsonCodec`); pass any `Codec<string | Uint8Array>` to handle binary formats like Protocol Buffers, MessagePack, or Avro.

The MQ adapter (Kafka, RabbitMQ, Redis Pub/Sub) passes raw transport bytes to the codec — text/binary normalization is the codec's job, not the adapter's. This means a single binary codec works across all three MQ adapters with no adapter-specific wiring.

### Kafka with Protobuf

```typescript
import * as protobuf from 'protobufjs';
import { type Codec, CodecError, Publisher, Subscriber } from 'testurio';
import { KafkaAdapter } from '@testurio/adapter-kafka';

const root = await protobuf.load('./orders.proto');
const OrderEventType = root.lookupType('orders.OrderEvent');

const orderProtobufCodec: Codec<Uint8Array> = {
  name: 'orders-protobuf',
  wireFormat: 'binary',
  encode(data) {
    try {
      const message = OrderEventType.fromObject(data as object);
      return OrderEventType.encode(message).finish();
    } catch (error) {
      throw CodecError.encodeError('orders-protobuf', error as Error, data);
    }
  },
  decode(wire) {
    try {
      const bytes = typeof wire === 'string' ? new TextEncoder().encode(wire) : wire;
      return OrderEventType.toObject(OrderEventType.decode(bytes), { defaults: true });
    } catch (error) {
      if (error instanceof CodecError) throw error;
      throw CodecError.decodeError('orders-protobuf', error as Error);
    }
  },
};

const adapter = new KafkaAdapter({ brokers: ['localhost:9092'] });

const pub = new Publisher('order-pub', { adapter, codec: orderProtobufCodec });
const sub = new Subscriber('order-sub', { adapter, codec: orderProtobufCodec });
```

### RabbitMQ with Protobuf

The same `orderProtobufCodec` works as-is — only the adapter changes:

```typescript
import { RabbitMQAdapter } from '@testurio/adapter-rabbitmq';

const adapter = new RabbitMQAdapter({
  url: 'amqp://localhost:5672',
  exchange: 'orders',
  exchangeType: 'topic',
});

const pub = new Publisher('order-pub', { adapter, codec: orderProtobufCodec });
const sub = new Subscriber('order-sub', { adapter, codec: orderProtobufCodec });
```

### Redis Pub/Sub with Protobuf

Redis Pub/Sub has no native concept of message keys, headers, or timestamps, so the adapter wraps every payload in an envelope (`{ payload, key, headers, timestamp }`). A binary codec on Redis must therefore encode the **whole envelope**, with the inner application payload carried as raw bytes in the envelope's `payload` field.

```protobuf
// orders.proto
syntax = "proto3";

message OrderEvent {
  string order_id = 1;
  int32  amount   = 2;
}

message RedisEnvelope {
  bytes  payload    = 1;
  string key        = 2;
  map<string, string> headers = 3;
  int64  timestamp  = 4;
}
```

```typescript
import { RedisPubSubAdapter } from '@testurio/adapter-redis';

const RedisEnvelopeType = root.lookupType('RedisEnvelope');

const redisOrderCodec: Codec<Uint8Array> = {
  name: 'redis-orders-protobuf',
  wireFormat: 'binary',
  encode(envelope) {
    const e = envelope as { payload: unknown; key?: string; headers?: Record<string, string>; timestamp?: number };
    const innerBytes = OrderEventType.encode(OrderEventType.fromObject(e.payload as object)).finish();
    return RedisEnvelopeType.encode(
      RedisEnvelopeType.fromObject({
        payload: innerBytes,
        key: e.key ?? '',
        headers: e.headers ?? {},
        timestamp: e.timestamp ?? 0,
      }),
    ).finish();
  },
  decode(wire) {
    const bytes = typeof wire === 'string' ? new TextEncoder().encode(wire) : wire;
    const outer = RedisEnvelopeType.toObject(RedisEnvelopeType.decode(bytes), { defaults: true });
    const inner = OrderEventType.toObject(OrderEventType.decode(outer.payload), { defaults: true });
    return { payload: inner, key: outer.key, headers: outer.headers, timestamp: outer.timestamp };
  },
};

const adapter = new RedisPubSubAdapter({ host: 'localhost', port: 6379 });
const pub = new Publisher('order-pub', { adapter, codec: redisOrderCodec });
const sub = new Subscriber('order-sub', { adapter, codec: redisOrderCodec });
```

### Error Handling

When a subscriber's codec fails to decode an incoming message, the error is captured on the component's unhandled-errors stream. Inspect it post-run:

```typescript
await scenario.run(tc);

const codecErrors = sub
  .getUnhandledErrors()
  .filter((e) => e instanceof CodecError);

expect(codecErrors).toHaveLength(0);
```
