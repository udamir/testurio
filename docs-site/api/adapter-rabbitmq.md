# @testurio/adapter-rabbitmq

RabbitMQ integration for Testurio via `Publisher` and `Subscriber` components.

```bash
npm install @testurio/adapter-rabbitmq --save-dev
```

**Peer dependency:** `amqplib`

## RabbitMQAdapter

```typescript
import { Publisher, Subscriber } from 'testurio';
import { RabbitMQAdapter } from '@testurio/adapter-rabbitmq';

const pub = new Publisher('rmq-pub', {
  adapter: new RabbitMQAdapter({
    url: 'amqp://localhost:5672',
    exchange: 'test-exchange',
    exchangeType: 'topic',
  }),
});

const sub = new Subscriber('rmq-sub', {
  adapter: new RabbitMQAdapter({
    url: 'amqp://localhost:5672',
    exchange: 'test-exchange',
    exchangeType: 'topic',
  }),
});
```

### Constructor Options

| Option | Type | Description |
|--------|------|-------------|
| `url` | `string` | AMQP connection URL |
| `exchange` | `string` | Exchange name |
| `exchangeType` | `string` | Exchange type: `direct`, `topic`, `fanout`, or `headers` |

### Features

- Exchange-based routing
- Topic pattern matching (e.g., `user.#`, `order.*`)
- Direct, topic, fanout, and headers exchange types
- Auto-generated queue names for subscribers
- Routing key support
