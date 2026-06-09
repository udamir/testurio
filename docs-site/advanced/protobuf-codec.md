# ProtobufCodec

`@testurio/codec-protobuf` ships a first-class `Codec` that dispatches per-topic to the correct protobuf message type. One codec instance handles every topic the `Publisher` / `Subscriber` emits or receives — exact, RegExp, and predicate matchers can mix freely in the same bindings array.

## Install

```bash
pnpm add -D @testurio/codec-protobuf
```

Peer-depends on `testurio` and depends on `protobufjs` directly.

## Quick start

Two equivalent ways to construct the bindings — a raw array, or the typed `defineBindings` helper:

::: code-group

```typescript [Raw bindings]
import { Publisher, Subscriber } from 'testurio';
import { KafkaAdapter } from '@testurio/adapter-kafka';
import { ProtobufCodec } from '@testurio/codec-protobuf';

const codec = new ProtobufCodec({
  proto: './events.proto',
  bindings: [
    { match: 'orders.v1',                   type: 'pkg.OrderEvent' },
    { match: /^events\.user\..+/,           type: 'pkg.UserEvent' },
    { match: (k) => k.startsWith('audit.'), type: 'pkg.AuditEvent' },
  ],
});

const adapter = new KafkaAdapter({ brokers: ['localhost:9092'] });
const pub = new Publisher<MyTopics>('p', { adapter, codec });
const sub = new Subscriber<MyTopics>('s', { adapter, codec });
```

```typescript [defineBindings (typed)]
import { Publisher, Subscriber } from 'testurio';
import { KafkaAdapter } from '@testurio/adapter-kafka';
import { ProtobufCodec, defineBindings } from '@testurio/codec-protobuf';

type Registry = {
  'pkg.OrderEvent': OrderEvent;
  'pkg.UserEvent':  UserEvent;
  'pkg.AuditEvent': AuditEvent;
};

interface MyTopics {
  'orders.v1': OrderEvent;
  'users.v1': UserEvent;
}

const codec = new ProtobufCodec({
  proto: './events.proto',
  bindings: defineBindings<MyTopics, Registry>()([
    { match: 'orders.v1',                   type: 'pkg.OrderEvent' },
    { match: /^events\.user\..+/,           type: 'pkg.UserEvent' },
    { match: (k) => k.startsWith('audit.'), type: 'pkg.AuditEvent' },
  ]),
});
```

:::

The codec uses the **dispatch key** (set by the adapter to the concrete topic) to pick which protobuf type to encode or decode. First match wins.

## Bindings shape

`bindings` is an ordered array. Each entry pairs a **matcher** with a fully-qualified protobuf **type** name.

| Matcher kind | Use for                                                                                |
| ------------ | -------------------------------------------------------------------------------------- |
| `string`     | Exact match — `key === match`.                                                         |
| `RegExp`     | Kafka RegExp subscribers, ad-hoc regex. Use `^…$` for strict single-segment matches.   |
| `(key) => boolean` | AMQP / glob wildcards, runtime conditions (compose adapter matcher utilities).   |

Entries evaluate top-to-bottom; the first matching entry wins. Put more-specific matchers before catch-alls:

```typescript
bindings: [
  { match: 'events.orders.priority', type: 'pkg.PriorityOrder' }, // specific first
  { match: /^events\.orders\..+$/,   type: 'pkg.OrderEvent' },    // catch-all
];
```

Predicate matchers that throw are treated as **no-match** and the scan continues; the last thrown error is attached to the resulting `CodecError.cause` if no later entry matches (R7).

## `defineBindings` typed helper

`defineBindings<TopicMap, Registry>()` is a pure type-level pass-through. Runtime returns the entries verbatim — the value of the helper is the constraint on its input:

