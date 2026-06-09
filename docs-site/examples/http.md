# HTTP Examples

Practical examples for testing HTTP APIs with Testurio.

## Setup

```typescript
import { Client, HttpProtocol, Server, TestScenario, testCase } from 'testurio';
```

## Type-Safe Service Definition

Declaring an `interface` for your HTTP service gives every step builder full autocomplete and turns silent runtime mismatches into compile-time errors. `HttpProtocol` understands the `{param}` path-template syntax — clients accept any concrete string at that segment, and server handlers receive a typed `params` object.

```typescript
interface UserApi {
  getUser: {
    request:  { method: 'GET';    path: '/users/{id}' };
    response: { code: 200;        body: { id: number; name: string; email: string } };
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

const server = new Server('backend', {
  protocol: new HttpProtocol<UserApi>(),
  listenAddress: { host: 'localhost', port: 3000 },
});

const client = new Client('api', {
  protocol: new HttpProtocol<UserApi>(),
  targetAddress: { host: 'localhost', port: 3000 },
});
```

What the compiler now catches:

```typescript
// ✗ Operation ID not in UserApi
api.request('getUserr', { method: 'GET', path: '/users/1' });

// ✗ Wrong HTTP method for the operation
api.request('getUser', { method: 'POST', path: '/users/1' });

// ✗ Missing required body field
api.request('createUser', { method: 'POST', path: '/users', body: { name: 'Bob' } });
//                                                                ^^^^^^^^^^^^^^ email is required

// ✗ Path doesn't match the template
api.request('getUser', { method: 'GET', path: '/orders/1' });
```

On the server side the `params` object is typed from the path template — no `as string` casts needed:

```typescript
mock.onRequest('getUser').mockResponse((req) => ({
  code: 200,
  body: { id: Number(req.params.id), name: 'Alice', email: 'alice@example.com' },
  //                  ^^^^ string, extracted from /users/{id}
}));
```

See the [Type Safety guide](/guide/type-safety) for response-code discriminated unions, schema-first inference, and the loose-mode escape hatch.

## GET Request with Mock Response

```typescript
interface UserApi {
  getUser: {
    request: { method: 'GET'; path: '/users/{id}' };
    response: { code: 200; body: { id: number; name: string; email: string } };
  };
}

const server = new Server('backend', {
  protocol: new HttpProtocol<UserApi>(),
  listenAddress: { host: 'localhost', port: 3000 },
});

const client = new Client('api', {
  protocol: new HttpProtocol<UserApi>(),
  targetAddress: { host: 'localhost', port: 3000 },
});

const scenario = new TestScenario({
  name: 'User API',
  components: [server, client],
});

const tc = testCase('Get user by ID', (test) => {
  const api = test.use(client);
  const mock = test.use(server);

  api.request('getUser', { method: 'GET', path: '/users/1' });

  mock.onRequest('getUser', { method: 'GET', path: '/users/1' }).mockResponse(() => ({
    code: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { id: 1, name: 'Alice', email: 'alice@example.com' },
  }));

  api.onResponse('getUser').assert((res) => {
    return res.code === 200 && res.body.name === 'Alice';
  });
});

const result = await scenario.run(tc);
```

## POST Request with Body

```typescript
interface UserApi {
  createUser: {
    request: { method: 'POST'; path: '/users'; body: { name: string; email: string } };
    response: { code: 201; body: { id: number; name: string; email: string } };
  };
}

const tc = testCase('Create new user', (test) => {
  const api = test.use(client);
  const mock = test.use(server);

  api.request('createUser', {
    method: 'POST',
    path: '/users',
    body: { name: 'Bob', email: 'bob@example.com' },
    headers: { 'Content-Type': 'application/json' },
  });

  mock.onRequest('createUser', { method: 'POST', path: '/users' }).mockResponse((req) => ({
    code: 201,
    headers: { 'Content-Type': 'application/json' },
    body: {
      id: 2,
      name: req.body?.name ?? 'Unknown',
      email: req.body?.email ?? 'unknown@example.com',
    },
  }));

  api.onResponse('createUser').assert((res) => {
    return res.code === 201 && res.body.name === 'Bob';
  });
});
```

## Simulating Delays

