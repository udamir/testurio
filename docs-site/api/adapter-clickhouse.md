# @testurio/adapter-clickhouse

ClickHouse integration for Testurio via the `DataSource` component. Wraps the
official `@clickhouse/client` HTTP transport and exposes a thin
`query` / `insert` / `command` / `ping` / `raw` helper to `exec` callbacks.

```bash
npm install @testurio/adapter-clickhouse @clickhouse/client --save-dev
```

**Peer dependency:** `@clickhouse/client`

## ClickHouseAdapter

```typescript
import { DataSource } from 'testurio';
import { ClickHouseAdapter } from '@testurio/adapter-clickhouse';

const ch = new DataSource('clickhouse', {
  adapter: new ClickHouseAdapter({
    url: 'http://localhost:8123',
    username: 'default',
    password: '',
    database: 'default',
  }),
});
```

### Constructor Options

| Option               | Type                                        | Default           | Description                                                     |
| -------------------- | ------------------------------------------- | ----------------- | --------------------------------------------------------------- |
| `url`                | `string`                                    | —                 | Full ClickHouse HTTP URL. Takes precedence over `host`/`port`.  |
| `host`               | `string`                                    | `"localhost"`     | Host (used when `url` is not set).                              |
| `port`               | `number`                                    | `8123`            | HTTP port (used when `url` is not set).                         |
| `tls`                | `boolean`                                   | `false`           | Use `https://` when building URL from `host`/`port`.            |
| `username`           | `string`                                    | `"default"`       | Connection username.                                            |
| `password`           | `string`                                    | `""`              | Connection password.                                            |
| `database`           | `string`                                    | —                 | Default database for queries.                                   |
| `requestTimeout`     | `number`                                    | —                 | Per-request timeout in ms.                                      |
| `maxOpenConnections` | `number`                                    | `10`              | Maximum concurrent HTTP connections.                            |
| `compression`        | `{ request?: boolean; response?: boolean }` | `{ false, true }` | Compression settings (request and response).                    |
| `application`        | `string`                                    | —                 | Application name (sent for query log identification).           |
| `clickhouseSettings` | `ClickHouseSettings`                        | —                 | Session-level ClickHouse settings.                              |
| `options`            | `Partial<ClickHouseClientConfigOptions>`    | —                 | Escape hatch — extra `@clickhouse/client` config (merged last). |

## Wrapper Helpers

The `exec` callback receives a `ClickHouseClientWrapper`, not the raw
`ClickHouseClient`. The wrapper hides the `ResultSet` indirection of the
underlying API for the common seed/assert path.

### `query<T>(params)`

Run a `SELECT`/`SHOW` query and return parsed rows. Format defaults to
`"JSONEachRow"`, so the result is `T[]`.

```typescript
const tc = testCase('count events', (test) => {
  const store = test.use(ch);

  store
    .exec('count', async (db) => {
      const rows = await db.query<{ c: string }>({
        query: 'SELECT count() AS c FROM events',
      });
      return Number(rows[0].c);
    })
    .assert('has events', (n) => n > 0);
});
```

Parameterized queries use ClickHouse's `{name:Type}` placeholders:

```typescript
const rows = await db.query<{ id: number; name: string }>({
  query: 'SELECT id, name FROM events WHERE id = {id:UInt32}',
  query_params: { id: 1 },
});
```

### `insert<T>(params)`

Bulk insert into a table. Format defaults to `"JSONEachRow"`.

```typescript
store.exec('seed', async (db) => {
  await db.insert<{ id: number; name: string }>({
    table: 'events',
    values: [
      { id: 1, name: 'login' },
      { id: 2, name: 'logout' },
    ],
  });
});
```

### `command(params)`

Execute DDL or any no-result statement.

```typescript
store.exec('ddl', async (db) => {
  await db.command({
    query: 'CREATE TABLE events (id UInt32, name String) ENGINE = MergeTree() ORDER BY id',
  });
});
```

### `ping()`

Health check; returns `true` on success.

```typescript
store
  .exec('health', async (db) => db.ping())
  .assert('alive', (ok) => ok === true);
```

### Escape Hatch — `raw()` and `getClickHouseClient()`

If you need a format that doesn't return rows (CSV, Parquet, raw `JSON`,
streaming), drop down to the underlying `@clickhouse/client`:

```typescript
store.exec('stream csv', async (db) => {
  const raw = db.raw();
  const rs = await raw.query({
    query: 'SELECT id, name FROM events',
    format: 'CSV',
  });
  const csv = await rs.text();
  return csv;
});
```

The adapter also exposes `getClickHouseClient()` for the same purpose, useful
when you need direct access outside of an `exec` callback.

## Features

- Direct access to a typed `query<T>` / `insert<T>` wrapper.
- DDL and parameterized queries with `query_params`.
- Default `"JSONEachRow"` format for ergonomic row arrays.
- Connection lifecycle managed by `TestScenario`.
- `connected` / `disconnected` / `error` events on the adapter.
- Escape hatch (`raw()` / `getClickHouseClient()`) for advanced/streaming use.
