# Installation

## Prerequisites

- **Node.js** 18.0.0 or higher
- **npm**, **pnpm**, or **yarn** package manager

## Install the Core Package

The core `testurio` package includes the framework essentials and the built-in HTTP protocol:

::: code-group

```bash [npm]
npm install testurio --save-dev
```

```bash [pnpm]
pnpm add testurio --save-dev
```

```bash [yarn]
yarn add testurio --dev
```

:::

## Protocol Packages

Install additional protocol packages based on the protocols you need to test:

| Package | Protocol | Install |
|---------|----------|---------|
| `testurio` | HTTP | Included in core |
| `@testurio/protocol-grpc` | gRPC (Unary & Streaming) | `npm install @testurio/protocol-grpc --save-dev` |
| `@testurio/protocol-ws` | WebSocket | `npm install @testurio/protocol-ws --save-dev` |
| `@testurio/protocol-tcp` | TCP | `npm install @testurio/protocol-tcp --save-dev` |

## Adapter Packages

For message queues and data sources, install the corresponding adapter packages:

### Message Queues

| Package | Service | Install |
|---------|---------|---------|
| `@testurio/adapter-kafka` | Apache Kafka | `npm install @testurio/adapter-kafka --save-dev` |
| `@testurio/adapter-rabbitmq` | RabbitMQ | `npm install @testurio/adapter-rabbitmq --save-dev` |
| `@testurio/adapter-redis` | Redis Pub/Sub | `npm install @testurio/adapter-redis --save-dev` |

### Data Sources

| Package | Service | Peer Dependency | Install |
|---------|---------|-----------------|---------|
| `@testurio/adapter-redis` | Redis | `ioredis` | `npm install @testurio/adapter-redis ioredis --save-dev` |
| `@testurio/adapter-pg` | PostgreSQL | `pg` | `npm install @testurio/adapter-pg pg --save-dev` |
| `@testurio/adapter-mongo` | MongoDB | `mongodb` | `npm install @testurio/adapter-mongo mongodb --save-dev` |

## CLI (Schema Generator)

The CLI generates type-safe Zod schemas and service interfaces from OpenAPI specs and `.proto` files:

```bash
npm install @testurio/cli --save-dev
```

## Reporter

For Allure HTML test reports:

```bash
npm install @testurio/reporter-allure --save-dev
```

## Test Runner

Testurio is test-runner agnostic. You can use it with any test runner, but it works especially well with [Vitest](https://vitest.dev):

```bash
npm install vitest --save-dev
```

Example with Vitest:

```typescript
import { describe, it, expect } from 'vitest';
import { TestScenario, testCase, Client, Server, HttpProtocol } from 'testurio';

describe('User API', () => {
  const client = new Client('api', {
    protocol: new HttpProtocol(),
    targetAddress: { host: 'localhost', port: 3000 },
  });

  const server = new Server('mock', {
    protocol: new HttpProtocol(),
    listenAddress: { host: 'localhost', port: 3000 },
  });

  const scenario = new TestScenario({
    name: 'User API',
    components: [server, client],
  });

  it('should return users', async () => {
    const tc = testCase('get users', (test) => {
      const api = test.use(client);
      const mock = test.use(server);

      api.request('getUsers', { method: 'GET', path: '/users' });
      mock.onRequest('getUsers').mockResponse(() => ({
        code: 200,
        body: [{ id: 1, name: 'Alice' }],
      }));
      api.onResponse('getUsers').assert((res) => res.body.length === 1);
    });

    const result = await scenario.run(tc);
    expect(result.passed).toBe(true);
  });
});
```

## Next Steps

- [Quick Start](/getting-started/quick-start) — Build your first test
- [Core Concepts](/getting-started/core-concepts) — Understand the framework fundamentals
