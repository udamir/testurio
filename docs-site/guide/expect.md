# Native `expect()`

Testurio ships its own `expect()` matcher API — zero dependencies on `vitest`, `jest`, or `chai`. Use it inside `.assert()` predicates for structured Expected/Received failures with source links and multi-line diffs.

## Quick Start

```typescript
import { expect } from 'testurio';

api.onResponse('getUser').assert((res) => {
  expect(res.code).toBe(200);
  expect(res.body).toMatchObject({ id: 1, name: 'Alice' });
});
```

When a matcher fails, it throws an `ExpectAssertionError` whose `.message` is fully self-formatted. The predicate doesn't need `return true;` on success — `undefined` returns now pass.

## Why testurio-native?

Vitest's `expect()` produces rich diffs but couples your tests to vitest's error shape. The framework-neutrality constraint (testurio shouldn't depend on a specific runner) ruled that out. Testurio owns its own matchers, error type, deep-equal, and diff renderer — written from scratch with zero new dependencies.

## Matcher Reference

### Equality

| Matcher                | Semantics                                                                |
| ---------------------- | ------------------------------------------------------------------------ |
| `toBe(expected)`       | `Object.is(actual, expected)` — referential equality.                    |
| `toEqual(expected)`    | Deep structural equality, lenient (`{ a: 1 }` equals `{ a: 1, b: undefined }`). |
| `toStrictEqual(expected)` | Deep structural equality, strict (same prototype, same key count).    |

### Truthiness

| Matcher          | Pass condition         |
| ---------------- | ---------------------- |
| `toBeTruthy()`   | `Boolean(actual)`      |
| `toBeFalsy()`    | `!actual`              |
| `toBeNull()`     | `actual === null`      |
| `toBeUndefined()`| `actual === undefined` |
| `toBeDefined()`  | `actual !== undefined` |

### Numeric

| Matcher                          | Pass condition                                            |
| -------------------------------- | --------------------------------------------------------- |
| `toBeGreaterThan(n)`             | `actual > n`                                              |
| `toBeGreaterThanOrEqual(n)`      | `actual >= n`                                             |
| `toBeLessThan(n)`                | `actual < n`                                              |
| `toBeLessThanOrEqual(n)`         | `actual <= n`                                             |
| `toBeCloseTo(n, digits = 2)`     | `Math.abs(actual - n) < 10^-digits / 2`                   |

All numeric matchers throw `TypeError` if `actual` is not a number.

### String

| Matcher                          | Pass condition                                            |
| -------------------------------- | --------------------------------------------------------- |
| `toMatch(string \| RegExp)`      | String: `actual.includes(s)`. RegExp: `r.test(actual)`.   |
| `toContain(substring)`           | `actual.includes(substring)`                              |

### Collection

| Matcher                          | Pass condition                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `toContain(element)` (array)     | `actual.some((x) => Object.is(x, element))`                                    |
| `toHaveLength(n)`                | `actual.length === n`                                                          |
| `toMatchObject(partial)`         | Every key in `partial` deep-equals (loose) the same key in actual. Extra keys in actual OK. |
| `toHaveProperty(path, value?)`   | Walk `path` (dot-string or `string[]`) on actual; if `value` provided, deep-equal.      |

### Negation

Every matcher has a `.not` variant that inverts the pass/fail decision:

```typescript
expect(res.code).not.toBe(500);
expect(users).not.toContain('admin');
expect(body).not.toMatchObject({ deleted: true });
```

The operator name in the thrown `ExpectAssertionError` becomes `not.toBe`, `not.toContain`, etc.

## Failure Message Format

A failing `expect(res.code).toBe(200)` against a 404 response produces:

```
Assertion failed
  at tests/integration/api.test.ts:54:21

  Expected: 200
  Received: 404
```

A `toEqual` mismatch adds a structured diff:

```
Assertion failed
  at tests/integration/user.test.ts:81:17

  Expected: { "id": 1, "name": "Alice", "role": "admin" }
  Received: { "id": 1, "name": "Alice", "role": "user" }

  Diff:
    {
      id: (equal)
      name: (equal)
      - role: "admin"
      + role: "user"
    }
```

### Diff Output Style

The diff renderer always emits ANSI color codes:

- `\x1b[31m` (red) for `-` lines (expected)
- `\x1b[32m` (green) for `+` lines (received)
- `\x1b[2m` (dim) for `(equal)` siblings and `…` depth markers
- `\x1b[0m` (reset) at end of each line

Reporters that don't render ANSI can strip them with one regex:

```typescript
const plain = message.replace(/\x1b\[\d+m/g, '');
```

Nested objects expand to multi-line indented form when their one-line representation exceeds 60 characters. Depth is capped at 6 levels — beyond that, the renderer emits a dimmed `…`. The whole diff is capped at 4 KB so a pathological structure can't blow up the failure message.

## Predicate Bodies

The D-3 truthiness rule: `.assert()` predicates returning `undefined` now pass. This makes expect-only bodies clean:

```typescript
// Works — expect throws on failure, predicate returns undefined on success
api.onResponse('getUser').assert((res) => {
  expect(res.code).toBe(200);
});

// Still works — explicit boolean returns
api.onResponse('getUser').assert((res) => res.code === 200);

// Still works — mixed bodies
api.onResponse('getUser').assert((res) => {
  expect(res.code).toBe(200);
  return res.body.length > 0;
});
```

Only an explicit `return false` fails the predicate (in addition to any thrown error).

## Type Narrowing

`expect()` is generic. The available matchers narrow based on the actual type:

```typescript
expect(5).toBe(5);                  // OK — Expectation<number>
expect(5).toMatch('x');             // TypeScript error — toMatch only on strings
expect('hi').toBeGreaterThan(1);    // TypeScript error — toBeGreaterThan only on numbers
expect([1, 2]).toContain(1);        // OK — ArrayExpectation
expect({ a: 1 }).toMatchObject({ a: 1 }); // OK — ObjectExpectation
```

## What's Not Included

Deliberately excluded from the MVP:

| Feature                         | Status                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Asymmetric matchers (`expect.any`, `expect.stringContaining`, etc.) | **Excluded by scope** — unit-testing idiom; integration tests assert on actual messages. |
| Async chaining (`.resolves` / `.rejects`)                            | **Deferred**. Predicate bodies remain async-capable, so `await x; expect(value).toBe(...)` already works. |
| Snapshot matchers (`.toMatchSnapshot()`)                             | **Deferred**.                                                                                              |
| Mock matchers (`.toHaveBeenCalled()`)                                | **N/A** — testurio uses hooks, not mocks.                                                                  |
| Custom matcher API (`expect.extend({ ... })`)                        | **Deferred** to a follow-up task.                                                                          |

## API: `ExpectAssertionError`

Named export from `testurio`. Use `instanceof` in custom reporters to recognize matcher failures.

```typescript
import { ExpectAssertionError } from 'testurio';

try {
  expect(1).toBe(2);
} catch (err) {
  if (err instanceof ExpectAssertionError) {
    console.log(err.operator);      // "toBe"
    console.log(err.expected);      // 2
    console.log(err.actual);        // 1
    console.log(err.sourceLocation); // { file: "...", line: ..., column: ... }
    console.log(err.diff);          // populated for toEqual/toStrictEqual/toMatchObject
  }
}
```

## Comparison to Vitest / Jest

| Feature                          | Testurio `expect`         | Vitest / Jest `expect`         |
| -------------------------------- | ------------------------- | ------------------------------ |
| Sync matchers (toBe, toEqual...) | ✓                         | ✓                              |
| Negation (`.not`)                | ✓                         | ✓                              |
| Type narrowing                   | ✓                         | ✓                              |
| Structured diff                  | ✓ (ANSI + multi-line)     | ✓                              |
| Source link in message           | ✓                         | (reporter-provided)            |
| Asymmetric matchers              | ✗ (excluded)              | ✓                              |
| Async (`.resolves`/`.rejects`)   | ✗ (excluded)              | ✓                              |
| Snapshot                         | ✗ (excluded)              | ✓                              |
| Mock matchers                    | ✗ (N/A)                   | ✓                              |
| `expect.extend`                  | ✗ (excluded)              | ✓                              |
