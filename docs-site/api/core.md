# testurio (Core)

The core `testurio` package contains the framework engine, all component types, the execution layer, the hook system, and the built-in HTTP protocol.

```bash
npm install testurio --save-dev
```

## Exports

```typescript
import {
  // Components
  Client,
  Server,
  AsyncClient,
  AsyncServer,
  DataSource,
  Publisher,
  Subscriber,

  // Execution
  TestScenario,
  testCase,

  // Protocols
  HttpProtocol,

  // Codecs
  JsonCodec,
} from 'testurio';
```

## TestScenario

Orchestrates component lifecycle and test execution.

### Constructor

```typescript
new TestScenario(options: TestScenarioOptions)
```

| Option | Type | Description |
|--------|------|-------------|
| `name` | `string` | Scenario name (used in reports) |
| `components` | `Component[]` | Components in startup order (servers before clients) |
| `reporters` | `IReporter[]` | _(optional)_ Test reporters |

### Methods

| Method | Description |
|--------|-------------|
| `run(...testCases)` | Run one or more test cases. Returns `Promise<TestResult>` |
| `init(handler)` | Register setup that runs after component startup |
| `stop(handler)` | Register teardown that runs before component shutdown |
| `addReporter(reporter)` | Add a test reporter |

### TestResult

```typescript
interface TestResult {
  name: string;
  passed: boolean;
  testCases: TestCaseResult[];
  duration: number;
}
```

## testCase

Factory function for creating test cases.

```typescript
const tc = testCase(name: string, builder: (test: TestContext) => void)
```

### TestContext

| Method | Returns | Description |
|--------|---------|-------------|
| `use(client)` | `SyncClientStepBuilder` | Get step builder for a Client |
| `use(server)` | `SyncServerStepBuilder` | Get step builder for a Server |
| `use(asyncClient)` | `AsyncClientStepBuilder` | Get step builder for an AsyncClient |
| `use(asyncServer)` | `AsyncServerStepBuilder` | Get step builder for an AsyncServer |
| `use(dataSource)` | `DataSourceStepBuilder` | Get step builder for a DataSource |
| `use(publisher)` | `PublisherStepBuilder` | Get step builder for a Publisher |
| `use(subscriber)` | `SubscriberStepBuilder` | Get step builder for a Subscriber |
| `wait(ms)` | void | Add a wait step |
| `waitUntil(fn, options?)` | void | Wait until a condition is true |

### TestCase Metadata

```typescript
testCase('name', (test) => { /* ... */ })
  .id('TC-001')
  .epic('Epic Name')
  .feature('Feature Name')
  .story('Story Name')
  .severity('critical')
  .tags('api', 'smoke')
  .issue('BUG-123')
  .description('Description text')
  .before((test) => { /* setup */ })
  .after((test) => { /* teardown */ });
```

## Client

Sends synchronous requests to a target server.

```typescript
new Client(name: string, options: ClientOptions)
```

| Option | Type | Description |
|--------|------|-------------|
| `protocol` | `ISyncProtocol` | Sync protocol instance |
| `targetAddress` | `Address` | Server address |
| `validation` | `SyncValidationOptions` | _(optional)_ Auto-validation settings |

### Step Builder Methods

| Method | Mode | Description |
|--------|------|-------------|
| `request(operationId, data, traceId?)` | action | Send a request |
| `onResponse(operationId, traceId?)` | hook | Non-blocking response handler |
| `waitResponse(operationId, options?)` | wait | Block until response arrives |

## Server

Mock server or proxy.

```typescript
new Server(name: string, options: ServerOptions)
```

| Option | Type | Description |
|--------|------|-------------|
| `protocol` | `ISyncProtocol` | Sync protocol instance |
| `listenAddress` | `Address` | Address to listen on |
| `targetAddress` | `Address` | _(optional)_ Backend for proxy mode |
| `validation` | `SyncValidationOptions` | _(optional)_ Auto-validation settings |

### Step Builder Methods

| Method | Mode | Description |
|--------|------|-------------|
| `onRequest(operationId, matcher?)` | hook | Handle incoming request |
| `waitRequest(operationId, matcher?)` | wait | Block until request arrives |

## AsyncClient

Sends messages over persistent connections. Connection can be deferred with `autoConnect: false` (default) and established explicitly via `connect()`.

```typescript
new AsyncClient(name: string, options: AsyncClientOptions)
```

| Option | Type | Description |
|--------|------|-------------|
| `protocol` | `IAsyncProtocol` | Async protocol instance |
| `targetAddress` | `Address` | Server address |
| `validation` | `AsyncValidationOptions` | _(optional)_ Auto-validation settings |
| `autoConnect` | `boolean \| ProtocolConnectParams<P>` | _(optional)_ Connection control. `false` (default): requires explicit `connect()` step. `true`: auto-connect without params. Object: auto-connect with protocol-typed params (e.g., `{ headers: { ... } }` for WS, `{ metadata: { ... } }` for gRPC) |

