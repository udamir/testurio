# Core Framework (`testurio`)

**Location:** `packages/core/`

The core package contains the framework engine, all component types, the execution layer, the hook system, and the built-in HTTP protocol.

## Package Structure

```
packages/core/src/
├── components/
│   ├── base/                  # BaseComponent, ServiceComponent, HookRegistry, StepBuilder
│   ├── sync-client/           # Client component
│   ├── sync-server/           # Server component
│   ├── async-client/          # AsyncClient component
│   ├── async-server/          # AsyncServer component
│   ├── datasource/            # DataSource component
│   ├── publisher/             # Publisher component (MQ)
│   ├── subscriber/            # Subscriber component (MQ)
│   └── mq.base/               # Shared MQ adapter interfaces
├── execution/
│   ├── test-scenario.ts       # TestScenario - lifecycle orchestration
│   ├── test-case.ts           # TestCase and testCase() factory
│   └── step-executor.ts       # Step execution engine
├── protocols/
│   ├── base/                  # Protocol interfaces and type helpers
│   └── http/                  # Built-in HTTP protocol
├── recording/                 # Reporter interfaces and implementations
└── utils.ts                   # Shared utilities (Deferred, etc.)
```

## Exports

The core package exports all component types, execution classes, protocol interfaces, and utilities:

```typescript
// Components
export { Client } from './components/sync-client';
export { Server } from './components/sync-server';
export { AsyncClient } from './components/async-client';
export { AsyncServer } from './components/async-server';
export { DataSource } from './components/datasource';
export { Publisher } from './components/publisher';
export { Subscriber } from './components/subscriber';

// Execution
export { TestScenario } from './execution/test-scenario';
export { testCase, TestCase } from './execution/test-case';

// Protocols
export { HttpProtocol } from './protocols/http';

// Types
export type { ISyncProtocol, IAsyncProtocol } from './protocols/base';
export type { IMQAdapter } from './components/mq.base';
export type { IDataSourceAdapter } from './components/datasource';
```

## Built-in HTTP Protocol

The HTTP protocol is included in the core package and does not require a separate install.

```typescript
import { Client, Server, HttpProtocol, TestScenario, testCase } from 'testurio';

type MyApi = {
  getUsers: {
    request: { method: 'GET'; path: '/users' };
    response: { code: 200; body: Array<{ id: string; name: string }> };
  };
};

const client = new Client('api', {
  protocol: new HttpProtocol<MyApi>(),
  targetAddress: { host: 'localhost', port: 3000 },
});
```

## Dependencies

The core package has minimal dependencies:
- `express` - HTTP server adapter
- No other runtime dependencies

All protocol-specific dependencies are in their respective packages.
