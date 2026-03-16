# Custom Adapter

How to create custom adapters for Testurio — either MQ adapters for message queue systems or DataSource adapters for databases/caches.

## MQ Adapter

MQ adapters provide `Publisher` and `Subscriber` integration.

### Interface

```typescript
interface IMQAdapter<TMessage, TOptions, TBatchMessage> {
  readonly type: string;
  createPublisher(codec: Codec): Promise<IMQPublisherAdapter<TOptions, TBatchMessage>>;
  createSubscriber(codec: Codec): Promise<IMQSubscriberAdapter<TMessage>>;
  dispose(): Promise<void>;
}
```

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
interface IMQSubscriberAdapter<TMessage> {
  readonly id: string;
  readonly isConnected: boolean;
  subscribe(topic: string): Promise<void>;
  unsubscribe(topic: string): Promise<void>;
  getSubscribedTopics(): string[];
  onMessage(handler: (topic: string, message: TMessage) => void): void;
  onError(handler: (error: Error) => void): void;
  onDisconnect(handler: () => void): void;
  close(): Promise<void>;
  startConsuming?(): Promise<void>;
}
```

### Implementation Example

```typescript
import type { Codec, IMQAdapter, IMQPublisherAdapter, IMQSubscriberAdapter } from 'testurio';

class MyMQAdapter implements IMQAdapter<MyMessage, MyOptions, MyBatchMessage> {
  readonly type = 'my-mq';
  private connection: MyConnection;

  constructor(private config: MyMQConfig) {
    this.connection = new MyConnection(config);
  }

  async createPublisher(codec: Codec): Promise<IMQPublisherAdapter<MyOptions, MyBatchMessage>> {
    await this.connection.connect();
    return new MyPublisherAdapter(this.connection, codec);
  }

  async createSubscriber(codec: Codec): Promise<IMQSubscriberAdapter<MyMessage>> {
    await this.connection.connect();
    return new MySubscriberAdapter(this.connection, codec);
  }

  async dispose(): Promise<void> {
    await this.connection.close();
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
