# Test Coverage

## Requirements

- **Minimum 90% coverage required** across all packages
- **Prefer integration/E2E tests** over unit tests
- Run coverage with `pnpm test:coverage`

## Test Organization

```
tests/
├── unit/              # Unit tests for individual components
├── integration/       # Integration tests for protocol chains
├── proto/             # Proto files for gRPC tests
└── containers/        # Testcontainer utilities
```

## Coverage Matrix

### Core Framework

| Component           | Unit Tests              | Integration Tests                                                                                                           |
| ------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Client (SyncClient) | `sync-client.test.ts`   | `sync-chain.integration.test.ts`                                                                                            |
| Server (SyncServer) | `sync-server.test.ts`   | `sync-chain.integration.test.ts`                                                                                            |
| AsyncClient         | `async-client.test.ts`  | `async-chain.integration.test.ts`                                                                                           |
| AsyncServer         | `async-server.test.ts`  | `async-chain.integration.test.ts`                                                                                           |
| DataSource          | -                       | `redis-datasource.integration.test.ts`, `postgres-datasource.integration.test.ts`, `mongodb-datasource.integration.test.ts` |
| Publisher           | -                       | `kafka-pubsub.integration.test.ts`, `rabbitmq-pubsub.integration.test.ts`, `redis-pubsub.integration.test.ts`               |
| Subscriber          | -                       | `kafka-pubsub.integration.test.ts`, `rabbitmq-pubsub.integration.test.ts`, `redis-pubsub.integration.test.ts`               |
| HookRegistry        | `hook-registry.test.ts` | -                                                                                                                           |
| TestScenario        | `test-scenario.test.ts` | All integration tests                                                                                                       |
| TestCase            | `test-case.test.ts`     | All integration tests                                                                                                       |
| StepExecutor        | `step-executor.test.ts` | All integration tests                                                                                                       |

### Protocols

| Protocol    | Test Files                                                     |
| ----------- | -------------------------------------------------------------- |
| HTTP        | `http-path-matching.test.ts`, `sync-chain.integration.test.ts` |
| gRPC Unary  | `grpc-chain.integration.test.ts`                               |
| gRPC Stream | `grpc-stream.integration.test.ts`                              |
| WebSocket   | `ws-chain.integration.test.ts`                                 |
| TCP         | `tcp-chain.integration.test.ts`                                |

### Adapters

| Adapter          | Test Files                                |
| ---------------- | ----------------------------------------- |
| Kafka            | `kafka-pubsub.integration.test.ts`        |
| RabbitMQ         | `rabbitmq-pubsub.integration.test.ts`     |
| Redis Pub/Sub    | `redis-pubsub.integration.test.ts`        |
| Redis DataSource | `redis-datasource.integration.test.ts`    |
| PostgreSQL       | `postgres-datasource.integration.test.ts` |
| MongoDB          | `mongodb-datasource.integration.test.ts`  |

### Reporters

| Reporter | Test Files                                                       |
| -------- | ---------------------------------------------------------------- |
| Allure   | `allure-reporter.test.ts`, `allure-reporter.integration.test.ts` |

## Port Allocation

Each integration test file uses a dedicated port range to avoid conflicts:

| Test File                                | Port Range |
| ---------------------------------------- | ---------- |
| `sync-chain.integration.test.ts`         | 13xxx      |
| `proxy-multi-client.integration.test.ts` | 15xxx      |

Follow this convention when adding new test files.

## Known Gaps

- AsyncClient unit tests for `waitForMessage` timeout and matcher behavior
- Some edge cases in proxy mode with multiple concurrent clients

See [roadmap/backlog.md](../roadmap/backlog.md) for tracked testing debt.
