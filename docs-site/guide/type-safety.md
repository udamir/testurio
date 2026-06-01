# Type Safety

Testurio is built around TypeScript's type system. When you declare a protocol with a service definition, every step builder you obtain from `test.use(component)` is typed against that definition — operation IDs, request payloads, response bodies, message types, path parameters, and topic payloads are all checked at compile time.

This page explains the three typing modes, how types propagate through the API, and what gets validated where.

## Why Type Safety Matters

Without typed protocols, a typo in an operation ID, a missing field in a mock response, or a wrong path parameter is only caught at runtime — usually as a confusing timeout or assertion failure. With a typed protocol, these become red squiggles in your editor:

```typescript
const api = test.use(client);

api.request('getUserr', { method: 'GET', path: '/users/1' });
//          ^^^^^^^^^^ ✗ Argument of type '"getUserr"' is not assignable...

api.request('getUser', { method: 'POST', path: '/users/1' });
//                                ^^^^^^ ✗ Type '"POST"' is not assignable to '"GET"'

api.onResponse('getUser').assert((res) => res.body.naem === 'Alice');
//                                                ^^^^ ✗ Property 'naem' does not exist
```

## The Three Modes

| Mode                 | Declaration                                    | Operation IDs    | Payload types          | Runtime validation |
| -------------------- | ---------------------------------------------- | ---------------- | ---------------------- | ------------------ |
| **Loose**            | `new HttpProtocol()`                           | any string       | `unknown`              | no                 |
| **Explicit generic** | `new HttpProtocol<UserApi>()`                  | keys of `UserApi` | inferred from `UserApi` | no                 |
| **Schema-first**     | `new HttpProtocol({ schema: userApiSchema })` | keys of schema   | inferred from schema   | **yes (automatic)**|

Pick a mode per protocol — different components in the same scenario can use different modes. Most projects start in loose mode for the first prototype, move to explicit generics once the API shape stabilises, and adopt schema-first once they want runtime validation as well.

## Sync Service Definition (HTTP, gRPC Unary)

A sync service definition is an interface where each key is an operation ID and each value declares a `request` / `response` pair.

```typescript
interface UserApi {
  getUser: {
    request:  { method: 'GET';    path: '/users/{id}' };
    response: { code: 200;        body: { id: number; name: string } };
  };
  createUser: {
    request:  { method: 'POST';   path: '/users'; body: { name: string; email: string } };
    response: { code: 201;        body: { id: number; name: string; email: string } };
  };
  deleteUser: {
    request:  { method: 'DELETE'; path: '/users/{id}' };
    response: { code: 204;        body?: never };
  };
}

const client = new Client('api', {
  protocol: new HttpProtocol<UserApi>(),
  targetAddress: { host: 'localhost', port: 3000 },
});
```

### Path Parameters

`HttpProtocol` understands `{param}` placeholders in `path` and rewrites the type so that the client accepts any concrete string at that position:

```typescript
// Declared: path: '/users/{id}'
// Accepted by client.request(): path: `/users/${string}`

api.request('getUser', { method: 'GET', path: '/users/1' });        // ✓
api.request('getUser', { method: 'GET', path: '/users/abc-123' });  // ✓
api.request('getUser', { method: 'GET', path: '/users' });          // ✗ missing segment
```

On the server side the same path template is exposed as a typed `params` object:

```typescript
mock.onRequest('getUser').mockResponse((req) => ({
  code: 200,
  body: { id: Number(req.params.id), name: 'Alice' },
  //                  ^^^^ typed as string, extracted from the path
}));
```

### Response Discrimination

Literal types in `response.code` give you discriminated unions for free:

```typescript
interface AuthApi {
  login: {
    request:  { method: 'POST'; path: '/login'; body: { user: string; pass: string } };
    response:
      | { code: 200; body: { token: string } }
      | { code: 401; body: { error: 'invalid_credentials' } };
  };
}

api.onResponse('login').assert((res) => {
  if (res.code === 200) {
    return res.body.token.length > 0;
    //              ^^^^^ narrowed to { token: string }
  }
  return res.body.error === 'invalid_credentials';
  //              ^^^^^ narrowed to { error: 'invalid_credentials' }
});
```

## Async Service Definition (WebSocket, TCP, gRPC Stream)

Async protocols use two maps: `clientMessages` (client → server) and `serverMessages` (server → client). They are intentionally separate so the compiler can prevent a client from sending a server-only message type and vice versa.

