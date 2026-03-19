# Proxy Mode

When a `Server` or `AsyncServer` has both `listenAddress` and `targetAddress`, it operates as a **transparent proxy**. Messages from clients are forwarded to the backend, and responses flow back through the proxy.

## How It Works

```
Client → Proxy (hooks intercept here) → Backend Server
                      ↕
              inspect / transform / mock / drop
```

The proxy sits between the client and backend. Hooks can:
- **Inspect** messages without modifying them
- **Transform** messages before forwarding
- **Mock** responses without forwarding to the backend
- **Drop** messages entirely
- **Add delays** to simulate network latency

## Setting Up a Proxy

### Sync Proxy (HTTP, gRPC Unary)

```typescript
import { Client, Server, HttpProtocol, TestScenario, testCase } from 'testurio';

// Real backend
const backend = new Server('backend', {
  protocol: new HttpProtocol<MyApi>(),
  listenAddress: { host: 'localhost', port: 4000 },
});

// Proxy (both listenAddress AND targetAddress)
const proxy = new Server('proxy', {
  protocol: new HttpProtocol<MyApi>(),
  listenAddress: { host: 'localhost', port: 3000 },
  targetAddress: { host: 'localhost', port: 4000 },
});

// Client connects to the proxy
const client = new Client('api', {
  protocol: new HttpProtocol<MyApi>(),
  targetAddress: { host: 'localhost', port: 3000 },
});

const scenario = new TestScenario({
  name: 'Proxy Test',
  components: [backend, proxy, client],
});
```

### Async Proxy (WebSocket, TCP, gRPC Stream)

```typescript
import { AsyncClient, AsyncServer } from 'testurio';
import { TcpProtocol } from '@testurio/protocol-tcp';

const backend = new AsyncServer('backend', {
  protocol: new TcpProtocol<MyService>(),
  listenAddress: { host: 'localhost', port: 9100 },
});

const proxy = new AsyncServer('proxy', {
  protocol: new TcpProtocol<MyService>(),
  listenAddress: { host: 'localhost', port: 9101 },
  targetAddress: { host: 'localhost', port: 9100 },
});

const client = new AsyncClient('client', {
  protocol: new TcpProtocol<MyService>(),
  targetAddress: { host: 'localhost', port: 9101 },
});
```

## Proxy Patterns

### Passthrough

Forward all messages without modification. The backend handles the request and the response flows back through the proxy:

```typescript
const tc = testCase('passthrough', (test) => {
  const api = test.use(client);
  const be = test.use(backend);

  // Backend handles requests normally
  be.onRequest('getUser').mockResponse(() => ({
    code: 200,
    body: { id: 1, name: 'Alice' },
  }));

  // Client sends request (goes through proxy to backend)
  api.request('getUser', { method: 'GET', path: '/users/1' });

  api.onResponse('getUser').assert((res) => res.code === 200);
});
```

### Inspection

Observe messages passing through the proxy without modifying them:

```typescript
const tc = testCase('inspect traffic', (test) => {
  const api = test.use(client);
  const px = test.use(proxy);
  const be = test.use(backend);

  be.onRequest('getUser').mockResponse(() => ({
    code: 200,
    body: { id: 1, name: 'Alice' },
  }));

  // Assert on the request at the proxy level
  px.waitRequest('getUser').assert((req) => {
    return req.path === '/users/1';
  });

  api.request('getUser', { method: 'GET', path: '/users/1' });
  api.onResponse('getUser').assert((res) => res.code === 200);
});
```

### Transformation

Modify messages in flight:

```typescript
const tc = testCase('transform request', (test) => {
  const api = test.use(client);
  const px = test.use(proxy);
  const be = test.use(backend);

  // Proxy adds a header before forwarding
  px.onRequest('getUser').proxy((req) => ({
    ...req,
    headers: { ...req.headers, 'X-Trace-Id': 'test-123' },
  }));

  be.onRequest('getUser').mockResponse(() => ({
    code: 200,
    body: { id: 1, name: 'Alice' },
  }));

  api.request('getUser', { method: 'GET', path: '/users/1' });
  api.onResponse('getUser').assert((res) => res.code === 200);
});
```

### Selective Mocking

Mock some requests at the proxy while forwarding others to the backend:

```typescript
const tc = testCase('selective mock', (test) => {
  const px = test.use(proxy);

  // Block delete requests at the proxy
  px.onRequest('deleteUser').mockResponse(() => ({
    code: 403,
    body: { error: 'Forbidden' },
  }));

  // All other requests pass through to the backend
});
```

### Message Transformation (Async)

For async protocols, transform messages flowing through the proxy:

```typescript
const tc = testCase('async transform', (test) => {
  const api = test.use(client);
  const px = test.use(proxy);
  const be = test.use(backend);

  // Proxy transforms messages before forwarding
  px.onMessage('Request').transform((msg) => ({
    ...msg,
    data: `[ENRICHED] ${msg.data}`,
  }));

  be.onMessage('Request').mockEvent('Response', (payload) => ({
    id: payload.id,
    result: payload.data,
    timestamp: Date.now(),
  }));

  api.sendMessage('Request', { id: 'req-1', action: 'get', data: 'item-123' });

  api.waitEvent('Response').timeout(2000).assert((msg) => {
    return msg.result.includes('[ENRICHED]');
  });
});
```

### Backend Event Interception (Async)

In async proxy mode, events from the backend flow back through the proxy to the client. Use `onEvent` (non-strict) or `waitEvent` (strict) to intercept and transform these events:

```typescript
const tc = testCase('intercept backend events', (test) => {
  const api = test.use(client);
  const px = test.use(proxy);
  const be = test.use(backend);

  // Backend responds with event
  be.onMessage('GetData').mockEvent('DataResponse', (p) => ({
    id: p.id,
    status: 'pending',
    value: 50,
  }));

  // Client sends request (must come before waitEvent since it blocks)
  api.sendMessage('GetData', { id: 'req-1' });

  // Proxy intercepts backend event with strict ordering and transforms it
  px.waitEvent('DataResponse')
    .timeout(2000)
    .assert((p) => p.status === 'pending')
    .proxy((p) => ({
      ...p,
      status: 'completed',
      value: p.value * 2,
    }));

  // Client receives the transformed event
  api.onEvent('DataResponse').assert((p) => {
    return p.status === 'completed' && p.value === 100;
  });
});
```

Use `onEvent` when timing doesn't matter, and `waitEvent` when you want to enforce that the proxy is actively waiting before the event arrives.
