# @testurio/adapter-mongo

MongoDB integration for Testurio via the `DataSource` component.

```bash
npm install @testurio/adapter-mongo mongodb --save-dev
```

**Peer dependency:** `mongodb`

## MongoAdapter

```typescript
import { DataSource } from 'testurio';
import { MongoAdapter } from '@testurio/adapter-mongo';

const mongo = new DataSource('mongodb', {
  adapter: new MongoAdapter({
    url: 'mongodb://localhost:27017',
    database: 'testdb',
  }),
});
```

### Constructor Options

| Option | Type | Description |
|--------|------|-------------|
| `url` | `string` | MongoDB connection URL |
| `database` | `string` | Database name |

### Usage in Tests

The adapter exposes the MongoDB `Db` instance:

```typescript
const tc = testCase('mongo test', (test) => {
  const db = test.use(mongo);

  db.exec('seed data', async (client) => {
    // client is a mongodb Db instance
    await client.collection('users').insertOne({ name: 'Alice', age: 30 });
  });

  db.exec('verify', async (client) => {
    return client.collection('users').findOne({ name: 'Alice' });
  }).assert('user should exist', (user) => user !== null);
});
```

### Features

- Direct access to MongoDB `Db` instance
- Collection operations (insert, find, update, delete)
- Connection lifecycle managed by `TestScenario`