```typescript
import type { WsServiceDefinition } from '@testurio/protocol-ws';

interface ChatService extends WsServiceDefinition {
  clientMessages: {
    join:    { roomId: string; userId: string };
    message: { text: string };
    leave:   { reason?: string };
  };
  serverMessages: {
    joined:  { roomId: string; success: boolean };
    message: { userId: string; text: string; timestamp: number };
    error:   { code: number; message: string };
  };
}

const wsClient = new AsyncClient('ws', {
  protocol: new WebSocketProtocol<ChatService>(),
  targetAddress: { host: 'localhost', port: 8080 },
});
```

`sendMessage` is restricted to `clientMessages` keys; `onEvent` / `waitEvent` are restricted to `serverMessages` keys:

```typescript
ws.sendMessage('join', { roomId: 'general', userId: 'alice' });   // ✓
ws.sendMessage('joined', { roomId: 'general', success: true });   // ✗ wrong direction
ws.waitEvent('message').assert((m) => m.timestamp > 0);           // ✓
ws.waitEvent('leave');                                            // ✗ wrong direction
```

On the server side the same definition flips: `onMessage` covers `clientMessages`, `mockEvent`/`sendEvent`/`broadcast` cover `serverMessages`.

```typescript
mock.onMessage('join').mockEvent('joined', (msg) => ({
  roomId: msg.roomId,
  //          ^^^^^^ typed as string from clientMessages.join
  success: true,
}));
```

TCP and gRPC streaming use the same shape — just substitute `TcpServiceDefinition` or your gRPC stream type:

```typescript
import type { TcpServiceDefinition } from '@testurio/protocol-tcp';

interface OrderStream extends TcpServiceDefinition {
  clientMessages: {
    new_order:    { price: number; amount: number };
    cancel_order: { order_id: string };
  };
  serverMessages: {
    order_confirm: { order_id: string; price: number };
    order_reject:  { reason: string };
  };
}
```

## gRPC Unary Service Definition

gRPC Unary protocols use the sync shape (`request` / `response` per operation), but operation IDs are RPC method names:

```typescript
interface UserService {
  GetUser: {
    request:  { user_id: number };
    response: { id: number; name: string; email: string };
  };
  CreateUser: {
    request:  { name: string; email: string };
    response: { id: number; name: string; email: string };
  };
}

const grpcClient = new Client('grpc', {
  protocol: new GrpcUnaryProtocol<UserService>({
    protoPath: 'proto/user.proto',
    serviceName: 'user.v1.UserService',
  }),
  targetAddress: { host: 'localhost', port: 50051 },
});
```

## Message Queue Topics

`Publisher` and `Subscriber` take a `Topics` generic where keys are topic names and values are payload types:

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
  adapter: new KafkaAdapter({ brokers: ['localhost:9092'], groupId: 'test' }),
});
```

`publish` enforces the topic + payload combination, and `waitMessage` returns the payload typed against the topic key:

```typescript
pub.publish('order-created', { orderId: 'ORD-1', customerId: 'C-1', total: 99.99 }); // ✓
pub.publish('order-shipped', { orderId: 'ORD-1' });                                  // ✗ missing trackingNumber

sub.waitMessage('order-created').assert((m) => m.payload.total > 0);
//                                                       ^^^^^ typed as number
```

## How Types Flow Through `test.use(component)`

The type of a component carries its protocol generic, and `test.use(component)` returns a step builder bound to that generic. You never re-declare the type — it cascades from the component definition:

```typescript
const client = new Client('api', {
  protocol: new HttpProtocol<UserApi>(),  // ← generic anchored here
  targetAddress: { host: 'localhost', port: 3000 },
});

const tc = testCase('flow', (test) => {
  const api = test.use(client);
  //    ^? SyncClientStepBuilder<HttpProtocol<UserApi>>

  api.request('getUser', /* ← request shape resolved from UserApi['getUser']['request'] */);
  api.onResponse('getUser').assert((res) => /* ← res typed as UserApi['getUser']['response'] */);
});
```

This is why you should always type the protocol on the component (not on individual steps): one declaration powers every builder method downstream.

## Schema-First Mode

Schema-first mode trades a TypeScript interface for a Zod-style schema and gets you two things at once: **the same compile-time types** (inferred from the schema) **plus runtime validation** at I/O boundaries.

```typescript
import { z } from 'zod';

const userApiSchema = {
  getUser: {
    request: z.object({
      method: z.literal('GET'),
      path: z.literal('/users/{id}'),
    }),
    response: z.object({
      code: z.literal(200),
      body: z.object({ id: z.number(), name: z.string() }),
    }),
  },
};

// No generic — types inferred from schema
const client = new Client('api', {
  protocol: new HttpProtocol({ schema: userApiSchema }),
  targetAddress: { host: 'localhost', port: 3000 },
});