### Step Builder Methods

| Method | Mode | Description |
|--------|------|-------------|
| `connect(params?)` | action | Establish connection. Accepts protocol-typed params or factory function |
| `sendMessage(messageType, data, traceId?)` | action | Send a message |
| `onEvent(messageType, matcher?)` | hook | Non-blocking event handler |
| `waitEvent(messageType, options?)` | wait | Block until event arrives |
| `disconnect()` | action | Close the connection |
| `waitDisconnect()` | wait | Block until connection closes |

## AsyncServer

Mock async server or proxy.

```typescript
new AsyncServer(name: string, options: AsyncServerOptions)
```

| Option | Type | Description |
|--------|------|-------------|
| `protocol` | `IAsyncProtocol` | Async protocol instance |
| `listenAddress` | `Address` | Address to listen on |
| `targetAddress` | `Address` | _(optional)_ Backend for proxy mode |
| `validation` | `AsyncValidationOptions` | _(optional)_ Auto-validation settings |

### Step Builder Methods

| Method | Mode | Description |
|--------|------|-------------|
| `onMessage(messageType, matcher?)` | hook | Handle incoming message |
| `waitMessage(messageType, options?)` | wait | Block until message arrives |
| `waitConnection()` | wait | Block until client connects |
| `waitDisconnect()` | wait | Block until client disconnects |

## DataSource

Direct SDK access to databases/caches.

```typescript
new DataSource(name: string, options: DataSourceOptions)
```

| Option | Type | Description |
|--------|------|-------------|
| `adapter` | `IDataSourceAdapter` | DataSource adapter instance |

### Step Builder Methods

| Method | Mode | Description |
|--------|------|-------------|
| `exec(description, fn, options?)` | action | Execute operations on the data store |

## Publisher

Publishes messages to message queue topics.

```typescript
new Publisher(name: string, options: PublisherOptions)
```

| Option | Type | Description |
|--------|------|-------------|
| `adapter` | `IMQAdapter` | MQ adapter instance |
| `schema` | `MQSchemaInput` | _(optional)_ Topic-based schemas |
| `validation` | `MQValidationOptions` | _(optional)_ Auto-validation settings |

### Step Builder Methods

| Method | Mode | Description |
|--------|------|-------------|
| `publish(topic, data, options?)` | action | Publish a message |
| `publishBatch(topic, messages)` | action | Publish multiple messages |

## Subscriber

Subscribes to messages from message queue topics.

```typescript
new Subscriber(name: string, options: SubscriberOptions)
```

| Option | Type | Description |
|--------|------|-------------|
| `adapter` | `IMQAdapter` | MQ adapter instance |
| `schema` | `MQSchemaInput` | _(optional)_ Topic-based schemas |
| `validation` | `MQValidationOptions` | _(optional)_ Auto-validation settings |

### Step Builder Methods

| Method | Mode | Description |
|--------|------|-------------|
| `onMessage(topic)` | hook | Non-blocking message handler |
| `waitMessage(topic, options?)` | wait | Block until message arrives |

## HttpProtocol

Built-in HTTP protocol using Express server and fetch client.

```typescript
// Loose mode
new HttpProtocol()

// Explicit generic mode
new HttpProtocol<ServiceDef>()

// Schema-first mode
new HttpProtocol({ schema: zodSchemas })
```

## Hook Builder Methods

All hook builders support these chaining methods:

| Method | Description |
|--------|-------------|
| `.assert(fn)` | Validate payload |
| `.assert(description, fn)` | Validate with named assertion |
| `.transform(fn)` | Transform payload |
| `.delay(ms)` | Add delay |
| `.drop()` | Drop message |
| `.mockResponse(fn)` | Mock response (sync server only) |
| `.mockEvent(type, fn)` | Send event (async server only) |
| `.proxy(fn?)` | Forward to backend (proxy mode) |
| `.validate()` | Validate against schema |
| `.validate(schema)` | Validate against explicit schema |
| `.timeout(ms)` | Set timeout (wait steps only) |

## Types

### Address

```typescript
interface Address {
  host: string;
  port: number;
  path?: string;
}
```

### SchemaLike

```typescript
interface SchemaLike<T> {
  parse(data: unknown): T;
}
```

### ValidationError

```typescript
class ValidationError extends Error {
  componentName: string;
  operationId: string;
  direction: string;
  cause: Error;
}
```

### JsonCodec

```typescript
new JsonCodec(options?: {
  reviver?: (key: string, value: unknown) => unknown;
  replacer?: (key: string, value: unknown) => unknown;
})
```
