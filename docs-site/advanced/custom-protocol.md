# Custom Protocol

How to create a custom protocol for Testurio. Protocols are stateless adapter factories — they create server and client adapters but hold no state themselves.

## Choose Your Protocol Type

| Type | Interface | Use Case |
|------|-----------|----------|
| Sync | `ISyncProtocol` | Request/response (HTTP, gRPC Unary) |
| Async | `IAsyncProtocol` | Bidirectional/streaming (WebSocket, TCP) |

## Sync Protocol

### Interface

```typescript
interface ISyncProtocol<M extends SyncOperations> {
  readonly type: string;
  readonly $types: M;
  createServer(config: ServerProtocolConfig): Promise<ISyncServerAdapter>;
  createClient(config: ClientProtocolConfig): Promise<ISyncClientAdapter>;
  createMessageTypeMatcher?(messageType: string, payload: unknown): MessageMatcher | string;
}
```

### Step-by-Step Implementation

```typescript
import type {
  ISyncProtocol,
  ISyncServerAdapter,
  ISyncClientAdapter,
  ServerProtocolConfig,
  ClientProtocolConfig,
  SyncOperations,
} from 'testurio';

class MyProtocol<M extends SyncOperations = SyncOperations>
  implements ISyncProtocol<M>
{
  readonly type = 'my-protocol';
  readonly $types!: M; // phantom type — never assigned at runtime

  async createServer(config: ServerProtocolConfig): Promise<ISyncServerAdapter> {
    // Create and return your server adapter
    return new MyServerAdapter(config);
  }

  async createClient(config: ClientProtocolConfig): Promise<ISyncClientAdapter> {
    // Create and return your client adapter
    return new MyClientAdapter(config);
  }
}
```

### Server Adapter

```typescript
interface ISyncServerAdapter {
  onRequest<TReq, TRes>(
    handler: (messageType: string, request: TReq) => Promise<TRes | null>,
  ): void;
  stop(): Promise<void>;
}
```

```typescript
class MyServerAdapter implements ISyncServerAdapter {
  private handler?: (messageType: string, request: unknown) => Promise<unknown>;

  constructor(private config: ServerProtocolConfig) {
    // Start listening on config.listenAddress
  }

  onRequest<TReq, TRes>(
    handler: (messageType: string, request: TReq) => Promise<TRes | null>,
  ): void {
    this.handler = handler as (messageType: string, request: unknown) => Promise<unknown>;
  }

  async stop(): Promise<void> {
    // Clean up server resources
  }
}
```

### Client Adapter

```typescript
interface ISyncClientAdapter {
  request<TReq, TRes>(messageType: string, data: TReq, timeout?: number): Promise<TRes>;
  close(): Promise<void>;
}
```

```typescript
class MyClientAdapter implements ISyncClientAdapter {
  constructor(private config: ClientProtocolConfig) {
    // Connect to config.targetAddress
  }

  async request<TReq, TRes>(
    messageType: string,
    data: TReq,
    timeout?: number,
  ): Promise<TRes> {
    // Send request and return response
  }

  async close(): Promise<void> {
    // Clean up client resources
  }
}
```

## Async Protocol

### Interface

```typescript
interface IAsyncProtocol<M extends AsyncMessages> {
  readonly type: string;
  readonly $types: M;
  createServer(config: ServerProtocolConfig): Promise<IAsyncServerAdapter>;
  createClient(config: ClientProtocolConfig): Promise<IAsyncClientAdapter>;
}
```

### Implementation

```typescript
class MyAsyncProtocol<M extends AsyncMessages = AsyncMessages>
  implements IAsyncProtocol<M>
{
  readonly type = 'my-async-protocol';
  readonly $types!: M;

  async createServer(config: ServerProtocolConfig): Promise<IAsyncServerAdapter> {
    return new MyAsyncServerAdapter(config);
  }

  async createClient(config: ClientProtocolConfig): Promise<IAsyncClientAdapter> {
    return new MyAsyncClientAdapter(config);
  }
}
```

### Async Server Adapter

```typescript
interface IAsyncServerAdapter {
  onConnection(handler: (connection: IAsyncClientAdapter) => void): void;
  stop(): Promise<void>;
}
```

### Async Client Adapter

```typescript
interface IAsyncClientAdapter<TContext = unknown> {
  readonly id: string;
  readonly context?: TContext;
  readonly isConnected: boolean;
  send(message: Message): Promise<void>;
  close(): Promise<void>;
  onMessage(handler: (message: Message) => void): void;
  onClose(handler: () => void): void;
  onError(handler: (error: Error) => void): void;
}
```

## Configuration Types

```typescript
interface ServerProtocolConfig {
  listenAddress: Address;
  targetAddress?: Address; // present when in proxy mode
}

interface ClientProtocolConfig {
  targetAddress: Address;
}

interface Address {
  host: string;
  port: number;
  path?: string;
}
```

## Packaging

Package your protocol as `@testurio/protocol-*` or `testurio-protocol-*`:

```
my-protocol/
├── src/
│   ├── protocol.ts      # ISyncProtocol/IAsyncProtocol
│   ├── server-adapter.ts
│   ├── client-adapter.ts
│   └── index.ts
├── package.json          # peerDependency on "testurio"
└── tsconfig.json
```

```json
{
  "peerDependencies": {
    "testurio": "^0.x"
  }
}
```

## Usage

```typescript
import { Client, Server, TestScenario } from 'testurio';
import { MyProtocol } from 'my-protocol';

const server = new Server('my-server', {
  protocol: new MyProtocol<MyServiceDef>(),
  listenAddress: { host: 'localhost', port: 5000 },
});
```