```typescript
const tc = testCase('Request with timeout', (test) => {
  const api = test.use(client);
  const mock = test.use(server);

  api.request('getUser', { method: 'GET', path: '/users/1', timeout: 5000 });

  mock
    .onRequest('getUser', { method: 'GET', path: '/users/1' })
    .delay(100) // Simulate 100ms network latency
    .mockResponse(() => ({
      code: 200,
      body: { id: 1, name: 'Charlie', email: 'charlie@example.com' },
    }));

  api.onResponse('getUser').assert((res) => res.body.name === 'Charlie');
});
```

## Schema-First Approach (Recommended)

Generate Zod schemas from your OpenAPI spec for runtime validation:

```bash
testurio generate openapi.yaml -o ./generated/api.schema.ts
```

```typescript
import { userApiSchema } from './generated/api.schema';

const server = new Server('backend', {
  protocol: new HttpProtocol({ schema: userApiSchema }),
  listenAddress: { host: 'localhost', port: 3000 },
});

const client = new Client('api', {
  protocol: new HttpProtocol({ schema: userApiSchema }),
  targetAddress: { host: 'localhost', port: 3000 },
});
```

With schemas, requests and responses are automatically validated at I/O boundaries.

## Multiple Assertions

```typescript
const tc = testCase('Verify user details', (test) => {
  const api = test.use(client);
  const mock = test.use(server);

  api.request('getUser', { method: 'GET', path: '/users/1' });

  mock.onRequest('getUser').mockResponse(() => ({
    code: 200,
    body: { id: 1, name: 'Alice', email: 'alice@example.com' },
  }));

  api.onResponse('getUser')
    .assert('status is 200', (res) => res.code === 200)
    .assert('name is correct', (res) => res.body.name === 'Alice')
    .assert('email is valid', (res) => res.body.email.includes('@'));
});
```

## Using with Vitest

```typescript
import { describe, it, expect } from 'vitest';

describe('User API', () => {
  const scenario = new TestScenario({
    name: 'User API',
    components: [server, client],
  });

  it('should get user by ID', async () => {
    const result = await scenario.run(getUserTest);
    expect(result.passed, result.error).toBe(true);
  });

  it('should create a user', async () => {
    const result = await scenario.run(createUserTest);
    expect(result.passed, result.error).toBe(true);
  });
});
```

## Polling Until Ready

Use `.retry(predicate)` after `request(...)` to poll an endpoint until it converges to the expected state. The predicate is "retry-while" — return `true` to keep retrying, `false` to stop. The mock must be **stateful** (a closure counter outside `testCase`), otherwise the loop will hit the overall timeout.

See the [Polling & Retry guide](/guide/polling-and-retry) for full semantics.

### Defaults form

```typescript
interface StatusService {
  getStatus: {
    request: { method: 'GET'; path: '/status' };
    response: { code: 200 | 503; body: { ready: boolean } };
  };
}

const server = new Server('backend', {
  protocol: new HttpProtocol<StatusService>(),
  listenAddress: { host: 'localhost', port: 3000 },
});

const client = new Client('api', {
  protocol: new HttpProtocol<StatusService>(),
  targetAddress: { host: 'localhost', port: 3000 },
});

const scenario = new TestScenario({
  name: 'Polling Test',
  components: [server, client],
});

// Stateful mock — first two attempts return 503, third returns 200.
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

const tc = testCase('Wait until ready', (test) => {
  const api = test.use(client);

  // Defaults: timeout 5000 ms, interval 1000 ms, retryOnError true.
  api.request('getStatus', { method: 'GET', path: '/status' })
     .retry((res) => res.body.ready === false);

  api.onResponse('getStatus').assert((res) => res.code === 200);
});
```

### Override timeout and interval

```typescript
const tc = testCase('Wait with custom budget', (test) => {
  const api = test.use(client);

  // Poll every 500 ms for up to 3 seconds.
  api.request('getStatus', { method: 'GET', path: '/status' })
     .retry((res) => res.body.ready === false, { timeout: 3000, interval: 500 });

  api.onResponse('getStatus').assert((res) => res.code === 200);
});
```

On overall timeout the step fails with a `RetryTimeoutError` carrying `attempts`, `elapsedMs`, `lastResult`, and `lastError`.
