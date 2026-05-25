# @testurio/adapter-clickhouse

ClickHouse adapter for [Testurio](https://github.com/udamir/testurio) DataSource.

Wraps the official `@clickhouse/client` (HTTP transport) and exposes a thin
`query` / `insert` / `command` / `ping` / `raw` helper for ergonomic seed and
assert flows. Lifecycle is managed by `TestScenario`.

## Installation

```bash
npm install @testurio/adapter-clickhouse @clickhouse/client --save-dev
```

**Peer dependency:** `@clickhouse/client`

## Usage

```typescript
import { DataSource, TestScenario, testCase } from "testurio";
import { ClickHouseAdapter } from "@testurio/adapter-clickhouse";

const ch = new DataSource("clickhouse", {
  adapter: new ClickHouseAdapter({
    url: "http://localhost:8123",
    username: "default",
    password: "",
    database: "default",
  }),
});

const scenario = new TestScenario({ name: "ClickHouse Test", components: [ch] });

const tc = testCase("count events", (test) => {
  const store = test.use(ch);

  store.exec("setup", async (db) => {
    await db.command({
      query: `CREATE TABLE events (id UInt32, name String) ENGINE = MergeTree() ORDER BY id`,
    });
  });

  store.exec("insert", async (db) => {
    await db.insert<{ id: number; name: string }>({
      table: "events",
      values: [
        { id: 1, name: "login" },
        { id: 2, name: "logout" },
      ],
    });
  });

  store
    .exec("count", async (db) => {
      const rows = await db.query<{ count: string }>({
        query: "SELECT count() AS count FROM events",
      });
      return Number(rows[0].count);
    })
    .assert("should have 2 events", (n) => n === 2);
});

await scenario.run(tc);
```

## Configuration

| Option               | Type                                       | Default         | Description                                                              |
| -------------------- | ------------------------------------------ | --------------- | ------------------------------------------------------------------------ |
| `url`                | `string`                                   | —               | Full ClickHouse HTTP URL. Takes precedence over `host`/`port`.           |
| `host`               | `string`                                   | `"localhost"`   | Host (used when `url` is not set).                                       |
| `port`               | `number`                                   | `8123`          | HTTP port (used when `url` is not set).                                  |
| `tls`                | `boolean`                                  | `false`         | Use `https://` when building URL from `host`/`port`.                     |
| `username`           | `string`                                   | `"default"`     | Connection username.                                                     |
| `password`           | `string`                                   | `""`            | Connection password.                                                     |
| `database`           | `string`                                   | —               | Default database for queries.                                            |
| `requestTimeout`     | `number`                                   | —               | Per-request timeout in ms.                                               |
| `maxOpenConnections` | `number`                                   | `10`            | Maximum concurrent HTTP connections.                                     |
| `compression`        | `{ request?: boolean; response?: boolean }`| `{ false, true }` | Compression settings (request and response).                           |
| `application`        | `string`                                   | —               | Application name (sent for query log identification).                    |
| `clickhouseSettings` | `ClickHouseSettings`                       | —               | Session-level ClickHouse settings.                                       |
| `options`            | `Partial<ClickHouseClientConfigOptions>`   | —               | Escape hatch — extra `@clickhouse/client` config, merged last.           |

## Wrapper Helpers

The `exec` callback receives a `ClickHouseClientWrapper`:

```typescript
store.exec("ddl", async (db) => {
  await db.command({ query: "CREATE TABLE ..." });
});

store.exec("bulk insert", async (db) => {
  await db.insert<{ id: number; name: string }>({
    table: "events",
    values: [{ id: 1, name: "a" }],
    // format defaults to "JSONEachRow"
  });
});

store.exec("select rows", async (db) => {
  const rows = await db.query<{ id: number; name: string }>({
    query: "SELECT id, name FROM events WHERE id = {id:UInt32}",
    query_params: { id: 1 },
  });
  return rows;
});

store.exec("health check", async (db) => db.ping());
```

`db.raw()` returns the underlying `ClickHouseClient` for advanced needs
(streaming, custom formats, low-level access). The adapter also exposes
`getClickHouseClient()` for the same purpose.

## Features

- Connection lifecycle managed by `TestScenario`.
- `connected` / `disconnected` / `error` events on the adapter.
- Generic-typed `query<T>`, `insert<T>` helpers.
- HTTP transport via the official `@clickhouse/client`.
- Escape hatch (`raw()` / `getClickHouseClient()`) for advanced usage.

## License

MIT
