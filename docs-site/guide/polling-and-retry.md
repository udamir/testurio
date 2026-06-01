# Polling & Retry

Distributed-system tests often need to **wait for a system to converge** — for an endpoint to become healthy, for a row to land in a database, for an order book to reflect a new entry. Testurio's step-level `.retry(...)` modifier handles this declaratively.

## What it is — and what it is not

`.retry(predicate, timeoutMs | options)` is a chainable modifier on `Client.request(...)` (HTTP / gRPC unary) and `DataSource.exec(...)`. The component owns a loop that re-fires the underlying operation until the predicate returns `false` — or an overall timeout elapses.

This is different from `TestExecutionOptions.retry`, which re-runs the **entire test case**. Use `.retry(...)` when you want one step to converge; use `TestExecutionOptions.retry` for whole-test flakiness mitigation.

It is also different from `.timeout(ms)` on a hook builder: `.timeout(ms)` caps a single attempt; `.retry(...)` runs many attempts.

## Retry-while semantics

The predicate is a **retry-while** check:

- Predicate returns `true` → keep retrying.
- Predicate returns `false` → stop and return the terminal result.

Reads naturally as _"retry while the response is not OK"_:

```typescript
api.request('getStatus', { method: 'GET', path: '/status' })
   .retry((res) => res.code !== 200);
```

## Call forms

There are three ways to call `.retry(...)`:

```typescript
// Defaults: timeout 5000 ms, interval 1000 ms, retryOnError true.
api.request('getStatus', { method: 'GET', path: '/status' })
   .retry((res) => res.code !== 200);

// Override timeout only — interval and retryOnError keep defaults.
api.request('getStatus', { method: 'GET', path: '/status' })
   .retry((res) => res.code !== 200, 3000);

// Options form — any combination of timeout, interval, retryOnError.
api.request('getStatus', { method: 'GET', path: '/status' })
   .retry((res) => res.code !== 200, { timeout: 3000, interval: 250, retryOnError: true });
```

## Defaults

| Option         | Default | Meaning                                                                   |
| -------------- | ------- | ------------------------------------------------------------------------- |
| `timeout`      | `5000`  | Overall wall-clock budget for the polling loop, in ms.                    |
| `interval`     | `1000`  | Delay between attempts in ms. Use `0` for an immediate retry (hot-loop). |
| `retryOnError` | `true`  | If an attempt throws, treat as "not ready" and retry until timeout.       |

The interval sleep is clamped against the remaining budget, so a 1000 ms interval will never push past a 1500 ms `timeout`.

## Error policy — `retryOnError`

```typescript
// Default: swallow attempt errors, retry until timeout.
api.request('getStatus', { method: 'GET', path: '/status' })
   .retry((res) => res.code !== 200, { retryOnError: true });

// Fail fast: the first thrown attempt aborts the step.
api.request('getStatus', { method: 'GET', path: '/status' })
   .retry((res) => res.code !== 200, { retryOnError: false });
```

`retryOnError: true` is right when the system is still warming up (a few connection-refused errors are expected and recoverable). `retryOnError: false` is right when an attempt error indicates a configuration problem — better to fail fast and surface the underlying error.

::: tip Predicate throws are always fatal
A throw from the predicate itself **always** aborts the loop — regardless of `retryOnError`. A buggy predicate is a test-author error, not a "not ready" signal.
:::

## Interplay with `.timeout(ms)` (DataSource)

On `DataSource.exec(...)`, `.timeout(ms)` is a **step-level wall-clock deadline**. When `.retry(...)` is also set, the deadline caps the entire polling loop — when it fires, retry is terminated and the step fails with `TimeoutError`.

```typescript
ds.exec('poll empty', (c) => c.query<Row>({ query: 'SELECT count() AS c FROM events' }))
  .timeout(1500)                                              // step-level deadline (caps the whole loop)
  .retry((rows) => rows.length === 0, { interval: 200 });     // poll forever until cap fires
```

When both `.timeout(ms)` and `.retry({ timeout })` are set, whichever elapses first wins. They raise distinct error types so callers can distinguish the cause:

- `.timeout(ms)` firing → `TimeoutError` (step deadline)
- `.retry({ timeout })` budget exhausted between attempts → `RetryTimeoutError`

::: warning In-flight call is abandoned
The SDK call running when the step deadline fires is abandoned, not cancelled — the framework stops awaiting but the underlying query may still complete on the server. Cooperative cancellation via `AbortSignal` is planned in a follow-up release.
:::

## `TimeoutError` and `RetryTimeoutError`

When `.timeout(ms)` fires (step-level deadline), the step fails with a `TimeoutError` whose message follows the format `Step "<description>" timeout after Xms`.

When the retry-loop budget elapses without the predicate returning `false`, the step fails with a `RetryTimeoutError`:

```typescript
class RetryTimeoutError extends Error {
  readonly attempts: number;          // how many attempts ran
  readonly elapsedMs: number;         // wall-clock time spent in the loop
  readonly lastResult: unknown;       // the most recent attempt result
  readonly lastError: Error | undefined; // the most recent thrown error
}
```

The error message follows the format `Retry exhausted after Xms / N attempt(s) for <description> (last error: <message>)`. Reporters surface either string on `TestStepResult.error`.

## Stateful mocks for convergence

Mock servers used in retry tests need to model convergence — return one thing, then a different thing — otherwise the loop will hit the overall timeout. Use a closure counter:

```typescript
let attempts = 0;

scenario.init((test) => {
  test
    .use(server)
    .onRequest('getStatus', { method: 'GET', path: '/status' })
    .mockResponse(() => {
      attempts++;
      const ready = attempts >= 3;
      return { code: ready ? 200 : 503, body: { ready } };
    });
});

const tc = testCase('wait until ready', (test) => {
  const api = test.use(client);
  api.request('getStatus', { method: 'GET', path: '/status' })
     .retry((res) => res.body.ready === false, 3000);
  api.onResponse('getStatus').assert((res) => res.code === 200);
});
```

## Terminal result only

For sync `Client`, only the **terminal** response is delivered to matching `onResponse` / `waitResponse` hooks. Responses from earlier attempts are discarded — the test sees the converged state, not the journey.

For `DataSource`, the chained `.assert(...)` runs once on the terminal result.

## Data factories re-resolve

`Client.request(...)` data factories re-execute on every attempt — useful when the payload contains a timestamp or a fresh token. If you need a stable payload across attempts, pass a literal value instead of a factory.
