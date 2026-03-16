# HTTP Examples

Practical examples for testing HTTP APIs with Testurio.

## Setup

```typescript
import { Client, HttpProtocol, Server, TestScenario, testCase } from 'testurio';
```

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
    expect(result.passed).toBe(true);
  });

  it('should create a user', async () => {
    const result = await scenario.run(createUserTest);
    expect(result.passed).toBe(true);
  });
});
```
