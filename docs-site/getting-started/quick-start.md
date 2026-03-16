# Quick Start

This guide walks you through writing your first Testurio test — a simple HTTP API test with a mock server.

## Step 1: Install Testurio

```bash
npm install testurio --save-dev
```

## Step 2: Define Your Service Types

Create a TypeScript file for your test. Start by defining the API operations you want to test:

```typescript
import { Client, Server, HttpProtocol, TestScenario, testCase } from 'testurio';

// Define the API operations
interface UserApi {
  getUser: {
    request: { method: 'GET'; path: '/users/{id}' };
    response: { code: 200; body: { id: number; name: string; email: string } };
  };
  createUser: {
    request: { method: 'POST'; path: '/users'; body: { name: string; email: string } };
    response: { code: 201; body: { id: number; name: string; email: string } };
  };
}
```

::: tip
You can skip type definitions and use Testurio in **loose mode** — just omit the generic parameter: `new HttpProtocol()`. Any string will be accepted as an operation ID.
:::

## Step 3: Create Components

Define a **client** (sends requests) and a **server** (mock that handles requests):

```typescript
const server = new Server('backend', {
  protocol: new HttpProtocol<UserApi>(),
  listenAddress: { host: 'localhost', port: 3000 },
});

const client = new Client('api', {
  protocol: new HttpProtocol<UserApi>(),
  targetAddress: { host: 'localhost', port: 3000 },
});
```

## Step 4: Create a Scenario

Group your components into a `TestScenario`. List servers before clients — Testurio starts them in order:

```typescript
const scenario = new TestScenario({
  name: 'User API Test',
  components: [server, client],  // servers first
});
```

## Step 5: Write a Test Case

Use `testCase()` to declare the message flow. Steps are written in the order messages travel through the system:

```typescript
const getUserTest = testCase('Get user by ID', (test) => {
  const api = test.use(client);
  const backend = test.use(server);

  // 1. Client sends a GET request
  api.request('getUser', { method: 'GET', path: '/users/1' });

  // 2. Server mock handles the request and returns a response
  backend.onRequest('getUser', { method: 'GET', path: '/users/1' })
    .mockResponse(() => ({
      code: 200,
      body: { id: 1, name: 'Alice', email: 'alice@example.com' },
    }));

  // 3. Client asserts on the response
  api.onResponse('getUser').assert((res) => {
    return res.code === 200 && res.body.name === 'Alice';
  });
});
```

::: info How it works
Inside `testCase()`, you only declare steps — no imperative code runs. Testurio collects all steps, registers hooks first (Phase 1), then executes action steps in order (Phase 2). This ensures mock handlers are ready before any request is sent.
:::

## Step 6: Run the Test

```typescript
const result = await scenario.run(getUserTest);
console.log(result.passed); // true
```

## Complete Example

```typescript
import { Client, Server, HttpProtocol, TestScenario, testCase } from 'testurio';

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
  name: 'User API Test',
  components: [server, client],
});

const getUserTest = testCase('Get user by ID', (test) => {
  const api = test.use(client);
  const backend = test.use(server);

  api.request('getUser', { method: 'GET', path: '/users/1' });

  backend.onRequest('getUser', { method: 'GET', path: '/users/1' })
    .mockResponse(() => ({
      code: 200,
      body: { id: 1, name: 'Alice', email: 'alice@example.com' },
    }));

  api.onResponse('getUser').assert((res) => {
    return res.code === 200 && res.body.name === 'Alice';
  });
});

async function main() {
  const result = await scenario.run(getUserTest);
  console.log(`Test: ${result.passed ? 'PASSED' : 'FAILED'}`);
}

main();
```

## Adding Payload Validation

You can validate payloads against schemas using the `.validate()` method. When schemas are registered on the protocol, validation happens automatically — or you can call `.validate()` explicitly on any hook:

```typescript
import { z } from 'zod';

// Define Zod schemas
const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
});

const validateTest = testCase('Validate response payload', (test) => {
  const api = test.use(client);
  const backend = test.use(server);

  api.request('getUser', { method: 'GET', path: '/users/1' });

  // Mock validates the incoming request
  backend.onRequest('getUser')
    .assert((req) => req.path === '/users/1')
    .mockResponse(() => ({
      code: 200,
      body: { id: 1, name: 'Alice', email: 'alice@example.com' },
    }));

  // Client validates the response body against the Zod schema
  api.onResponse('getUser')
    .validate(UserSchema)
    .assert((res) => res.code === 200);
});
```

See the [Schema Validation guide](/guide/schema-validation) for schema-first protocols with automatic validation.

## Proxy Mode

Instead of mocking, you can test against a real backend by adding a **proxy** between the client and server. The proxy forwards traffic while letting you inspect, transform, or selectively mock messages:

```typescript
// Real backend (or a mock acting as the backend)
const backend = new Server('backend', {
  protocol: new HttpProtocol<UserApi>(),
  listenAddress: { host: 'localhost', port: 4000 },
});

// Proxy — forwards to backend (note: both listenAddress AND targetAddress)
const proxy = new Server('proxy', {
  protocol: new HttpProtocol<UserApi>(),
  listenAddress: { host: 'localhost', port: 3000 },
  targetAddress: { host: 'localhost', port: 4000 },
});

// Client connects to the proxy
const client = new Client('api', {
  protocol: new HttpProtocol<UserApi>(),
  targetAddress: { host: 'localhost', port: 3000 },
});

const proxyScenario = new TestScenario({
  name: 'Proxy Test',
  components: [backend, proxy, client],
});

const proxyTest = testCase('Inspect traffic through proxy', (test) => {
  const api = test.use(client);
  const px = test.use(proxy);
  const be = test.use(backend);

  // Backend handles the request
  be.onRequest('getUser').mockResponse(() => ({
    code: 200,
    body: { id: 1, name: 'Alice', email: 'alice@example.com' },
  }));

  // Proxy inspects the request as it passes through
  px.onRequest('getUser').assert((req) => req.path === '/users/1');

  // Client sends request (flows through proxy to backend)
  api.request('getUser', { method: 'GET', path: '/users/1' });
  api.onResponse('getUser').assert((res) => res.code === 200);
});
```

The proxy can also **transform** messages, **add headers**, **mock selectively**, or **drop** requests. See the [Proxy Mode guide](/guide/proxy-mode) for all patterns.

## What's Next?

- [Core Concepts](/getting-started/core-concepts) — Understand components, protocols, hooks, and the execution model
- [Components Guide](/guide/components) — Learn about all component types
- [Proxy Mode](/guide/proxy-mode) — All proxy patterns (inspection, transformation, selective mocking)
- [HTTP Examples](/examples/http) — More HTTP testing patterns