- Every entry's `type` must be a key of `Registry` (catches FQN typos).
- For **string-match** entries, `Registry[entry.type]` must be assignable to `TopicMap[entry.match]` (catches topic ↔ wire-type mismatches).
- For **RegExp / predicate** entries, only the `type ∈ keyof Registry` constraint applies (a RegExp can't be statically resolved to a topic key).

```typescript
const bindings = defineBindings<MyTopics, Registry>()([
  { match: 'orders.v1', type: 'pkg.OrderEvent' }, // ✅
  // { match: 'users.v1', type: 'pkg.OrderEvent' }, // ❌ TS error
  { match: /^audit\./,  type: 'pkg.OrderEvent' }, // ✅ (RegExp — type checked only)
]);
```

**What `defineBindings` does NOT catch:**

- The user-declared `Registry` is not validated against the actual `.proto` source. A codegen tool is the only way to close this fully.
- RegExp / predicate matchers are statically untyped against `TopicMap` because the matcher's effective key set is runtime-determined.

Raw `bindings: [...]` arrays continue to work for users who don't want the `Registry` overhead. `defineBindings` is the recommended path for production codebases.

## `decodeOptions`

Defaults to `{ defaults: true, longs: String, enums: String }`. `bytes` is intentionally omitted so binary fields round-trip as `Uint8Array` via protobufjs's native default. Override per the `protobufjs.IConversionOptions` shape:

```typescript
new ProtobufCodec({
  proto: './events.proto',
  bindings: [/* … */],
  decodeOptions: { defaults: true, longs: Number, enums: Number },
});
```

## `keepCase`

Top-level `keepCase?: boolean` option, forwarded to protobufjs's parser at `.proto` load time. It controls field naming for **both** decode output and encode input, so encode and decode always agree.

| Value             | Behaviour                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `false` (default) | protobufjs's native behaviour — proto `snake_case` fields become `camelCase` on the JS side (`{ orderId: … }`).                       |
| `true`            | Preserve the original `.proto` field names verbatim (conventionally `snake_case`). `decode` emits `{ order_id: … }`; `encode` reads the same. |

```typescript
// camelCase (default)
new ProtobufCodec({ proto: './events.proto', bindings: [/* … */] });
// → decode: { orderId: 'o-1', amount: 1 }

// snake_case
new ProtobufCodec({ proto: './events.proto', keepCase: true, bindings: [/* … */] });
// → decode: { order_id: 'o-1', amount: 1 }
```

## Loading `.proto` files with dependencies

`ProtobufCodec` accepts `proto: string | string[]`. Three patterns cover every real-world case:

### 1. Single file with relative imports

```typescript
// schemas/events.proto
//   import "common.proto";
//   import "google/protobuf/timestamp.proto";

new ProtobufCodec({
  proto: './schemas/events.proto',
  bindings: [{ match: 'orders.v1', type: 'pkg.OrderEvent' }],
});
```

Imports resolve next to the file. Well-known types (`google/protobuf/*`) auto-resolve from protobufjs's bundled common definitions.

### 2. Multiple top-level files

```typescript
new ProtobufCodec({
  proto: ['./schemas/orders.proto', './schemas/users.proto'],
  bindings: [
    { match: 'orders.v1', type: 'pkg.OrderEvent' },
    { match: 'users.v1',  type: 'pkg.UserEvent' },
  ],
});
```

Cross-file imports between the listed files resolve normally.

### 3. `protoc -I include/path` semantics

```typescript
import path from 'node:path';

// Files: schemas/events/orders.proto, schemas/shared/types.proto
// orders.proto says: import "shared/types.proto";

new ProtobufCodec({
  proto: [path.resolve(__dirname, 'schemas/events/orders.proto')],
  includePaths: [path.resolve(__dirname, 'schemas')],
  bindings: [{ match: 'orders.v1', type: 'pkg.OrderEvent' }],
});
```

`includePaths` are searched in order; the default `Root.resolvePath` (next-to-origin + bundled well-known types) is still consulted if none match.

Pre-bundled `Root.fromJSON` descriptors are not currently supported (filed as a follow-up).

## Codec usage by transport

The codec contract is **uniform**: codec authors only need to know that they receive a concrete dispatch key. Per-transport differences live in the **adapter** — what value the adapter chooses for the key.

### Kafka — topic key

The adapter passes the broker's concrete topic. Mix matcher kinds freely:

```typescript
const codec = new ProtobufCodec({
  proto: './events.proto',
  bindings: [
    { match: 'orders.v1',                   type: 'pkg.OrderEvent' },
    { match: /^events\.user\..+/,           type: 'pkg.UserEvent' },
    { match: (k) => k.startsWith('audit.'), type: 'pkg.AuditEvent' },
  ],
});

const pub = new Publisher<MyTopics>('p', { adapter, codec });
const sub = new Subscriber<MyTopics>('s', { adapter, codec });
```

### RabbitMQ — concrete routing key (no AMQP mask)

The adapter passes `msg.fields.routingKey` — the broker-delivered routing key, never the subscription pattern. Compose predicate matchers with an AMQP wildcard helper:

```typescript
// Inline helper — replaces `import { matchAmqpTopic } from '@testurio/adapter-rabbitmq'`
// once task 039 lands. Identical semantics.
function matchAmqpTopic(pattern: string, routingKey: string): boolean {
  const regex = new RegExp(
    '^' +
      pattern
        .split('.')
        .map((seg) =>
          seg === '*' ? '[^.]+' : seg === '#' ? '.*' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        )
        .join('\\.') +
      '$',
  );
  return regex.test(routingKey);
}

const codec = new ProtobufCodec({
  proto: './events.proto',
  bindings: [
    { match: 'orders.created',                     type: 'pkg.OrderCreated' },
    { match: (k) => matchAmqpTopic('orders.*', k), type: 'pkg.OrderEvent' },
    { match: (k) => matchAmqpTopic('users.#', k),  type: 'pkg.UserEvent' },
  ],
});
```

### Redis Pub/Sub — concrete channel (no glob mask)

The adapter passes the concrete `channel`. Compose predicates with a glob helper:

```typescript
// Inline helper — replaces `import { matchGlobChannel } from '@testurio/adapter-redis'`
// once task 039 lands.
function matchGlobChannel(pattern: string, channel: string): boolean {
  const regex = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
        .replace(/\[([^\]]+)\]/g, '[$1]') +
      '$',
  );
  return regex.test(channel);
}

const codec = new ProtobufCodec({
  proto: './events.proto',
  bindings: [
    { match: (k) => matchGlobChannel('orders.*', k),       type: 'pkg.OrderEvent' },
    { match: (k) => matchGlobChannel('user[12].login', k), type: 'pkg.UserLogin' },
  ],
});
```

The Redis Pub/Sub adapter wraps every payload in an envelope before invoking the codec. The bound `type` must be the envelope type (e.g. `RedisEnvelope` from the test fixture), not the inner payload type. The default `decodeOptions` leaves `bytes` at protobufjs's `Uint8Array` default so the inner payload bytes survive a round-trip.

### WebSocket, TCP, HTTP, gRPC — illustrative

These transports don't get codec dispatch wiring in this release; the snippets below show how the same primitive carries forward once those follow-ups land.

::: details WebSocket — envelope `type` field
WS adapters don't carry a per-message topic. A follow-up task will add an opt-in `envelope: (raw) => { key, payload }` hook on `WsProtocol`. Once landed:

```typescript
const codec = new ProtobufCodec({
  proto: './ws-messages.proto',
  bindings: [
    { match: 'OrderPlaced',             type: 'pkg.OrderPlaced' },
    { match: 'UserLoggedIn',            type: 'pkg.UserLoggedIn' },
    { match: /^(Heartbeat|Ack|Error)$/, type: 'pkg.ControlFrame' },
  ],
});
```
:::

::: details TCP — hand-rolled codec recommended today
TCP is a stream protocol with no inherent per-message identity. The TCP adapter calls `codec.decode(bytes)` with `key === undefined`, and `ProtobufCodec` deliberately throws on undefined keys. For TCP today, write a hand-rolled `Codec` around `Type.encode` / `Type.decode`:

```typescript
import * as protobuf from 'protobufjs';
import type { Codec } from 'testurio';

const root = protobuf.loadSync('./tcp.proto');
const WireFrame = root.lookupType('pkg.WireFrame');

const tcpCodec: Codec<Uint8Array> = {
  name: 'tcp-wire-frame',
  wireFormat: 'binary',
  encode: (data, _key) => WireFrame.encode(WireFrame.fromObject(data as object)).finish(),
  decode: (wire, _key) => {
    const bytes = typeof wire === 'string' ? new TextEncoder().encode(wire) : wire;
    return WireFrame.toObject(WireFrame.decode(bytes), { defaults: true });
  },
};
```
:::

::: details HTTP — operationId, suffixed by direction
HTTP currently inlines `JSON.stringify` / `JSON.parse`. Once a future task adds a `codec` slot to `HttpProtocol`, the natural dispatch key is the OpenAPI `operationId` (optionally suffixed with `:request` / `:response`):

```typescript
const codec = new ProtobufCodec({
  proto: './api.proto',
  bindings: [
    { match: 'getOrder:request',    type: 'pkg.GetOrderRequest' },
    { match: 'getOrder:response',   type: 'pkg.GetOrderResponse' },
    { match: 'createOrder:request', type: 'pkg.CreateOrderRequest' },
    { match: ':response$' as unknown as RegExp /* once supported */, type: 'pkg.GenericResponse' },
  ],
});
```
:::

::: details gRPC — fully-qualified method name
`@grpc/grpc-js` owns protobuf encode/decode internally. A future codec hook would either pre-encode the request before grpc-js or post-decode the response. When that lands, the dispatch key is the fully-qualified method name:

```typescript
const codec = new ProtobufCodec({
  proto: './service.proto',
  bindings: [
    { match: 'pkg.OrderService/GetOrder',    type: 'pkg.GetOrderResponse' },
    { match: 'pkg.OrderService/CreateOrder', type: 'pkg.CreateOrderResponse' },
    { match: /\/StreamUpdates$/,             type: 'pkg.UpdateEvent' },
  ],
});
```
:::

## Error behaviour

`ProtobufCodec` throws `CodecError` when no entry matches the dispatch key. The error message lists every configured entry's matcher (`string` matchers JSON-quoted, RegExp via `toString()`, predicates as `<predicate>`) plus its target type:

```text
CodecError: Failed to decode message with protobuf codec: No binding entry matched key='unmapped.v1' — ProtobufCodec entries: ["orders.v1" → .pkg.OrderEvent, /^users\..+/ → .pkg.UserEvent]
```

If a predicate threw during the scan, the last thrown error is attached to the wrapped error's `.cause` — reachable via `(err as CodecError).cause?.cause`.

**No silent fallback.** Mixed-codec setups (e.g. JSON for some topics, protobuf for others) should split into separate `Publisher` / `Subscriber` instances.

See also: [Custom Codec](/advanced/custom-codec), [Message Queue examples](/examples/message-queues).
