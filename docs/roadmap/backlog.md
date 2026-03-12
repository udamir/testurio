# Backlog

Low-priority items and technical debt.

## Documentation Cleanup

### Make Component Layer Comments Protocol-Agnostic

**Priority:** Low

Component layer documentation contains protocol-specific examples that should be made generic.

**Files with protocol-specific comments:**

| File                                   | Issue                                         |
| -------------------------------------- | --------------------------------------------- |
| `async-client.component.ts:35`         | Example uses `new WebSocketProtocol()`        |
| `async-server.component.ts:55,63`      | Example uses `new WebSocketProtocol()`        |
| `sync-client.component.ts:103-104`     | "GET /users for HTTP, GetUser for gRPC"       |
| `sync-server.component.ts:194`         | "GET /users for HTTP, GetUser for gRPC"       |
| `sync-server.step-builder.ts:37-38,76` | "operationId for HTTP, method name for gRPC"  |
| `sync-client.step-builder.ts:110`      | "operationId for HTTP, method name for gRPC"  |
| `sync-server.types.ts:14-15`           | "HTTP: Full request", "gRPC: Request payload" |
| `sync-client.types.ts:14`              | "e.g., body for HTTP"                         |

**Suggested change:** Replace protocol-specific examples with generic terms like "operation identifier" or "message type".

## Testing Debt

### AsyncClient Unit Tests

**Priority:** Medium

Missing unit tests:
- `waitForMessage` timeout behavior
- `waitForMessage` matcher function behavior
- Pending message queue management

**File:** `tests/unit/async-client.test.ts`

## Future Enhancements

### gRPC Metadata Forwarding

**Priority:** Low

gRPC proxy mode doesn't currently forward metadata (headers, trailers). This would be useful for tracing and authentication forwarding in proxy scenarios.
