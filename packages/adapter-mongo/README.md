# @testurio/adapter-mongo

MongoDB adapter for [Testurio](https://github.com/udamir/testurio) DataSource.

## Installation

```bash
npm install @testurio/adapter-mongo
```

## Usage

```typescript
import { TestScenario, testCase, DataSource } from 'testurio';
import { MongoAdapter } from '@testurio/adapter-mongo';

const db = new DataSource('database', {
  adapter: new MongoAdapter({
    url: 'mongodb://localhost:27017',
    database: 'testdb',
  }),
});

const scenario = new TestScenario({
  name: 'MongoDB Test',
  components: [db],
});

const tc = testCase('should query documents', (test) => {
  const mongo = test.use(db);

  // Setup test data
  mongo.exec('insert user', async (db) => {
    await db.collection('users').insertOne({ name: 'John', email: 'john@example.com' });
  });

  // Query and assert
  mongo.exec('get user', async (db) => {
    return db.collection('users').findOne({ name: 'John' });
  }).assert('user should exist', (user) => user?.email === 'john@example.com');

  // Cleanup
  mongo.exec('cleanup', async (db) => {
    await db.collection('users').deleteOne({ name: 'John' });
  });
});
```

## Configuration

```typescript
const adapter = new MongoAdapter({
  url: 'mongodb://localhost:27017',
  database: 'mydb',
});
```

## Client Type

The `exec` callback receives a MongoDB `Db` instance.

## License

MIT
