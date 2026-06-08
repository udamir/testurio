# Custom Adapter

How to create custom adapters for Testurio — either MQ adapters for message queue systems or DataSource adapters for databases/caches.

## MQ Adapter

MQ adapters provide `Publisher` and `Subscriber` integration.

### Interface

```typescript
interface IMQAdapter<TMessage, TOptions, TBatchMessage, P = unknown> {
  readonly type: string;
  createPublisher(codec: Codec): Promise<IMQPublisherAdapter<TOptions, TBatchMessage>>;
  createSubscriber(codec?: Codec): Promise<IMQSubscriberAdapter<TMessage, P>>;
  dispose(): Promise<void>;
}
```

The fourth generic `P` (`unknown` by default) types the **per-call subscribe params** the adapter accepts (e.g. `KafkaSubscribeParams { groupId?, fromBeginning? }`). Existing adapters that don't need per-call params can leave it as `unknown`.

`Subscriber` calls `createSubscriber()` **once per test case** under per-TC isolation. Adapter-wide subscribe-time defaults should live on the adapter's own config (e.g. `KafkaAdapterConfig.defaultSubscribeParams`) and be read at materialization time.

### Publisher Adapter

```typescript
interface IMQPublisherAdapter<TOptions, TBatchMessage> {
  readonly isConnected: boolean;
  publish(topic: string, payload: unknown, options?: TOptions): Promise<void>;
  publishBatch(topic: string, messages: TBatchMessage[]): Promise<void>;
  close(): Promise<void>;
}
```

### Subscriber Adapter

```typescript
interface IMQSubscriberAdapter<TMessage, P = unknown> {
  readonly id: string;
  readonly isConnected: boolean;
  subscribe(topic: string | string[], params?: Partial<P>): Promise<void>;
  unsubscribe(topic: string | string[]): Promise<void>;
  getSubscribedTopics(): string[];
  onMessage(handler: (topic: string, message: TMessage) => void): void;
  onError(handler: (error: Error) => void): void;
  onDisconnect(handler: () => void): void;
  close(): Promise<void>;
}
```

**Subscribe contract (v0.6.5 BREAKING):**

- `subscribe` and `unsubscribe` accept `string` OR `string[]` (batch).
- The **first** `subscribe` call activates the delivery loop. The old `startConsuming?()` is removed — fold any consume-loop activation into the first `subscribe` call's path.
- Adapters that need a broker restart to add topics after the consume loop is running (Kafka) MUST do so transparently inside `subscribe` and MUST NOT return until newly-published messages on the new topics will be delivered.
- `params` is `Partial<P>` (per-call overrides only). Adapter-wide defaults are read from the adapter's own config at construction time.
- Per-TC `Subscriber` binds per-TC closures on `onMessage` / `onError` / `onDisconnect` at materialization time, so handlers must be replaceable across calls (the latest handler wins) OR the adapter must guarantee `onMessage` etc. are called exactly once.
- `close()` releases every resource the adapter owns (broker connections, dedicated clients, queues). Under per-TC materialization there is no "managed externally" — the adapter owns teardown end-to-end.

### Implementation Example

```typescript
import type { Codec, IMQAdapter, IMQPublisherAdapter, IMQSubscriberAdapter } from 'testurio';

class MyMQAdapter implements IMQAdapter<MyMessage, MyOptions, MyBatchMessage, MyParams> {
  readonly type = 'my-mq';

  constructor(private config: MyMQConfig) {}

  async createPublisher(codec: Codec): Promise<IMQPublisherAdapter<MyOptions, MyBatchMessage>> {
    return new MyPublisherAdapter(this.config, codec);
  }

  // v0.6.5: createSubscriber is called once per test case. Adapter-wide
  // defaults live on `this.config` (e.g. `defaultSubscribeParams`).
  async createSubscriber(codec?: Codec): Promise<IMQSubscriberAdapter<MyMessage, MyParams>> {
    return new MySubscriberAdapter(this.config, codec);
  }

  async dispose(): Promise<void> {
    // Sweep adapter-level resources here (e.g. auto-generated groupIds, shared
    // admin clients, transitive publishers). Per-TC subscriber adapters are
    // closed by `Subscriber.clearHooks` / `Subscriber.doStop` — this is a
    // defensive fallback.
  }
}
```

### Usage

```typescript
import { Publisher, Subscriber, TestScenario } from 'testurio';
import { MyMQAdapter } from 'my-mq-adapter';

const pub = new Publisher<MyTopics>('pub', {
  adapter: new MyMQAdapter({ url: 'my-mq://localhost:5555' }),
});

const sub = new Subscriber<MyTopics>('sub', {
  adapter: new MyMQAdapter({ url: 'my-mq://localhost:5555' }),
});
```

## DataSource Adapter

DataSource adapters provide direct SDK access to databases and caches.

### Interface

```typescript
interface IDataSourceAdapter<TClient> {
  readonly type: string;
  connect(): Promise<void>;
  getClient(): TClient;
  disconnect(): Promise<void>;
}
```

### Implementation Example

```typescript
import type { IDataSourceAdapter } from 'testurio';

interface MyDBConfig {
  host: string;
  port: number;
  database: string;
}

class MyDBAdapter implements IDataSourceAdapter<MyDBClient> {
  readonly type = 'my-db';
  private client: MyDBClient | null = null;

  constructor(private config: MyDBConfig) {}

  async connect(): Promise<void> {
    this.client = await MyDBClient.connect(this.config);
  }

  getClient(): MyDBClient {
    if (!this.client) throw new Error('Not connected');
    return this.client;
  }

  async disconnect(): Promise<void> {
    await this.client?.close();
    this.client = null;
  }
}
```

### Usage

```typescript
import { DataSource, TestScenario, testCase } from 'testurio';
import { MyDBAdapter } from 'my-db-adapter';

const db = new DataSource('my-db', {
  adapter: new MyDBAdapter({
    host: 'localhost',
    port: 5555,
    database: 'testdb',
  }),
});

const tc = testCase('Database test', (test) => {
  const store = test.use(db);

  store.exec('insert', async (client) => {
    await client.insert('users', { name: 'Alice' });
  });

  store
    .exec('query', async (client) => client.findOne('users', { name: 'Alice' }))
    .assert('user exists', (result) => result !== null);
});
```

## Packaging

Package as `@testurio/adapter-*` or `testurio-adapter-*`:

```json
{
  "peerDependencies": {
    "testurio": "^0.x"
  }
}
```

The underlying database/MQ client library should be listed as a `peerDependency` so users control which version they install.
