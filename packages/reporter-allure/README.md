# @testurio/reporter-allure

Allure reporter for [Testurio](https://github.com/udamir/testurio) - converts test results to Allure-compatible format for interactive HTML reports.

## Installation

```bash
npm install @testurio/reporter-allure
# or
pnpm add @testurio/reporter-allure
```

## Usage

### Basic Usage

```typescript
import { TestScenario, testCase, Client, Server, HttpProtocol } from 'testurio';
import { AllureReporter } from '@testurio/reporter-allure';

const scenario = new TestScenario({
  name: 'User API Tests',
  components: [server, client],
  reporters: [
    new AllureReporter({
      resultsDir: 'allure-results',
    }),
  ],
});

await scenario.run(getUserTest);
```

### With Metadata (BDD Hierarchy)

```typescript
const getUserTest = testCase('Get user by ID', (test) => {
  const api = test.use(client);
  const mock = test.use(server);

  mock.onRequest('getUser').mockResponse(() => ({
    code: 200,
    body: { id: 1, name: 'Alice' },
  }));

  api.request('getUser', { method: 'GET', path: '/users/1' });
  api.onResponse('getUser').assert((res) => res.body.name === 'Alice');
})
  .id('TC-001')
  .epic('User Management')
  .feature('User API')
  .story('Get User')
  .severity('critical')
  .tags('api', 'smoke', 'regression')
  .issue('BUG-123')
  .description('Verifies that user can be retrieved by ID');
```

### Full Configuration

```typescript
const scenario = new TestScenario({
  name: 'Full API Test Suite',
  components: [server, client],
  reporters: [
    new AllureReporter({
      // Output location
      resultsDir: './reports/allure-results',

      // Environment info (shown in report)
      environmentInfo: {
        'Node.js': process.version,
        'OS': process.platform,
        'Environment': 'CI',
        'Build': process.env.BUILD_NUMBER || 'local',
      },

      // Default labels for all tests
      labels: [
        { name: 'owner', value: 'team-api' },
        { name: 'layer', value: 'integration' },
      ],

      // Link patterns
      tmsUrlPattern: 'https://testrail.example.com/index.php?/cases/view/{id}',
      issueUrlPattern: 'https://jira.example.com/browse/{id}',

      // Default BDD hierarchy
      defaultEpic: 'E-Commerce Platform',
      defaultFeature: 'API',

      // Payload capture
      includePayloads: 'both',
      maxPayloadSize: 500,
    }),
  ],
});
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `resultsDir` | `string` | `"allure-results"` | Output directory for Allure results |
| `environmentInfo` | `Record<string, string>` | - | Environment info written to `environment.properties` |
| `labels` | `Label[]` | - | Default labels applied to all test cases |
| `tmsUrlPattern` | `string` | - | URL pattern for TMS links (use `{id}` placeholder) |
| `issueUrlPattern` | `string` | - | URL pattern for issue links (use `{id}` placeholder) |
| `defaultEpic` | `string` | - | Default epic for all tests |
| `defaultFeature` | `string` | - | Default feature for all tests |
| `includePayloads` | `"parameters"` \| `"attachments"` \| `"both"` | - | Include recorded payloads in Allure steps |
| `maxPayloadSize` | `number` | `1000` | Maximum payload size for "parameters" mode |

## Generating Reports

After running tests, generate the HTML report using the Allure CLI:

```bash
# Install Allure CLI (if not already installed)
npm install -g allure-commandline

# Generate HTML report from results
allure generate allure-results -o allure-report

# Open report in browser
allure open allure-report

# Or serve directly (generates and opens in one step)
allure serve allure-results
```

## Protocol Agnostic

The reporter works identically across all Testurio protocols:

- HTTP
- WebSocket
- TCP
- gRPC
- DataSource (Redis, PostgreSQL, etc.)

## Output Files

The reporter generates the following files in the results directory:

- `{uuid}-result.json` - Individual test result for each test case
- `{uuid}-container.json` - Container grouping test cases from a scenario
- `environment.properties` - Environment information (when configured)
- `{uuid}-attachment.{ext}` - Attachment files (when `includePayloads` is set)

## License

MIT
