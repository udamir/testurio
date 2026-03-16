# Schema Validation

Testurio supports runtime payload validation using Zod-compatible schemas. Schemas serve a dual purpose: **TypeScript type inference** (eliminating manual generic parameters) and **runtime validation** at I/O boundaries.

## Schema-First Protocols

Pass a schema map to the protocol constructor. TypeScript infers all types automatically — no manual generic parameter needed:

```typescript
import { z } from 'zod';
import { Client, Server, HttpProtocol } from 'testurio';

const userApiSchema = {
  getUsers: {
    request: z.object({ method: z.literal('GET'), path: z.literal('/users') }),
    response: z.object({
      code: z.literal(200),
      body: z.array(z.object({ id: z.number(), name: z.string() })),
    }),
  },
};

// Types are inferred from schema — no generic needed
const client = new Client('api', {
  protocol: new HttpProtocol({ schema: userApiSchema }),
  targetAddress: { host: 'localhost', port: 3000 },
});
```

This works across all protocol types:

```typescript
import { WebSocketProtocol } from '@testurio/protocol-ws';

const chatSchema = {
  clientMessages: {
    ping: z.object({ seq: z.number() }),
  },
  serverMessages: {
    pong: z.object({ seq: z.number(), timestamp: z.number() }),
  },
};

const wsClient = new AsyncClient('ws', {
  protocol: new WebSocketProtocol({ schema: chatSchema }),
  targetAddress: { host: 'localhost', port: 4000 },
});
```

## Auto-Validation

When schemas are registered, outgoing requests/messages and incoming responses/events are **automatically validated** at I/O boundaries. Invalid payloads throw a `ValidationError`.

```typescript
// Auto-validation is ON by default when schemas are provided
const client = new Client('api', {
  protocol: new HttpProtocol({ schema: userApiSchema }),
  targetAddress: { host: 'localhost', port: 3000 },
});
```

### Disabling Auto-Validation

You can selectively disable auto-validation:

```typescript
// Sync components (Client, Server)
const client = new Client('api', {
  protocol: new HttpProtocol({ schema: userApiSchema }),
  targetAddress: { host: 'localhost', port: 3000 },
  validation: {
    validateRequests: false,   // Skip outgoing request validation
    validateResponses: false,  // Skip incoming response validation
  },
});

// Async components (AsyncClient, AsyncServer)
const ws = new AsyncClient('ws', {
  protocol: new WebSocketProtocol({ schema: chatSchema }),
  targetAddress: { host: 'localhost', port: 4000 },
  validation: {
    validateMessages: false,  // Skip outgoing message validation
    validateEvents: false,    // Skip incoming event validation
  },
});

// MQ components (Publisher, Subscriber)
const pub = new Publisher('pub', {
  adapter: new KafkaAdapter({ brokers: ['localhost:9092'] }),
  schema: orderSchema,
  validation: {
    validateMessages: false,  // Skip message validation
  },
});
```

## Explicit `.validate()` Builder Method

Use `.validate()` on hook builders for per-step validation:

```typescript
const tc = testCase('validate response', (test) => {
  const api = test.use(client);
  const mock = test.use(server);

  api.request('getUsers', { method: 'GET', path: '/users' });
  mock.onRequest('getUsers').mockResponse(() => ({
    code: 200,
    body: [{ id: 1, name: 'Alice' }],
  }));

  // Validate using the protocol's registered schema
  api.onResponse('getUsers').validate();

  // Or validate with an explicit schema
  const UserListSchema = z.array(z.object({ id: z.number(), name: z.string() }));
  api.onResponse('getUsers').validate(UserListSchema);
});
```

## ValidationError

When validation fails, a `ValidationError` is thrown with context:

```typescript
class ValidationError extends Error {
  componentName: string;   // e.g., 'api'
  operationId: string;     // e.g., 'getUsers'
  direction: string;       // 'request' | 'response' | 'message' | 'event'
  cause: Error;            // The underlying Zod error
}
```

## SchemaLike Interface

Testurio is not tightly coupled to Zod. Any object with a `.parse()` method works:

```typescript
interface SchemaLike<T> {
  parse(data: unknown): T;
}
```

This is compatible with Zod, Yup (with a `.parse()` wrapper), or any custom validation library.

## Message Queue Schemas

Publisher and Subscriber components accept schemas at the component level:

```typescript
const orderSchema = {
  'order-created': z.object({ orderId: z.string(), amount: z.number() }),
  'order-shipped': z.object({ orderId: z.string(), trackingNumber: z.string() }),
};

const publisher = new Publisher('pub', {
  adapter: new KafkaAdapter({ brokers: ['localhost:9092'] }),
  schema: orderSchema,
});

const subscriber = new Subscriber('sub', {
  adapter: new KafkaAdapter({ brokers: ['localhost:9092'], groupId: 'test' }),
  schema: orderSchema,
});
```

## Three Typing Modes

| Mode | Usage | Runtime Validation |
|------|-------|--------------------|
| **Schema-first** | `new HttpProtocol({ schema: zodSchema })` | Yes — types inferred from schema |
| **Explicit generic** | `new HttpProtocol<ServiceDef>()` | No — compile-time types only |
| **Loose** | `new HttpProtocol()` | No — any string accepted |

## CLI-Generated Schemas

The `@testurio/cli` package generates `.schema.ts` files from OpenAPI specs and `.proto` files that are ready for schema-first usage:

```bash
testurio generate openapi.yaml
```

```typescript
// Generated file includes the protocol schema bridge
import { petStoreSchema } from './petstore.schema';

const protocol = new HttpProtocol({ schema: petStoreSchema });
```

See the [CLI Guide](/guide/cli) for more details.
