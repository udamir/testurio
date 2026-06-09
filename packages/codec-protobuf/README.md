# @testurio/codec-protobuf

Protobuf codec for testurio `Publisher` / `Subscriber` — per-topic message-type dispatch via the codec dispatch key.

A single codec instance handles every topic, exact, RegExp, and predicate matchers can mix freely in the same bindings array. First match wins. Throws `CodecError` when no entry matches — no silent fallback.

## Install

```bash
pnpm add -D @testurio/codec-protobuf
```

Peer-depends on `testurio` and depends on `protobufjs` directly.

## Quick start

```typescript
import { Publisher, Subscriber } from "testurio";
import { KafkaAdapter } from "@testurio/adapter-kafka";
import { ProtobufCodec } from "@testurio/codec-protobuf";

const codec = new ProtobufCodec({
  proto: "./events.proto",
  bindings: [
    { match: "orders.v1", type: "pkg.OrderEvent" },
    { match: /^events\.user\..+/, type: "pkg.UserEvent" },
    { match: (k) => k.startsWith("audit."), type: "pkg.AuditEvent" },
  ],
});

const adapter = new KafkaAdapter({ brokers: ["localhost:9092"] });
const pub = new Publisher<MyTopics>("p", { adapter, codec });
const sub = new Subscriber<MyTopics>("s", { adapter, codec });
```

## Bindings

Each entry pairs a **matcher** with a **fully-qualified protobuf type name**.

| Matcher kind | Use for                                                                              |
| ------------ | ------------------------------------------------------------------------------------ |
| `string`     | Exact match — `key === match`.                                                       |
| `RegExp`     | Kafka RegExp subscribers, ad-hoc regex. Use `^…$` for strict single-segment matches. |
| `(key) => boolean` | AMQP / glob wildcards (compose with adapter matcher utilities), runtime conditions. |

Entries evaluate in declaration order; the first match wins. Put more-specific matchers before catch-alls.

```typescript
bindings: [
  { match: "events.orders.priority", type: "pkg.PriorityOrder" }, // specific first
  { match: /^events\.orders\..+$/,   type: "pkg.OrderEvent" },    // catch-all
];
```

Matcher utilities like `matchAmqpTopic`, `matchGlobChannel`, and `matchRegex` live in the adapter packages. Import them directly from `@testurio/adapter-rabbitmq` / `@testurio/adapter-redis` / `@testurio/adapter-kafka` when composing predicate matchers — `@testurio/codec-protobuf` has no runtime dependency on the adapter packages.

## `defineBindings` typed helper

```typescript
import { defineBindings, ProtobufCodec } from "@testurio/codec-protobuf";

type Registry = {
  "pkg.OrderEvent": OrderEvent;
  "pkg.UserEvent": UserEvent;
};
interface MyTopics {
  "orders.v1": OrderEvent;
  "users.v1": UserEvent;
}

const bindings = defineBindings<MyTopics, Registry>()([
  { match: "orders.v1", type: "pkg.OrderEvent" }, // ✅
  // { match: "users.v1", type: "pkg.OrderEvent" }, // ❌ TS error
  { match: /^audit\./, type: "pkg.OrderEvent" },  // ✅ (RegExp — type checked only)
]);

const codec = new ProtobufCodec({ proto: "./events.proto", bindings });
```

The helper constrains every entry's `type` to `keyof Registry` (catches FQN typos) and, for string-match entries, requires `Registry[type]` to be assignable to `TopicMap[match]` (catches topic ↔ wire-type mismatches).

The user-declared `Registry` is not validated against the actual `.proto` source — a codegen tool is the only way to close that gap fully.

## Error behaviour

`ProtobufCodec` throws `CodecError` when no entry matches the dispatch key. The error message lists every configured entry's matcher + target type. If a predicate threw during the scan, the last error is attached to `.cause`.

```text
CodecError: Failed to decode message with protobuf codec: No binding entry matched key='unmapped.v1' — ProtobufCodec entries: ["orders.v1" → pkg.OrderEvent, /^users\..+/ → pkg.UserEvent]
```

No silent fallback. Mixed-codec setups (JSON for some topics, protobuf for others) should use separate `Publisher` / `Subscriber` instances.

## `keepCase`

protobufjs's `keepCase` parse option, controlling field naming for **both** decode output and encode input. Applied at `.proto` load time so encode and decode always agree.

| Value             | Behaviour                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `false` (default) | protobufjs's native behaviour — field names are converted to `camelCase` (`{ orderId: … }`).                                         |
| `true`            | Preserve the original `.proto` field names (conventionally `snake_case`). `decode` emits `{ order_id: … }`; `encode` reads the same. |

```typescript
// camelCase (default)
new ProtobufCodec({ proto: "./events.proto", bindings });
// → decode: { orderId: "o-1", amount: 1 }

// snake_case
new ProtobufCodec({ proto: "./events.proto", keepCase: true, bindings });
// → decode: { order_id: "o-1", amount: 1 }
```

## `decodeOptions`

Defaults to `{ defaults: true, longs: String, enums: String }`. `bytes` is intentionally omitted so binary fields round-trip as `Uint8Array` via protobufjs's native default. Override per the `protobufjs.IConversionOptions` shape.

## Loading `.proto` files

Three patterns:

1. **Single file** — `proto: "./events.proto"`. Imports resolve next to the file.
2. **Multiple files** — `proto: ["./orders.proto", "./users.proto"]`. Use when bindings span several top-level files.
3. **`includePaths`** — mirror of `protoc -I include/path`:

```typescript
new ProtobufCodec({
  proto: [path.resolve(__dirname, "schemas/events/orders.proto")],
  includePaths: [path.resolve(__dirname, "schemas")],
  bindings: [{ match: "orders.v1", type: "pkg.OrderEvent" }],
});
```

`includePaths` are searched in order; the default `Root.resolvePath` (next-to-origin + bundled well-known types) is still consulted if none match.
