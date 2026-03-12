# MongoDB Adapter (`@testurio/adapter-mongo`)

**Location:** `packages/adapter-mongo/`

Provides MongoDB integration for Testurio via the `DataSource` component.

## Usage

```typescript
import { MongoAdapter } from '@testurio/adapter-mongo';

const mongo = new DataSource('mongo', {
  adapter: new MongoAdapter({
    url: 'mongodb://localhost:27017',
    database: 'testdb',
  }),
});

// In test case:
const db = test.use(mongo);
db.exec('seed data', async (client) => {
  await client.collection('users').insertOne({ name: 'Alice', age: 30 });
});
db.exec('verify', async (client) => {
  const user = await client.collection('users').findOne({ name: 'Alice' });
  expect(user?.age).toBe(30);
});
```

## Configuration

| Option | Type | Description |
|--------|------|-------------|
| `url` | `string` | MongoDB connection URL |
| `database` | `string` | Database name |

## Features

- Direct access to MongoDB `Db` client object
- Full MongoDB driver API available in `exec()` callbacks
- Connection lifecycle managed by `TestScenario`

## Testing

Integration tests use MongoDB via testcontainers. See [testing/testcontainers.md](../testing/testcontainers.md).

## Dependencies

- `mongodb` - MongoDB driver
