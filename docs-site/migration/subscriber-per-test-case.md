# Migration: Subscriber per-test-case isolation

testurio 0.7.0 ships a redesigned `Subscriber` component with always-on per-test-case isolation. Each test case gets its own materialized subscriber adapter via the broker's `IMQAdapter` factory. This guide covers the six breaking changes and how to migrate.

## TL;DR

| Before (master) | After (0.7.0) |
| --- | --- |
| `new Subscriber('x', { adapter: await kafka.createSubscriber() })` | `new Subscriber('x', { adapter: kafka })` |
| `new KafkaAdapter({ brokers, groupId: 'g', fromBeginning: true })` | `new KafkaAdapter({ brokers, defaultSubscribeParams: { groupId: 'g', fromBeginning: true } })` |
| `new KafkaAdapter({ brokers, groupId: 'g' })` | `new KafkaAdapter({ brokers })` — auto-gen `testurio-…` per TC |
| `autoSubscribe: ['t1', 't2']` | omit (or `autoSubscribe: true`) — hooks contribute their own topics |
| `subAdapter.startConsuming()` | (gone — folded into `subscribe(topic, ...)`) |
| `scenario-level` `ev.onMessage('t')` | move into a `testCase(...)` body |

## 1. Factory adapter

The `Subscriber` constructor now takes the **broker adapter** (the `IMQAdapter` factory), not an already-materialized subscriber.

```typescript
// Before
const subAdapter = await kafka.createSubscriber();
const events = new Subscriber('events', { adapter: subAdapter });

// After
const events = new Subscriber('events', { adapter: kafka });
```

A fresh subscriber adapter is materialized for each test case at Phase 1.5 (after hooks are registered, before any action step runs).

## 2. Adapter-wide subscribe defaults

`KafkaAdapterConfig.groupId` and `KafkaAdapterConfig.fromBeginning` are removed. Adapter-wide subscribe-time defaults move to `KafkaAdapterConfig.defaultSubscribeParams`:

```typescript
// Before
const kafka = new KafkaAdapter({ brokers, groupId: 'events', fromBeginning: true });

// After (shared group across TCs — opt-out from auto-isolation)
const kafka = new KafkaAdapter({
  brokers,
  defaultSubscribeParams: { groupId: 'events', fromBeginning: true },
});
```

Per-call overrides flow through the builder:

```typescript
ev.subscribe('orders', { fromBeginning: true });
```

## 3. Auto-generated consumer groups (default)

If you omit `defaultSubscribeParams.groupId` (or omit the bag entirely), the framework auto-generates `testurio-${randomSuffix(8)}` for every `createSubscriber()` call. With the default `autoSubscribe: true` that means **every test case gets its own consumer group automatically**.

```typescript
// Default — zero-config per-TC isolation
const kafka = new KafkaAdapter({ brokers });
const events = new Subscriber('events', { adapter: kafka });
```

Auto-generated groupIds are tracked on the parent `KafkaAdapter` and swept via one shared `admin().deleteGroups([...])` call at `dispose()` time — **not per-TC** (eliminates the LeaveGroup race). User-provided groupIds are never deleted by the framework.

## 4. `autoSubscribe` is now a boolean

```typescript
// Before — opted in by listing topics on the constructor
new Subscriber('x', { adapter, autoSubscribe: ['t1', 't2'] });

// After — derive topics from hooks (recommended)
new Subscriber('x', { adapter });        // autoSubscribe: true is the default
new Subscriber('x', { adapter, autoSubscribe: false }); // imperative mode
```

Under `autoSubscribe: true`, every topic referenced by `onMessage` / `waitMessage` / `waitMessageFrom` for the test case is auto-subscribed in one batched Kafka `subscribe + run` cycle at Phase 1.5.

Under `autoSubscribe: false`, the test must call `ev.subscribe(...)` explicitly. The empty-array shortcut `ev.subscribe()` is useful here — it subscribes to all hook-derived topics for the current TC at once.

## 5. `startConsuming` removed

The `startConsuming?()` method is gone from `IMQSubscriberAdapter`. Folded into `subscribe(topic | topics, params?)` which activates the delivery loop on first call. For Kafka, `subscribe(['t1', 't2', 't3'])` batches three topics into ONE `consumer.subscribe + consumer.run` cycle (single coordinator join).

Custom adapters that previously implemented `startConsuming` should fold the body into the first `subscribe` call's path and remove the public method.

## 6. Persistent / scenario-level Subscriber hooks removed

`Subscriber.registerHook` now throws when `step.testCaseId === undefined`. That covers:

- Builders called at scenario-level (outside any `testCase()` body)
- Builders called inside `scenario.init(...)` handlers
- Builders called inside `scenario.stop(...)` handlers

**There is no scenario-level subscription primitive in testurio.** Move the hook into a `testCase()` body:

```typescript
// Before — registered at scenario-level (no testCaseId)
const ev = events.createStepBuilder({ phase: 'init', registerStep });
ev.onMessage('orders').assert(...);

// After — registered inside a test case body
const tc = testCase('orders flow', (test) => {
  const ev = test.use(events);
  ev.onMessage('orders').assert(...);
  // ... rest of the TC
});
```

The error message thrown by `Subscriber.registerHook` includes a pointer to this guide.

## Imperative subscribe / unsubscribe

Two new declarative builder methods cover imperative broker subscription:

```typescript
ev.subscribe('orders');                                    // single
ev.subscribe(['orders', 'shipments']);                     // batch — one Kafka cycle
ev.subscribe('orders', { fromBeginning: false });          // per-call params
ev.subscribe();                                            // shortcut — all hook-derived topics
ev.unsubscribe('orders');
ev.unsubscribe(['orders', 'shipments']);
ev.unsubscribe();                                          // shortcut — all currently-held
```

**Footgun:** when callers spread a computed array that may be empty (`ev.subscribe(computedTopics)` where `computedTopics: string[]`), the empty case silently triggers the "subscribe-all" shortcut. Guard at the call site:

```typescript
if (computedTopics.length > 0) ev.subscribe(computedTopics);
```

## Performance — parallel test cases

Each test case requires one Kafka coordinator-join (when a `Subscriber` is used in the TC). For N parallel TCs that means N concurrent join handshakes against one broker partition leader.

Recommended parallel-TC cap depends on broker `group.initial.rebalance.delay.ms`:

- **With `KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS=0`** (recommended for testing — see [Kafka test broker config](../guides/kafka-test-broker.md)): 8 – 16 parallel TCs on a single broker partition leader.
- **With default `group.initial.rebalance.delay.ms=3000`**: ~3 parallel TCs to avoid coordinator-join contention.

For higher fan-out, use a shared `groupId` opt-out (see §2) and accept Kafka partition-assignment semantics.