// Same type-safety as explicit generic mode
api.request('getUser', { method: 'GET', path: '/users/1' });
api.onResponse('getUser').assert((res) => res.body.name === 'Alice');
```

When schemas are present, outgoing requests/messages and incoming responses/events are automatically `.parse()`-ed at the adapter boundary. A bad payload throws a `ValidationError` with operation ID and direction attached. See [Schema Validation](/guide/schema-validation) for the validation knobs.

The schema doesn't have to be Zod — any object with a `.parse(data): T` method (Valibot, ArkType, custom) satisfies the `SchemaLike` interface.

## Loose Mode as an Escape Hatch

Omit the generic when you want a throwaway probe, a quick repro, or you genuinely don't know the wire format yet:

```typescript
const client = new Client('api', {
  protocol: new HttpProtocol(),       // no generic — loose mode
  targetAddress: { host: 'localhost', port: 3000 },
});

api.request('anything', { method: 'GET', path: '/whatever' });
api.onResponse('anything').assert((res) => res.code === 200);
//                                        ^^^ res.body is `unknown` — must guard before use
```

Loose mode is also useful per-operation: if 95 % of your API is declared but you need to probe an undocumented endpoint, drop a single component into loose mode rather than weakening the strict definition.

## Auto-Completion You Get for Free

Once a protocol is typed, your editor surfaces:

- Valid operation IDs / message types / topic names on `request`, `onRequest`, `sendMessage`, `waitEvent`, `publish`, `waitMessage`, etc.
- Field-level autocomplete inside the request/response/payload object literals
- `params.<paramName>` autocomplete on HTTP server handlers
- Narrowed unions in `.assert(...)` callbacks (e.g. by `res.code`)

These are the same features the runtime uses for matching and routing, so what compiles is what runs.

## Matchers and Factories Preserve Types

Per-operation matchers, payload factories, and request transforms all preserve the protocol-level types:

```typescript
// Matcher: typed against the operation's request shape
api.waitEvent('order_confirm', {
  matcher: (e) => e.price === 1.9,
  //               ^^^^^ typed as number from serverMessages.order_confirm
});

// Factory: typed against the operation's request shape
api.request('createUser', () => ({
  method: 'POST' as const,
  path: '/users',
  body: { name: dynamicName, email: dynamicEmail },
  //      ^^^^ required by UserApi.createUser.request.body
}));

// Transform: typed against the request/response in flight
proxy.onRequest('getUser').transform((req) => ({
  ...req,
  headers: { ...req.headers, 'X-Trace': traceId },
}));
```

## Mixing Modes in One Scenario

Each component carries its own protocol generic, so a scenario can mix modes freely:

```typescript
const scenario = new TestScenario({
  name: 'Mixed modes',
  components: [
    new Server('backend', {
      protocol: new HttpProtocol<UserApi>(),         // explicit generic
      listenAddress: { host: 'localhost', port: 3000 },
    }),
    new Client('probe', {
      protocol: new HttpProtocol(),                  // loose — for an undocumented endpoint
      targetAddress: { host: 'localhost', port: 3000 },
    }),
    new AsyncClient('ws', {
      protocol: new WebSocketProtocol({ schema: chatSchema }), // schema-first
      targetAddress: { host: 'localhost', port: 8080 },
    }),
  ],
});
```

## Common Pitfalls

**Forgetting `as const` on a factory request.** TypeScript widens `'GET'` to `string` unless you assert the literal, which then fails to satisfy `method: 'GET'`:

```typescript
api.request('getUser', () => ({
  method: 'GET' as const,   // ← required
  path: '/users/1',
}));
```

**Defining the service on the step instead of the component.** Always anchor the generic on the protocol passed to the component:

```typescript
// ✗ Generic lost — every step is `unknown`
new Client('api', { protocol: new HttpProtocol(), targetAddress: { ... } });

// ✓ Anchored — types flow into every test.use(client) builder
new Client('api', { protocol: new HttpProtocol<UserApi>(), targetAddress: { ... } });
```

**Reusing `interface UserApi` between HTTP and gRPC.** They have incompatible request shapes — HTTP has `method`/`path`, gRPC has the message fields directly. Define them separately.

**Sharing one definition between client and server with diverging mocks.** The `params` field is required on the server side (extracted from the path template) but absent on the client side. Both sides use the same `UserApi` interface — the protocol does the perspective-shifting for you. Don't try to do it manually.

## Next Steps

- [Schema Validation](/guide/schema-validation) — Add runtime validation on top of the inferred types
- [Components Guide](/guide/components) — Per-component step builder methods
- [Protocols Guide](/guide/protocols) — Protocol options and codecs
- [CLI Guide](/guide/cli) — Generate schema files from OpenAPI / `.proto`
