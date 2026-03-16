# Proxy Mode Examples

Practical examples for using Testurio's proxy mode to intercept and modify traffic between clients and servers.

## How Proxy Mode Works

When an `AsyncServer` (or `Server`) has both `listenAddress` and `targetAddress`, it acts as a transparent proxy:

```
Client ──→ Proxy (listenAddress) ──→ Backend (targetAddress)
Client ←── Proxy ←────────────────── Backend
```

Hooks on the proxy can inspect, transform, or mock messages passing through.

## Setup

```typescript
import { AsyncClient, AsyncServer, TestScenario, testCase } from 'testurio';
import { TcpProtocol, type TcpServiceDefinition } from '@testurio/protocol-tcp';

interface ProxyService extends TcpServiceDefinition {
  clientMessages: {
    Request: { id: string; action: string; data: string };
  };
  serverMessages: {
    Response: { id: string; result: string; timestamp: number };
  };
}

// Real backend server
const backend = new AsyncServer('backend', {
  protocol: new TcpProtocol<ProxyService>(),
  listenAddress: { host: 'localhost', port: 9100 },
});

// Proxy server — both listenAddress AND targetAddress
const proxy = new AsyncServer('proxy', {
  protocol: new TcpProtocol<ProxyService>(),
  listenAddress: { host: 'localhost', port: 9101 },
  targetAddress: { host: 'localhost', port: 9100 }, // forwards to backend
});

// Client connects to proxy, not backend
const client = new AsyncClient('client', {
  protocol: new TcpProtocol<ProxyService>(),
  targetAddress: { host: 'localhost', port: 9101 }, // connects to proxy
});

const scenario = new TestScenario({
  name: 'Proxy Mode',
  components: [backend, proxy, client],
});
```

## Passthrough

Messages flow through the proxy unmodified:

```typescript
const tc = testCase('Passthrough mode', (test) => {
  const api = test.use(client);
  const mock = test.use(backend);

  mock.onMessage('Request').mockEvent('Response', (payload) => ({
    id: payload.id,
    result: `Processed: ${payload.action}`,
    timestamp: Date.now(),
  }));

  api.sendMessage('Request', { id: 'req-1', action: 'get', data: 'item-123' });

  api.waitEvent('Response').timeout(2000).assert((msg) => {
    return msg.id === 'req-1' && msg.result.includes('Processed');
  });
});
```

## Message Inspection

Observe messages at the proxy without modifying them:

```typescript
const tc = testCase('Message inspection', (test) => {
  const api = test.use(client);
  const proxyServer = test.use(proxy);
  const mock = test.use(backend);

  mock.onMessage('Request').mockEvent('Response', (payload) => ({
    id: payload.id,
    result: 'success',
    timestamp: Date.now(),
  }));

  // Proxy observes the message passing through
  proxyServer.waitMessage('Request').timeout(2000).assert((msg) => {
    return msg.action === 'inspect-me';
  });

  api.sendMessage('Request', {
    id: 'req-2',
    action: 'inspect-me',
    data: 'sensitive-data',
  });

  api.waitEvent('Response').timeout(2000).assert((msg) => msg.id === 'req-2');
});
```

## Message Transformation

Modify messages as they pass through the proxy:

```typescript
const tc = testCase('Message transformation', (test) => {
  const api = test.use(client);
  const proxyServer = test.use(proxy);
  const mock = test.use(backend);

  // Proxy transforms outgoing requests
  proxyServer.onMessage('Request').transform((msg) => ({
    ...msg,
    data: `[TRANSFORMED] ${msg.data}`,
  }));

  // Backend receives the transformed message
  mock.onMessage('Request').mockEvent('Response', (payload) => ({
    id: payload.id,
    result: payload.data, // echoes transformed data
    timestamp: Date.now(),
  }));

  api.sendMessage('Request', { id: 'req-3', action: 'transform', data: 'original' });

  api.waitEvent('Response').timeout(2000).assert((msg) => {
    return msg.result.includes('[TRANSFORMED]');
  });
});
```

## HTTP Proxy Mode

Proxy mode also works with sync protocols:

```typescript
import { Client, HttpProtocol, Server, TestScenario, testCase } from 'testurio';

interface ApiService {
  getUser: {
    request: { method: 'GET'; path: '/users/{id}' };
    response: { code: 200; body: { id: number; name: string } };
  };
}

const backend = new Server('backend', {
  protocol: new HttpProtocol<ApiService>(),
  listenAddress: { host: 'localhost', port: 3000 },
});

// HTTP proxy — listenAddress + targetAddress
const proxy = new Server('proxy', {
  protocol: new HttpProtocol<ApiService>(),
  listenAddress: { host: 'localhost', port: 3001 },
  targetAddress: { host: 'localhost', port: 3000 },
});

const client = new Client('api', {
  protocol: new HttpProtocol<ApiService>(),
  targetAddress: { host: 'localhost', port: 3001 }, // connects to proxy
});

const scenario = new TestScenario({
  name: 'HTTP Proxy',
  components: [backend, proxy, client],
});

const tc = testCase('HTTP proxy passthrough', (test) => {
  const api = test.use(client);
  const mock = test.use(backend);

  api.request('getUser', { method: 'GET', path: '/users/1' });

  mock.onRequest('getUser').mockResponse(() => ({
    code: 200,
    body: { id: 1, name: 'Alice' },
  }));

  api.onResponse('getUser').assert((res) => res.body.name === 'Alice');
});
```

## Selective Mocking

Mock some requests at the proxy, let others pass through:

```typescript
const tc = testCase('Selective mocking', (test) => {
  const api = test.use(client);
  const proxyServer = test.use(proxy);
  const mock = test.use(backend);

  // Mock specific requests at the proxy level
  proxyServer.onRequest('getUser', { method: 'GET', path: '/users/99' }).mockResponse(() => ({
    code: 200,
    body: { id: 99, name: 'Mocked User' },
  }));

  // Other requests pass through to the real backend
  mock.onRequest('getUser').mockResponse(() => ({
    code: 200,
    body: { id: 1, name: 'Real User' },
  }));
});
```
